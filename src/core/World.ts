import { defineHiddenProperty } from './utils/defineHiddenProperty'
import { createEntityIndex, EntityIndex } from './EntityIndex'
import { ComponentRef, ComponentData } from './Component'
import { Query, QueryResult } from './Query'
import { EntityId } from './Entity'
import { type SparseSet } from './utils/SparseSet'

export const $internal = Symbol.for('bitecs_internal')

/**
 * Represents a node in the archetype transition graph.
 * Each node corresponds to a unique component signature.
 * Edges are cached transitions indexed by component action.
 */
export type ArchetypeNode = {
    edges: (ArchetypeEdge | undefined)[]
}

/**
 * Represents a cached transition between archetype nodes.
 * Stores the target node and which queries to add/remove the entity from.
 */
export type ArchetypeEdge = {
    target: ArchetypeNode
    addTo: Query[]
    removeFrom: Query[]
    // Pair-filtered queries this component can affect. Which queries those are
    // depends only on the component, so it caches here like addTo/removeFrom;
    // only the membership outcome is per entity, so applyTransition evaluates it.
    pairChecked: Query[]
    // Query version this edge was computed under; a stale stamp means a
    // query was registered or removed since, so the edge must be recomputed.
    version: number
}

export type RelationEntry = { subject: EntityId, relation: ComponentRef }

export type WorldContext = {
    entityIndex: EntityIndex
    // Component bitmasks, one holey number[] per generation. Holey on purpose:
    // versioned entity ids index by their full value, and sparse arrays absorb
    // the huge indexes that versioning produces (undefined reads coerce to 0)
    entityMasks: number[][]
    entityComponents: ComponentRef[][]
    bitflag: number
    componentMap: Map<ComponentRef, ComponentData>
    componentCount: number
    queries: Set<Query>
    queriesHashMap: Map<string, Query>
    notQueries: Set<any>
    dirtyQueries: Set<any>
    entityArchetypes: ArchetypeNode[]
    rootArchetype: ArchetypeNode
    // Canonical archetype nodes interned by mask signature, so entities with
    // identical component masks share nodes (and their cached edges)
    archetypeNodeMap: Map<string, ArchetypeNode>
    prefabData: ComponentData | null
    // Bumped whenever a query is registered or removed; cached archetype
    // edges are stamped with the version they were computed under and
    // recomputed lazily when the stamp is stale.
    queryVersion: number
    // Relation indexes
    relationTargets: (Map<ComponentRef, Set<any>> | null)[]
    reverseIndex: (RelationEntry[] | null)[]
    targetsByRelation: Map<ComponentRef, Set<EntityId>>
    pairsByTarget: Map<EntityId, ComponentRef[]>
    // Pair-filtered query indexes: specific pairs by target, Wildcard(entity)
    // by entity, Pair(Wildcard, Relation) by relation
    queriesByTarget: Map<any, Set<Query>>
    queriesByEntity: Map<EntityId, Set<Query>>
    queriesByRelation: Map<ComponentRef, Set<Query>>
    // O(1) cache for single specific-pair queries keyed by the pair component
    // (ChildOf(eid) returns a stable object per target, so no hash string needed)
    pairQueryMap: Map<ComponentRef, Query>
    // Term-array-identity cache: hoisted query term arrays skip hashing entirely.
    // Entries may go stale after removeQuery; callers must check ctx.queries.has()
    queryTermCache: WeakMap<object, Query>
    // Observer queues (for queue/queuePeek), with unsubscribe handles and
    // per-target tracking so entity removal can drop queues for dead targets
    observerQueues: Map<string, { buf: EntityId[], unsubscribe: () => void }>
    observerQueuesByTarget: Map<EntityId, Set<string>>
    hierarchyData: Map<ComponentRef, {
        depths: Uint32Array
        dirty: SparseSet
        depthToEntities: Map<number, SparseSet>
        maxDepth: number
    }>
    hierarchyActiveRelations: Set<ComponentRef>
    hierarchyQueryCache: Map<ComponentRef, { hash: string, result: QueryResult }>
}

export type InternalWorld = {
    [$internal]: WorldContext
}

export type World<T extends object = {}> = { [K in keyof T]: T[K] }

export const createArchetypeNode = (): ArchetypeNode => ({ edges: [] })

const createWorldContext = (entityIndex?: EntityIndex): WorldContext => {
    const rootArchetype = createArchetypeNode()
    return {
    entityIndex: entityIndex || createEntityIndex(),
    entityMasks: [[]],
    entityComponents: [],
    bitflag: 1,
    componentMap: new Map(),
    componentCount: 0,
    queries: new Set(),
    queriesHashMap: new Map(),
    notQueries: new Set(),
    queryVersion: 0,
    dirtyQueries: new Set(),
    entityArchetypes: [],
    rootArchetype,
    archetypeNodeMap: new Map([['', rootArchetype]]),
    prefabData: null,
    relationTargets: [],
    reverseIndex: [],
    targetsByRelation: new Map(),
    pairsByTarget: new Map(),
    queriesByTarget: new Map(),
    queriesByEntity: new Map(),
    queriesByRelation: new Map(),
    pairQueryMap: new Map(),
    queryTermCache: new WeakMap(),
    observerQueues: new Map(),
    observerQueuesByTarget: new Map(),
    hierarchyData: new Map(),
    hierarchyActiveRelations: new Set(),
    hierarchyQueryCache: new Map(),
    }
}

const createBaseWorld = <T extends object>(context?: T, entityIndex?: EntityIndex): World<T> =>
    defineHiddenProperty(
        context || {} as T,
        $internal,
        createWorldContext(entityIndex)
    ) as World<T>

/**
 * Creates a new world, optionally seeded with an EntityIndex and/or a context object.
 */
export function createWorld<T extends object = {}>(
    ...args: Array<EntityIndex | T>
): World<T> {
    let entityIndex: EntityIndex | undefined
    let context: T | undefined

    args.forEach(arg => {
        if (typeof arg === 'object' && 'dense' in arg && 'sparse' in arg && 'aliveCount' in arg) {
            entityIndex = arg as EntityIndex
        } else if (typeof arg === 'object') {
            context = arg as T
        }
    })

    return createBaseWorld<T>(context, entityIndex)
}

/**
 * Resets a world.
 */
export const resetWorld = (world: World) => {
    const ctx = (world as InternalWorld)[$internal]
    Object.assign(ctx, createWorldContext())
    return world
}

/**
 * Deletes a world by removing its internal data.
 */
export const deleteWorld = (world: World) => {
    delete (world as any)[$internal];
}

/**
 * Returns all components registered to a world
 */
export const getWorldComponents = (world: World) =>
    Array.from((world as InternalWorld)[$internal].componentMap.keys())

/**
 * Returns all existing entities in a world
 */
export const getAllEntities = (world: World): readonly EntityId[] => {
    const { entityIndex } = (world as InternalWorld)[$internal]
    return entityIndex.dense.slice(0, entityIndex.aliveCount)
}
