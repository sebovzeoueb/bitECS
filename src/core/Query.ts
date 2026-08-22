import { createSparseSet, createUint32SparseSet, type SparseSet } from './utils/SparseSet'
import { hasComponent, registerComponent, ComponentRef, ComponentData } from './Component'
import { $internal, World, InternalWorld, RelationEntry } from './World'
import { createObservable } from './utils/Observer'
import { EntityId, Prefab } from './Entity'
import { queryHierarchy, queryHierarchyDepth } from './Hierarchy'
import { $isPairComponent, $relation, $pairTarget, Wildcard, isWildcard, isRelation } from './Relation'

/**
 * @typedef {Readonly<Uint32Array> | readonly EntityId[]} QueryResult
 * @description The result of a query as a readonly array of entity IDs.
 */
export type QueryResult = Readonly<Uint32Array> | readonly EntityId[]

/**
 * @typedef {Object} QueryOptions
 * @description Options for configuring query behavior.
 * @property {boolean} [commit=true] - Whether to commit pending entity removals before querying.
 * @property {boolean} [buffered=false] - Whether to return results as Uint32Array instead of number[].
 */
export interface QueryOptions {
	commit?: boolean
	buffered?: boolean
}

/**
 * @typedef {Object} Query
 * @description Represents a query in the ECS using original blazing-fast bitmask evaluation.
 * @property {ComponentRef[]} allComponents - All components referenced in the query.
 * @property {ComponentRef[]} orComponents - Components in an OR relationship.
 * @property {ComponentRef[]} notComponents - Components that should not be present.
 * @property {Record<number, number>} masks - Bitmasks for each component generation.
 * @property {Record<number, number>} orMasks - OR bitmasks for each component generation.
 * @property {Record<number, number>} notMasks - NOT bitmasks for each component generation.
 * @property {Record<number, number>} hasMasks - HAS bitmasks for each component generation.
 * @property {number[]} generations - Component generations.
 * @property {SparseSet} toRemove - Set of entities to be removed.
 * @property {ReturnType<typeof createObservable>} addObservable - Observable for entity additions.
 * @property {ReturnType<typeof createObservable>} removeObservable - Observable for entity removals.
 */
export type SpecificPairFilter = { relation: ComponentRef, target: any }
export type PairFilter = { entity: EntityId } | { relation: ComponentRef } | SpecificPairFilter

export type Query = SparseSet & {
	allComponents: ComponentRef[]
	orComponents: ComponentRef[]
	notComponents: ComponentRef[]
	masks: Record<number, number>
	orMasks: Record<number, number>
	notMasks: Record<number, number>
	hasMasks: Record<number, number>
	hasOrTerms: boolean
	generations: number[]
	toRemove: SparseSet
	addObservable: ReturnType<typeof createObservable>
	removeObservable: ReturnType<typeof createObservable>
	queues: Record<any, any>
	pairFilters: PairFilter[]
	componentsData: ComponentData[]
	hash: string
	pairComponent?: ComponentRef
}

/**
 * @typedef {'Or' | 'And' | 'Not'} QueryOperatorType
 * @description Types of query operators.
 */
export type QueryOperatorType = 'Or' | 'And' | 'Not'
/**
 * Symbol for query operator type.
 * @type {Symbol}
 */
export const $opType = Symbol.for('bitecs-opType')

/**
 * Symbol for query operator terms.
 * @type {Symbol}
 */
export const $opTerms = Symbol.for('bitecs-opTerms')

/**
 * @typedef {Object} OpReturnType
 * @property {symbol} [$opType] - The type of the operator.
 * @property {symbol} [$opTerms] - The components involved in the operation.
 */
export type OpReturnType = {
	[$opType]: string
	[$opTerms]: ComponentRef[]
}

/**
 * @typedef {Function} QueryOperator
 * @description A function that creates a query operator.
 * @param {...ComponentRef} components - The components to apply the operator to.
 * @returns {OpReturnType} The result of the operator.
 */
export type QueryOperator = (...components: ComponentRef[]) => OpReturnType

/**
 * @typedef {ComponentRef | QueryOperator | HierarchyTerm} QueryTerm
 * @description A term in a query, either a component reference, query operator, or hierarchy term.
 */
export type QueryTerm = ComponentRef | QueryOperator | HierarchyTerm


