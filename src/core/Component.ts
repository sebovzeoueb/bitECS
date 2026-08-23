import { entityExists, EntityId, getEntityComponents, Prefab } from './Entity'
import { queryAddEntity, queryCheckEntity, queryRemoveEntity } from './Query'
import { Query } from './Query'
import {
	IsA,
	Wildcard,
	isWildcard,
	isRelation,
	getRelationTargets,
	$relationData,
	$isPairComponent,
	$pairTarget,
	$relation
} from './Relation'
import { createObservable, Observable } from './utils/Observer'
import { $internal, InternalWorld, World, WorldContext, ArchetypeNode, ArchetypeEdge, createArchetypeNode } from './World'
import { updateHierarchyDepth, invalidateHierarchyDepth } from './Hierarchy'

/**
 * Represents a reference to a component.
 */
export type ComponentRef = any

/**
 * Represents the data associated with a component.
 */
export interface ComponentData {
	id: number
	generationId: number
	bitflag: number
	ref: ComponentRef
	queries: Set<Query>
	setObservable: Observable
	getObservable: Observable
}

/**
 * Represents a component with data to be set on an entity.
 */
type ComponentSetter<T = any> = { component: ComponentRef; data: T }

// ── Archetype Graph ──────────────────────────────────────────────────

/**
 * Returns the canonical archetype node for an entity's current component masks.
 * Entities with identical masks share one node, so cached transition edges are
 * computed once per archetype instead of once per entity. Trailing zero masks
 * are trimmed so the key is stable as new generations are added to the world.
 */
const internArchetypeNode = (ctx: WorldContext, eid: EntityId): ArchetypeNode => {
	let key = ''
	let pendingZeros = 0
	for (let g = 0; g < ctx.entityMasks.length; g++) {
		const mask = ctx.entityMasks[g][eid] | 0
		if (mask === 0) {
			pendingZeros++
			continue
		}
		for (; pendingZeros > 0; pendingZeros--) key += '0,'
		key += mask + ','
	}
	let node = ctx.archetypeNodeMap.get(key)
	if (!node) {
		node = createArchetypeNode()
		ctx.archetypeNodeMap.set(key, node)
	}
	return node
}

/**
 * Gets or computes the transition edge for adding/removing a component.
 * Follows the archetype graph: entity's current node → edge → target node.
 * Edge stores which queries to add/remove the entity from.
 */
const getTransitionEdge = (
	world: World,
	ctx: WorldContext,
	node: ArchetypeNode,
	eid: EntityId,
	componentData: ComponentData,
	isAdd: boolean
): ArchetypeEdge => {
	const action = componentData.id * 2 + (isAdd ? 1 : 0)

	const edge = node.edges[action]
	if (edge !== undefined && edge.version === ctx.queryVersion) return edge

	const addTo: Query[] = []
	const removeFrom: Query[] = []

	for (const queryData of componentData.queries) {
		// Pair-filter queries are entity-specific (check relationTargets[eid]),
		// so they can't be cached per archetype node. They're handled by updatePairQueries.
		if (queryData.pairFilters.length > 0) continue
		if (queryCheckEntity(world, queryData, eid)) addTo.push(queryData)
		else removeFrom.push(queryData)
	}

	// Intern the target by the entity's post-op masks (call sites update masks
	// before transitioning), so identical archetypes share one node and its edges.
	return node.edges[action] = { target: internArchetypeNode(ctx, eid), addTo, removeFrom, version: ctx.queryVersion }
}

/**
 * Applies a cached archetype transition to an entity, updating query membership.
 */
const applyTransition = (world: World, ctx: WorldContext, eid: EntityId, componentData: ComponentData, isAdd: boolean) => {
	const node = ctx.entityArchetypes[eid] || ctx.rootArchetype
	const edge = getTransitionEdge(world, ctx, node, eid, componentData, isAdd)
	ctx.entityArchetypes[eid] = edge.target
	for (let i = 0; i < edge.addTo.length; i++) queryAddEntity(edge.addTo[i], eid)
	for (let i = 0; i < edge.removeFrom.length; i++) {
		if (!isAdd) edge.removeFrom[i].toRemove.remove(eid)
		queryRemoveEntity(world, edge.removeFrom[i], eid)
	}
}

/**
 * Checks if an entity is a prefab using cached component data.
 */
