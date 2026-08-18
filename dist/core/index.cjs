var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/index.ts
var core_exports = {};
__export(core_exports, {
  $internal: () => $internal,
  All: () => All,
  And: () => And,
  Any: () => Any,
  Cascade: () => Cascade,
  Hierarchy: () => Hierarchy,
  IsA: () => IsA,
  None: () => None,
  Not: () => Not,
  Or: () => Or,
  Pair: () => Pair,
  Prefab: () => Prefab,
  Wildcard: () => Wildcard,
  addComponent: () => addComponent,
  addComponents: () => addComponents,
  addEntity: () => addEntity,
  addPrefab: () => addPrefab,
  aos: () => aos,
  asBuffer: () => asBuffer,
  commitRemovals: () => commitRemovals,
  createEntityIndex: () => createEntityIndex,
  createRelation: () => createRelation,
  createWorld: () => createWorld,
  deleteWorld: () => deleteWorld,
  entityExists: () => entityExists,
  getAllEntities: () => getAllEntities,
  getComponent: () => getComponent,
  getEntityComponents: () => getEntityComponents,
  getHierarchyDepth: () => getHierarchyDepth,
  getId: () => getId,
  getMaxHierarchyDepth: () => getMaxHierarchyDepth,
  getRelationTargets: () => getRelationTargets,
  getVersion: () => getVersion,
  getWorldComponents: () => getWorldComponents,
  hasComponent: () => hasComponent,
  isNested: () => isNested,
  isRelation: () => isRelation,
  isWildcard: () => isWildcard,
  makeExclusive: () => makeExclusive,
  noCommit: () => noCommit,
  observe: () => observe,
  onAdd: () => onAdd,
  onGet: () => onGet,
  onRemove: () => onRemove,
  onSet: () => onSet,
  peek: () => peek,
  pipe: () => pipe,
  query: () => query,
  queue: () => queue,
  queueDrain: () => queueDrain,
  queuePeek: () => queuePeek,
  registerComponent: () => registerComponent,
  registerComponents: () => registerComponents,
  registerQuery: () => registerQuery,
  removeComponent: () => removeComponent,
  removeComponents: () => removeComponents,
  removeEntity: () => removeEntity,
  removeQuery: () => removeQuery,
  resetWorld: () => resetWorld,
  set: () => set,
  setComponent: () => setComponent,
  soa: () => soa,
  withAutoRemoveSubject: () => withAutoRemoveSubject,
  withOnTargetRemoved: () => withOnTargetRemoved,
  withStore: () => withStore,
  withVersioning: () => withVersioning
});
module.exports = __toCommonJS(core_exports);

// src/core/utils/defineHiddenProperty.ts
var defineHiddenProperty = (obj, key, value) => Object.defineProperty(obj, key, {
  value,
  enumerable: false,
  writable: true,
  configurable: true
});

// src/core/EntityIndex.ts
var getId = (index, id) => id & index.entityMask;
var getVersion = (index, id) => id >>> index.versionShift & (1 << index.versionBits) - 1;
var incrementVersion = (index, id) => {
  const currentVersion = getVersion(index, id);
  const newVersion = currentVersion + 1 & (1 << index.versionBits) - 1;
  return id & index.entityMask | newVersion << index.versionShift;
};
var withVersioning = (versionBits) => ({
  versioning: true,
  versionBits
});
var createEntityIndex = (options) => {
  const config = options ? typeof options === "function" ? options() : options : { versioning: false, versionBits: 8 };
  const versionBits = config.versionBits ?? 8;
  const versioning = config.versioning ?? false;
  const entityBits = 32 - versionBits;
  const entityMask = (1 << entityBits) - 1;
  const versionShift = entityBits;
  const versionMask = (1 << versionBits) - 1 << versionShift;
  return {
    aliveCount: 0,
    dense: [],
    sparse: [],
    maxId: 0,
    versioning,
    versionBits,
    entityMask,
    versionShift,
    versionMask
  };
};
var addEntityId = (index) => {
  if (index.aliveCount < index.dense.length) {
    const recycledId = index.dense[index.aliveCount];
    const entityId = recycledId;
    index.sparse[entityId] = index.aliveCount;
    index.aliveCount++;
    return recycledId;
  }
  const id = ++index.maxId;
  index.dense.push(id);
  index.sparse[id] = index.aliveCount;
  index.aliveCount++;
  return id;
};
var removeEntityId = (index, id) => {
  const denseIndex = index.sparse[id];
  if (denseIndex === void 0 || denseIndex >= index.aliveCount) {
    return;
  }
  const lastIndex = index.aliveCount - 1;
  const lastId = index.dense[lastIndex];
  index.sparse[lastId] = denseIndex;
  index.dense[denseIndex] = lastId;
  index.sparse[id] = lastIndex;
  index.dense[lastIndex] = id;
  if (index.versioning) {
    const newId = incrementVersion(index, id);
    index.dense[lastIndex] = newId;
  }
  index.aliveCount--;
};
var isEntityIdAlive = (index, id) => {
  const entityId = getId(index, id);
  const denseIndex = index.sparse[entityId];
  return denseIndex !== void 0 && denseIndex < index.aliveCount && index.dense[denseIndex] === id;
};

// src/core/World.ts
var $internal = Symbol.for("bitecs_internal");
var createArchetypeNode = () => ({ edges: [] });
var createWorldContext = (entityIndex) => ({
  entityIndex: entityIndex || createEntityIndex(),
  entityMasks: [[]],
  entityComponents: [],
  bitflag: 1,
  componentMap: /* @__PURE__ */ new Map(),
  componentCount: 0,
  queries: /* @__PURE__ */ new Set(),
  queriesHashMap: /* @__PURE__ */ new Map(),
  notQueries: /* @__PURE__ */ new Set(),
  dirtyQueries: /* @__PURE__ */ new Set(),
  entityArchetypes: [],
  rootArchetype: createArchetypeNode(),
  prefabData: null,
  relationTargets: [],
  reverseIndex: [],
  targetsByRelation: /* @__PURE__ */ new Map(),
  pairsByTarget: /* @__PURE__ */ new Map(),
  observerQueues: /* @__PURE__ */ new Map(),
  hierarchyData: /* @__PURE__ */ new Map(),
  hierarchyActiveRelations: /* @__PURE__ */ new Set(),
  hierarchyQueryCache: /* @__PURE__ */ new Map()
});
var createBaseWorld = (context, entityIndex) => defineHiddenProperty(
  context || {},
  $internal,
  createWorldContext(entityIndex)
);
function createWorld(...args) {
  let entityIndex;
  let context;
  args.forEach((arg) => {
    if (typeof arg === "object" && "dense" in arg && "sparse" in arg && "aliveCount" in arg) {
      entityIndex = arg;
    } else if (typeof arg === "object") {
      context = arg;
    }
  });
  return createBaseWorld(context, entityIndex);
}
var resetWorld = (world) => {
  const ctx = world[$internal];
  Object.assign(ctx, createWorldContext());
  return world;
};
var deleteWorld = (world) => {
  delete world[$internal];
};
var getWorldComponents = (world) => Array.from(world[$internal].componentMap.keys());
var getAllEntities = (world) => {
  const { entityIndex } = world[$internal];
  return entityIndex.dense.slice(0, entityIndex.aliveCount);
};