const createOp = (type: string) => (...components: ComponentRef[]) => ({ [$opType]: type, [$opTerms]: components })

export const Or: QueryOperator = createOp('Or')
export const And: QueryOperator = createOp('And')
export const Not: QueryOperator = createOp('Not')
export const Any = Or
export const All = And
export const None = Not

// NEW: Hierarchy combinator symbols
export const $hierarchyType = Symbol.for('bitecs-hierarchyType')
export const $hierarchyRel = Symbol.for('bitecs-hierarchyRel')
export const $hierarchyDepth = Symbol.for('bitecs-hierarchyDepth')

/**
 * @typedef {Object} HierarchyTerm
 * @description Represents a hierarchy query term for topological ordering.
 * @property {symbol} [$hierarchyType] - Always 'Hierarchy'.
 * @property {ComponentRef} [$hierarchyRel] - The relation component for hierarchy.
 * @property {number} [$hierarchyDepth] - Optional depth limit.
 */
export type HierarchyTerm = {
	[$hierarchyType]: 'Hierarchy'
	[$hierarchyRel]: ComponentRef
	[$hierarchyDepth]?: number
}

/**
 * @function Hierarchy
 * @description Creates a hierarchy query term for topological ordering (parents before children).
 * @param {ComponentRef} relation - The relation component (e.g., ChildOf).
 * @param {number} [depth] - Optional depth limit.
 * @returns {HierarchyTerm} The hierarchy term.
 */
export const Hierarchy = (relation: ComponentRef, depth?: number): HierarchyTerm => ({
	[$hierarchyType]: 'Hierarchy',
	[$hierarchyRel]: relation,
	[$hierarchyDepth]: depth
})

/**
 * @function Cascade
 * @description Alias for Hierarchy - creates a hierarchy query term for topological ordering.
 * @param {ComponentRef} relation - The relation component (e.g., ChildOf).
 * @param {number} [depth] - Optional depth limit.
 * @returns {HierarchyTerm} The hierarchy term.
 */
export const Cascade = Hierarchy

// Query modifier symbols
export const $modifierType = Symbol.for('bitecs-modifierType')

/**
 * @typedef {Object} QueryModifier
 * @description Represents a query modifier that can be mixed into query terms.
 * @property {symbol} [$modifierType] - The type of modifier ('buffer' | 'nested').
 */
export type QueryModifier = {
	[$modifierType]: 'buffer' | 'nested'
}

export const asBuffer: QueryModifier = { [$modifierType]: 'buffer' }
export const isNested: QueryModifier = { [$modifierType]: 'nested' }
export const noCommit = isNested

/**
 * @typedef {Function} ObservableHook
 * @description A function that creates an observable hook for queries.
 * @param {...QueryTerm} terms - The query terms to observe.
 * @returns {{type: 'add' | 'remove' | 'set', terms: QueryTerm[]}} The observable hook configuration.
 */
export type ObservableHookDef = (...terms: QueryTerm[]) => {
	[$opType]: 'add' | 'remove' | 'set' | 'get'
	[$opTerms]: QueryTerm[]
}

export type ObservableHook = ReturnType<ObservableHookDef>

const createHook = (type: 'add' | 'remove' | 'set' | 'get') => (...terms: QueryTerm[]) => ({ [$opType]: type, [$opTerms]: terms })
export const onAdd: ObservableHookDef = createHook('add')
export const onRemove: ObservableHookDef = createHook('remove')
export const onSet: ObservableHookDef = (component: ComponentRef) => ({ [$opType]: 'set', [$opTerms]: [component] })
export const onGet: ObservableHookDef = (component: ComponentRef) => ({ [$opType]: 'get', [$opTerms]: [component] })

/**
 * @function observe
 * @description Observes changes in entities based on specified components.
 * @param {World} world - The world object.
 * @param {ObservableHook} hook - The observable hook.
 * @param {function(number): any} callback - The callback function to execute when changes occur.
 * @returns {function(): void} A function to unsubscribe from the observation.
 */