const isPrefabEntity = (ctx: WorldContext, eid: EntityId): boolean => {
	if (!ctx.prefabData) return false
	return (ctx.entityMasks[ctx.prefabData.generationId][eid] & ctx.prefabData.bitflag) === ctx.prefabData.bitflag
}

// ── Relation Index Helpers ────────────────────────────────────────────

const hasPairTarget = (ctx: WorldContext, eid: EntityId, relation: ComponentRef, target: any): boolean => {
	const targets = ctx.relationTargets[eid]?.get(relation)
	return targets !== undefined && targets.has(target)
}

const addPairTarget = (ctx: WorldContext, eid: EntityId, relation: ComponentRef, target: any) => {
	if (!ctx.relationTargets[eid]) ctx.relationTargets[eid] = new Map()
	const relMap = ctx.relationTargets[eid]!
	let targets = relMap.get(relation)
	if (!targets) {
		targets = new Set()
		relMap.set(relation, targets)
	}
	targets.add(target)

	if (typeof target === 'number') {
		if (!ctx.reverseIndex[target]) ctx.reverseIndex[target] = []
		ctx.reverseIndex[target]!.push({ subject: eid, relation })

		let targetSet = ctx.targetsByRelation.get(relation)
		if (!targetSet) {
			targetSet = new Set()
			ctx.targetsByRelation.set(relation, targetSet)
		}
		targetSet.add(target)
	}
}

const removePairTarget = (ctx: WorldContext, eid: EntityId, relation: ComponentRef, target: any) => {
	const targets = ctx.relationTargets[eid]?.get(relation)
	if (!targets) return

	targets.delete(target)
	if (targets.size === 0) ctx.relationTargets[eid]!.delete(relation)

	if (typeof target === 'number') {
		const rev = ctx.reverseIndex[target]
		if (rev) {
			const revIdx = rev.findIndex(e => e.subject === eid && e.relation === relation)
			if (revIdx >= 0) {
				rev[revIdx] = rev[rev.length - 1]
				rev.pop()
			}
		}

		const relSet = ctx.targetsByRelation.get(relation)
		if (relSet) {
			const rev2 = ctx.reverseIndex[target]
			if (!rev2 || !rev2.some(e => e.relation === relation)) {
				relSet.delete(target)
				if (relSet.size === 0) ctx.targetsByRelation.delete(relation)
			}
		}
	}
}

const swapRemoveComponent = (ctx: WorldContext, eid: EntityId, component: ComponentRef) => {
	const comps = ctx.entityComponents[eid]
	if (!comps) return
	const idx = comps.indexOf(component)
	if (idx >= 0) {
		comps[idx] = comps[comps.length - 1]
		comps.pop()
	}
}

// ── Registration ─────────────────────────────────────────────────────

/**
 * Registers a component with the world.
 */
export const registerComponent = (world: World, component: ComponentRef) => {
	if (!component) {
		throw new Error(`bitECS - Cannot register null or undefined component`)
	}

	const ctx = (world as InternalWorld)[$internal]

	// Specific pairs share the relation's bitflag — don't allocate their own
	const isSpecificPair = component[$isPairComponent] && component[$pairTarget] !== Wildcard && !isWildcard(component[$relation])

	const data: ComponentData = {
		id: ctx.componentCount++,
		generationId: isSpecificPair ? -1 : ctx.entityMasks.length - 1,
		bitflag: isSpecificPair ? 0 : ctx.bitflag,
		ref: component,
		queries: new Set<Query>(),
		setObservable: createObservable(),
		getObservable: createObservable(),
	}

	ctx.componentMap.set(component, data)

	// Index pairs by numeric target so removeEntity can release their registrations
	if (component[$isPairComponent] && typeof component[$pairTarget] === 'number') {
		const target = component[$pairTarget]
		let list = ctx.pairsByTarget.get(target)
		if (!list) {
			list = []
			ctx.pairsByTarget.set(target, list)
		}
		list.push(component)
	}

	if (component === Prefab) ctx.prefabData = data

	if (!isSpecificPair) {
		ctx.bitflag *= 2
		if (ctx.bitflag >= 2 ** 31) {
			ctx.bitflag = 1
			// New generation page at current capacity so existing eids are in range
			ctx.entityMasks.push([])
		}
	}

	return data
}

/**
 * Registers multiple components with the world.
 */
export const registerComponents = (world: World, components: ComponentRef[]) => {
	for (let i = 0; i < components.length; i++) registerComponent(world, components[i])
}

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Checks if an entity has a specific component.
 */
