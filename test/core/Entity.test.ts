import { strictEqual } from 'assert'
import { describe, it, expect } from 'bun:test'
import { createWorld, addEntity, removeEntity, addComponent, hasComponent, entityExists, createEntityIndex, withVersioning, World, $internal } from '../../src/core'

const getEntityCursor = (world: World) => world[$internal].entityIndex.maxId + 1

describe('Entity Tests', () => {
    it('should add and remove entities', () => {
        const world = createWorld()

        const eid1 = addEntity(world)
        strictEqual(getEntityCursor(world), 2)

        const eid2 = addEntity(world)
        strictEqual(getEntityCursor(world), 3)

        const eid3 = addEntity(world)
        strictEqual(getEntityCursor(world), 4)

        strictEqual(eid1, 1)
        strictEqual(eid2, 2)
        strictEqual(eid3, 3)

        removeEntity(world, eid1)
        removeEntity(world, eid2)
        removeEntity(world, eid3)

        const eid4 = addEntity(world)
        const eid5 = addEntity(world)
        const eid6 = addEntity(world)

        strictEqual(eid4, 3)
        strictEqual(eid5, 2)
        strictEqual(eid6, 1)
        strictEqual(getEntityCursor(world), 4)
    })
})

describe('Versioned entity recycling', () => {
	it('should recycle versioned ids through component add/remove without unbounded mask growth', () => {
		const world = createWorld(createEntityIndex(withVersioning()))
		const Position = { x: [] as number[] }

		let eid = 0
		for (let i = 0; i < 300; i++) {
			eid = addEntity(world)
			addComponent(world, eid, Position)
			expect(hasComponent(world, eid, Position)).toBe(true)
			removeEntity(world, eid)
		}
		// version bits make the final recycled id large; it must still work
		expect(eid).toBeGreaterThan(0xffffff)
	})
})

describe('Versioned recycling with swap-removal', () => {
	it('should keep a recycled versioned entity alive after removing an unrelated entity', () => {
		const world = createWorld(createEntityIndex(withVersioning()))
		const a = addEntity(world)
		const b = addEntity(world)
		removeEntity(world, b)
		const b2 = addEntity(world) // recycled id of b, version bumped
		expect(b2).not.toBe(b)
		removeEntity(world, a) // swap-removal must not desync b2's sparse slot
		expect(entityExists(world, b2)).toBe(true)
		expect(entityExists(world, b)).toBe(false)
	})
})