export function observe(world: World, hook: ObservableHook, callback: (eid: EntityId, ...args: any[]) => any): () => void {
	const ctx = (world as InternalWorld)[$internal]
	const { [$opType]: type, [$opTerms]: components } = hook

	if (type === 'add' || type === 'remove') {
		const queryData = ctx.queriesHashMap.get(queryHash(world, components)) || registerQuery(world, components)
		return queryData[type === 'add' ? 'addObservable' : 'removeObservable'].subscribe(callback)
	}
	
	if (type === 'set' || type === 'get') {
		if (components.length !== 1) throw new Error('Set and Get hooks can only observe a single component')
		const componentData = ctx.componentMap.get(components[0]) || registerComponent(world, components[0])
		return componentData[type === 'set' ? 'setObservable' : 'getObservable'].subscribe(callback)
	}

	throw new Error(`Invalid hook type: ${type}`)
}

/**
 * Hashes an observer hook for queue caching.
 */
const hookHash = (world: World, hook: ObservableHook): string => {
	const { [$opType]: type, [$opTerms]: components } = hook
	return `${type}:${queryHash(world, components)}`
}

/**
 * Returns the observer queue for a hook, creating and subscribing on first call.
 * Queues are tracked by their numeric pair targets so entity removal can drop
 * them once the target no longer exists.
 */
const getObserverQueue = (world: World, hook: ObservableHook): EntityId[] => {
	const ctx = (world as InternalWorld)[$internal]
	const hash = hookHash(world, hook)

	let entry = ctx.observerQueues.get(hash)
	if (!entry) {
		const buf: EntityId[] = []
		const unsubscribe = observe(world, hook, (eid: EntityId) => buf.push(eid))

		// Seed onAdd queues with existing matches so first-frame adds aren't missed
		if (hook[$opType] === 'add') {
			const existing = queryInternal(world, hook[$opTerms])
			for (let i = 0; i < existing.length; i++) buf.push(existing[i] as EntityId)
		}

		entry = { buf, unsubscribe }
		ctx.observerQueues.set(hash, entry)

		// Track numeric pair targets so removeEntity can release the queue
		const terms = hook[$opTerms]
		for (let i = 0; i < terms.length; i++) {
			const term = terms[i]
			if (term && typeof term === 'object' && term[$isPairComponent] && typeof term[$pairTarget] === 'number') {
				const target = term[$pairTarget]
				let set = ctx.observerQueuesByTarget.get(target)
				if (!set) {
					set = new Set()
					ctx.observerQueuesByTarget.set(target, set)
				}
				set.add(hash)
			}
		}
	}

	return entry.buf
}

/**
 * Releases observer queues for hooks that reference the given pair target,
 * which is being removed. Must run before pair queries are evicted so the
 * internal subscriptions stop counting against them.
 */
export const dropObserverQueuesFor = (world: World, target: EntityId) => {
	const ctx = (world as InternalWorld)[$internal]
	const hashes = ctx.observerQueuesByTarget.get(target)
	if (!hashes) return
	for (const hash of hashes) {
		const entry = ctx.observerQueues.get(hash)
		if (entry) {
			entry.unsubscribe()
			ctx.observerQueues.delete(hash)
		}
	}
	ctx.observerQueuesByTarget.delete(target)
}

/**
 * Returns entities that matched the observer hook since last drain, then clears the queue.
 * Auto-registers the observer on first call. Cached by hook type + terms.
 * @param {World} world - The world object.
 * @param {ObservableHook} hook - The observer hook (onAdd, onRemove, onSet, onGet).
 * @returns {EntityId[]} Array of entity IDs accumulated since last drain.
 */
export const queueDrain = (world: World, hook: ObservableHook): EntityId[] => {
	const buf = getObserverQueue(world, hook)
	const result = buf.slice()
	buf.length = 0
	return result
}

/**
 * Returns entities that matched the observer hook since last drain WITHOUT clearing the queue.
 * @param {World} world - The world object.
 * @param {ObservableHook} hook - The observer hook (onAdd, onRemove, onSet, onGet).
 * @returns {EntityId[]} Array of entity IDs accumulated since last drain.
 */
export const queuePeek = (world: World, hook: ObservableHook): EntityId[] => {
	return getObserverQueue(world, hook).slice()
}

export const queue = queueDrain
export const peek = queuePeek

/**
 * @function queryHash
 * @description Generates a hash for a query based on its terms.
 * @param {World} world - The world object.
 * @param {QueryTerm[]} terms - The query terms.
 * @returns {string} The generated hash.
 */
