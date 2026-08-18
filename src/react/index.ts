import { createContext, createElement, useContext, useSyncExternalStore, useRef, useMemo, useCallback, type ReactNode } from 'react'
import {
	query as queryWorld,
	observe,
	onAdd,
	onRemove,
	onSet,
	commitRemovals,
	setComponent,
	getComponent,
	type World,
	type QueryTerm,
	type EntityId,
	type ComponentRef,
} from 'bitecs'

// Global tick — incremented on every observed change to bust snapshots.
let tick = 0

// ── Context ───────────────────────────────────────────────────────────

const WorldContext = createContext<World>(null!)

/**
 * Provides a world to all descendant hooks.
 *
 * ```tsx
 * <WorldProvider world={world}>
 *   <Game />
 * </WorldProvider>
 * ```
 */
export const WorldProvider = ({ world, children }: { world: World; children?: ReactNode }) =>
	createElement(WorldContext.Provider, { value: world }, children)

/**
 * Returns the world from context.
 */
export const useWorld = (): World => useContext(WorldContext)

// ── Hooks ─────────────────────────────────────────────────────────────

/**
 * Reactive query. Re-renders when entities enter or leave the result set.
 *
 * ```tsx
 * const entities = useQuery(Position, Velocity)
 * ```
 */
export const useQuery = (...terms: QueryTerm[]): readonly EntityId[] => {
	const world = useWorld()
	const termsRef = useStableValue(terms)

	const subscribe = useCallback(
		(notify: () => void) => {
			const handler = () => { tick++; notify() }
			const unsub1 = observe(world, onAdd(...termsRef), handler)
			const unsub2 = observe(world, onRemove(...termsRef), handler)
			return () => { unsub1(); unsub2() }
		},
		[world, termsRef]
	)

	const getSnapshot = useMemo(() => {
		let last: readonly EntityId[] | undefined
		let lastTick = -1
		return () => {
			if (lastTick !== tick) {
				commitRemovals(world)
				// query returns the live dense array; copy so the snapshot
				// is stable and comparable across calls
				const next = queryWorld(world, termsRef)
				if (
					last === undefined ||
					last.length !== next.length ||
					next.some((e, i) => e !== last![i])
				) {
					last = Array.from(next)
				}
				lastTick = tick
			}
			return last!
		}
	}, [world, termsRef])

	return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Reactive component read. Re-renders when the component is added,
 * removed, or set on the entity, and returns its current data.
 *
 * ```tsx
 * const pos = useComponent(eid, Position)
 * return <div style={{ left: pos.x }} />
 *
 * // tags and relations: re-renders on change, read state directly
 * useComponent(eid, IsActive)
 * return hasComponent(world, eid, IsActive) ? 'on' : 'off'
 * ```
 */
export const useComponent = (eid: EntityId, component: ComponentRef): any => {
	const world = useWorld()
	useObserve(world, eid, component)
	return getComponent(world, eid, component)
}

/**
 * Signals that components were mutated on an entity, notifying observers
 * (and triggering React re-renders). Only needed after raw SoA writes in
 * systems — writes made through `setComponent` notify automatically, so
 * React code never needs this.
 *
 * ```ts
 * Position.x[eid] += Velocity.x[eid]
 * mutated(world, eid, Position)
 * ```
 */
export const mutated = (world: World, eid: EntityId, ...components: ComponentRef[]): void => {
	for (let i = 0; i < components.length; i++) {
		setComponent(world, eid, components[i])
	}
}

// ── Internal ──────────────────────────────────────────────────────────

const useObserve = (world: World, eid: EntityId, component: ComponentRef): void => {
	const counter = useRef(0)

	const subscribe = useCallback(
		(notify: () => void) => {
			const handler = (entity: EntityId) => {
				if (entity === eid) { tick++; counter.current++; notify() }
			}
			const unsubs = [
				observe(world, onAdd(component), handler),
				observe(world, onRemove(component), handler),
				observe(world, onSet(component), handler),
			]
			return () => { for (const unsub of unsubs) unsub() }
		},
		[world, eid, component]
	)

	useSyncExternalStore(subscribe, useCallback(() => counter.current, []))
}

const useStableValue = <T extends unknown[]>(value: T): T => {
	const ref = useRef<T>(value)
	if (
		value.length !== ref.current.length ||
		value.some((v, i) => v !== ref.current[i])
	) {
		ref.current = value
	}
	return ref.current
}
