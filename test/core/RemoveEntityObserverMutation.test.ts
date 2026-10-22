import { describe, it, expect } from 'bun:test'
import { createWorld, addEntity, removeEntity, addComponent, removeComponent, entityExists, query, observe, onRemove, createRelation, Wildcard } from '../../src/core'

// An onRemove observer fired by removeEntity may remove components from the dying entity itself,
// which swap-removes from the component list removeEntity is walking.
describe('removeEntity with observers that mutate the dying entity', () => {
	it('removes the entity from every query when an observer removes an earlier component', () => {
		const world = createWorld()
		const A = {}, B = {}, C = {}
		observe(world, onRemove(B), (eid: number) => removeComponent(world, eid, A))
		const eid = addEntity(world)
		addComponent(world, eid, A)
		addComponent(world, eid, B)
		addComponent(world, eid, C)
		expect([...query(world, [C])]).toEqual([eid])

		removeEntity(world, eid)

		expect(entityExists(world, eid)).toBe(false)
		expect([...query(world, [A])]).toEqual([])
		expect([...query(world, [C])]).toEqual([])
	})

	it('removes the entity from every query when a Relation(Wildcard) observer removes an earlier component', () => {
		const world = createWorld()
		const Pose = {}, Effect = {}
		const SittingOn = createRelation()
		observe(world, onRemove(SittingOn(Wildcard)), (eid: number) => removeComponent(world, eid, Pose))
		const seat = addEntity(world)
		const eid = addEntity(world)
		addComponent(world, eid, Pose)
		addComponent(world, eid, SittingOn(seat))
		addComponent(world, eid, Effect)
		expect([...query(world, [Effect])]).toEqual([eid])

		removeEntity(world, eid)

		expect(entityExists(world, eid)).toBe(false)
		expect([...query(world, [Effect])]).toEqual([])
	})
})
