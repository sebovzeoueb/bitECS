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
}

export type RelationEntry = { subject: EntityId, relation: ComponentRef }

export type WorldContext = {
    entityIndex: EntityIndex
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
    prefabData: ComponentData | null
    // Relation indexes
    relationTargets: (Map<ComponentRef, Set<any>> | null)[]
    reverseIndex: (RelationEntry[] | null)[]
    targetsByRelation: Map<ComponentRef, Set<EntityId>>
    // Observer queues (for queue/queuePeek)
    observerQueues: Map<string, EntityId[]>
    // Hierarchy tracking
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

const createArchetypeNode = (): ArchetypeNode => ({ edges: [] })

const createWorldContext = (entityIndex?: EntityIndex): WorldContext => ({
    entityIndex: entityIndex || createEntityIndex(),
    entityMasks: [[]],
    entityComponents: [],
    bitflag: 1,
    componentMap: new Map(),
    componentCount: 0,
    queries: new Set(),
    queriesHashMap: new Map(),
    notQueries: new Set(),
    dirtyQueries: new Set(),
    entityArchetypes: [],
    rootArchetype: createArchetypeNode(),
    prefabData: null,
    relationTargets: [],
    reverseIndex: [],
    targetsByRelation: new Map(),
    observerQueues: new Map(),
    hierarchyData: new Map(),
    hierarchyActiveRelations: new Set(),
    hierarchyQueryCache: new Map(),
})

const createBaseWorld = <T extends object>(context?: T, entityIndex?: EntityIndex): World<T> =>
    defineHiddenProperty(
        context || {} as T,
        $internal,
        createWorldContext(entityIndex)
    ) as World<T>

/**
 * Creates a new world with various configurations.
 * @template T
 * @param {...Array<EntityIndex | object>} args - EntityIndex, context object, or both.
 * @returns {World<T>} The created world.
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
 *
 * @param {World} world
 * @returns {object}
 */
export const resetWorld = (world: World) => {
    const ctx = (world as InternalWorld)[$internal]
    Object.assign(ctx, createWorldContext())
    return world
}

/**
 * Deletes a world by removing its internal data.
 *
 * @param {World} world - The world to be deleted.
 */
export const deleteWorld = (world: World) => {
    delete (world as any)[$internal];
}

/**
 * Returns all components registered to a world
 *
 * @param {World} world
 * @returns Array
 */
export const getWorldComponents = (world: World) =>
    Array.from((world as InternalWorld)[$internal].componentMap.keys())

/**
 * Returns all existing entities in a world
 *
 * @param {World} world
 * @returns Array
 */
export const getAllEntities = (world: World): readonly EntityId[] => {
    const { entityIndex } = (world as InternalWorld)[$internal]
    return entityIndex.dense.slice(0, entityIndex.aliveCount)
}