// src/core/utils/SparseSet.ts
var createSparseSet = () => {
  const dense = [];
  const sparse = [];
  const has = (val) => dense[sparse[val]] === val;
  const add = (val) => {
    if (has(val)) return;
    sparse[val] = dense.push(val) - 1;
  };
  const remove = (val) => {
    if (!has(val)) return;
    const index = sparse[val];
    const swapped = dense.pop();
    if (swapped !== val) {
      dense[index] = swapped;
      sparse[swapped] = index;
    }
  };
  const reset = () => {
    dense.length = 0;
    sparse.length = 0;
  };
  const sort = (compareFn) => {
    dense.sort(compareFn);
    for (let i = 0; i < dense.length; i++) {
      sparse[dense[i]] = i;
    }
  };
  return {
    add,
    remove,
    has,
    sparse,
    dense,
    reset,
    sort
  };
};
var SharedArrayBufferOrArrayBuffer = typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : ArrayBuffer;
var createUint32SparseSet = (initialCapacity = 1e3) => {
  const sparse = [];
  let length = 0;
  let dense = new Uint32Array(new SharedArrayBufferOrArrayBuffer(initialCapacity * 4));
  let cachedView = new Uint32Array(dense.buffer, 0, 0);
  let viewDirty = true;
  const has = (val) => val < sparse.length && sparse[val] < length && dense[sparse[val]] === val;
  const add = (val) => {
    if (has(val)) return;
    if (length >= dense.length) {
      const newDense = new Uint32Array(new SharedArrayBufferOrArrayBuffer(dense.length * 2 * 4));
      newDense.set(dense);
      dense = newDense;
    }
    dense[length] = val;
    sparse[val] = length;
    length++;
    viewDirty = true;
  };
  const remove = (val) => {
    if (!has(val)) return;
    length--;
    const index = sparse[val];
    const swapped = dense[length];
    dense[index] = swapped;
    sparse[swapped] = index;
    viewDirty = true;
  };
  const reset = () => {
    length = 0;
    sparse.length = 0;
    viewDirty = true;
  };
  const sort = (compareFn) => {
    const temp = Array.from(dense.subarray(0, length));
    temp.sort(compareFn);
    for (let i = 0; i < temp.length; i++) {
      dense[i] = temp[i];
    }
    for (let i = 0; i < length; i++) {
      sparse[dense[i]] = i;
    }
    viewDirty = true;
  };
  return {
    add,
    remove,
    has,
    sparse,
    get dense() {
      if (viewDirty) {
        cachedView = new Uint32Array(dense.buffer, 0, length);
        viewDirty = false;
      }
      return cachedView;
    },
    reset,
    sort
  };
};

// src/core/utils/Observer.ts
var createObservable = () => {
  const observers = [];
  const subscribe = (observer) => {
    observers.push(observer);
    return () => {
      const idx = observers.indexOf(observer);
      if (idx >= 0) observers.splice(idx, 1);
    };
  };
  const notify = (entity, ...args) => {
    if (observers.length === 0) return;
    let result;
    for (let i = 0; i < observers.length; i++) {
      const r = observers[i](entity, ...args);
      if (r && typeof r === "object") {
        result = result ? Object.assign(result, r) : r;
      }
    }
    return result;
  };
  return { subscribe, notify, count: () => observers.length };
};

// src/core/Relation.ts
var $relation = Symbol.for("bitecs-relation");
var $pairTarget = Symbol.for("bitecs-pairTarget");
var $isPairComponent = Symbol.for("bitecs-isPairComponent");
var $relationData = Symbol.for("bitecs-relationData");
var pairFinalizer = new FinalizationRegistry(
  ({ pairsMap, key, ref }) => {
    if (pairsMap.get(key) === ref) pairsMap.delete(key);
  }
);
var createBaseRelation = () => {
  const data = {
    pairsMap: /* @__PURE__ */ new Map(),
    initStore: void 0,
    exclusiveRelation: false,
    autoRemoveSubject: false,
    onTargetRemoved: void 0
  };
  const relation = (target) => {
    if (target === void 0) throw Error("Relation target is undefined");
    const normalizedTarget = target === "*" ? Wildcard : target;
    const existing = data.pairsMap.get(normalizedTarget)?.deref();
    if (existing !== void 0) return existing;
    const component = data.initStore ? data.initStore(target) : {};
    defineHiddenProperty(component, $relation, relation);
    defineHiddenProperty(component, $pairTarget, normalizedTarget);
    defineHiddenProperty(component, $isPairComponent, true);
    const ref = new WeakRef(component);
    data.pairsMap.set(normalizedTarget, ref);
    pairFinalizer.register(component, { pairsMap: data.pairsMap, key: normalizedTarget, ref });
    return component;
  };
  defineHiddenProperty(relation, $relationData, data);
  return relation;
};
var withStore = (createStore) => (relation) => {
  const ctx = relation[$relationData];
  ctx.initStore = createStore;
  return relation;
};
var makeExclusive = (relation) => {
  const ctx = relation[$relationData];
  ctx.exclusiveRelation = true;
  return relation;
};
var withAutoRemoveSubject = (relation) => {
  const ctx = relation[$relationData];
  ctx.autoRemoveSubject = true;
  return relation;
};
var withOnTargetRemoved = (onRemove2) => (relation) => {
  const ctx = relation[$relationData];
  ctx.onTargetRemoved = onRemove2;
  return relation;
};
var Pair = (relation, target) => {
  if (relation === void 0) throw Error("Relation is undefined");
  return relation(target);
};
var getRelationTargets = (world, eid, relation) => {
  const ctx = world[$internal];
  const targets = ctx.relationTargets[eid]?.get(relation);
  return targets ? Array.from(targets) : [];
};
function createRelation(...args) {
  if (args.length === 1 && typeof args[0] === "object") {
    const { store, exclusive, autoRemoveSubject, onTargetRemoved } = args[0];
    const modifiers = [
      store && withStore(store),
      exclusive && makeExclusive,
      autoRemoveSubject && withAutoRemoveSubject,
      onTargetRemoved && withOnTargetRemoved(onTargetRemoved)
    ].filter(Boolean);
    return modifiers.reduce((acc, modifier) => modifier(acc), createBaseRelation());
  } else {
    const modifiers = args;
    return modifiers.reduce((acc, modifier) => modifier(acc), createBaseRelation());
  }
}
var $wildcard = Symbol.for("bitecs-wildcard");
var getGlobalRelation = (key, init) => {
  const sym = Symbol.for(key);
  if (!globalThis[sym]) globalThis[sym] = init();
  return globalThis[sym];
};
var Wildcard = getGlobalRelation("bitecs-global-wildcard", () => {
  const relation = createBaseRelation();
  Object.defineProperty(relation, $wildcard, { value: true, enumerable: false, writable: false, configurable: false });
  return relation;
});
var IsA = getGlobalRelation("bitecs-global-isa", createBaseRelation);
function isWildcard(relation) {
  return relation ? relation[$wildcard] === true : false;
}
function isRelation(component) {
  return component ? component[$relationData] !== void 0 : false;
}

