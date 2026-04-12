import { World } from '.'
import { EntityId } from './Entity'
import { $internal, InternalWorld } from './World'
import { defineHiddenProperty } from './utils/defineHiddenProperty'

/**
 * Callback function type for when a target is removed from a relation.
 * @callback OnTargetRemovedCallback
 * @param {number} subject - The subject entity ID.
 * @param {number} target - The target entity ID.
 */
export type OnTargetRemovedCallback = (subject: EntityId, target: EntityId) => void

/**
 * Possible types for a relation target.
 * @typedef {number | '*' | typeof Wildcard} RelationTarget
 */
export type RelationTarget = number | '*' | typeof Wildcard
/**
 * Symbol for accessing the relation of a component.
 * @type {Symbol}
 */
export const $relation = Symbol.for('bitecs-relation')

/**
 * Symbol for accessing the pair target of a component.
 * @type {Symbol}
 */
export const $pairTarget = Symbol.for('bitecs-pairTarget')

/**
 * Symbol for checking if a component is a pair component.
 * @type {Symbol}
 */
export const $isPairComponent = Symbol.for('bitecs-isPairComponent')

/**
 * Symbol for accessing the relation data of a component.
 * @type {Symbol}
 */
export const $relationData = Symbol.for('bitecs-relationData')

/**
 * Interface for relation data.
 * @interface RelationData
 * @template T
 */
type RelationData<T> = {
    pairsMap: Map<number | string | Relation<any>, T>
    initStore: (eid: EntityId) => T
    exclusiveRelation: boolean
    autoRemoveSubject: boolean
    onTargetRemoved: OnTargetRemovedCallback
}

/**
 * Type definition for a Relation function.
 * @template T
 * @typedef {function} Relation
 * @param {RelationTarget} target - The target of the relation.
 * @returns {T} The relation component.
 */
export type Relation<T> = (target: RelationTarget) => T

/**
 * Creates a base relation.
 * @template T
 * @returns {Relation<T>} The created base relation.
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
        if (!data.pairsMap.has(normalizedTarget)) {
            const component = data.initStore ? data.initStore(target) : {} as T
            defineHiddenProperty(component, $relation, relation)
            defineHiddenProperty(component, $pairTarget, normalizedTarget)
            defineHiddenProperty(component, $isPairComponent, true)
            data.pairsMap.set(normalizedTarget, component)
        }

        return data.pairsMap.get(normalizedTarget)!
    }

    defineHiddenProperty(relation, $relationData, data)

    return relation as Relation<T>
}

/**
 * Adds a store to a relation.
 * @template T
 * @param {function(): T} createStore - Function to create the store.
 * @returns {function(Relation<T>): Relation<T>} A function that modifies the relation.
 */
export const withStore = <T>(createStore: (eid: EntityId) => T) => (relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.initStore = createStore
    return relation
}

/**
 * Makes a relation exclusive.
 * @template T
 * @param {Relation<T>} relation - The relation to make exclusive.
 * @returns {Relation<T>} The modified relation.
 */
export const makeExclusive = <T>(relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.exclusiveRelation = true
    return relation
}

/**
 * Adds auto-remove subject behavior to a relation.
 * @template T
 * @param {Relation<T>} relation - The relation to modify.
 * @returns {Relation<T>} The modified relation.
 */
export const withAutoRemoveSubject = <T>(relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.autoRemoveSubject = true
    return relation
}

/**
 * Adds an onTargetRemoved callback to a relation.
 * @template T
 * @param {OnTargetRemovedCallback} onRemove - The callback to add.
 * @returns {function(Relation<T>): Relation<T>} A function that modifies the relation.
 */
export const withOnTargetRemoved = <T>(onRemove: OnTargetRemovedCallback) => (relation: Relation<T>): Relation<T> => {
    const ctx = relation[$relationData] as RelationData<T>
    ctx.onTargetRemoved = onRemove
    return relation
}

/**
 * Creates a pair from a relation and a target.
 * @template T
 * @param {Relation<T>} relation - The relation.
 * @param {RelationTarget} target - The target.
 * @returns {T} The created pair.
 * @throws {Error} If the relation is undefined.
 */
export const Pair = <T>(relation: Relation<T>, target: RelationTarget): T => {
    if (relation === undefined) throw Error('Relation is undefined')
    return relation(target)
}

/**
 * Gets the relation targets for an entity.
 * @param {World} world - The world object.
 * @param {Relation<any>} relation - The relation to get targets for.
 * @param {number} eid - The entity ID.
 * @returns {Array<any>} An array of relation targets.
 */
export const getRelationTargets = (world: World, eid: EntityId, relation: Relation<any>): number[] => {
	const ctx = (world as InternalWorld)[$internal]
	const targets = ctx.relationTargets[eid]?.get(relation)
	return targets ? Array.from(targets) : []
}

/**
 * Creates a new relation.
 * @template T
 * @param {...Array<function(Relation<T>): Relation<T>>} modifiers - Modifier functions for the relation.
 * @returns {Relation<T>} The created relation.
 */
export function createRelation<T>(...modifiers: Array<(relation: Relation<T>) => Relation<T>>): Relation<T>

/**
 * Creates a new relation with options.
 * @template T
 * @param {Object} options - Options for creating the relation.
 * @param {function(): T} [options.store] - Function to create the store.
 * @param {boolean} [options.exclusive] - Whether the relation is exclusive.
 * @param {boolean} [options.autoRemoveSubject] - Whether to auto-remove the subject.
 * @param {OnTargetRemovedCallback} [options.onTargetRemoved] - Callback for when a target is removed.
 * @returns {Relation<T>} The created relation.
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
 * @type {Relation<any>}
 */
export const Wildcard: Relation<any> = getGlobalRelation('bitecs-global-wildcard', () => {
    const relation = createBaseRelation()
    Object.defineProperty(relation, $wildcard, { value: true, enumerable: false, writable: false, configurable: false })
    return relation
})

/**
 * IsA relation — used for component inheritance between entities.
 * @type {Relation<any>}
 */
export const IsA: Relation<any> = getGlobalRelation('bitecs-global-isa', createBaseRelation)

/**
 * Checks if a relation is a wildcard relation.
 * @param {any} relation - The relation to check.
 * @returns {boolean} True if the relation is a wildcard relation, false otherwise.
 */
export function isWildcard(relation: any): boolean {
    return relation ? relation[$wildcard] === true : false
}

/**
 * Checks if a component is a relation.
 * @param {any} component - The component to check.
 * @returns {boolean} True if the component is a relation, false otherwise.
 */
export function isRelation(component: any): boolean {
    return component ? component[$relationData] !== undefined : false
}