export const hasComponent = (world: World, eid: EntityId, component: ComponentRef): boolean => {
	const ctx = (world as InternalWorld)[$internal]

	if (component[$isPairComponent]) {
		const relation = component[$relation]
		const target = component[$pairTarget]

		// Relation(Wildcard): check relation bitflag
		if (target === Wildcard) {
			if (isWildcard(relation)) return false
			const relData = ctx.componentMap.get(relation)
			if (!relData) return false
			return (ctx.entityMasks[relData.generationId][eid] & relData.bitflag) === relData.bitflag
		}

		// Wildcard(Relation): check reverse index — is entity targeted via this relation?
		// Mirrors queryCheckEntity's Pair(Wildcard, Relation) filter.
		if (isWildcard(relation) && isRelation(target)) {
			const rev = ctx.reverseIndex[eid]
			if (rev) {
				for (let i = 0; i < rev.length; i++) {
					if (rev[i].relation === target) return true
				}
			}
			return false
		}

		// Wildcard(X): check forward index — does entity have any relation targeting X?
		if (isWildcard(relation)) {
			const forward = ctx.relationTargets[eid]
			if (forward) {
				for (const [, targets] of forward) {
					if (targets.has(target)) return true
				}
			}
			return false
		}

		// Specific pair: check relation index
		return hasPairTarget(ctx, eid, relation, target)
	}

	// Standard bitmask check — works for regular components
	const registeredComponent = ctx.componentMap.get(component)
	if (!registeredComponent) return false

	const { generationId, bitflag } = registeredComponent
	return (ctx.entityMasks[generationId][eid] & bitflag) === bitflag
}

/**
 * Retrieves the data associated with a component for a specific entity.
 */
export const getComponent = (world: World, eid: EntityId, component: ComponentRef): any => {
	const ctx = (world as InternalWorld)[$internal]
	const componentData = ctx.componentMap.get(component)
	if (!componentData) return undefined
	if (!hasComponent(world, eid, component)) return undefined
	return componentData.getObservable.notify(eid)
}

// ── Setters ──────────────────────────────────────────────────────────

/**
 * Helper function to set component data.
 */
export const set = <T extends ComponentRef>(component: T, data: any): { component: T, data: any } => ({
	component,
	data
})

/**
 * Sets component data on an entity. Always calls the setter observable even if entity already has the component.
 */
export const setComponent = (
	world: World,
	eid: EntityId,
	component: ComponentRef,
	data?: any
): void => {
	const ctx = (world as InternalWorld)[$internal]
	const componentData = ctx.componentMap.get(component)
	// Specific pairs carry no own bitflag (generationId -1); route them through
	// addComponent, which handles existing pairs and notifies with the data
	if (componentData && !component[$isPairComponent]) {
		const { generationId, bitflag } = componentData
		if ((ctx.entityMasks[generationId][eid] & bitflag) === bitflag) {
			componentData.setObservable.notify(eid, data)
			return
		}
	}
	addComponent(world, eid, data !== undefined ? set(component, data) : component)
}

// ── Inheritance ──────────────────────────────────────────────────────

/**
 * Recursively inherits components from one entity to another.
 * The visited set prevents circular inheritance from recursing forever.
 */
const recursivelyInherit = (ctx: WorldContext, world: World, baseEid: EntityId, inheritedEid: EntityId, visited = new Set<EntityId>()): void => {
	if (visited.has(inheritedEid)) return
	visited.add(inheritedEid)

	addComponent(world, baseEid, IsA(inheritedEid))

	for (const component of getEntityComponents(world, inheritedEid)) {
		if (component === Prefab) continue
		if (!hasComponent(world, baseEid, component)) {
			addComponent(world, baseEid, component)
			const componentData = ctx.componentMap.get(component)
			if (componentData) {
				// Try observable-based get/set first
				const data = getComponent(world, inheritedEid, component)
				if (data !== undefined) {
					componentData.setObservable.notify(baseEid, data)
				} else {
					// Fall back to copying SoA array values directly
					const ref = componentData.ref
					if (ref && typeof ref === 'object') {
						for (const key in ref) {
							const store = ref[key]
							if (ArrayBuffer.isView(store) || Array.isArray(store)) {
								store[baseEid] = store[inheritedEid]
							}
						}
					}
				}
			}
		}
	}

	// Iterate the Set directly: recursion only adds IsA targets to baseEid, and
	// the shared visited set makes any additions to this set no-op revisits.
	// Snapshot the IsA targets: user observers firing mid-inheritance can
	// mutate the live Set, and live iteration would visit/skip those mutations
	const isaParents = ctx.relationTargets[inheritedEid]?.get(IsA)
	if (isaParents) {
		for (const parentEid of [...isaParents]) {
			recursivelyInherit(ctx, world, baseEid, parentEid, visited)
		}
	}
}