export const queryHash = (world: World, terms: QueryTerm[]): string => {
	const ctx = (world as InternalWorld)[$internal]
	const getComponentId = (component: ComponentRef): number => {
		if (!ctx.componentMap.has(component)) registerComponent(world, component)
		return ctx.componentMap.get(component)!.id
	}
	const termToString = (term: QueryTerm): string => {
		if (typeof term === 'object' && term !== null && $opType in term) {
			return `${term[$opType].toLowerCase()}(${term[$opTerms].map(termToString).sort().join(',')})`
		}
		if (term[$isPairComponent]) {
			const relation = term[$relation]
			const target = term[$pairTarget]
			if (isWildcard(relation)) {
				// Wildcard(X) — hash by target identity
				if (typeof target === 'number') return `w(e${target})`
				if (isRelation(target)) {
					if (!ctx.componentMap.has(target)) registerComponent(world, target)
					return `w(r${ctx.componentMap.get(target)!.id})`
				}
				return `w(?)`
			}
			if (target === Wildcard) {
				// Relation(Wildcard) — same hash as bare relation
				return getComponentId(relation).toString()
			}
			// Relation(specificTarget) — hash includes target
			return `p(${getComponentId(relation)},${target})`
		}
		return getComponentId(term).toString()
	}

	return terms.map(termToString).sort().join('-')
}

/**
 * Invalidates cached archetype transitions by bumping the query version.
 * Cached edges are stamped with the version they were computed under and
 * recomputed lazily when the stamp no longer matches.
 */
const invalidateArchetypeTransitions = (ctx: InternalWorld[typeof $internal]) => {
	ctx.queryVersion++
}

const indexQuery = <K>(index: Map<K, Set<Query>>, key: K, query: Query) => {
	let set = index.get(key)
	if (!set) {
		set = new Set()
		index.set(key, set)
	}
	set.add(query)
}

const unindexQuery = <K>(index: Map<K, Set<Query>>, key: K, query: Query) => {
	const set = index.get(key)
	if (!set) return
	set.delete(query)
	if (set.size === 0) index.delete(key)
}

/**
 * Removes a query from every world registry: query set, hash map, component
 * query sets, notQueries, dirtyQueries, and the pair filter indexes.
 * Used by removeQuery and by entity removal to release queries whose pair
 * target no longer exists.
 */
export const removeQueryFromWorld = (world: World, query: Query) => {
	const ctx = (world as InternalWorld)[$internal]
	if (!ctx.queries.delete(query)) return
	if (query.pairComponent) ctx.pairQueryMap.delete(query.pairComponent)
	if (ctx.queriesHashMap.get(query.hash) === query) ctx.queriesHashMap.delete(query.hash)
	ctx.notQueries.delete(query)
	ctx.dirtyQueries.delete(query)
	for (let i = 0; i < query.componentsData.length; i++) {
		query.componentsData[i].queries.delete(query)
	}
	for (let i = 0; i < query.pairFilters.length; i++) {
		const filter = query.pairFilters[i]
		if ('target' in filter) unindexQuery(ctx.queriesByTarget, filter.target, query)
		else if ('entity' in filter) unindexQuery(ctx.queriesByEntity, filter.entity, query)
		else unindexQuery(ctx.queriesByRelation, filter.relation, query)
	}
	invalidateArchetypeTransitions(ctx)
}

/**
 * A single specific-pair term (e.g. ChildOf(eid)) resolves to the same
 * component object every time, so its query can be cached by that object
 * instead of by hash string. Wildcard pairs are excluded: they need filters.
 */
const isCacheablePairTerm = (term: QueryTerm): boolean =>
	typeof term === 'object' && term !== null &&
	term[$isPairComponent] && !isWildcard(term[$relation]) && term[$pairTarget] !== Wildcard

/**
 * @function registerQuery  
 * @description Registers a new query in the world using unified clause-mask compilation.
 * @param {World} world - The world object.
 * @param {QueryTerm[]} terms - The query terms.
 * @param {Object} [options] - Additional options.
 * @param {boolean} [options.buffered] - Whether the query should be buffered.
 * @returns {Query} The registered query.
 */
