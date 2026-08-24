import { EntityId } from "../Entity";
export type Observer = (entity: EntityId, arg?: any) => void | object;
export interface Observable {
    subscribe: (observer: Observer) => () => void;
    notify: (entity: EntityId, arg?: any) => void | object;
    count: () => number;
}
export declare const createObservable: () => Observable;
//# sourceMappingURL=Observer.d.ts.map