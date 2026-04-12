import { describe, test, expect } from 'bun:test'
import {
	createWorld,
	addEntity,
	addComponent,
	addComponents,
	removeComponent,
	hasComponent,
	query,
	observe,
	onAdd,
	onRemove,
	createRelation,
	Wildcard,
	Hierarchy,
	withAutoRemoveSubject,
	commitRemovals,
} from '../../src/core'

describe('Archetype Graph', () => {

	test('pair-filter queries must not share cached archetype edges between entities with different relation targets', () => {
		const world = createWorld()
		const Likes = createRelation()
		const Health = {}

		const apple = addEntity(world)
		const banana = addEntity(world)

		// Register a query that uses a specific pair filter: Likes(apple)
		const q = query(world, [Likes(apple)])
		expect(q.length).toBe(0)

		// Entity A: has Health + Likes(apple) — should match
		const a = addEntity(world)
		addComponent(world, a, Health)
		addComponent(world, a, Likes(apple))

		expect(Array.from(query(world, [Likes(apple)]))).toContain(a)

		// Entity B: has Health + Likes(banana) — should NOT match Likes(apple) query
		const b = addEntity(world)
		addComponent(world, b, Health)
		addComponent(world, b, Likes(banana))

		// The bug: if archetype edge cache doesn't exclude pair-filter queries,
		// entity B could be incorrectly added to the Likes(apple) query because
		// the cached edge was computed for entity A's state
		const result = Array.from(query(world, [Likes(apple)]))
		expect(result).toContain(a)
		expect(result).not.toContain(b)
	})

	test('different entities with same bitmask but different relation targets get correct query membership', () => {
		const world = createWorld()
		const ChildOf = createRelation()

		const parent1 = addEntity(world)
		const parent2 = addEntity(world)

		// Query for specific parent
		query(world, [ChildOf(parent1)])

		// Two children with same component signature but different parents
		const child1 = addEntity(world)
		const child2 = addEntity(world)

		addComponent(world, child1, ChildOf(parent1))
		addComponent(world, child2, ChildOf(parent2))

		const result = Array.from(query(world, [ChildOf(parent1)]))
		expect(result).toContain(child1)
		expect(result).not.toContain(child2)
	})

	test('addComponents produces same query membership as sequential addComponent', () => {
		const world = createWorld()
		const A = {}
		const B = {}
		const C = {}

		// Register a query that requires A + B
		const q1 = query(world, [A, B])
		expect(q1.length).toBe(0)

		// Sequential path
		const e1 = addEntity(world)
		addComponent(world, e1, A)
		addComponent(world, e1, B)

		// Bulk path
		const e2 = addEntity(world)
		addComponents(world, e2, [A, B])

		// Both should be in the query
		const result = Array.from(query(world, [A, B]))
		expect(result).toContain(e1)
		expect(result).toContain(e2)
	})

	test('addComponents with three components matches query requiring all three', () => {
		const world = createWorld()
		const A = {}
		const B = {}
		const C = {}

		// Query requires all three
		query(world, [A, B, C])

		const e1 = addEntity(world)
		addComponents(world, e1, [A, B, C])

		const result = Array.from(query(world, [A, B, C]))
		expect(result).toContain(e1)
	})

	test('addComponents archetype state stays consistent for later single addComponent', () => {
		const world = createWorld()
		const A = {}
		const B = {}
		const C = {}

		query(world, [A, B])
		query(world, [A, B, C])

		// Bulk add A + B
		const e = addEntity(world)
		addComponents(world, e, [A, B])

		expect(Array.from(query(world, [A, B]))).toContain(e)
		expect(Array.from(query(world, [A, B, C]))).not.toContain(e)

		// Now add C individually — archetype state must be consistent
		addComponent(world, e, C)

		expect(Array.from(query(world, [A, B, C]))).toContain(e)
	})

	test('bulk removeComponent does not fire spurious onAdd events', () => {
		const world = createWorld()
		const A = {}
		const B = {}
		const C = {}

		// Query requires A + B
		query(world, [A, B])

		const adds: number[] = []
		const removes: number[] = []
		observe(world, onAdd(A, B), (eid) => adds.push(eid))
		observe(world, onRemove(A, B), (eid) => removes.push(eid))

		const e = addEntity(world)
		addComponents(world, e, [A, B, C])

		expect(adds).toEqual([e])

		// Bulk remove B and C — entity should leave [A,B] query
		// Should NOT trigger a spurious onAdd
		adds.length = 0
		removeComponent(world, e, B, C)

		expect(removes).toEqual([e])
		expect(adds).toEqual([]) // no spurious onAdd
	})

	test('bulk removeComponent correctly removes from queries', () => {
		const world = createWorld()
		const A = {}
		const B = {}

		query(world, [A, B])

		const e = addEntity(world)
		addComponent(world, e, A)
		addComponent(world, e, B)

		expect(Array.from(query(world, [A, B]))).toContain(e)

		// Bulk remove
		removeComponent(world, e, A, B)

		expect(Array.from(query(world, [A, B]))).not.toContain(e)
	})

	test('hasComponent Wildcard(X) returns correct result for forward index only', () => {
		const world = createWorld()
		const Likes = createRelation()

		const apple = addEntity(world)
		const person = addEntity(world)
		const other = addEntity(world)

		addComponent(world, person, Likes(apple))

		// person has Likes(apple), so Wildcard check on person with apple as target should be true
		expect(hasComponent(world, person, Wildcard(apple))).toBe(true)
		// other has no relations
		expect(hasComponent(world, other, Wildcard(apple))).toBe(false)
	})

	test('bulk addComponents then single addComponent does not poison rootArchetype cache for other entities', () => {
		const world = createWorld()
		const A = {}
		const B = {}
		const C = {}

		query(world, [A, C])

		// e1: bulk-add A+B, then individually add C
		const e1 = addEntity(world)
		addComponents(world, e1, [A, B])
		addComponent(world, e1, C)

		// e1 has A+C → should be in query [A,C]
		expect(Array.from(query(world, [A, C]))).toContain(e1)

		// e2: fresh entity, only gets C — should NOT be in [A,C] query
		const e2 = addEntity(world)
		addComponent(world, e2, C)

		const result = Array.from(query(world, [A, C]))
		expect(result).toContain(e1)
		expect(result).not.toContain(e2)
	})

	test('bulk removeComponent then single addComponent does not poison rootArchetype cache', () => {
		const world = createWorld()
		const A = {}
		const B = {}
		const C = {}

		query(world, [A, C])

		// e1: add A+B+C, then bulk-remove B+C, then add C back
		const e1 = addEntity(world)
		addComponents(world, e1, [A, B, C])
		removeComponent(world, e1, B, C)
		addComponent(world, e1, C)

		expect(Array.from(query(world, [A, C]))).toContain(e1)

		// e2: only gets C — should NOT be in [A,C]
		const e2 = addEntity(world)
		addComponent(world, e2, C)

		const result = Array.from(query(world, [A, C]))
		expect(result).toContain(e1)
		expect(result).not.toContain(e2)
	})

	test('targetsByRelation cleans up empty sets after all targets removed', () => {
		const world = createWorld()
		const Likes = createRelation()

		const apple = addEntity(world)
		const person = addEntity(world)

		addComponent(world, person, Likes(apple))

		// Now remove the relation
		removeComponent(world, person, Likes(apple))

		// The relation should not have stale entries
		// Verify by checking that a fresh query returns empty
		expect(Array.from(query(world, [Likes(Wildcard)]))).toEqual([])
	})

	test('queryHierarchy does not mutate the base query iteration order', () => {
		const world = createWorld()
		const ChildOf = createRelation({ autoRemoveSubject: true })
		const Position = {}

		// Create entities in REVERSE depth order so entity IDs are opposite of depth order
		// child gets lowest ID, grandparent gets highest
		const child = addEntity(world)
		const parent = addEntity(world)
		const grandparent = addEntity(world)

		// Set up hierarchy and add Position
		addComponent(world, parent, ChildOf(grandparent))
		addComponent(world, child, ChildOf(parent))
		addComponent(world, child, Position)
		addComponent(world, parent, Position)
		addComponent(world, grandparent, Position)

		// Capture normal query order — lazily registered, populated from entity index
		// Entity index order: [child, parent, grandparent] (by creation order)
		const normalBefore = Array.from(query(world, [Position]))
		expect(normalBefore.length).toBe(3)

		// Sanity: confirm order is NOT depth-sorted (child has lowest ID, comes first)
		const depthSorted = [grandparent, parent, child]
		expect(normalBefore).not.toEqual(depthSorted)

		// Hierarchy query should return depth-sorted: grandparent, parent, child
		const hierarchyResult = Array.from(query(world, [Position, Hierarchy(ChildOf)]))
		expect(hierarchyResult.length).toBe(3)
		expect(hierarchyResult).toEqual(depthSorted)

		// Normal query should still return ORIGINAL order, not depth-sorted
		const normalAfter = Array.from(query(world, [Position]))
		expect(normalAfter).toEqual(normalBefore)
	})

})