// src/core/Hierarchy.ts
var MAX_HIERARCHY_DEPTH = 64;
var INVALID_DEPTH = 4294967295;
var DEFAULT_BUFFER_GROWTH = 1024;
function growDepthsArray(hierarchyData, entity) {
  const { depths } = hierarchyData;
  if (entity < depths.length) return depths;
  const newSize = Math.max(entity + 1, depths.length * 2, depths.length + DEFAULT_BUFFER_GROWTH);
  const newDepths = new Uint32Array(newSize);
  newDepths.fill(INVALID_DEPTH);
  newDepths.set(depths);
  hierarchyData.depths = newDepths;
  return newDepths;
}
function updateDepthCache(hierarchyData, entity, newDepth, oldDepth) {
  const { depthToEntities } = hierarchyData;
  if (oldDepth !== void 0 && oldDepth !== INVALID_DEPTH) {
    const oldSet = depthToEntities.get(oldDepth);
    if (oldSet) {
      oldSet.remove(entity);
      if (oldSet.dense.length === 0) depthToEntities.delete(oldDepth);
    }
  }
  if (newDepth !== INVALID_DEPTH) {
    if (!depthToEntities.has(newDepth)) depthToEntities.set(newDepth, createUint32SparseSet());
    depthToEntities.get(newDepth).add(entity);
  }
}
function updateMaxDepth(hierarchyData, depth) {
  if (depth > hierarchyData.maxDepth) {
    hierarchyData.maxDepth = depth;
  }
}
function setEntityDepth(hierarchyData, entity, newDepth, oldDepth) {
  hierarchyData.depths[entity] = newDepth;
  updateDepthCache(hierarchyData, entity, newDepth, oldDepth);
  updateMaxDepth(hierarchyData, newDepth);
}
function invalidateQueryCache(world, relation) {
  const ctx = world[$internal];
  ctx.hierarchyQueryCache.delete(relation);
}
function getHierarchyData(world, relation) {
  const ctx = world[$internal];
  if (!ctx.hierarchyActiveRelations.has(relation)) {
    ctx.hierarchyActiveRelations.add(relation);
    ensureDepthTracking(world, relation);
    populateExistingDepths(world, relation);
  }
  return ctx.hierarchyData.get(relation);
}
function populateExistingDepths(world, relation) {
  const entitiesWithRelation = query(world, [relation(Wildcard)]);
  for (const entity of entitiesWithRelation) {
    getEntityDepth(world, relation, entity);
  }
  const processedTargets = /* @__PURE__ */ new Set();
  for (const entity of entitiesWithRelation) {
    for (const target of getRelationTargets(world, entity, relation)) {
      if (!processedTargets.has(target)) {
        processedTargets.add(target);
        getEntityDepth(world, relation, target);
      }
    }
  }
}
function ensureDepthTracking(world, relation) {
  const ctx = world[$internal];
  if (!ctx.hierarchyData.has(relation)) {
    const initialSize = Math.max(DEFAULT_BUFFER_GROWTH, ctx.entityIndex.dense.length * 2);
    const depthArray = new Uint32Array(initialSize);
    depthArray.fill(INVALID_DEPTH);
    ctx.hierarchyData.set(relation, {
      depths: depthArray,
      dirty: createSparseSet(),
      depthToEntities: /* @__PURE__ */ new Map(),
      maxDepth: 0
    });
  }
}
function calculateEntityDepth(world, relation, entity, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(entity)) return 0;
  visited.add(entity);
  const targets = getRelationTargets(world, entity, relation);
  if (targets.length === 0) return 0;
  if (targets.length === 1) return getEntityDepthWithVisited(world, relation, targets[0], visited) + 1;
  let minDepth = Infinity;
  for (const target of targets) {
    const depth = getEntityDepthWithVisited(world, relation, target, visited);
    if (depth < minDepth) {
      minDepth = depth;
      if (minDepth === 0) break;
    }
  }
  return minDepth === Infinity ? 0 : minDepth + 1;
}
function getEntityDepthWithVisited(world, relation, entity, visited) {
  const ctx = world[$internal];
  ensureDepthTracking(world, relation);
  const hierarchyData = ctx.hierarchyData.get(relation);
  let { depths } = hierarchyData;
  depths = growDepthsArray(hierarchyData, entity);
  if (depths[entity] === INVALID_DEPTH) {
    const depth = calculateEntityDepth(world, relation, entity, visited);
    setEntityDepth(hierarchyData, entity, depth);
    return depth;
  }
  return depths[entity];
}
function getEntityDepth(world, relation, entity) {
  return getEntityDepthWithVisited(world, relation, entity, /* @__PURE__ */ new Set());
}
function markChildrenDirty(world, relation, parent, dirty, visited = createSparseSet()) {
  if (visited.has(parent)) return;
  visited.add(parent);
  const children = query(world, [relation(parent)]);
  for (const child of children) {
    dirty.add(child);
    markChildrenDirty(world, relation, child, dirty, visited);
  }
}
function updateHierarchyDepth(world, relation, entity, parent, updating = /* @__PURE__ */ new Set()) {
  const ctx = world[$internal];
  if (!ctx.hierarchyActiveRelations.has(relation)) {
    return;
  }
  ensureDepthTracking(world, relation);
  const hierarchyData = ctx.hierarchyData.get(relation);
  if (updating.has(entity)) {
    hierarchyData.dirty.add(entity);
    return;
  }
  updating.add(entity);
  const { depths, dirty } = hierarchyData;
  const newDepth = parent !== void 0 ? getEntityDepth(world, relation, parent) + 1 : 0;
  if (newDepth > MAX_HIERARCHY_DEPTH) {
    return;
  }
  const oldDepth = depths[entity];
  setEntityDepth(hierarchyData, entity, newDepth, oldDepth === INVALID_DEPTH ? void 0 : oldDepth);
  if (oldDepth !== newDepth) {
    markChildrenDirty(world, relation, entity, dirty, createSparseSet());
    invalidateQueryCache(world, relation);
  }
}
function invalidateHierarchyDepth(world, relation, entity) {
  const ctx = world[$internal];
  if (!ctx.hierarchyActiveRelations.has(relation)) {
    return;
  }
  const hierarchyData = ctx.hierarchyData.get(relation);
  let { depths } = hierarchyData;
  depths = growDepthsArray(hierarchyData, entity);
  invalidateSubtree(world, relation, entity, depths, createSparseSet());
  invalidateQueryCache(world, relation);
}
function invalidateSubtree(world, relation, entity, depths, visited) {
  if (visited.has(entity)) return;
  visited.add(entity);
  const ctx = world[$internal];
  const hierarchyData = ctx.hierarchyData.get(relation);
  if (entity < depths.length) {
    const oldDepth = depths[entity];
    if (oldDepth !== INVALID_DEPTH) {
      hierarchyData.depths[entity] = INVALID_DEPTH;
      updateDepthCache(hierarchyData, entity, INVALID_DEPTH, oldDepth);
    }
  }
  const children = query(world, [relation(entity)]);
  for (const child of children) {
    invalidateSubtree(world, relation, child, depths, visited);
  }
}
function flushDirtyDepths(world, relation) {
  const ctx = world[$internal];
  const hierarchyData = ctx.hierarchyData.get(relation);
  if (!hierarchyData) return;
  const { dirty, depths } = hierarchyData;
  if (dirty.dense.length === 0) return;
  for (const entity of dirty.dense) {
    const oldDepth = depths[entity];
    const newDepth = calculateEntityDepth(world, relation, entity);
    setEntityDepth(hierarchyData, entity, newDepth, oldDepth === INVALID_DEPTH ? void 0 : oldDepth);
  }
  dirty.reset();
}
function queryHierarchy(world, relation, components, options = {}) {
  const ctx = world[$internal];
  getHierarchyData(world, relation);
  const queryKey = queryHash(world, [relation, ...components]);
  const cached = ctx.hierarchyQueryCache.get(relation);
  if (cached && cached.hash === queryKey) {
    return cached.result;
  }
  flushDirtyDepths(world, relation);
  queryInternal(world, components, options);
  const queryObj = ctx.queriesHashMap.get(queryHash(world, components));
  const hierarchyData = ctx.hierarchyData.get(relation);
  const { depths } = hierarchyData;
  const sorted = Array.from(queryObj.dense).sort((a, b) => {
    const depthA = depths[a];
    const depthB = depths[b];
    return depthA !== depthB ? depthA - depthB : a - b;
  });
  const result = options.buffered ? new Uint32Array(sorted) : sorted;
  ctx.hierarchyQueryCache.set(relation, { hash: queryKey, result });
  return result;
}
function queryHierarchyDepth(world, relation, depth, options = {}) {
  const hierarchyData = getHierarchyData(world, relation);
  flushDirtyDepths(world, relation);
  const entitiesAtDepth = hierarchyData.depthToEntities.get(depth);
  if (entitiesAtDepth) {
    return options.buffered ? entitiesAtDepth.dense : entitiesAtDepth.dense;
  }
  return options.buffered ? new Uint32Array(0) : [];
}
function getHierarchyDepth(world, entity, relation) {
  getHierarchyData(world, relation);
  return getEntityDepthWithVisited(world, relation, entity, /* @__PURE__ */ new Set());
}
function getMaxHierarchyDepth(world, relation) {
  const hierarchyData = getHierarchyData(world, relation);
  return hierarchyData.maxDepth;
}

