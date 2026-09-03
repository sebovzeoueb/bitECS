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

## 2. `src/serialization/ObserverSerializer.ts` — redundant `AddEntity` is idempotent

`createObserverDeserializer` warned and dropped an `AddEntity` op for an entity already in the id
map. But a shared id map is the normal case: an entity can be introduced by a snapshot on one channel
and announced by the observer stream on another, in either order. The mapping already resolves
correctly, so the op is redundant rather than wrong — and dropping it leaves an entity that arrived
via snapshot without the networked tag, which is what makes `onRemove(tag)` a complete pruning hook
on the receiving side.

Now it ensures the tag instead, guarded on `entityExists`.

## Working on this fork

```bash
bun test                        # tests import from src/, so they pass before a build
bun run build                   # consumers import dist/
```

Regression coverage for both patches:

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
