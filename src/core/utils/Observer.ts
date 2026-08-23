import { EntityId } from "../Entity"

// Fixed arity: every notify site passes at most one extra arg (set/get data),
// so spreading args on dispatch would only add per-call allocation.
export type Observer = (entity: EntityId, arg?: any) => void | object

export interface Observable {
  subscribe: (observer: Observer) => () => void
  notify: (entity: EntityId, arg?: any) => void | object
  count: () => number
}

export const createObservable = (): Observable => {
  const observers: Observer[] = []

  const subscribe = (observer: Observer) => {
    observers.push(observer)
    return () => {
      const idx = observers.indexOf(observer)
      if (idx >= 0) observers.splice(idx, 1)
    }
  }

  // Function expression (not arrow) so arguments.length can preserve the exact
  // call shape: notify(eid) dispatches 1 arg, notify(eid, undefined) dispatches 2.
  const notify = function (entity: EntityId, arg?: any): any {
    if (observers.length === 0) return
    const hasArg = arguments.length > 1
    let result: any
    for (let i = 0; i < observers.length; i++) {
      const r = hasArg ? observers[i](entity, arg) : observers[i](entity)
      if (r && typeof r === 'object') {
        // Merged-object return semantics: get observers' partial results accumulate
        result = result ? Object.assign(result, r) : r
      }
    }
    return result
  }

  return { subscribe, notify, count: () => observers.length }
}