// src/core/Query.ts
var $opType = Symbol.for("bitecs-opType");
var $opTerms = Symbol.for("bitecs-opTerms");
var createOp = (type) => (...components) => ({ [$opType]: type, [$opTerms]: components });
var Or = createOp("Or");
var And = createOp("And");
var Not = createOp("Not");
var Any = Or;
var All = And;
var None = Not;
var $hierarchyType = Symbol.for("bitecs-hierarchyType");
var $hierarchyRel = Symbol.for("bitecs-hierarchyRel");
var $hierarchyDepth = Symbol.for("bitecs-hierarchyDepth");
var Hierarchy = (relation, depth) => ({
  [$hierarchyType]: "Hierarchy",
  [$hierarchyRel]: relation,
  [$hierarchyDepth]: depth
});
var Cascade = Hierarchy;
var $modifierType = Symbol.for("bitecs-modifierType");
var asBuffer = { [$modifierType]: "buffer" };
var isNested = { [$modifierType]: "nested" };
var noCommit = isNested;
var createHook = (type) => (...terms) => ({ [$opType]: type, [$opTerms]: terms });
var onAdd = createHook("add");
var onRemove = createHook("remove");
var onSet = (component) => ({ [$opType]: "set", [$opTerms]: [component] });
var onGet = (component) => ({ [$opType]: "get", [$opTerms]: [component] });
function observe(world, hook, callback) {
  const ctx = world[$internal];
  const { [$opType]: type, [$opTerms]: components } = hook;
  if (type === "add" || type === "remove") {
    const queryData = ctx.queriesHashMap.get(queryHash(world, components)) || registerQuery(world, components);
    return queryData[type === "add" ? "addObservable" : "removeObservable"].subscribe(callback);
  }
  if (type === "set" || type === "get") {
    if (components.length !== 1) throw new Error("Set and Get hooks can only observe a single component");
    const componentData = ctx.componentMap.get(components[0]) || registerComponent(world, components[0]);
    return componentData[type === "set" ? "setObservable" : "getObservable"].subscribe(callback);
  }
  throw new Error(`Invalid hook type: ${type}`);
}
var hookHash = (world, hook) => {
  const { [$opType]: type, [$opTerms]: components } = hook;
  return `${type}:${queryHash(world, components)}`;
};
var getObserverQueue = (world, hook) => {
  const ctx = world[$internal];
  const hash = hookHash(world, hook);
  let buf = ctx.observerQueues.get(hash);
  if (!buf) {
    buf = [];
    ctx.observerQueues.set(hash, buf);
    observe(world, hook, (eid) => buf.push(eid));
    if (hook[$opType] === "add") {
      const existing = queryInternal(world, hook[$opTerms]);
      for (let i = 0; i < existing.length; i++) buf.push(existing[i]);
    }
  }
  return buf;
};
var queueDrain = (world, hook) => {
  const buf = getObserverQueue(world, hook);
  const result = buf.slice();
  buf.length = 0;
  return result;
};
var queuePeek = (world, hook) => {
  return getObserverQueue(world, hook).slice();
};
var queue = queueDrain;
var peek = queuePeek;
var queryHash = (world, terms) => {
  const ctx = world[$internal];
  const getComponentId = (component) => {
    if (!ctx.componentMap.has(component)) registerComponent(world, component);
    return ctx.componentMap.get(component).id;
  };
  const termToString = (term) => {
    if (typeof term === "object" && term !== null && $opType in term) {
      return `${term[$opType].toLowerCase()}(${term[$opTerms].map(termToString).sort().join(",")})`;
    }
    if (term[$isPairComponent]) {
      const relation = term[$relation];
      const target = term[$pairTarget];
      if (isWildcard(relation)) {
        if (typeof target === "number") return `w(e${target})`;
        if (isRelation(target)) {
          if (!ctx.componentMap.has(target)) registerComponent(world, target);
          return `w(r${ctx.componentMap.get(target).id})`;
        }
        return `w(?)`;
      }
      if (target === Wildcard) {
        return getComponentId(relation).toString();
      }
      return `p(${getComponentId(relation)},${target})`;
    }
    return getComponentId(term).toString();
  };
  return terms.map(termToString).sort().join("-");
};
var invalidateArchetypeTransitions = (ctx) => {
  ctx.rootArchetype.edges = [];
  for (let i = 0; i < ctx.entityArchetypes.length; i++) {
    const node = ctx.entityArchetypes[i];
    if (node) node.edges = [];
  }
};
var registerQuery = (world, terms, options = {}) => {
  const ctx = world[$internal];
  const hash = queryHash(world, terms);
  const isOp = (term) => typeof term === "object" && term !== null && $opType in term;
  const pairFilters = [];
  const unwrapTerm = (term) => {
    if (term[$isPairComponent]) {
      const relation = term[$relation];
      const target = term[$pairTarget];
      if (isWildcard(relation)) {
        if (typeof target === "number") pairFilters.push({ entity: target });
        else if (isRelation(target)) pairFilters.push({ relation: target });
        return null;
      }
      if (target === Wildcard) {
        if (!ctx.componentMap.has(relation)) registerComponent(world, relation);
        return relation;
      }
      if (!ctx.componentMap.has(relation)) registerComponent(world, relation);
      pairFilters.push({ relation, target });
      return relation;
    }
    return term;
  };
  const queryComponents = [];
  const collect = (term) => {
    if (isOp(term)) {
      const opTerms = term[$opTerms];
      for (let j = 0; j < opTerms.length; j++) collect(opTerms[j]);
    } else {
      const unwrapped = unwrapTerm(term);
      if (unwrapped === null) return;
      if (!ctx.componentMap.has(unwrapped)) registerComponent(world, unwrapped);
      queryComponents.push(unwrapped);
    }
  };
  for (let i = 0; i < terms.length; i++) collect(terms[i]);
  const components = [];
  const notComponents = [];
  const orComponents = [];
  const addToArray = (arr, comps) => {
    for (let j = 0; j < comps.length; j++) {
      const unwrapped = unwrapTerm(comps[j]);
      if (unwrapped === null) continue;
      if (!ctx.componentMap.has(unwrapped)) registerComponent(world, unwrapped);
      arr.push(unwrapped);
    }
  };
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (isOp(term)) {
      const { [$opType]: type, [$opTerms]: comps } = term;
      if (type === "Not") addToArray(notComponents, comps);
      else if (type === "Or") addToArray(orComponents, comps);
      else if (type === "And") addToArray(components, comps);
      else throw new Error(`Nested combinator ${type} not supported yet - use simple queries for best performance`);
    } else {
      const unwrapped = unwrapTerm(term);
      if (unwrapped === null) continue;
      if (!ctx.componentMap.has(unwrapped)) registerComponent(world, unwrapped);
      components.push(unwrapped);
    }
  }
  const allComponentsData = queryComponents.map((c) => ctx.componentMap.get(c));
  const generations = allComponentsData.length > 0 ? [...new Set(allComponentsData.map((c) => c.generationId))] : [];
  const reduceBitflags = (a, c) => (a[c.generationId] = (a[c.generationId] || 0) | c.bitflag, a);
  const masks = components.map((c) => ctx.componentMap.get(c)).reduce(reduceBitflags, {});
  const notMasks = notComponents.map((c) => ctx.componentMap.get(c)).reduce(reduceBitflags, {});
  const orMasks = orComponents.map((c) => ctx.componentMap.get(c)).reduce(reduceBitflags, {});
  const hasMasks = allComponentsData.reduce(reduceBitflags, {});
  const hasOrTerms = orComponents.length > 0;
  const query2 = Object.assign(options.buffered ? createUint32SparseSet() : createSparseSet(), {
    allComponents: queryComponents,
    orComponents,
    notComponents,
    masks,
    notMasks,
    orMasks,
    hasMasks,
    hasOrTerms,
    generations,
    toRemove: createSparseSet(),
    addObservable: createObservable(),
    removeObservable: createObservable(),
    queues: {},
    pairFilters
  });
  ctx.queries.add(query2);
  ctx.queriesHashMap.set(hash, query2);
  for (let i = 0; i < allComponentsData.length; i++) {
    allComponentsData[i].queries.add(query2);
  }
  if (notComponents.length) ctx.notQueries.add(query2);
  invalidateArchetypeTransitions(ctx);
  if (pairFilters.length > 0 && queryComponents.length === 0) {
    for (const filter of pairFilters) {
      if ("entity" in filter) {
        const relTargets = ctx.relationTargets[filter.entity];
        if (relTargets) {
          for (const [, targets] of relTargets) {
            for (const t of targets) queryAddEntity(query2, t);
          }
        }
      } else {
        const targetSet = ctx.targetsByRelation.get(filter.relation);
        if (targetSet) {
          for (const eid of targetSet) queryAddEntity(query2, eid);
        }
      }
    }
  } else {
    const entityIndex = ctx.entityIndex;
    for (let i = 0; i < entityIndex.aliveCount; i++) {
      const eid = entityIndex.dense[i];
      if (hasComponent(world, eid, Prefab)) continue;
      const match = queryCheckEntity(world, query2, eid);
      if (match) {
        queryAddEntity(query2, eid);
      }
    }
  }
  return query2;
};
function queryInternal(world, terms, options = {}) {
  const ctx = world[$internal];
  const hash = queryHash(world, terms);
  let queryData = ctx.queriesHashMap.get(hash);
  if (!queryData) {
    queryData = registerQuery(world, terms, options);
  } else if (options.buffered && !("buffer" in queryData.dense)) {
    queryData = registerQuery(world, terms, { buffered: true });
  }
  return options.buffered ? queryData.dense : queryData.dense;
}
function query(world, terms, ...modifiers) {
  const hierarchyTerm = terms.find((term) => term && typeof term === "object" && $hierarchyType in term);
  let buffered = false, commit = true;
  const hasModifiers = modifiers.some((m) => m && typeof m === "object" && $modifierType in m);
  for (const modifier of modifiers) {
    if (hasModifiers && modifier && typeof modifier === "object" && $modifierType in modifier) {
      const mod = modifier;
      if (mod[$modifierType] === "buffer") buffered = true;
      if (mod[$modifierType] === "nested") commit = false;
    } else if (!hasModifiers) {
      const opts = modifier;
      if (opts.buffered !== void 0) buffered = opts.buffered;
      if (opts.commit !== void 0) commit = opts.commit;
    }
  }
  if (hierarchyTerm) {
    const regularTerms = terms.filter((term) => !(term && typeof term === "object" && $hierarchyType in term));
    const { [$hierarchyRel]: relation, [$hierarchyDepth]: depth } = hierarchyTerm;
    return depth !== void 0 ? queryHierarchyDepth(world, relation, depth, { buffered }) : queryHierarchy(world, relation, regularTerms, { buffered });
  }
  if (commit) commitRemovals(world);
  return queryInternal(world, terms, { buffered });
}
function queryCheckEntity(world, query2, eid) {
  const ctx = world[$internal];
  const { masks, notMasks, orMasks, hasOrTerms, generations, pairFilters } = query2;
  let hasOrMatch = !hasOrTerms;
  for (let i = 0; i < generations.length; i++) {
    const generationId = generations[i];
    const qMask = masks[generationId];
    const qNotMask = notMasks[generationId];
    const qOrMask = orMasks[generationId];
    const eMask = ctx.entityMasks[generationId][eid];
    if (qNotMask && (eMask & qNotMask) !== 0) return false;
    if (qMask && (eMask & qMask) !== qMask) return false;
    if (qOrMask && (eMask & qOrMask) !== 0) hasOrMatch = true;
  }
  if (!hasOrMatch) return false;
  if (pairFilters.length > 0) {
    for (let i = 0; i < pairFilters.length; i++) {
      const filter = pairFilters[i];
      if ("target" in filter) {
        const targets = ctx.relationTargets[eid]?.get(filter.relation);
        if (!targets || !targets.has(filter.target)) return false;
      } else if ("entity" in filter) {
        const relTargets = ctx.relationTargets[eid];
        if (!relTargets) return false;
        let found = false;
        for (const [, targets] of relTargets) {
          if (targets.has(filter.entity)) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      } else {
        const rev = ctx.reverseIndex[eid];
        if (!rev) return false;
        let found = false;
        for (let j = 0; j < rev.length; j++) {
          if (rev[j].relation === filter.relation) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
    }
  }
  return true;
}
var queryAddEntity = (query2, eid) => {
  if (query2.toRemove.has(eid)) {
    query2.toRemove.remove(eid);
    query2.addObservable.notify(eid);
    return;
  }
  if (query2.has(eid)) return;
  query2.add(eid);
  query2.addObservable.notify(eid);
};
var queryCommitRemovals = (query2) => {
  for (let i = 0; i < query2.toRemove.dense.length; i++) {
    const eid = query2.toRemove.dense[i];
    query2.remove(eid);
  }
  query2.toRemove.reset();
};
var commitRemovals = (world) => {
  const ctx = world[$internal];
  if (!ctx.dirtyQueries.size) return;
  for (const q of ctx.dirtyQueries) queryCommitRemovals(q);
  ctx.dirtyQueries.clear();
};
var queryRemoveEntity = (world, query2, eid) => {
  const ctx = world[$internal];
  const has = query2.has(eid);
  if (!has || query2.toRemove.has(eid)) return;
  query2.toRemove.add(eid);
  ctx.dirtyQueries.add(query2);
  query2.removeObservable.notify(eid);
};
var removeQuery = (world, terms) => {
  const ctx = world[$internal];
  const hash = queryHash(world, terms);
  const query2 = ctx.queriesHashMap.get(hash);
  if (query2) {
    ctx.queries.delete(query2);
    ctx.queriesHashMap.delete(hash);
    invalidateArchetypeTransitions(ctx);
  }
};

// src/core/Component.ts
var createArchetypeNode2 = () => ({ edges: [] });
var getTransitionEdge = (world, ctx, node, eid, componentData, isAdd) => {
  const action = componentData.id * 2 + (isAdd ? 1 : 0);
  let edge = node.edges[action];
  if (edge !== void 0) return edge;
  const addTo = [];
  const removeFrom = [];
  for (const queryData of componentData.queries) {
    if (queryData.pairFilters.length > 0) continue;
    if (queryCheckEntity(world, queryData, eid)) addTo.push(queryData);
    else removeFrom.push(queryData);
  }
  edge = { target: createArchetypeNode2(), addTo, removeFrom };
  node.edges[action] = edge;
  return edge;
};
var applyTransition = (world, ctx, eid, componentData, isAdd) => {
  const node = ctx.entityArchetypes[eid] || ctx.rootArchetype;
  const edge = getTransitionEdge(world, ctx, node, eid, componentData, isAdd);
  ctx.entityArchetypes[eid] = edge.target;
  for (let i = 0; i < edge.addTo.length; i++) queryAddEntity(edge.addTo[i], eid);
  for (let i = 0; i < edge.removeFrom.length; i++) {
    if (!isAdd) edge.removeFrom[i].toRemove.remove(eid);
    queryRemoveEntity(world, edge.removeFrom[i], eid);
  }
};
var isPrefabEntity = (ctx, eid) => {
  if (!ctx.prefabData) return false;
  return (ctx.entityMasks[ctx.prefabData.generationId][eid] & ctx.prefabData.bitflag) === ctx.prefabData.bitflag;
};
var hasPairTarget = (ctx, eid, relation, target) => {
  const targets = ctx.relationTargets[eid]?.get(relation);
  return targets !== void 0 && targets.has(target);
};
var addPairTarget = (ctx, eid, relation, target) => {
  if (!ctx.relationTargets[eid]) ctx.relationTargets[eid] = /* @__PURE__ */ new Map();
  const relMap = ctx.relationTargets[eid];
  let targets = relMap.get(relation);
  if (!targets) {
    targets = /* @__PURE__ */ new Set();
    relMap.set(relation, targets);
  }
  targets.add(target);
  if (typeof target === "number") {
    if (!ctx.reverseIndex[target]) ctx.reverseIndex[target] = [];
    ctx.reverseIndex[target].push({ subject: eid, relation });
    let targetSet = ctx.targetsByRelation.get(relation);
    if (!targetSet) {
      targetSet = /* @__PURE__ */ new Set();
      ctx.targetsByRelation.set(relation, targetSet);
    }
    targetSet.add(target);
  }
};
var removePairTarget = (ctx, eid, relation, target) => {
  const targets = ctx.relationTargets[eid]?.get(relation);
  if (!targets) return;
  targets.delete(target);
  if (targets.size === 0) ctx.relationTargets[eid].delete(relation);
  if (typeof target === "number") {
    const rev = ctx.reverseIndex[target];
    if (rev) {
      const revIdx = rev.findIndex((e) => e.subject === eid && e.relation === relation);
      if (revIdx >= 0) {
        rev[revIdx] = rev[rev.length - 1];
        rev.pop();
      }
    }
    const relSet = ctx.targetsByRelation.get(relation);
    if (relSet) {
      const rev2 = ctx.reverseIndex[target];
      if (!rev2 || !rev2.some((e) => e.relation === relation)) {
        relSet.delete(target);
        if (relSet.size === 0) ctx.targetsByRelation.delete(relation);
      }
    }
  }
};
var swapRemoveComponent = (ctx, eid, component) => {
  const comps = ctx.entityComponents[eid];
  if (!comps) return;
  const idx = comps.indexOf(component);
  if (idx >= 0) {
    comps[idx] = comps[comps.length - 1];
    comps.pop();
  }
};
var registerComponent = (world, component) => {
  if (!component) {
    throw new Error(`bitECS - Cannot register null or undefined component`);
  }
  const ctx = world[$internal];
  const isSpecificPair = component[$isPairComponent] && component[$pairTarget] !== Wildcard && !isWildcard(component[$relation]);
  const data = {
    id: ctx.componentCount++,
    generationId: isSpecificPair ? -1 : ctx.entityMasks.length - 1,
    bitflag: isSpecificPair ? 0 : ctx.bitflag,
    ref: component,
    queries: /* @__PURE__ */ new Set(),
    setObservable: createObservable(),
    getObservable: createObservable()
  };
  ctx.componentMap.set(component, data);
  if (component[$isPairComponent] && typeof component[$pairTarget] === "number") {
    const target = component[$pairTarget];
    let list = ctx.pairsByTarget.get(target);
    if (!list) {
      list = [];
      ctx.pairsByTarget.set(target, list);
    }
    list.push(component);
  }
  if (component === Prefab) ctx.prefabData = data;
  if (!isSpecificPair) {
    ctx.bitflag *= 2;
    if (ctx.bitflag >= 2 ** 31) {
      ctx.bitflag = 1;
      ctx.entityMasks.push([]);
    }
  }
  return data;
};
var registerComponents = (world, components) => {
  for (let i = 0; i < components.length; i++) registerComponent(world, components[i]);
};
var hasComponent = (world, eid, component) => {
  const ctx = world[$internal];
  if (component[$isPairComponent]) {
    const relation = component[$relation];
    const target = component[$pairTarget];
    if (target === Wildcard) {
      if (isWildcard(relation)) return false;
      const relData = ctx.componentMap.get(relation);
      if (!relData) return false;
      return (ctx.entityMasks[relData.generationId][eid] & relData.bitflag) === relData.bitflag;
    }
    if (isWildcard(relation)) {
      const forward = ctx.relationTargets[eid];
      if (forward) {
        for (const [, targets] of forward) {
          if (targets.has(target)) return true;
        }
      }
      return false;
    }
    return hasPairTarget(ctx, eid, relation, target);
  }
  const registeredComponent = ctx.componentMap.get(component);
  if (!registeredComponent) return false;
  const { generationId, bitflag } = registeredComponent;
  return (ctx.entityMasks[generationId][eid] & bitflag) === bitflag;
};
var getComponent = (world, eid, component) => {
  const ctx = world[$internal];
  const componentData = ctx.componentMap.get(component);
  if (!componentData) return void 0;
  if (!hasComponent(world, eid, component)) return void 0;
  return componentData.getObservable.notify(eid);
};
var set = (component, data) => ({
  component,
  data
});
var setComponent = (world, eid, component, data) => {
  const ctx = world[$internal];
  const componentData = ctx.componentMap.get(component);
  if (componentData) {
    const { generationId, bitflag } = componentData;
    if ((ctx.entityMasks[generationId][eid] & bitflag) === bitflag) {
      componentData.setObservable.notify(eid, data);
      return;
    }
  }
  addComponent(world, eid, data !== void 0 ? set(component, data) : component);
};
var recursivelyInherit = (ctx, world, baseEid, inheritedEid, visited = /* @__PURE__ */ new Set()) => {
  if (visited.has(inheritedEid)) return;
  visited.add(inheritedEid);
  addComponent(world, baseEid, IsA(inheritedEid));
  for (const component of getEntityComponents(world, inheritedEid)) {
    if (component === Prefab) continue;
    if (!hasComponent(world, baseEid, component)) {
      addComponent(world, baseEid, component);
      const componentData = ctx.componentMap.get(component);
      if (componentData) {
        const data = getComponent(world, inheritedEid, component);
        if (data !== void 0) {
          componentData.setObservable.notify(baseEid, data);
        } else {
          const ref = componentData.ref;
          if (ref && typeof ref === "object") {
            for (const key in ref) {
              const store = ref[key];
              if (ArrayBuffer.isView(store) || Array.isArray(store)) {
                store[baseEid] = store[inheritedEid];
              }
            }
          }
        }
      }
    }
  }
  for (const parentEid of getRelationTargets(world, inheritedEid, IsA)) {
    recursivelyInherit(ctx, world, baseEid, parentEid, visited);
  }
};
var updatePairQueries = (world, ctx, eid, relation, target, isAdd) => {
  for (const q of ctx.queries) {
    if (q.pairFilters.length === 0) continue;
    for (let i = 0; i < q.pairFilters.length; i++) {
      const filter = q.pairFilters[i];
      if ("target" in filter) {
        if (filter.relation === relation && filter.target === target) {
          if (isAdd) {
            if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid);
          } else {
            if (!queryCheckEntity(world, q, eid)) queryRemoveEntity(world, q, eid);
          }
        }
        continue;
      }
      if (typeof target !== "number") continue;
      if ("entity" in filter && filter.entity === eid) {
        if (isAdd) {
          queryAddEntity(q, target);
        } else {
          let stillTargeted = false;
          const rt = ctx.relationTargets[eid];
          if (rt) {
            for (const [r] of rt) {
              if (hasPairTarget(ctx, eid, r, target)) {
                stillTargeted = true;
                break;
              }
            }
          }
          if (!stillTargeted) queryRemoveEntity(world, q, target);
        }
      }
      if ("relation" in filter && filter.relation === relation) {
        if (isAdd) {
          queryAddEntity(q, target);
        } else {
          const relSet = ctx.targetsByRelation.get(relation);
          if (!relSet || !relSet.has(target)) queryRemoveEntity(world, q, target);
        }
      }
    }
  }
};
var ensureComponentData = (world, ctx, component) => ctx.componentMap.get(component) || registerComponent(world, component);
var addComponent = (world, eid, componentOrSet) => {
  if (!entityExists(world, eid)) {
    throw new Error(`Cannot add component - entity ${eid} does not exist in the world.`);
  }
  const ctx = world[$internal];
  const isSetter = typeof componentOrSet === "object" && componentOrSet !== null && "component" in componentOrSet;
  const component = isSetter ? componentOrSet.component : componentOrSet;
  const data = isSetter ? componentOrSet.data : void 0;
  const isPrefab = isPrefabEntity(ctx, eid);
  if (component[$isPairComponent]) {
    const relation = component[$relation];
    const target = component[$pairTarget];
    if (target === Wildcard || isWildcard(relation)) return false;
    if (hasPairTarget(ctx, eid, relation, target)) {
      if (data !== void 0) {
        const cd = ensureComponentData(world, ctx, component);
        cd.setObservable.notify(eid, data);
      }
      return false;
    }
    const relationData = relation[$relationData];
    if (relationData.exclusiveRelation === true) {
      const oldTarget = getRelationTargets(world, eid, relation)[0];
      if (oldTarget !== void 0 && oldTarget !== null && oldTarget !== target) {
        removeComponent(world, eid, relation(oldTarget));
      }
    }
    const isFirstTarget = !ctx.relationTargets[eid] || !ctx.relationTargets[eid].has(relation);
    addPairTarget(ctx, eid, relation, target);
    const pairData = ensureComponentData(world, ctx, component);
    if (isFirstTarget) {
      const relData = ensureComponentData(world, ctx, relation);
      const { generationId: relGenId, bitflag: relBit } = relData;
      if ((ctx.entityMasks[relGenId][eid] & relBit) !== relBit) {
        ctx.entityMasks[relGenId][eid] |= relBit;
        if (!isPrefab) applyTransition(world, ctx, eid, relData, true);
      }
    }
    ctx.entityComponents[eid].push(component);
    updatePairQueries(world, ctx, eid, relation, target, true);
    if (data !== void 0) pairData.setObservable.notify(eid, data);
    if (relation === IsA) {
      for (const inherited of getRelationTargets(world, eid, IsA)) {
        recursivelyInherit(ctx, world, eid, inherited);
      }
    }
    updateHierarchyDepth(world, relation, eid, typeof target === "number" ? target : void 0);
    return true;
  }
  const componentData = ensureComponentData(world, ctx, component);
  const { generationId, bitflag } = componentData;
  if ((ctx.entityMasks[generationId][eid] & bitflag) === bitflag) {
    componentData.setObservable.notify(eid, data);
    return false;
  }
  ctx.entityMasks[generationId][eid] |= bitflag;
  if (!isPrefab) {
    applyTransition(world, ctx, eid, componentData, true);
  }
  ctx.entityComponents[eid].push(component);
  if (data !== void 0) componentData.setObservable.notify(eid, data);
  return true;
};
function addComponents(world, eid, ...args) {
  if (!entityExists(world, eid)) {
    throw new Error(`Cannot add component - entity ${eid} does not exist in the world.`);
  }
  const ctx = world[$internal];
  const components = Array.isArray(args[0]) ? args[0] : args;
  const isPrefab = isPrefabEntity(ctx, eid);
  const queries = /* @__PURE__ */ new Set();
  for (let i = 0; i < components.length; i++) {
    const componentOrSet = components[i];
    const isSetter = typeof componentOrSet === "object" && componentOrSet !== null && "component" in componentOrSet;
    const component = isSetter ? componentOrSet.component : componentOrSet;
    const data = isSetter ? componentOrSet.data : void 0;
    if (component[$isPairComponent]) {
      addComponent(world, eid, componentOrSet);
      continue;
    }
    const componentData = ensureComponentData(world, ctx, component);
    const { generationId, bitflag } = componentData;
    if ((ctx.entityMasks[generationId][eid] & bitflag) === bitflag) {
      if (data !== void 0) componentData.setObservable.notify(eid, data);
      continue;
    }
    ctx.entityMasks[generationId][eid] |= bitflag;
    if (!isPrefab) {
      for (const q of componentData.queries) queries.add(q);
    }
    ctx.entityComponents[eid].push(component);
    if (data !== void 0) componentData.setObservable.notify(eid, data);
  }
  ctx.entityArchetypes[eid] = createArchetypeNode2();
  for (const q of queries) {
    if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid);
    else if (q.has(eid)) queryRemoveEntity(world, q, eid);
  }
}
var removeComponentInternal = (world, ctx, eid, component) => {
  if (component[$isPairComponent]) {
    const relation = component[$relation];
    const target = component[$pairTarget];
    if (target === Wildcard && !isWildcard(relation)) {
      const targets = getRelationTargets(world, eid, relation);
      for (let i = 0; i < targets.length; i++) {
        removeComponentInternal(world, ctx, eid, relation(targets[i]));
      }
      return;
    }
    if (isWildcard(relation)) return;
    if (!hasPairTarget(ctx, eid, relation, target)) return;
    removePairTarget(ctx, eid, relation, target);
    swapRemoveComponent(ctx, eid, component);
    const relTargets = ctx.relationTargets[eid];
    if (!relTargets || !relTargets.has(relation)) {
      const relData = ctx.componentMap.get(relation);
      if (relData) {
        const { generationId: relGenId, bitflag: relBit } = relData;
        if ((ctx.entityMasks[relGenId][eid] & relBit) === relBit) {
          ctx.entityMasks[relGenId][eid] &= ~relBit;
          applyTransition(world, ctx, eid, relData, false);
        }
      }
    }
    updatePairQueries(world, ctx, eid, relation, target, false);
    invalidateHierarchyDepth(world, relation, eid);
    return;
  }
  const componentData = ctx.componentMap.get(component);
  if (!componentData) return;
  const { generationId, bitflag } = componentData;
  if ((ctx.entityMasks[generationId][eid] & bitflag) !== bitflag) return;
  ctx.entityMasks[generationId][eid] &= ~bitflag;
  applyTransition(world, ctx, eid, componentData, false);
  swapRemoveComponent(ctx, eid, component);
};
function removeComponent(world, eid, ...components) {
  const ctx = world[$internal];
  if (!entityExists(world, eid)) {
    throw new Error(`Cannot remove component - entity ${eid} does not exist in the world.`);
  }
  if (components.length <= 1) {
    for (let i = 0; i < components.length; i++) {
      removeComponentInternal(world, ctx, eid, components[i]);
    }
    return;
  }
  const queries = /* @__PURE__ */ new Set();
  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    if (component[$isPairComponent]) {
      removeComponentInternal(world, ctx, eid, component);
      continue;
    }
    const componentData = ctx.componentMap.get(component);
    if (!componentData) continue;
    const { generationId, bitflag } = componentData;
    if ((ctx.entityMasks[generationId][eid] & bitflag) !== bitflag) continue;
    ctx.entityMasks[generationId][eid] &= ~bitflag;
    for (const q of componentData.queries) queries.add(q);
    swapRemoveComponent(ctx, eid, component);
  }
  ctx.entityArchetypes[eid] = createArchetypeNode2();
  for (const q of queries) {
    if (!queryCheckEntity(world, q, eid) && q.has(eid)) queryRemoveEntity(world, q, eid);
  }
}
var removeComponents = removeComponent;

