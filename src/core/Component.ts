import { entityExists, EntityId, getEntityComponents, Prefab } from './Entity'
import { queryAddEntity, queryCheckEntity, queryRemoveEntity } from './Query'
import { Query } from './Query'
import {
	IsA,
	Wildcard,
	isWildcard,
	getRelationTargets,
	$relationData,
	$isPairComponent,
	$pairTarget,
	$relation
} from './Relation'
import { createObservable, Observable } from './utils/Observer'
import { $internal, InternalWorld, World, WorldContext, ArchetypeNode, ArchetypeEdge } from './World'
import { updateHierarchyDepth, invalidateHierarchyDepth } from './Hierarchy'

/**
 * Represents a reference to a component.
 * @typedef {any} ComponentRef
 */
export type ComponentRef = any

/**
 * Represents the data associated with a component.
 * @interface ComponentData
 * @property {number} id - The unique identifier for the component.
 * @property {number} generationId - The generation ID of the component.
 * @property {number} bitflag - The bitflag used for component masking.
 * @property {ComponentRef} ref - Reference to the component.
 * @property {Set<Query>} queries - Set of queries associated with the component.
 * @property {Observable} setObservable - Observable for component changes.
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

const createArchetypeNode = (): ArchetypeNode => ({ edges: [] })

/**
 * Gets or computes the transition edge for adding/removing a component.
 * Follows the archetype graph: entity's current node → edge → target node.
 * Edge stores which queries to add/remove the entity from.
 * @param {World} world - The world object.
 * @param {WorldContext} ctx - The world context.
 * @param {ArchetypeNode} node - The entity's current archetype node.
 * @param {EntityId} eid - The entity ID (used for bitmask evaluation on cache miss).
 * @param {ComponentData} componentData - The component being added/removed.
 * @param {boolean} isAdd - Whether the component is being added or removed.
 * @returns {ArchetypeEdge} The cached or newly computed transition edge.
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

	let edge = node.edges[action]
	if (edge !== undefined) return edge

	const addTo: Query[] = []
	const removeFrom: Query[] = []

	for (const queryData of componentData.queries) {
		// Pair-filter queries are entity-specific (check relationTargets[eid]),
		// so they can't be cached per archetype node. They're handled by updatePairQueries.
		if (queryData.pairFilters.length > 0) continue
		if (queryCheckEntity(world, queryData, eid)) addTo.push(queryData)
		else removeFrom.push(queryData)
	}

	edge = { target: createArchetypeNode(), addTo, removeFrom }
	node.edges[action] = edge
	return edge
}

/**
 * Applies a cached archetype transition to an entity, updating query membership.
 * @param {World} world - The world object.
 * @param {WorldContext} ctx - The world context.
 * @param {EntityId} eid - The entity ID.
 * @param {ComponentData} componentData - The component being transitioned.
 * @param {boolean} isAdd - Whether the component is being added or removed.
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
 * @param {WorldContext} ctx - The world context.
 * @param {EntityId} eid - The entity ID.
 * @returns {boolean} True if the entity has the Prefab component.
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
 * @param {World} world - The world object.
 * @param {ComponentRef} component - The component to register.
 * @returns {ComponentData} The registered component data.
 * @throws {Error} If the component is null or undefined.
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

	if (component === Prefab) ctx.prefabData = data

	if (!isSpecificPair) {
		ctx.bitflag *= 2
		if (ctx.bitflag >= 2 ** 31) {
			ctx.bitflag = 1
			ctx.entityMasks.push([])
		}
	}

	return data
}

/**
 * Registers multiple components with the world.
 * @param {World} world - The world object.
 * @param {ComponentRef[]} components - Array of components to register.
 */
export const registerComponents = (world: World, components: ComponentRef[]) => {
	for (let i = 0; i < components.length; i++) registerComponent(world, components[i])
}

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Checks if an entity has a specific component.
 * @param {World} world - The world object.
 * @param {number} eid - The entity ID.
 * @param {ComponentRef} component - The component to check for.
 * @returns {boolean} True if the entity has the component, false otherwise.
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
 * @param {World} world - The world object.
 * @param {EntityId} eid - The entity ID.
 * @param {ComponentRef} component - The component to retrieve data for.
 * @returns {any} The component data, or undefined if the component is not found or the entity doesn't have the component.
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
 * @param {ComponentRef} component - The component to set.
 * @param {any} data - The data to set for the component.
 * @returns {{ component: ComponentRef, data: any }} An object containing the component and its data.
 */
export const set = <T extends ComponentRef>(component: T, data: any): { component: T, data: any } => ({
	component,
	data
})

/**
 * Sets component data on an entity. Always calls the setter observable even if entity already has the component.
 * @param {World} world - The world object.
 * @param {EntityId} eid - The entity ID.
 * @param {ComponentRef} component - The component to set.
 * @param {any} data - The data to set for the component.
 * @throws {Error} If the entity does not exist in the world.
 */
export const setComponent = (
	world: World,
	eid: EntityId,
	component: ComponentRef,
	data: any
): void => {
	addComponent(world, eid, set(component, data))
}