export const registerQuery = (world: World, terms: QueryTerm[], options: { buffered?: boolean } = {}): Query => {
	const ctx = (world as InternalWorld)[$internal]
	const hash = queryHash(world, terms)

	const isOp = (term: QueryTerm): term is OpReturnType =>
		typeof term === 'object' && term !== null && $opType in term

	const pairFilters: PairFilter[] = []

	// Unwrap pair terms: Wildcard pairs use indexes, Relation(Wildcard) uses relation bitflag,
	// specific pairs (Relation(target)) use their own bitflag — no unwrapping needed.
	// Only the collect pass gathers pairFilters; later passes unwrap the same
	// terms again and must not duplicate the filters.
	const unwrapTerm = (term: ComponentRef, collectFilters = false): ComponentRef => {
		if (term[$isPairComponent]) {
			const relation = term[$relation]
			const target = term[$pairTarget]
			if (isWildcard(relation)) {
				if (collectFilters) {
					if (typeof target === 'number') pairFilters.push({ entity: target })
					else if (isRelation(target)) pairFilters.push({ relation: target })
				}
				return null as any
			}
			if (target === Wildcard) {
				if (!ctx.componentMap.has(relation)) registerComponent(world, relation)
				return relation
			}
			// Specific pair: use relation bitflag + pair filter
			if (!ctx.componentMap.has(relation)) registerComponent(world, relation)
			if (collectFilters) pairFilters.push({ relation, target })
			return relation
		}
		return term
	}

	const queryComponents: ComponentRef[] = []
	const collect = (term: QueryTerm) => {
		if (isOp(term)) {
			const opTerms = term[$opTerms]
			for (let j = 0; j < opTerms.length; j++) collect(opTerms[j])
		} else {
			const unwrapped = unwrapTerm(term, true)
			if (unwrapped === null) return // wildcard filter, no bitmask
			if (!ctx.componentMap.has(unwrapped)) registerComponent(world, unwrapped)
			queryComponents.push(unwrapped)
		}
	}
	for (let i = 0; i < terms.length; i++) collect(terms[i])

	const components: ComponentRef[] = []
	const notComponents: ComponentRef[] = []
	const orComponents: ComponentRef[] = []

	const addToArray = (arr: ComponentRef[], comps: ComponentRef[]) => {
		for (let j = 0; j < comps.length; j++) {
			const unwrapped = unwrapTerm(comps[j])
			if (unwrapped === null) continue
			if (!ctx.componentMap.has(unwrapped)) registerComponent(world, unwrapped)
			arr.push(unwrapped)
		}
	}

	for (let i = 0; i < terms.length; i++) {
		const term = terms[i]
		if (isOp(term)) {
			const { [$opType]: type, [$opTerms]: comps } = term
			if (type === 'Not') addToArray(notComponents, comps)
			else if (type === 'Or') addToArray(orComponents, comps)
			else if (type === 'And') addToArray(components, comps)
			else throw new Error(`Nested combinator ${type} not supported yet - use simple queries for best performance`)
		} else {
			const unwrapped = unwrapTerm(term)
			if (unwrapped === null) continue
			if (!ctx.componentMap.has(unwrapped)) registerComponent(world, unwrapped)
			components.push(unwrapped)
		}
	}

	const allComponentsData = queryComponents.map(c => ctx.componentMap.get(c)!)
	const generations = allComponentsData.length > 0
		? [...new Set(allComponentsData.map(c => c.generationId))]
		: []
	const reduceBitflags = (a: Record<number, number>, c: ComponentData) => (a[c.generationId] = (a[c.generationId] || 0) | c.bitflag, a)

	const masks = components.map(c => ctx.componentMap.get(c)!).reduce(reduceBitflags, {})
	const notMasks = notComponents.map(c => ctx.componentMap.get(c)!).reduce(reduceBitflags, {})
	const orMasks = orComponents.map(c => ctx.componentMap.get(c)!).reduce(reduceBitflags, {})
	const hasMasks = allComponentsData.reduce(reduceBitflags, {})

	const hasOrTerms = orComponents.length > 0

	const isSingleSpecificPair = !options.buffered && terms.length === 1 && isCacheablePairTerm(terms[0])

	const query = Object.assign(options.buffered ? createUint32SparseSet() : createSparseSet(), {
		allComponents: queryComponents, orComponents, notComponents, masks, notMasks, orMasks, hasMasks, hasOrTerms, generations,
		toRemove: createSparseSet(), addObservable: createObservable(), removeObservable: createObservable(), queues: {},
		pairFilters, componentsData: allComponentsData, hash,
		pairComponent: isSingleSpecificPair ? terms[0] : undefined
	}) as Query

	ctx.queries.add(query)

	ctx.queriesHashMap.set(hash, query)

	if (isSingleSpecificPair) ctx.pairQueryMap.set(terms[0], query)
	for (let i = 0; i < allComponentsData.length; i++) {
		allComponentsData[i].queries.add(query)
	}

	if (notComponents.length) ctx.notQueries.add(query)

	// Index pair-filtered queries so pair operations and entity removal can
	// find them without scanning every query in the world
	for (let i = 0; i < pairFilters.length; i++) {
		const filter = pairFilters[i]
		if ('target' in filter) indexQuery(ctx.queriesByTarget, filter.target, query)
		else if ('entity' in filter) indexQuery(ctx.queriesByEntity, filter.entity, query)
		else indexQuery(ctx.queriesByRelation, filter.relation, query)
	}

	// New queries change the cached transition results, but existing entities
	// must retain the nodes that identify their current archetypes.
	invalidateArchetypeTransitions(ctx)

	// Populate initial query membership
	const hasTargetFilters = pairFilters.some(f => 'target' in f)
	const hasWildcardFilters = pairFilters.some(f => !('target' in f))
	if (pairFilters.length > 0 && queryComponents.length === 0 && hasWildcardFilters) {
		// Pure wildcard query — resolve from indexes
		for (const filter of pairFilters) {
			if ('entity' in filter) {
				// Wildcard(entity) — collect all targets of entity's relations
				const relTargets = ctx.relationTargets[filter.entity]
				if (relTargets) {
					for (const [, targets] of relTargets) {
						for (const t of targets) queryAddEntity(query, t)
					}
				}
			} else {
				// Pair(Wildcard, Relation) — collect all entities targeted via this relation
				const targetSet = ctx.targetsByRelation.get(filter.relation)
				if (targetSet) {
					for (const eid of targetSet) queryAddEntity(query, eid)
				}
			}
		}
	} else if (hasTargetFilters && !hasWildcardFilters) {
		// Specific-pair queries — populate from the reverse target index instead
		// of scanning every alive entity
		let bestFilter: SpecificPairFilter | null = null
		let bestCandidates: RelationEntry[] | null = null
		for (const filter of pairFilters) {
			if ('target' in filter && typeof filter.target === 'number') {
				const candidates = ctx.reverseIndex[filter.target]
				if (candidates && (!bestCandidates || candidates.length < bestCandidates.length)) {
					bestFilter = filter
					bestCandidates = candidates
				}
			}
		}
		if (bestFilter && bestCandidates) {
			for (let i = 0; i < bestCandidates.length; i++) {
				const entry = bestCandidates[i]
				if (entry.relation !== bestFilter.relation) continue
				if (hasComponent(world, entry.subject, Prefab)) continue
				if (queryCheckEntity(world, query, entry.subject)) queryAddEntity(query, entry.subject)
			}
		} else {
			// No numeric targets to index — fall back to a full scan
			populateByScan(world, ctx, query)
		}
	} else {
		populateByScan(world, ctx, query)
	}

	return query
}

