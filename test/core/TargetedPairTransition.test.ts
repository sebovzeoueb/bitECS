import { describe, it, expect } from 'bun:test'
import {
    createWorld, addEntity, removeEntity, addComponent, removeComponent, hasComponent,
    createRelation, query, observe, onAdd, onRemove, Wildcard, Not, removeQuery, $internal,
} from '../../src/core'

const members = (world: any, terms: any[]) => new Set(Array.from(query(world, terms)))

describe('Specific-target pair queries across transitions', () => {
    it('membership follows a plain component added or removed after the pair (FORK section 1)', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const Position = {}
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [ChildOf(parent), Position]

        expect(members(world, q).has(child)).toBe(false)
        addComponent(world, child, ChildOf(parent))
        expect(members(world, q).has(child)).toBe(false)
        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(true)
        removeComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(false)
        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(true)
    })

    it('pair added after the plain component joins the query', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const Position = {}
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [ChildOf(parent), Position]
        query(world, q)

        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(false)
        addComponent(world, child, ChildOf(parent))
        expect(members(world, q).has(child)).toBe(true)
    })

    it('Not(component) tracks the component on a targeted pair', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const Position = {}
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [ChildOf(parent), Not(Position)]
        addComponent(world, child, ChildOf(parent))
        expect(members(world, q).has(child)).toBe(true)

        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(false)
        removeComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(true)
    })

    it('removing the pair leaves the query once and fires onRemove exactly once', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [ChildOf(parent)]
        const removes: number[] = []
        const adds: number[] = []
        query(world, q)
        observe(world, onAdd(ChildOf(parent)), (e: number) => adds.push(e))
        observe(world, onRemove(ChildOf(parent)), (e: number) => removes.push(e))

        addComponent(world, child, ChildOf(parent))
        expect(members(world, q).has(child)).toBe(true)
        removeComponent(world, child, ChildOf(parent))
        expect(members(world, q).has(child)).toBe(false)
        expect(adds).toEqual([child])
        expect(removes).toEqual([child])
    })

    it('removeEntity on the subject leaves the targeted query and fires onRemove once', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const Position = {}
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [ChildOf(parent), Position]
        const removes: number[] = []
        query(world, q)
        observe(world, onRemove(ChildOf(parent)), (e: number) => removes.push(e))

        addComponent(world, child, ChildOf(parent))
        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(true)
        removeEntity(world, child)
        expect(members(world, q).has(child)).toBe(false)
        expect(removes).toEqual([child])
    })

    it('removing the target leaves no stale membership (plain relation)', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const Position = {}
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [ChildOf(parent), Position]
        const qp = [ChildOf(parent)]
        addComponent(world, child, ChildOf(parent))
        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(true)

        removeEntity(world, parent)
        expect(members(world, qp).has(child)).toBe(hasComponent(world, child, ChildOf(parent)))
        expect(members(world, q).has(child)).toBe(hasComponent(world, child, ChildOf(parent)))
        expect(members(world, q).has(child)).toBe(false)
    })

    it('removing an autoRemoveSubject target removes the subject from targeted queries', () => {
        const world = createWorld()
        const Slot = createRelation({ exclusive: true, autoRemoveSubject: true })
        const Position = {}
        const parent = addEntity(world)
        const child = addEntity(world)
        const q = [Slot(parent), Position]
        const qp = [Slot(parent)]
        query(world, q)
        query(world, qp)
        addComponent(world, child, Slot(parent))
        addComponent(world, child, Position)
        expect(members(world, q).has(child)).toBe(true)

        removeEntity(world, parent)
        expect(members(world, q).has(child)).toBe(false)
        expect(members(world, qp).has(child)).toBe(false)
    })

    it('exclusive retarget moves the subject between targeted queries', () => {
        const world = createWorld()
        const Slot = createRelation({ exclusive: true })
        const p1 = addEntity(world)
        const p2 = addEntity(world)
        const child = addEntity(world)
        const q1 = [Slot(p1)]
        const q2 = [Slot(p2)]
        const left: number[] = []
        query(world, q1)
        query(world, q2)
        observe(world, onRemove(Slot(p1)), (e: number) => left.push(e))

        addComponent(world, child, Slot(p1))
        expect(members(world, q1).has(child)).toBe(true)
        addComponent(world, child, Slot(p2))
        expect(members(world, q1).has(child)).toBe(false)
        expect(members(world, q2).has(child)).toBe(true)
        expect(left).toEqual([child])
    })

    it('indexes targeted queries per component and target, and unindexes them on removeQuery', () => {
        const world = createWorld()
        const Interest = createRelation()
        const A = {}, B = {}
        const slot = addEntity(world)
        const qa = [Interest(slot), A]
        const qb = [Interest(slot), B]
        query(world, qa)
        query(world, qb)
        const ctx = (world as any)[$internal]
        const indexOf = (component: any) => ctx.componentMap.get(component).targetedQueries.get(slot)
        expect(indexOf(A).size).toBe(1)
        expect(indexOf(B).size).toBe(1)

        const e = addEntity(world)
        addComponent(world, e, Interest(slot))
        addComponent(world, e, A)
        expect(members(world, qa).has(e)).toBe(true)
        expect(members(world, qb).has(e)).toBe(false)
        addComponent(world, e, B)
        expect(members(world, qb).has(e)).toBe(true)

        removeQuery(world, qa)
        expect(indexOf(A)).toBeUndefined()
        expect(indexOf(B).size).toBe(1)
        removeComponent(world, e, B)
        expect(members(world, qb).has(e)).toBe(false)
    })

    it('many parents: a change for one child touches only its parent query', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const parents = Array.from({ length: 500 }, () => addEntity(world))
        const queries = parents.map(p => [ChildOf(p)])
        queries.forEach(q => query(world, q))
        const child = addEntity(world)

        for (const k of [0, 137, 499]) {
            addComponent(world, child, ChildOf(parents[k]))
            for (let i = 0; i < queries.length; i++) {
                expect(members(world, queries[i]).has(child)).toBe(i === k)
            }
            removeComponent(world, child, ChildOf(parents[k]))
            for (let i = 0; i < queries.length; i++) {
                expect(members(world, queries[i]).has(child)).toBe(false)
            }
        }
    })
})