// ── Wildcard Query Updates ───────────────────────────────────────

/**
 * Updates pair-filtered queries (specific pairs, Wildcard(entity), and
 * Pair(Wildcard, Relation)) when a pair is added or removed. These are the
 * only queries that can't use standard bitmask evaluation. Indexed lookups
 * keep this O(matching queries) instead of O(all queries).
 */
const updatePairQueries = (world: World, ctx: WorldContext, eid: EntityId, relation: ComponentRef, target: any, isAdd: boolean) => {
	// Specific pair filter: Relation(specificTarget) — adds/removes eid.
	// Indexed by target only, so the relation still has to be matched.
	const byTarget = ctx.queriesByTarget.get(target)
	if (byTarget) {
		for (const q of byTarget) {
			for (let i = 0; i < q.pairFilters.length; i++) {
				const filter = q.pairFilters[i]
				if (!('target' in filter) || filter.relation !== relation || filter.target !== target) continue
				if (isAdd) {
					if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid)
				} else {
					if (!queryCheckEntity(world, q, eid)) queryRemoveEntity(world, q, eid)
				}
				break
			}
		}
	}

	if (typeof target !== 'number') return

	// Wildcard(entity) — adds/removes target. Membership in the index is
	// itself the match: a query is only keyed by eid via an { entity: eid }
	// filter, so there is nothing left to re-check.
	const byEntity = ctx.queriesByEntity.get(eid)
	if (byEntity) {
		for (const q of byEntity) {
			if (isAdd) {
				queryAddEntity(q, target)
			} else {
				let stillTargeted = false
				const rt = ctx.relationTargets[eid]
				if (rt) {
					for (const [r] of rt) {
						if (hasPairTarget(ctx, eid, r, target)) { stillTargeted = true; break }
					}
				}
				if (!stillTargeted) queryRemoveEntity(world, q, target)
			}
		}
	}

	// Pair(Wildcard, Relation) — adds/removes target. Keyed only by
	// { relation } filters, so membership is the match.
	const byRelation = ctx.queriesByRelation.get(relation)
	if (byRelation) {
		for (const q of byRelation) {
			if (isAdd) {
				queryAddEntity(q, target)
			} else {
				const relSet = ctx.targetsByRelation.get(relation)
				if (!relSet || !relSet.has(target)) queryRemoveEntity(world, q, target)
			}
		}
	}
}

/**
 * Cleans up all outgoing pair components of an entity being removed: purges
 * the relation indexes and updates pair-filtered queries. Incoming pairs are
 * handled separately by removeEntity's cascade.
 */
export const removeEntityPairs = (world: World, ctx: WorldContext, eid: EntityId) => {
	const comps = ctx.entityComponents[eid]
	if (!comps) return
	for (let i = 0; i < comps.length; i++) {
		const component = comps[i]
		if (!component[$isPairComponent]) continue
		removePairTarget(ctx, eid, component[$relation], component[$pairTarget])
		updatePairQueries(world, ctx, eid, component[$relation], component[$pairTarget], false)
	}
}

// ── Add Component ────────────────────────────────────────────────────

const ensureComponentData = (world: World, ctx: WorldContext, component: ComponentRef): ComponentData =>
	ctx.componentMap.get(component) || registerComponent(world, component)

/**
 * Adds a single component to an entity. Returns true if the component was
 * added, false if it already existed.
 */