/**
 * Populates initial query membership by scanning all alive entities.
 */
const populateByScan = (world: World, ctx: InternalWorld[typeof $internal], query: Query) => {
	const entityIndex = ctx.entityIndex
	for (let i = 0; i < entityIndex.aliveCount; i++) {
		const eid = entityIndex.dense[i]
		if (hasComponent(world, eid, Prefab)) continue
		if (queryCheckEntity(world, query, eid)) queryAddEntity(query, eid)
	}
}



/**
 * @function queryInternal
 * @description Internal implementation for nested queries.
 * @param {World} world - The world object.
 * @param {QueryTerm[]} terms - The query terms.
 * @param {Object} [options] - Additional options.
 * @param {boolean} [options.buffered] - Whether the query should be buffered.
 * @returns {QueryResult} The result of the query.
 */
export function queryInternal(world: World, terms: QueryTerm[], options: { buffered?: boolean } = {}): QueryResult {
	const queryData = resolveQuery(world, terms, options)
	return options.buffered ? queryData.dense as Readonly<Uint32Array> : queryData.dense as readonly EntityId[]
}

/**
 * Resolves the registered Query for a set of terms, registering it on first use.
 */
const resolveQuery = (world: World, terms: QueryTerm[], options: { buffered?: boolean } = {}): Query => {
	const ctx = (world as InternalWorld)[$internal]
	const hash = queryHash(world, terms)
	let queryData = ctx.queriesHashMap.get(hash)
	if (!queryData) {
		queryData = registerQuery(world, terms, options)
	} else if (options.buffered && !('buffer' in queryData.dense)) {
		queryData = registerQuery(world, terms, { buffered: true })
	}
	return queryData
}

