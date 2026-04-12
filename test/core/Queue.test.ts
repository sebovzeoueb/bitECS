import { describe, test, expect } from 'bun:test'
import {
	createWorld,
	addEntity,
	addComponent,
	removeComponent,
	setComponent,
	queue,
	queueDrain,
	peek,
	queuePeek,
	onAdd,
	onRemove,
	onSet,
	createRelation,
	Wildcard,
} from '../../src/core'

describe('Queue Tests', () => {

	test('should drain entities added since last drain', () => {
		const world = createWorld()
		const Position = {}

		// Register observer
		expect(queue(world, onAdd(Position))).toEqual([])

		const a = addEntity(world)
		const b = addEntity(world)
		addComponent(world, a, Position)
		addComponent(world, b, Position)

		expect(queue(world, onAdd(Position))).toEqual([a, b])
		expect(queue(world, onAdd(Position))).toEqual([])
	})

	test('should drain entities removed since last drain', () => {
		const world = createWorld()
		const Position = {}

		const a = addEntity(world)
		const b = addEntity(world)
		addComponent(world, a, Position)
		addComponent(world, b, Position)

		// Register observer
		expect(queue(world, onRemove(Position))).toEqual([])

		removeComponent(world, a, Position)

		expect(queue(world, onRemove(Position))).toEqual([a])
		expect(queue(world, onRemove(Position))).toEqual([])
	})

	test('should drain entities with set components since last drain', () => {
		const world = createWorld()
		const Health = {}

		const a = addEntity(world)
		addComponent(world, a, Health)

		// Register observer
		expect(queue(world, onSet(Health))).toEqual([])

		setComponent(world, a, Health, 100)

		expect(queue(world, onSet(Health))).toEqual([a])
		expect(queue(world, onSet(Health))).toEqual([])
	})

	test('should work with relation pairs', () => {
		const world = createWorld()
		const ChildOf = createRelation()
		const parent = addEntity(world)

		// Register observer
		expect(queue(world, onAdd(ChildOf(parent)))).toEqual([])

		const a = addEntity(world)
		const b = addEntity(world)
		addComponent(world, a, ChildOf(parent))
		addComponent(world, b, ChildOf(parent))

		expect(queue(world, onAdd(ChildOf(parent)))).toEqual([a, b])
	})

	test('should work with Relation(Wildcard) hooks', () => {
		const world = createWorld()
		const ChildOf = createRelation()

		// Register observer
		expect(queue(world, onAdd(ChildOf(Wildcard)))).toEqual([])

		const parent1 = addEntity(world)
		const parent2 = addEntity(world)
		const child = addEntity(world)

		addComponent(world, child, ChildOf(parent1))

		const added = queue(world, onAdd(ChildOf(Wildcard)))
		expect(added).toEqual([child])
	})

	test('peek should not drain the queue', () => {
		const world = createWorld()
		const Position = {}

		// Register observer
		queue(world, onAdd(Position))

		const a = addEntity(world)
		addComponent(world, a, Position)

		expect(queuePeek(world, onAdd(Position))).toEqual([a])
		expect(queuePeek(world, onAdd(Position))).toEqual([a])
		expect(queuePeek(world, onAdd(Position)).length).toBe(1)

		// Drain clears it
		expect(queue(world, onAdd(Position))).toEqual([a])
		expect(queuePeek(world, onAdd(Position))).toEqual([])
	})

	test('should handle multiple hook types independently', () => {
		const world = createWorld()
		const Position = {}

		// Register all observers
		queue(world, onAdd(Position))
		queue(world, onRemove(Position))

		const a = addEntity(world)
		addComponent(world, a, Position)

		expect(queue(world, onAdd(Position))).toEqual([a])
		expect(queue(world, onRemove(Position))).toEqual([])

		removeComponent(world, a, Position)

		expect(queue(world, onAdd(Position))).toEqual([])
		expect(queue(world, onRemove(Position))).toEqual([a])
	})

	test('should accumulate across multiple frames', () => {
		const world = createWorld()
		const Position = {}

		// Register observer
		queue(world, onAdd(Position))

		// Frame 1
		const a = addEntity(world)
		addComponent(world, a, Position)

		// Frame 2 (no drain yet)
		const b = addEntity(world)
		addComponent(world, b, Position)

		// Drain gets both frames
		expect(queue(world, onAdd(Position))).toEqual([a, b])
	})

	test('should cache by hook hash — same hook returns same queue', () => {
		const world = createWorld()
		const Position = {}

		// Register via queue
		queue(world, onAdd(Position))

		const a = addEntity(world)
		addComponent(world, a, Position)

		// Both queue and queuePeek use the same underlying buffer
		expect(queuePeek(world, onAdd(Position))).toEqual([a])
		expect(queue(world, onAdd(Position))).toEqual([a])
	})

	test('should work in a system loop pattern', () => {
		const world = createWorld()
		const Health = {}
		const ChildOf = createRelation({ autoRemoveSubject: true })

		const inits: number[] = []
		const cleanups: number[] = []
		const childAdds: number[] = []

		const parent = addEntity(world)

		const runSystems = () => {
			for (const eid of queue(world, onAdd(Health))) inits.push(eid)
			for (const eid of queue(world, onRemove(Health))) cleanups.push(eid)
			for (const eid of queue(world, onAdd(ChildOf(parent)))) childAdds.push(eid)
		}

		// Frame 0: register
		runSystems()
		expect(inits).toEqual([])
		expect(cleanups).toEqual([])

		// Frame 1: add entities
		const a = addEntity(world)
		const b = addEntity(world)
		addComponent(world, a, Health)
		addComponent(world, b, Health)
		addComponent(world, a, ChildOf(parent))

		runSystems()
		expect(inits).toEqual([a, b])
		expect(childAdds).toEqual([a])

		// Frame 2: remove
		removeComponent(world, a, Health)

		runSystems()
		expect(cleanups).toEqual([a])

		// Frame 3: nothing
		runSystems()
		expect(inits).toEqual([a, b]) // unchanged
		expect(cleanups).toEqual([a]) // unchanged
	})
})