// Deterministic PRNG (mulberry32) so the differential run is reproducible.
const prng = (seed: number) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe('Targeted pair queries: differential against hasComponent', () => {
    it('membership matches the term predicate after every random operation', () => {
        const rand = prng(0x5EED)
        const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
        const world = createWorld()
        const ChildOf = createRelation()
        const Slot = createRelation({ exclusive: true, autoRemoveSubject: true })
        const Pos = {}
        const Vel = {}
        const Tag = {}
        const plain = [Pos, Vel, Tag]
        const parents = Array.from({ length: 20 }, () => addEntity(world))
        const alive: number[] = [...parents]
        const children: number[] = []
        for (let i = 0; i < 30; i++) {
            const c = addEntity(world)
            children.push(c)
            alive.push(c)
        }

        type Spec = { terms: any[], check: (e: number) => boolean }
        const specs: Spec[] = []
        const has = (e: number, c: any) => hasComponent(world, e, c)
        const addSpec = (terms: any[], check: (e: number) => boolean) => specs.push({ terms, check })
        for (let i = 0; i < parents.length; i++) {
            const p = parents[i]
            const q = parents[(i + 7) % parents.length]
            addSpec([ChildOf(p)], e => has(e, ChildOf(p)))
            addSpec([ChildOf(p), Pos], e => has(e, ChildOf(p)) && has(e, Pos))
            addSpec([ChildOf(p), Not(Pos)], e => has(e, ChildOf(p)) && !has(e, Pos))
            addSpec([Slot(p), Vel], e => has(e, Slot(p)) && has(e, Vel))
            addSpec([ChildOf(p), Slot(q)], e => has(e, ChildOf(p)) && has(e, Slot(q)))
        }
        addSpec([Wildcard(ChildOf)], e => has(e, Wildcard(ChildOf)))
        addSpec([Slot(Wildcard)], e => has(e, Slot(Wildcard)))
        addSpec([ChildOf(Wildcard), Pos], e => has(e, ChildOf(Wildcard)) && has(e, Pos))
        // Left out, as the baseline disagrees with itself there: Wildcard(entity) (query
        // population uses targets, hasComponent uses subjects), mixed Wildcard(relation)
        // (updatePairQueries adds without re-checking other terms), and Not(specific pair)
        // (compiles to the relation bitflag, so it means "no pair of that relation").

        // Register half up front and half after 1000 steps, so late registration is covered too.
        const split = Math.floor(specs.length / 2)
        for (const s of specs.slice(0, split)) query(world, s.terms)

        const verify = (step: number) => {
            for (const s of specs) {
                const got = members(world, s.terms)
                for (const e of alive) {
                    if (got.has(e) !== s.check(e)) {
                        throw new Error(`step ${step}: entity ${e} member=${got.has(e)} expected=${s.check(e)} terms=${s.terms.length}`)
                    }
                }
            }
        }

        for (let step = 0; step < 2000; step++) {
            if (step === 1000) for (const s of specs.slice(split)) query(world, s.terms)
            const roll = rand()
            if (roll < 0.25) {
                const c = pick(children)
                if (alive.includes(c)) addComponent(world, c, pick(plain))
            } else if (roll < 0.4) {
                const c = pick(children)
                if (alive.includes(c)) removeComponent(world, c, pick(plain))
            } else if (roll < 0.6) {
                const c = pick(children)
                if (alive.includes(c)) addComponent(world, c, rand() < 0.5 ? ChildOf(pick(parents)) : Slot(pick(parents)))
            } else if (roll < 0.75) {
                const c = pick(children)
                if (alive.includes(c)) {
                    const rel = rand() < 0.5 ? ChildOf : Slot
                    removeComponent(world, c, rel(pick(parents)))
                }
            } else if (roll < 0.85) {
                const c = addEntity(world)
                children.push(c)
                alive.push(c)
            } else {
                const c = pick(children)
                if (alive.includes(c)) {
                    removeEntity(world, c)
                    alive.splice(alive.indexOf(c), 1)
                }
            }
            verify(step)
        }
    })
})