// ── Inheritance ──────────────────────────────────────────────────────

/**
 * Recursively inherits components from one entity to another.
 * @param {WorldContext} ctx - The world context.
 * @param {World} world - The world object.
 * @param {number} baseEid - The ID of the entity inheriting components.
 * @param {number} inheritedEid - The ID of the entity being inherited from.
 * @param {Set<EntityId>} visited - Set of already-visited entities to prevent circular inheritance.
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
			if (componentData?.setObservable) {
				const data = getComponent(world, inheritedEid, component)
				componentData.setObservable.notify(baseEid, data)
			}
		}
	}

	for (const parentEid of getRelationTargets(world, inheritedEid, IsA)) {
		recursivelyInherit(ctx, world, baseEid, parentEid, visited)
	}
}

// ── Wildcard Query Updates ───────────────────────────────────────

/**
 * Updates wildcard queries (Wildcard(entity) and Pair(Wildcard, Relation))
 * when a pair is added or removed. These are the only queries that can't
 * use standard bitmask evaluation.
 */
const updatePairQueries = (world: World, ctx: WorldContext, eid: EntityId, relation: ComponentRef, target: any, isAdd: boolean) => {
	for (const q of ctx.queries) {
		if (q.pairFilters.length === 0) continue
		for (let i = 0; i < q.pairFilters.length; i++) {
			const filter = q.pairFilters[i]
			// Specific pair filter: Relation(specificTarget) — adds/removes eid
			if ('target' in filter) {
				if (filter.relation === relation && filter.target === target) {
					if (isAdd) {
						if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid)
					} else {
						if (!queryCheckEntity(world, q, eid)) queryRemoveEntity(world, q, eid)
					}
				}
				continue
			}
			if (typeof target !== 'number') continue
			// Wildcard(entity) — adds/removes target
			if ('entity' in filter && filter.entity === eid) {
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
			// Pair(Wildcard, Relation) — adds/removes target
			if ('relation' in filter && filter.relation === relation) {
				if (isAdd) {
					queryAddEntity(q, target)
				} else {
					const relSet = ctx.targetsByRelation.get(relation)
					if (!relSet || !relSet.has(target)) queryRemoveEntity(world, q, target)
				}
			}
		}
	}
}

// ── Add Component ────────────────────────────────────────────────────

const ensureComponentData = (world: World, ctx: WorldContext, component: ComponentRef): ComponentData =>
	ctx.componentMap.get(component) || registerComponent(world, component)

/**
 * Adds a single component to an entity.
 * @param {World} world - The world object.
 * @param {EntityId} eid - The entity ID.
 * @param {ComponentRef | ComponentSetter} componentOrSet - Component to add or set.
 * @returns {boolean} True if component was added, false if it already existed.
 * @throws {Error} If the entity does not exist in the world.
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

		// Exclusive: remove old target first
		const relationData = relation[$relationData]
		if (relationData.exclusiveRelation === true) {
			const oldTarget = getRelationTargets(world, eid, relation)[0]
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
		if (data !== undefined) componentData.setObservable.notify(eid, data)
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
 * Adds multiple components to an entity.
 * @param {World} world - The world object.
 * @param {EntityId} eid - The entity ID.
 * @param {(ComponentRef | ComponentSetter)[] | ComponentRef | ComponentSetter} components - Components to add or set (array or spread args).
 * @throws {Error} If the entity does not exist in the world.
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

	// Invalidate archetype node — entity's component set changed
	ctx.entityArchetypes[eid] = createArchetypeNode()

	// One query evaluation pass
	for (const q of queries) {
		if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid)
		else if (q.has(eid)) queryRemoveEntity(world, q, eid)
	}
}

// ── Remove Component ─────────────────────────────────────────────────

/**
 * Internal removeComponent — skips entityExists check. Handles a single component.
 * @param {World} world - The world object.
 * @param {WorldContext} ctx - The world context.
 * @param {EntityId} eid - The entity ID.
 * @param {ComponentRef} component - The component to remove.
 */
const removeComponentInternal = (world: World, ctx: WorldContext, eid: EntityId, component: ComponentRef) => {
	if (component[$isPairComponent]) {
		const relation = component[$relation]
		const target = component[$pairTarget]

		// Wildcard removal: remove all targets for this relation
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
 * @param {World} world - The world object.
 * @param {number} eid - The entity ID.
 * @param {...ComponentRef} components - Components to remove.
 * @throws {Error} If the entity does not exist in the world.
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

	// Invalidate archetype node — entity's component set changed
	ctx.entityArchetypes[eid] = createArchetypeNode()

	// Only remove from queries during removal — never add (avoids cancelling pending removals)
	for (const q of queries) {
		if (!queryCheckEntity(world, q, eid) && q.has(eid)) queryRemoveEntity(world, q, eid)
	}
}

/**
 * Removes one or more components from an entity. This is an alias for removeComponent.
 * @param {World} world - The world object.
 * @param {EntityId} eid - The entity ID.
 * @param {...ComponentRef} components - Components to remove.
 * @throws {Error} If the entity does not exist in the world.
 */
export const removeComponents = removeComponent