// src/core/Entity.ts
var Prefab = {};
var addPrefab = (world) => {
  const eid = addEntity(world);
  addComponent(world, eid, Prefab);
  return eid;
};
function addEntity(world, ...components) {
  const ctx = world[$internal];
  const eid = addEntityId(ctx.entityIndex);
  for (const q of ctx.notQueries) {
    if (queryCheckEntity(world, q, eid)) queryAddEntity(q, eid);
  }
  ctx.entityComponents[eid] = [];
  ctx.entityArchetypes[eid] = ctx.rootArchetype;
  if (components.length > 0) {
    addComponents(world, eid, components);
  }
  return eid;
}
var removeEntity = (world, eid) => {
  const ctx = world[$internal];
  if (!isEntityIdAlive(ctx.entityIndex, eid)) return;
  const removalQueue = [eid];
  let queueIdx = 0;
  const processedEntities = /* @__PURE__ */ new Set();
  while (queueIdx < removalQueue.length) {
    const currentEid = removalQueue[queueIdx++];
    if (processedEntities.has(currentEid)) continue;
    processedEntities.add(currentEid);
    const reverseEntries = ctx.reverseIndex[currentEid];
    if (reverseEntries && reverseEntries.length > 0) {
      const deferredOps = [];
      const entries = reverseEntries.slice();
      for (let i = 0; i < entries.length; i++) {
        const { subject, relation } = entries[i];
        if (!isEntityIdAlive(ctx.entityIndex, subject)) continue;
        const relationData = relation[$relationData];
        const pairComponent = relation(currentEid);
        deferredOps.push(() => removeComponent(world, subject, pairComponent));
        if (relationData.autoRemoveSubject) removalQueue.push(subject);
        if (relationData.onTargetRemoved) {
          deferredOps.push(() => relationData.onTargetRemoved(world, subject, currentEid));
        }
      }
      for (let i = 0; i < deferredOps.length; i++) deferredOps[i]();
    }
    const components = ctx.entityComponents[currentEid];
    if (components) {
      const visited = /* @__PURE__ */ new Set();
      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        const compData = ctx.componentMap.get(comp);
        if (compData) {
          for (const q of compData.queries) {
            if (!visited.has(q)) {
              visited.add(q);
              queryRemoveEntity(world, q, currentEid);
            }
          }
        }
        if (comp[$isPairComponent]) {
          const relData = ctx.componentMap.get(comp[$relation]);
          if (relData) {
            for (const q of relData.queries) {
              if (!visited.has(q)) {
                visited.add(q);
                queryRemoveEntity(world, q, currentEid);
              }
            }
          }
        }
      }
      for (const q of ctx.queries) {
        if (q.pairFilters.length > 0 && !visited.has(q)) {
          queryRemoveEntity(world, q, currentEid);
        }
      }
    }
    for (const q of ctx.notQueries) {
      queryRemoveEntity(world, q, currentEid);
    }
    removeEntityId(ctx.entityIndex, currentEid);
    ctx.entityComponents[currentEid] = null;
    ctx.entityArchetypes[currentEid] = null;
    ctx.relationTargets[currentEid] = null;
    ctx.reverseIndex[currentEid] = null;
    for (let i = 0; i < ctx.entityMasks.length; i++) {
      ctx.entityMasks[i][currentEid] = 0;
    }
    const deadPairs = ctx.pairsByTarget.get(currentEid);
    if (deadPairs) {
      ctx.pairsByTarget.delete(currentEid);
      for (let i = 0; i < deadPairs.length; i++) {
        const pairData = ctx.componentMap.get(deadPairs[i]);
        if (pairData && pairData.queries.size === 0 && pairData.setObservable.count() === 0 && pairData.getObservable.count() === 0) {
          ctx.componentMap.delete(deadPairs[i]);
        }
      }
    }
  }
};
var getEntityComponents = (world, eid) => {
  const ctx = world[$internal];
  if (eid === void 0) throw new Error(`getEntityComponents: entity id is undefined.`);
  if (!isEntityIdAlive(ctx.entityIndex, eid))
    throw new Error(`getEntityComponents: entity ${eid} does not exist in the world.`);
  const components = ctx.entityComponents[eid];
  return components ? components.slice() : [];
};
var entityExists = (world, eid) => isEntityIdAlive(world[$internal].entityIndex, eid);

// src/core/utils/pipe.ts
var pipe = (...functions) => {
  return (...args) => functions.reduce((result, fn) => [fn(...result)], args)[0];
};

// src/core/utils/soa.ts
var soa = (spec) => spec;
function aos(spec) {
  const base = [];
  return spec ? Object.assign(base, spec) : base;
}
//# sourceMappingURL=index.cjs.map