/**
 * @function query
 * @description Performs a unified query operation with configurable options.
 * @param {World} world - The world object.
 * @param {QueryTerm[]} terms - The query terms.
 * @param {...QueryModifier} modifiers - Query modifiers (asBuffer, isNested, etc.).
 * @returns {QueryResult} The result of the query.
 * @description Hoist the terms array (define it once, outside your loop) to hit
 * the term-identity cache and skip hashing entirely on repeat calls.
 */
export function query(world: World, terms: QueryTerm[], ...modifiers: (QueryModifier | QueryOptions)[]): QueryResult {
	const ctx = (world as InternalWorld)[$internal]

	// Fast path: a hoisted terms array maps straight to its query by identity.
	// The liveness check guards against queries evicted by removeQuery/removeEntity.
	if (modifiers.length === 0) {
		const cached = ctx.queryTermCache.get(terms)
		if (cached && ctx.queries.has(cached)) {
			commitRemovals(world)
			return cached.dense as readonly EntityId[]
		}
	}

	// Fast path: a single specific pair is cached by the pair component itself,
	// so it skips hashing entirely. Same predicate registerQuery uses to fill
	// pairQueryMap — they must agree or every call would register a new query.
	if (terms.length === 1 && modifiers.length === 0 && isCacheablePairTerm(terms[0])) {
		commitRemovals(world)
		const cached = ctx.pairQueryMap.get(terms[0]) ?? registerQuery(world, terms)
		ctx.queryTermCache.set(terms, cached)
		return cached.dense as readonly EntityId[]
	}

	const hierarchyTerm = terms.find(term => term && typeof term === 'object' && $hierarchyType in term) as HierarchyTerm | undefined

	let buffered = false, commit = true
	const hasModifiers = modifiers.some(m => m && typeof m === 'object' && $modifierType in m)

	for (const modifier of modifiers) {
		if (hasModifiers && modifier && typeof modifier === 'object' && $modifierType in modifier) {
			const mod = modifier as QueryModifier
			if (mod[$modifierType] === 'buffer') buffered = true
			if (mod[$modifierType] === 'nested') commit = false
		} else if (!hasModifiers) {
			const opts = modifier as QueryOptions
			if (opts.buffered !== undefined) buffered = opts.buffered
			if (opts.commit !== undefined) commit = opts.commit
		}
	}

	if (hierarchyTerm) {
		const regularTerms = terms.filter(term => !(term && typeof term === 'object' && $hierarchyType in term))
		const { [$hierarchyRel]: relation, [$hierarchyDepth]: depth } = hierarchyTerm
		return depth !== undefined ? queryHierarchyDepth(world, relation, depth, { buffered }) : queryHierarchy(world, relation, regularTerms, { buffered })
	}

	if (commit) commitRemovals(world)
	const queryData = resolveQuery(world, terms, { buffered })
	if (modifiers.length === 0) ctx.queryTermCache.set(terms, queryData)
	return buffered ? queryData.dense as Readonly<Uint32Array> : queryData.dense as readonly EntityId[]
}



/**
 * @function queryCheckEntity
 * @description Original blazing-fast query evaluation using simple bitmasks.
 * @param {World} world - The world object.
 * @param {Query} query - The query to check against.
 * @param {number} eid - The entity ID to check.
 * @returns {boolean} True if the entity matches the query, false otherwise.
 */