export const addComponent = (world: World, eid: EntityId, componentOrSet: ComponentRef | ComponentSetter): boolean => {
	if (!entityExists(world, eid)) {
		throw new Error(`Cannot add component - entity ${eid} does not exist in the world.`)
	}

	const ctx = (world as InternalWorld)[$internal]
	const isSetter = typeof componentOrSet === 'object' && componentOrSet !== null && 'component' in componentOrSet
	const component = isSetter ? componentOrSet.component : componentOrSet
	const data = isSetter ? componentOrSet.data : undefined
	const isPrefab = isPrefabEntity(ctx, eid)

	if (component[$isPairComponent]) {
		const relation = component[$relation]
		const target = component[$pairTarget]

		// Wildcard descriptors are query-only, not real components
		if (target === Wildcard || isWildcard(relation)) return false

		// Already exists?
		if (hasPairTarget(ctx, eid, relation, target)) {
			if (data !== undefined) {
				const cd = ensureComponentData(world, ctx, component)
				cd.setObservable.notify(eid, data)
			}
			return false
		}

		// Exclusive: remove old target first (peek the Set directly, no copy)
		const relationData = relation[$relationData]
		if (relationData.exclusiveRelation === true) {
			const oldTarget = ctx.relationTargets[eid]?.get(relation)?.values().next().value
			if (oldTarget !== undefined && oldTarget !== null && oldTarget !== target) {
				removeComponent(world, eid, relation(oldTarget))
			}
		}

		// Store indexes BEFORE transitions (observers may read them)
		const isFirstTarget = !ctx.relationTargets[eid] || !ctx.relationTargets[eid]!.has(relation)
		addPairTarget(ctx, eid, relation, target)

		// Ensure pair is registered (for observables) — no bitflag allocated
		const pairData = ensureComponentData(world, ctx, component)

		// Set relation bitflag + transition (only on first target)
		if (isFirstTarget) {
			const relData = ensureComponentData(world, ctx, relation)
			const { generationId: relGenId, bitflag: relBit } = relData
			if ((ctx.entityMasks[relGenId][eid] & relBit) !== relBit) {
				ctx.entityMasks[relGenId][eid] |= relBit
				if (!isPrefab) applyTransition(world, ctx, eid, relData, true)
			}
		}

		ctx.entityComponents[eid].push(component)

		// Wildcard queries can't use bitmasks — update them separately
		updatePairQueries(world, ctx, eid, relation, target, true)

		if (data !== undefined) pairData.setObservable.notify(eid, data)

		if (relation === IsA) {
			// Snapshot copy required: recursivelyInherit adds IsA targets to eid's
			// own set (deep chains), which would otherwise mutate during iteration.
			for (const inherited of getRelationTargets(world, eid, IsA)) {
				recursivelyInherit(ctx, world, eid, inherited)
			}
		}

		updateHierarchyDepth(world, relation, eid, typeof target === 'number' ? target : undefined)

		return true
	}

	// ── Regular component ────────────────────────────────────────
	const componentData = ensureComponentData(world, ctx, component)
	const { generationId, bitflag } = componentData
	if ((ctx.entityMasks[generationId][eid] & bitflag) === bitflag) {
		componentData.setObservable.notify(eid, data)
		return false
	}
	ctx.entityMasks[generationId][eid] |= bitflag

	if (!isPrefab) {
		applyTransition(world, ctx, eid, componentData, true)
	}

	ctx.entityComponents[eid].push(component)

	if (data !== undefined) componentData.setObservable.notify(eid, data)

	return true
}

// ── Add Multiple Components ──────────────────────────────────────────

/**
 * Adds multiple components to an entity (array or spread args).
 */
export function addComponents(world: World, eid: EntityId, components: (ComponentRef | ComponentSetter)[]): void
export function addComponents(world: World, eid: EntityId, ...components: (ComponentRef | ComponentSetter)[]): void
export function addComponents(world: World, eid: EntityId, ...args: any[]): void {
	if (!entityExists(world, eid)) {
		throw new Error(`Cannot add component - entity ${eid} does not exist in the world.`)
	}
	const ctx = (world as InternalWorld)[$internal]
	const components = Array.isArray(args[0]) ? args[0] : args
	const isPrefab = isPrefabEntity(ctx, eid)
	const queries = new Set<Query>()

	for (let i = 0; i < components.length; i++) {
		const componentOrSet = components[i]
		const isSetter = typeof componentOrSet === 'object' && componentOrSet !== null && 'component' in componentOrSet
		const component = isSetter ? componentOrSet.component : componentOrSet
		const data = isSetter ? componentOrSet.data : undefined

		// Pairs have complex bookkeeping (relations, wildcards, IsA) — handle individually
		if (component[$isPairComponent]) {
			addComponent(world, eid, componentOrSet)
			continue
		}

		// Regular component — inline bookkeeping, defer query evaluation
		const componentData = ensureComponentData(world, ctx, component)
		const { generationId, bitflag } = componentData
		if ((ctx.entityMasks[generationId][eid] & bitflag) === bitflag) {
			if (data !== undefined) componentData.setObservable.notify(eid, data)
			continue
		}
		ctx.entityMasks[generationId][eid] |= bitflag

		if (!isPrefab) {
			for (const q of componentData.queries) queries.add(q)
		}

		ctx.entityComponents[eid].push(component)
		if (data !== undefined) componentData.setObservable.notify(eid, data)
	}

	// Re-derive the entity's archetype node from its updated masks
	ctx.entityArchetypes[eid] = internArchetypeNode(ctx, eid)

	// One query evaluation pass
	for (const q of queries) {
		if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid)
		else if (q.has(eid)) queryRemoveEntity(world, q, eid)
	}
}

