import { EntityIndex } from './EntityIndex';
import { ComponentRef, ComponentData } from './Component';
import { Query, QueryResult } from './Query';
import { EntityId } from './Entity';
import { type SparseSet } from './utils/SparseSet';
export declare const $internal: unique symbol;
export type ArchetypeNode = {
    edges: (ArchetypeEdge | undefined)[];
};
export type ArchetypeEdge = {
    target: ArchetypeNode;
    addTo: Query[];
    removeFrom: Query[];
    version: number;
};
export type RelationEntry = {
    subject: EntityId;
    relation: ComponentRef;
};
export type WorldContext = {
    entityIndex: EntityIndex;
    entityMasks: number[][];
    entityComponents: ComponentRef[][];
    bitflag: number;
    componentMap: Map<ComponentRef, ComponentData>;
    componentCount: number;
    queries: Set<Query>;
    queriesHashMap: Map<string, Query>;
    notQueries: Set<any>;
    dirtyQueries: Set<any>;
    entityArchetypes: ArchetypeNode[];
    rootArchetype: ArchetypeNode;
    archetypeNodeMap: Map<string, ArchetypeNode>;
    prefabData: ComponentData | null;
    queryVersion: number;
    relationTargets: (Map<ComponentRef, Set<any>> | null)[];
    reverseIndex: (RelationEntry[] | null)[];
    targetsByRelation: Map<ComponentRef, Set<EntityId>>;
    pairsByTarget: Map<EntityId, ComponentRef[]>;
    queriesByTarget: Map<any, Set<Query>>;
    queriesByEntity: Map<EntityId, Set<Query>>;
    queriesByRelation: Map<ComponentRef, Set<Query>>;
    pairQueryMap: Map<ComponentRef, Query>;
    queryTermCache: WeakMap<object, Query>;
    observerQueues: Map<string, {
        buf: EntityId[];
        unsubscribe: () => void;
    }>;
    observerQueuesByTarget: Map<EntityId, Set<string>>;
    hierarchyData: Map<ComponentRef, {
        depths: Uint32Array;
        dirty: SparseSet;
        depthToEntities: Map<number, SparseSet>;
        maxDepth: number;
    }>;
    hierarchyActiveRelations: Set<ComponentRef>;
    hierarchyQueryCache: Map<ComponentRef, {
        hash: string;
        result: QueryResult;
    }>;
};
export type InternalWorld = {
    [$internal]: WorldContext;
};
export type World<T extends object = {}> = {
    [K in keyof T]: T[K];
};
export declare const createArchetypeNode: () => ArchetypeNode;
export declare function createWorld<T extends object = {}>(...args: Array<EntityIndex | T>): World<T>;
export declare const resetWorld: (world: World) => World<{}>;
export declare const deleteWorld: (world: World) => void;
export declare const getWorldComponents: (world: World) => any[];
export declare const getAllEntities: (world: World) => readonly EntityId[];
//# sourceMappingURL=World.d.ts.map