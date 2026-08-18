import { describe, it, expect } from 'bun:test'
import {
    createWorld, addEntity, removeEntity, addComponent, hasComponent,
    createRelation, query, observe, onSet, withStore
} from '../../src/core'
import { $internal, InternalWorld } from '../../src/core/World'

const ctxOf = (world: any) => (world as InternalWorld)[$internal]

describe('Pair registration cleanup on target removal', () => {
    it('releases pair registrations when the target entity is removed', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const parent = addEntity(world)
        const child = addEntity(world)
        const pair = ChildOf(parent)

        addComponent(world, child, pair)
        const ctx = ctxOf(world)
        expect(ctx.componentMap.has(pair)).toBe(true)
        expect(ctx.pairsByTarget.has(parent)).toBe(true)

        removeEntity(world, parent)
        expect(ctx.componentMap.has(pair)).toBe(false)
        expect(ctx.pairsByTarget.has(parent)).toBe(false)
        expect(hasComponent(world, child, ChildOf(parent))).toBe(false)
    })

    it('queries on a specific pair survive target removal and eid recycling', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const parent = addEntity(world)
        const child = addEntity(world)

        addComponent(world, child, ChildOf(parent))
        expect(query(world, [ChildOf(parent)]).length).toBe(1)

        removeEntity(world, parent)
        expect(query(world, [ChildOf(parent)]).length).toBe(0)

        const parent2 = addEntity(world) // recycles the eid
        expect(parent2).toBe(parent)
        addComponent(world, child, ChildOf(parent2))
        expect(query(world, [ChildOf(parent2)]).length).toBe(1)
        expect(Array.from(query(world, [ChildOf(parent2)]))).toContain(child)
    })

    it('keeps pair registrations with set/get subscribers', () => {
        const world = createWorld()
        const Targets = createRelation(withStore(() => ({ value: [] as number[] })))
        const target = addEntity(world)
        const attacker = addEntity(world)
        const pair = Targets(target)

        addComponent(world, attacker, pair)
        observe(world, onSet(pair), () => {})
        removeEntity(world, target)

        const ctx = ctxOf(world)
        expect(ctx.componentMap.has(pair)).toBe(true)
    })

    it('re-registers cleanly when a recycled eid is used as a target again', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const parent = addEntity(world)
        const child = addEntity(world)

        addComponent(world, child, ChildOf(parent))
        removeEntity(world, parent)

        const parent2 = addEntity(world) // may recycle the eid
        addComponent(world, child, ChildOf(parent2))
        expect(hasComponent(world, child, ChildOf(parent2))).toBe(true)

        const ctx = ctxOf(world)
        expect(ctx.componentMap.has(ChildOf(parent2))).toBe(true)
        removeEntity(world, parent2)
        expect(ctx.componentMap.has(ChildOf(parent2))).toBe(false)
    })
})
