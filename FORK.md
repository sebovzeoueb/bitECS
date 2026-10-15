# Fork notes

`sebovzeoueb/bitECS`, forked from [NateTheGreatt/bitECS](https://github.com/NateTheGreatt/bitECS) to
carry fixes the manormans game needs that upstream hasn't taken yet.

- **Remotes:** `origin` is this fork, `upstream` is NateTheGreatt.
- **Branch:** `pair-cleanup`, tracking `upstream/pair-cleanup`.
- **Base:** `7463296` (2026-08-24). Rebase onto upstream rather than merging, so the patches below
  stay a readable tip.

Both patches concern `createObserverSerializer`/`createObserverDeserializer` as the game uses them:
one observer serializer per connected client, its networked tag a **specific relation pair**
(`ClientInterest(slot)`) so the stream carries only that client's entities, with a plain tag and a
shared entity id map on the receiving side. Upstream's tests only cover a plain tag on both ends,
which is why neither of these showed up there.

## 1. `src/core/Component.ts`, `src/core/World.ts` — pair-filtered queries missed plain component changes

A query holding a specific pair, such as `[ClientInterest(slot), HitBy]`, gets a `pairFilter`
recorded for the pair term and the relation's bitflag as its component term (`registerQuery`), so
`pairFilters.length > 0`. `getTransitionEdge` skipped exactly those queries whenever a plain
component was added or removed, deferring to `updatePairQueries`:

```ts
for (const queryData of componentData.queries) {
	// Pair-filter queries are entity-specific (check relationTargets[eid]),
	// so they can't be cached per archetype node. They're handled by updatePairQueries.
	if (queryData.pairFilters.length > 0) continue
```

The premise is right — the membership *outcome* depends on `relationTargets[eid]`, so it cannot be
cached on an archetype edge — but the conclusion doesn't follow. `updatePairQueries` only runs from
the pair add/remove path, and only re-evaluates filters whose `relation` *and* `target` match the
pair being changed. Nothing re-evaluated a pair-filtered query when an ordinary component changed, so
its membership set ended up contradicting its own `queryCheckEntity` predicate: the entity satisfied
every term but had never been added, and neither `addObservable` nor `removeObservable` fired.

In the game this silently broke every interest-filtered lifecycle stream. A component was announced
to a client only if it was already present when the entity *entered* that client's interest — so
entities arriving in a chunk looked correct and the bug went unnoticed, while hits, held actions,
inventory moves and equipment changes made mid-interest never replicated at all.

The fix splits the two halves of the caching question. *Which* pair-filtered queries a component can
affect depends only on the component, so it caches on the edge exactly like `addTo`/`removeFrom`;
only the per-entity outcome doesn't. `ArchetypeEdge` gains a third list:

```ts
export type ArchetypeEdge = {
    target: ArchetypeNode
    addTo: Query[]
    removeFrom: Query[]
    pairChecked: Query[]
    version: number
}
```

`getTransitionEdge` routes the skipped queries into it, and `applyTransition` evaluates them per
entity, **both directions unconditionally** — unlike `updatePairQueries`, which branches on `isAdd`
and only ever does one of the two. That matters for a query holding the component under `Not`, where
an add unmatches and a remove matches. `queryAddEntity` and `queryRemoveEntity` are both already
guarded against redundant calls, and `removeEntity` (`Entity.ts`) already does the same uncached
sweep over pair-filtered queries, so this is safe and precedented.

Cost: one `queryCheckEntity` — a bitmask test plus a `relationTargets` lookup — per pair-filtered
query registered against that component, per add or remove. In the game that is one per connected
client, and only for the handful of replicated components.

**Not fixed:** a non-exclusive relation with more than one target still loses ops, because
`addComponent` only calls `applyTransition` for the first target and the serializer's
`relationTargets` map remembers a single target per component index. Every networked relation in the
game is exclusive, so this is latent.

Since patch 3, queries with a specific-target filter are evaluated through an index instead of
`pairChecked`; only wildcard-only pair queries remain on the edge.

## 2. `src/serialization/ObserverSerializer.ts` — redundant `AddEntity` is idempotent

`createObserverDeserializer` warned and dropped an `AddEntity` op for an entity already in the id
map. But a shared id map is the normal case: an entity can be introduced by a snapshot on one channel
and announced by the observer stream on another, in either order. The mapping already resolves
correctly, so the op is redundant rather than wrong — and dropping it leaves an entity that arrived
via snapshot without the networked tag, which is what makes `onRemove(tag)` a complete pruning hook
on the receiving side.

Now it ensures the tag instead, guarded on `entityExists`.

## 3. `src/core/Component.ts`, `src/core/Query.ts`, `src/core/Entity.ts` — targeted pair queries without a scan

Performance only; membership results are unchanged. Patch 1 put every pair-filtered query of a
component on the edge's `pairChecked` list and evaluated all of them on every transition. The game
registers one `[ChildOf(parent)]` query per parent it traverses (~1,800 live in a city), so every
first or last `ChildOf` pair (each building foundation created or unloaded) ran ~1,800
`queryCheckEntity` calls: 5–6 s of client main thread per 40 s walk.

A query with a specific-target filter (`{relation, target}`) can only change membership for an entity
that has that pair, or that still holds the entity through a pair just removed. So:

- `ComponentData.targetedQueries: Map<target, Set<Query>>` indexes, per component, its queries with
  a specific-target filter (maintained in `registerQuery` / `removeQueryFromWorld`); `Query` gains
  `hasTargetFilters`.
- `getTransitionEdge` leaves those queries off `pairChecked` (wildcard-only pair queries stay on it).
- `applyTransition` collects candidates from `targetedQueries` for each of the entity's current
  targets plus `removedTarget` (passed by `removeComponentInternal` when the last target of a relation
  goes), then evaluates them exactly as before. Candidates are collected into a reusable stack segment
  before any observer runs, so reentrant transitions are safe.
- `removeEntity` skips `queryRemoveEntity` (a no-op) for queries that don't contain the entity before
  touching its visited set.

The per-component index matters for the server: a per-target index alone reached ~60 observer
queries per `ClientInterest(slot)` target and made component toggles on interest entities ~5× slower.

Coverage: `test/core/TargetedPairTransition.test.ts`, including a seeded 2,000-operation differential
test against `hasComponent`-derived expectations that passes on the code before and after this patch.
Writing it surfaced three pre-existing membership disagreements, excluded from it and left unchanged
(membership changes are out of scope for a perf patch):

- `[Wildcard(p)]` is populated and updated as "targets of p" but `queryCheckEntity`/`hasComponent`
  read it as "has a relation pointing at p".
- Mixed wildcard filters with other terms (`[ChildOf(p), Wildcard(Slot)]`, `[Wildcard(p), Tag]`):
  `updatePairQueries`' by-relation and by-entity branches add without re-checking the other terms.
- `Not(Relation(target))` compiles to the relation's bitflag, so it means "no pair of that relation".

## 4. `src/core/Query.ts` — specific-target queries no longer invalidate cached archetype edges

Performance only; membership results are unchanged. `registerQuery` and `removeQueryFromWorld`
bumped `ctx.queryVersion` for every query, which makes every cached archetype edge recompute
(`queryCheckEntity` over all of a component's queries) on its next use. Since patch 3, edges never
hold queries with `hasTargetFilters`, so registering or removing one cannot change any edge, and the
bump is skipped for them. The game registers and evicts one `[ChildOf(parent)]`, `InChunk(chunk)` or
tilemap-layer query per parent or chunk as the player walks, so the version moved ~6,850 times per
probe session against 106 after the patch, and edges were almost never reused while chunk
snapshots deserialized.

Coverage: `test/core/TargetedPairTransition.test.ts` › `Specific-target queries leave cached
archetype edges valid`. The version test fails before the patch; the seeded 3,000-step differential
with targeted queries registered, removed and evicted between operations passes before and after.

## Working on this fork

```bash
bun test                        # tests import from src/, so they pass before a build
bun run build                   # consumers import dist/
```

Regression coverage for patches 1 and 2 (patch 3 has its own test file):

- `test/core/Query.test.ts` › `Pair-filtered queries` — a plain component added and removed after the
  pair, observer notification, the pair term still discriminating between two targets, and a `Not`
  term re-evaluating. When adding cases here, note that the query must be registered *before* the
  component change: a `query(world, [Interest(slot), Hit])` called for the first time afterwards
  seeds its own membership through `queryCheckEntity` and passes even unpatched.
- `test/serialization/ObserverSerializer.test.ts` › `ObserverSerializer with a pair networked tag`
  and `ObserverDeserializer with a shared id map` — the game's shape end to end.

The game consumes this repo as `"bitecs": "../bitECS"`, which bun installs as a **hardlinked copy** of
`dist/` rather than a symlink. esbuild writes in place so the hardlink normally survives a rebuild,
but after building, check that the game sees it:

```bash
md5sum dist/core/index.min.mjs ../manormans-bitecs/node_modules/bitecs/dist/core/index.min.mjs
```

and `bun install` in the game repo if they differ.

Known unrelated annoyance: `bun test` dies with `mprotect failed: 487` when several serialization test
files share a process on Windows. Run them one file at a time.
