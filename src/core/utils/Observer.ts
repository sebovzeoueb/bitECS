import { EntityId } from "../Entity"

export type Observer = (entity: EntityId, ...args: any[]) => void | object

export interface Observable {
  subscribe: (observer: Observer) => () => void
  notify: (entity: EntityId, ...args: any[]) => void | object
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

  const notify = (entity: EntityId, ...args: any[]): any => {
    if (observers.length === 0) return
    let result: any
    for (let i = 0; i < observers.length; i++) {
      const r = observers[i](entity, ...args)
      if (r && typeof r === 'object') {
        result = result ? Object.assign(result, r) : r
      }
    }
    return result
  }

  return { subscribe, notify }
}
