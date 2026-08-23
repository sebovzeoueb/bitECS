import { World } from '.'
import { EntityId } from './Entity'
import { $internal, InternalWorld } from './World'
import { defineHiddenProperty } from './utils/defineHiddenProperty'

/**
 * Callback function type for when a target is removed from a relation.
 */
export type OnTargetRemovedCallback = (subject: EntityId, target: EntityId) => void

/**
 * Possible types for a relation target.
 */
export type RelationTarget = number | '*' | typeof Wildcard
/**
 * Symbol for accessing the relation of a component.
 */
export const $relation = Symbol.for('bitecs-relation')

/**
 * Symbol for accessing the pair target of a component.
 */
export const $pairTarget = Symbol.for('bitecs-pairTarget')

/**
 * Symbol for checking if a component is a pair component.
 */
export const $isPairComponent = Symbol.for('bitecs-isPairComponent')

/**
 * Symbol for accessing the relation data of a component.
 */
export const $relationData = Symbol.for('bitecs-relationData')

/**
 * Interface for relation data.
 */
type RelationData<T> = {
    pairsMap: Map<number | string | Relation<any>, WeakRef<T & object>>
    initStore: (eid: EntityId) => T
    exclusiveRelation: boolean
    autoRemoveSubject: boolean
    onTargetRemoved: OnTargetRemovedCallback
}

// Sweeps dead cache entries after a pair component is garbage collected.
// A pair stays alive while any world's componentMap, query, or user code
// references it; once all references drop, its cache entry is removed.
const pairFinalizer = new FinalizationRegistry<{ pairsMap: Map<any, WeakRef<any>>, key: any, ref: WeakRef<any> }>(
    ({ pairsMap, key, ref }) => {
        if (pairsMap.get(key) === ref) pairsMap.delete(key)
    }
)

/**
 * Type definition for a Relation function.
 */
export type Relation<T> = (target: RelationTarget) => T

/**
 * Creates a base relation.
 */
const createBaseRelation = <T>(): Relation<T> => {
    const data = {
        pairsMap: new Map(),
        initStore: undefined,
        exclusiveRelation: false,
        autoRemoveSubject: false,
        onTargetRemoved: undefined
    }
    const relation = (target: RelationTarget): T => {
        if (target === undefined) throw Error('Relation target is undefined')
        const normalizedTarget = target === '*' ? Wildcard : target
        const existing = data.pairsMap.get(normalizedTarget)?.deref()
        if (existing !== undefined) return existing

        const component = data.initStore ? data.initStore(target) : {} as T
        defineHiddenProperty(component, $relation, relation)
        defineHiddenProperty(component, $pairTarget, normalizedTarget)
        defineHiddenProperty(component, $isPairComponent, true)
        const ref = new WeakRef(component as T & object)
        data.pairsMap.set(normalizedTarget, ref)
        pairFinalizer.register(component as T & object, { pairsMap: data.pairsMap, key: normalizedTarget, ref })
        return component
    }

    defineHiddenProperty(relation, $relationData, data)

    return relation as Relation<T>
}

/**
 * Adds a store to a relation.
 */
export const withStore = <T>(createStore: (eid: EntityId) => T) => (relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.initStore = createStore
    return relation
}

/**
 * Makes a relation exclusive.
 */
export const makeExclusive = <T>(relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.exclusiveRelation = true
    return relation
}

/**
 * Adds auto-remove subject behavior to a relation.
 */
export const withAutoRemoveSubject = <T>(relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.autoRemoveSubject = true
    return relation
}

/**
 * Adds an onTargetRemoved callback to a relation.
 */
export const withOnTargetRemoved = <T>(onRemove: OnTargetRemovedCallback) => (relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.onTargetRemoved = onRemove
    return relation
}

/**
 * Creates a pair from a relation and a target.
 */
export const Pair = <T>(relation: Relation<T>, target: RelationTarget): T => {
    if (relation === undefined) throw Error('Relation is undefined')
    return relation(target)
}

/**
 * Gets the relation targets for an entity.
 */
export const getRelationTargets = (world: World, eid: EntityId, relation: Relation<any>): number[] => {
	const ctx = (world as InternalWorld)[$internal]
	const targets = ctx.relationTargets[eid]?.get(relation)
	return targets ? Array.from(targets) : []
}

/**
 * Creates a new relation.
 */
export function createRelation<T>(...modifiers: Array<(relation: Relation<T>) => Relation<T>>): Relation<T>

/**
 * Creates a new relation with options.
 */
export function createRelation<T>(options: {
    store?: () => T
    exclusive?: boolean
    autoRemoveSubject?: boolean
    onTargetRemoved?: OnTargetRemovedCallback
}): Relation<T>
export function createRelation<T>(
    ...args: Array<(relation: Relation<T>) => Relation<T>> | [{
        store?: () => T
        exclusive?: boolean
        autoRemoveSubject?: boolean
        onTargetRemoved?: OnTargetRemovedCallback
    }]
): Relation<T> {
    if (args.length === 1 && typeof args[0] === 'object') {
        const { store, exclusive, autoRemoveSubject, onTargetRemoved } = args[0]
        const modifiers = [
            store && withStore(store),
            exclusive && makeExclusive,
            autoRemoveSubject && withAutoRemoveSubject,
            onTargetRemoved && withOnTargetRemoved(onTargetRemoved)
        ].filter(Boolean) as Array<(relation: Relation<T>) => Relation<T>>
        return modifiers.reduce((acc, modifier) => modifier(acc), createBaseRelation<T>())
    } else {
        const modifiers = args as Array<(relation: Relation<T>) => Relation<T>>
        return modifiers.reduce((acc, modifier) => modifier(acc), createBaseRelation<T>())
    }
}

/**
 * Symbol used to mark a relation as a wildcard relation
 */
export const $wildcard = Symbol.for('bitecs-wildcard')

/**
 * Gets or creates a global singleton relation by symbol key.
 */
const getGlobalRelation = (key: string, init: () => any) => {
    const sym = Symbol.for(key)
    if (!(globalThis as any)[sym]) (globalThis as any)[sym] = init()
    return (globalThis as any)[sym]
}

/**
 * Wildcard relation — matches any target in queries and hasComponent checks.
 */
export const Wildcard: Relation<any> = getGlobalRelation('bitecs-global-wildcard', () => {
    const relation = createBaseRelation()
    Object.defineProperty(relation, $wildcard, { value: true, enumerable: false, writable: false, configurable: false })
    return relation
})

/**
 * IsA relation — used for component inheritance between entities.
 */
export const IsA: Relation<any> = getGlobalRelation('bitecs-global-isa', createBaseRelation)

/**
 * Checks if a relation is a wildcard relation.
 */
export function isWildcard(relation: any): boolean {
    return relation ? relation[$wildcard] === true : false
}

/**
 * Checks if a component is a relation.
 */
export function isRelation(component: any): boolean {
    return component ? component[$relationData] !== undefined : false
}