describe('Specific-target queries leave cached archetype edges valid (FORK section 4)', () => {
    it('only queries that edges can hold bump the query version', () => {
        const world = createWorld()
        const ChildOf = createRelation()
        const A = {}
        const parent = addEntity(world)
        const ctx = (world as any)[$internal]
        const before = ctx.queryVersion
        query(world, [ChildOf(parent)])
        query(world, [ChildOf(parent), A])
        removeQuery(world, [ChildOf(parent)])
        expect(ctx.queryVersion).toBe(before)
        query(world, [A])
        expect(ctx.queryVersion).toBe(before + 1)
        query(world, [ChildOf(Wildcard), A])
        expect(ctx.queryVersion).toBe(before + 2)
        removeEntity(world, parent) // evicts [ChildOf(parent), A]
        expect(ctx.queryVersion).toBe(before + 2)
    })

    it('plain query membership stays right while targeted queries churn', () => {
        const rand = prng(0xED6E)
        const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
        const world = createWorld()
        const ChildOf = createRelation()
        const Pos = {}, Vel = {}, Tag = {}
        const plain = [Pos, Vel, Tag]
        const has = (e: number, c: any) => hasComponent(world, e, c)
        const specs: { terms: any[], check: (e: number) => boolean }[] = [
            { terms: [Pos, Vel], check: e => has(e, Pos) && has(e, Vel) },
            { terms: [Pos, Not(Tag)], check: e => has(e, Pos) && !has(e, Tag) },
            { terms: [Tag], check: e => has(e, Tag) },
            { terms: [ChildOf(Wildcard), Vel], check: e => has(e, ChildOf(Wildcard)) && has(e, Vel) },
        ]
        for (const s of specs) query(world, s.terms)
        const parents = Array.from({ length: 10 }, () => addEntity(world))
        const alive: number[] = []
        for (let i = 0; i < 30; i++) alive.push(addEntity(world))
        const targeted: any[][] = []

        for (let step = 0; step < 3000; step++) {
            const roll = rand()
            if (roll < 0.3) addComponent(world, pick(alive), pick(plain))
            else if (roll < 0.45) removeComponent(world, pick(alive), pick(plain))
            else if (roll < 0.55) addComponent(world, pick(alive), ChildOf(pick(parents)))
            else if (roll < 0.62) removeComponent(world, pick(alive), ChildOf(pick(parents)))
            else if (roll < 0.75) {
                const terms = rand() < 0.5 ? [ChildOf(pick(parents))] : [ChildOf(pick(parents)), pick(plain)]
                query(world, terms)
                targeted.push(terms)
            } else if (roll < 0.85) {
                if (targeted.length) removeQuery(world, targeted.splice(Math.floor(rand() * targeted.length), 1)[0])
            } else if (roll < 0.9) {
                const i = Math.floor(rand() * parents.length)
                removeEntity(world, parents[i]) // releases its targeted queries
                parents[i] = addEntity(world)
            } else if (roll < 0.95) alive.push(addEntity(world))
            else if (alive.length > 5) removeEntity(world, alive.splice(Math.floor(rand() * alive.length), 1)[0])
            for (const s of specs) {
                const got = members(world, s.terms)
                for (const e of alive) {
                    if (got.has(e) !== s.check(e)) throw new Error(`step ${step}: entity ${e} member=${got.has(e)} expected=${s.check(e)}`)
                }
            }
        }
    })
})
