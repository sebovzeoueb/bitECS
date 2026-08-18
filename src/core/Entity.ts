import { addComponent, addComponents, removeComponent } from './Component'
import {
	queryAddEntity,
	queryCheckEntity,
	queryRemoveEntity,
} from './Query'
import { $isPairComponent, $relation, $relationData } from './Relation'
import { World } from "./World"
import { InternalWorld } from './World'
import { addEntityId, isEntityIdAlive, removeEntityId } from './EntityIndex'
import { $internal } from './World'
import { ComponentRef } from './Component'

export type EntityId = number

export const Prefab = {}

/**
 * Creates a new prefab entity in the world. Prefabs are special entities marked with the Prefab component
 * that are excluded from normal queries and can be used as templates for creating other entities.
 * @param {World} world - The world object to create the prefab in.
 * @returns {EntityId} The entity ID of the created prefab.
 */
export const addPrefab = (world: World): EntityId => {
	const eid = addEntity(world)
	addComponent(world, eid, Prefab)
	return eid
}

/**
 * Adds a new entity to the specified world.
 *
 * @param {World} world
 * @returns {number} eid
 */
export function addEntity(world: World): EntityId
export function addEntity(world: World, ...components: any[]): EntityId
export function addEntity(world: World, ...components: any[]): EntityId {
	const ctx = (world as InternalWorld)[$internal]
	const eid = addEntityId(ctx.entityIndex)

	for (const q of ctx.notQueries) {
		if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid)
	}

	ctx.entityComponents[eid] = []
	ctx.entityArchetypes[eid] = ctx.rootArchetype

	if (components.length > 0) {
		addComponents(world, eid, components)
	}

	return eid
}

/**
 * Removes an existing entity from the specified world.
 *
 * @param {World} world
 * @param {number} eid
 */
export const removeEntity = (world: World, eid: EntityId) => {
	const ctx = (world as InternalWorld)[$internal]
	// Check if entity is already removed
	if (!isEntityIdAlive(ctx.entityIndex, eid)) return

	// Remove relation components from entities that have a relation to this one, breadth-first
	// e.g. addComponent(world, child, ChildOf(parent))
	// when parent is removed, we need to remove the child
	const removalQueue = [eid]
	let queueIdx = 0
	const processedEntities = new Set<EntityId>()

	while (queueIdx < removalQueue.length) {
		const currentEid = removalQueue[queueIdx++]
		if (processedEntities.has(currentEid)) continue
		processedEntities.add(currentEid)

		// Handle relation cascade removal via reverse index
		const reverseEntries = ctx.reverseIndex[currentEid]
		if (reverseEntries && reverseEntries.length > 0) {
			const deferredOps: (() => void)[] = []

			// Copy entries since removeComponent will mutate the array
			const entries = reverseEntries.slice()
			for (let i = 0; i < entries.length; i++) {
				const { subject, relation } = entries[i]
				if (!isEntityIdAlive(ctx.entityIndex, subject)) continue

				const relationData = relation[$relationData]
				const pairComponent = relation(currentEid)

				deferredOps.push(() => removeComponent(world, subject, pairComponent))
				if (relationData.autoRemoveSubject) removalQueue.push(subject)
				if (relationData.onTargetRemoved) {
					deferredOps.push(() => relationData.onTargetRemoved(world, subject, currentEid))
				}
			}

			for (let i = 0; i < deferredOps.length; i++) deferredOps[i]()
		}

		// Remove entity from affected queries (via entity's component set)
		const components = ctx.entityComponents[currentEid]
		if (components) {
			const visited = new Set<any>()
			for (let i = 0; i < components.length; i++) {
				const comp = components[i]
				// Pairs and regular components are both in componentMap now
				const compData = ctx.componentMap.get(comp)
				if (compData) {
					for (const q of compData.queries) {
						if (!visited.has(q)) { visited.add(q); queryRemoveEntity(world, q, currentEid) }
					}
				}
				// For pairs, also check the relation's queries (for Relation(Wildcard) queries)
				if (comp[$isPairComponent]) {
					const relData = ctx.componentMap.get(comp[$relation])
					if (relData) {
						for (const q of relData.queries) {
							if (!visited.has(q)) { visited.add(q); queryRemoveEntity(world, q, currentEid) }
						}
					}
				}
			}
			// Wildcard queries can't be found via component lookup
			for (const q of ctx.queries) {
				if (q.pairFilters.length > 0 && !visited.has(q)) {
					queryRemoveEntity(world, q, currentEid)
				}
			}
		}
		// Also check notQueries (entity may match queries with only Not terms)
		for (const q of ctx.notQueries) {
			queryRemoveEntity(world, q, currentEid)
		}

		// Free the entity ID
		removeEntityId(ctx.entityIndex, currentEid)

		// Remove all entity state from world
		ctx.entityComponents[currentEid] = null as any
		ctx.entityArchetypes[currentEid] = null as any
		ctx.relationTargets[currentEid] = null
		ctx.reverseIndex[currentEid] = null

		// Clear entity bitmasks
		for (let i = 0; i < ctx.entityMasks.length; i++) {
			ctx.entityMasks[i][currentEid] = 0
		}

		// Release this world's registrations of pairs targeting the removed entity,
		// unless a query or set/get subscriber still needs the pair's identity.
		// Once every world releases a pair, GC reclaims it and its global cache entry.
		const deadPairs = ctx.pairsByTarget.get(currentEid)
		if (deadPairs) {
			ctx.pairsByTarget.delete(currentEid)
			for (let i = 0; i < deadPairs.length; i++) {
				const pairData = ctx.componentMap.get(deadPairs[i])
				if (pairData && pairData.queries.size === 0 &&
					pairData.setObservable.count() === 0 && pairData.getObservable.count() === 0) {
					ctx.componentMap.delete(deadPairs[i])
				}
			}
		}
	}
}

/**
 *  Returns an array of components that an entity possesses.
 *
 * @param {*} world
 * @param {*} eid
 */
export const getEntityComponents = (world: World, eid: EntityId): ComponentRef[] => {
	const ctx = (world as InternalWorld)[$internal]
	if (eid === undefined) throw new Error(`getEntityComponents: entity id is undefined.`)
	if (!isEntityIdAlive(ctx.entityIndex, eid))
		throw new Error(`getEntityComponents: entity ${eid} does not exist in the world.`)
	const components = ctx.entityComponents[eid]
	return components ? components.slice() : []
}

/**
 * Checks the existence of an entity in a world
 *
 * @param {World} world
 * @param {number} eid
 */
export const entityExists = (world: World, eid: EntityId) =>
	isEntityIdAlive((world as InternalWorld)[$internal].entityIndex, eid)