// ── Remove Component ─────────────────────────────────────────────────

/**
 * Internal removeComponent — skips entityExists check. Handles a single component.
 */
const removeComponentInternal = (world: World, ctx: WorldContext, eid: EntityId, component: ComponentRef) => {
	if (component[$isPairComponent]) {
		const relation = component[$relation]
		const target = component[$pairTarget]

		// Wildcard removal: remove all targets for this relation.
		// Snapshot copy required: the loop removes targets from the very Set
		// getRelationTargets copies, so it can't iterate the live Set.
		if (target === Wildcard && !isWildcard(relation)) {
			const targets = getRelationTargets(world, eid, relation)
			for (let i = 0; i < targets.length; i++) {
				removeComponentInternal(world, ctx, eid, relation(targets[i]))
			}
			return
		}

		if (isWildcard(relation)) return
		if (!hasPairTarget(ctx, eid, relation, target)) return

		removePairTarget(ctx, eid, relation, target)

		swapRemoveComponent(ctx, eid, component)

		// Clear relation bitflag if this was the last target
		const relTargets = ctx.relationTargets[eid]
		if (!relTargets || !relTargets.has(relation)) {
			const relData = ctx.componentMap.get(relation)
			if (relData) {
				const { generationId: relGenId, bitflag: relBit } = relData
				if ((ctx.entityMasks[relGenId][eid] & relBit) === relBit) {
					ctx.entityMasks[relGenId][eid] &= ~relBit
					applyTransition(world, ctx, eid, relData, false)
				}
			}
		}

		updatePairQueries(world, ctx, eid, relation, target, false)
		invalidateHierarchyDepth(world, relation, eid)

		return
	}

	// ── Regular component ────────────────────────────────────────
	const componentData = ctx.componentMap.get(component)
	if (!componentData) return
	const { generationId, bitflag } = componentData
	if ((ctx.entityMasks[generationId][eid] & bitflag) !== bitflag) return
	ctx.entityMasks[generationId][eid] &= ~bitflag

	applyTransition(world, ctx, eid, componentData, false)
	swapRemoveComponent(ctx, eid, component)
}

/**
 * Removes one or more components from an entity.
 */
export function removeComponent(world: World, eid: EntityId, component: ComponentRef): void
export function removeComponent(world: World, eid: EntityId, ...components: ComponentRef[]): void
export function removeComponent(world: World, eid: EntityId, ...components: ComponentRef[]) {
	const ctx = (world as InternalWorld)[$internal]
	if (!entityExists(world, eid)) {
		throw new Error(`Cannot remove component - entity ${eid} does not exist in the world.`)
	}

	if (components.length <= 1) {
		for (let i = 0; i < components.length; i++) {
			removeComponentInternal(world, ctx, eid, components[i])
		}
		return
	}

	// Bulk path — inline bookkeeping for regular components, defer query evaluation
	const queries = new Set<Query>()
	for (let i = 0; i < components.length; i++) {
		const component = components[i]

		if (component[$isPairComponent]) {
			removeComponentInternal(world, ctx, eid, component)
			continue
		}

		const componentData = ctx.componentMap.get(component)
		if (!componentData) continue
		const { generationId, bitflag } = componentData
		if ((ctx.entityMasks[generationId][eid] & bitflag) !== bitflag) continue
		ctx.entityMasks[generationId][eid] &= ~bitflag

		for (const q of componentData.queries) queries.add(q)

		swapRemoveComponent(ctx, eid, component)
	}

	// Re-derive the entity's archetype node from its updated masks
	ctx.entityArchetypes[eid] = internArchetypeNode(ctx, eid)

	// Only remove from queries during removal — never add (avoids cancelling pending removals)
	for (const q of queries) {
		if (!queryCheckEntity(world, q, eid) && q.has(eid)) queryRemoveEntity(world, q, eid)
	}
}

/**
 * Removes one or more components from an entity. This is an alias for removeComponent.
 */
export const removeComponents = removeComponent