export function queryCheckEntity(world: World, query: Query, eid: EntityId): boolean {
	const ctx = (world as InternalWorld)[$internal]
	const { masks, notMasks, orMasks, hasOrTerms, generations, pairFilters } = query

	// Bitmask evaluation — handles regular components, specific pairs, and Relation(Wildcard)
	let hasOrMatch = !hasOrTerms

	for (let i = 0; i < generations.length; i++) {
		const generationId = generations[i]
		const qMask = masks[generationId]
		const qNotMask = notMasks[generationId]
		const qOrMask = orMasks[generationId]
		const eMask = ctx.entityMasks[generationId][eid]

		if (qNotMask && (eMask & qNotMask) !== 0) return false
		if (qMask && (eMask & qMask) !== qMask) return false
		if (qOrMask && (eMask & qOrMask) !== 0) hasOrMatch = true
	}

	if (!hasOrMatch) return false

	// Pair filters — queries that can't use bitmasks alone
	if (pairFilters.length > 0) {
		for (let i = 0; i < pairFilters.length; i++) {
			const filter = pairFilters[i]
			// Specific pair: Relation(target)
			if ('target' in filter) {
				const targets = ctx.relationTargets[eid]?.get(filter.relation)
				if (!targets || !targets.has(filter.target)) return false
			}
			// Wildcard(entity)
			else if ('entity' in filter) {
				const relTargets = ctx.relationTargets[eid]
				if (!relTargets) return false
				let found = false
				for (const [, targets] of relTargets) {
					if (targets.has(filter.entity)) { found = true; break }
				}
				if (!found) return false
			}
			// Pair(Wildcard, Relation)
			else {
				const rev = ctx.reverseIndex[eid]
				if (!rev) return false
				let found = false
				for (let j = 0; j < rev.length; j++) {
					if (rev[j].relation === filter.relation) { found = true; break }
				}
				if (!found) return false
			}
		}
	}

	return true
}



/**
 * @function queryCheckComponent
 * @description Checks if a component matches a query.
 * @param {Query} query - The query to check against.
 * @param {ComponentData} c - The component data to check.
 * @returns {boolean} True if the component matches the query, false otherwise.
 */
export const queryCheckComponent = (query: Query, c: ComponentData) => {
	const { generationId, bitflag } = c
	const { hasMasks } = query
	const mask = hasMasks[generationId]
	return (mask & bitflag) === bitflag
}

/**
 * @function queryAddEntity
 * @description Adds an entity to a query.
 * @param {Query} query - The query to add the entity to.
 * @param {number} eid - The entity ID to add.
 */
export const queryAddEntity = (query: Query, eid: EntityId) => {
	// If there is a pending removal for this entity in this query, cancel it and emit add again.
	// This ensures remove-then-add within the same frame produces a fresh onAdd event for observers.
	if (query.toRemove.has(eid)) {
		query.toRemove.remove(eid)
		query.addObservable.notify(eid)
		return
	}
	// Prevent duplicate onAdd notifications when multiple components cause the same entity
	// to newly satisfy an Or(...) or mixed combinator query within a single update sequence.
	if (query.has(eid)) return

	query.add(eid)
	
	// Notify after the entity is actually added to the query set to reflect state transition.
	query.addObservable.notify(eid)
}

/**
 * @function queryCommitRemovals
 * @description Commits removals for a query.
 * @param {Query} query - The query to commit removals for.
 */
const queryCommitRemovals = (query: Query) => {
	for (let i = 0; i < query.toRemove.dense.length; i++) {
		const eid = query.toRemove.dense[i]

		query.remove(eid)
	}
	query.toRemove.reset()
}

/**
 * @function commitRemovals
 * @description Commits all pending removals for queries in the world.
 * @param {World} world - The world object.
 */
export const commitRemovals = (world: World) => {
	const ctx = (world as InternalWorld)[$internal]
	if (!ctx.dirtyQueries.size) return
	for (const q of ctx.dirtyQueries) queryCommitRemovals(q)
	ctx.dirtyQueries.clear()
}

/**
 * @function queryRemoveEntity
 * @description Removes an entity from a query.
 * @param {World} world - The world object.
 * @param {Query} query - The query to remove the entity from.
 * @param {number} eid - The entity ID to remove.
 */
export const queryRemoveEntity = (world: World, query: Query, eid: EntityId) => {
	const ctx = (world as InternalWorld)[$internal]
	const has = query.has(eid)
	if (!has || query.toRemove.has(eid)) return
	query.toRemove.add(eid)
	ctx.dirtyQueries.add(query)
	query.removeObservable.notify(eid)
}

/**
 * @function removeQuery
 * @description Removes a query from the world.
 * @param {World} world - The world object.
 * @param {QueryTerm[]} terms - The query terms of the query to remove.
 */
export const removeQuery = (world: World, terms: QueryTerm[]) => {
	const ctx = (world as InternalWorld)[$internal]
	const hash = queryHash(world, terms)
	const query = ctx.queriesHashMap.get(hash)
	if (query) removeQueryFromWorld(world, query)
}
