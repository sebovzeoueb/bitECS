import { describe, it, expect } from 'bun:test'
import {
    createWorld, addEntity, removeEntity, addComponent, hasComponent, addPrefab,
    createRelation, query, observe, onAdd, queueDrain, Wildcard, withAutoRemoveSubject,
} from '../../src/core'
import { InternalWorld } from '../../src/core/World'

const ctxOf = (world: any) => (world as InternalWorld)[Symbol.for('bitecs_internal')]

describe('Pair query lifecycle', () => {
    it('populates specific-pair queries from the target index', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const Tag = { v: [] as number[] }

        const parent1 = addEntity(world)
        const parent2 = addEntity(world)
        const a = addEntity(world)
        const b = addEntity(world)
        const c = addEntity(world)

        addComponent(world, a, ChildOf(parent1))
        addComponent(world, b, ChildOf(parent1))
        addComponent(world, b, Tag)
        addComponent(world, c, ChildOf(parent2))

        expect(query(world, [ChildOf(parent1)]).length).toBe(2)
        expect(query(world, [ChildOf(parent1)]).sort()).toEqual([a, b])
        expect(query(world, [ChildOf(parent1), Tag]).length).toBe(1)
        expect(Array.from(query(world, [ChildOf(parent1), Tag]))).toContain(b)
        expect(query(world, [ChildOf(parent2)]).length).toBe(1)
    })

    it('populates queries with non-numeric pair targets by scan', () => {
        const world = createWorld()
        const Rel = createRelation()
        const e = addEntity(world)

        addComponent(world, e, Rel('tag'))
        expect(Array.from(query(world, [Rel('tag')]))).toContain(e)
    })

    it('excludes prefabs from specific-pair query population', () => {
        const world = createWorld()
        const ChildOf = createRelation()

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))

        const prefabEid = addPrefab(world)
        addComponent(world, prefabEid, ChildOf(parent))

        // Prefabs are excluded from scan-populated queries; the indexed
        // population must match that behavior.
        expect(Array.from(query(world, [ChildOf(parent)]))).toContain(child)
        expect(Array.from(query(world, [ChildOf(parent)]))).not.toContain(prefabEid)
    })

    it('evicts specific-pair queries when their target entity is removed', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const ctx = ctxOf(world)

        for (let i = 0; i < 20; i++) {
            const parent = addEntity(world)
            const child = addEntity(world)
            addComponent(world, child, ChildOf(parent))
            expect(query(world, [ChildOf(parent)]).length).toBe(1)
            removeEntity(world, parent)
            removeEntity(world, child)
        }

        expect(ctx.queries.size).toBe(0)
        expect(ctx.queriesHashMap.size).toBe(0)
        expect(ctx.queriesByTarget.size).toBe(0)
    })

    it('keeps pair queries with active observers when the target is removed', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const ctx = ctxOf(world)

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))

        const seen: number[] = []
        observe(world, onAdd(ChildOf(parent)), (eid: number) => seen.push(eid))
        const before = query(world, [ChildOf(parent)])

        removeEntity(world, parent)
        expect(ctx.queries.size).toBe(1)

        const after = query(world, [ChildOf(parent)])
        expect(after).toBe(before)
    })

    it('cleans outgoing pair indexes when the subject entity is removed', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const ctx = ctxOf(world)

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))

        expect(Array.from(query(world, [Wildcard(child)]))).toEqual([parent])
        expect(ctx.targetsByRelation.has(ChildOf)).toBe(true)
        expect(ctx.reverseIndex[parent]!.length).toBe(1)

        removeEntity(world, child)

        expect(ctx.targetsByRelation.has(ChildOf)).toBe(false)
        expect(ctx.reverseIndex[parent]!.length).toBe(0)
        expect(ctx.queriesByEntity.has(child)).toBe(false)
        expect(query(world, [Wildcard(child)]).length).toBe(0)
    })

    it('recomputes cached transitions for queries registered mid-session', () => {
        const world = createWorld()
        const A = { v: [] as number[] }
        const B = { v: [] as number[] }

        const eid = addEntity(world)
        addComponent(world, eid, A)
        expect(query(world, [B]).length).toBe(0)

        // Registering the query bumped the archetype version; the cached
        // transition edge must be recomputed to include it.
        addComponent(world, eid, B)
        expect(Array.from(query(world, [B]))).toContain(eid)

        const C = { v: [] as number[] }
        addComponent(world, eid, C)
        expect(Array.from(query(world, [C]))).toContain(eid)
    })

    it('supports cascade removal plus query eviction with autoRemoveSubject', () => {
        const world = createWorld()
        const ChildOf = createRelation(withAutoRemoveSubject)
        const ctx = ctxOf(world)

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))
        expect(query(world, [ChildOf(parent)]).length).toBe(1)

        removeEntity(world, parent)
        expect(hasComponent(world, child, ChildOf(parent))).toBe(false)
        expect(ctx.queries.size).toBe(0)
        expect(ctx.queriesHashMap.size).toBe(0)
    })

    it('caches single pair query results by pair component', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const ctx = ctxOf(world)

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))

        const r1 = query(world, [ChildOf(parent)])
        const r2 = query(world, [ChildOf(parent)])
        expect(r2).toBe(r1)
        expect(ctx.queries.size).toBe(1)
        expect(ctx.pairQueryMap.has(ChildOf(parent))).toBe(true)

        removeEntity(world, parent)
        removeEntity(world, child)
        expect(ctx.pairQueryMap.size).toBe(0)
        expect(ctx.queries.size).toBe(0)
    })

    it('drops observer queues when their pair target is removed', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const ctx = ctxOf(world)

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))

        queueDrain(world, onAdd(ChildOf(parent)))
        expect(ctx.observerQueues.size).toBe(1)

        removeEntity(world, parent)
        expect(ctx.observerQueues.size).toBe(0)
        expect(ctx.observerQueuesByTarget.size).toBe(0)
        expect(ctx.queries.size).toBe(0)
    })

    it('recreates observer queues after target eid recycling', () => {
        const world = createWorld()
        const ChildOf = createRelation()

        const parent = addEntity(world)
        const child = addEntity(world)
        addComponent(world, child, ChildOf(parent))

        queueDrain(world, onAdd(ChildOf(parent)))
        removeEntity(world, parent)

        const parent2 = addEntity(world)
        expect(parent2).toBe(parent)
        addComponent(world, child, ChildOf(parent2))
        expect(queueDrain(world, onAdd(ChildOf(parent2)))).toEqual([child])
    })
})
