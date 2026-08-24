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

// src/serialization/index.ts
var serialization_exports = {};
__export(serialization_exports, {
  $f32: () => $f32,
  $f64: () => $f64,
  $i16: () => $i16,
  $i32: () => $i32,
  $i8: () => $i8,
  $ref: () => $ref,
  $str: () => $str,
  $u16: () => $u16,
  $u32: () => $u32,
  $u8: () => $u8,
  array: () => array,
  createAoSDeserializer: () => createAoSDeserializer,
  createAoSSerializer: () => createAoSSerializer,
  createObserverDeserializer: () => createObserverDeserializer,
  createObserverSerializer: () => createObserverSerializer,
  createSnapshotDeserializer: () => createSnapshotDeserializer,
  createSnapshotSerializer: () => createSnapshotSerializer,
  createSoADeserializer: () => createSoADeserializer,
  createSoASerializer: () => createSoASerializer,
  f32: () => f32,
  f64: () => f64,
  i16: () => i16,
  i32: () => i32,
  i8: () => i8,
  ref: () => ref,
  str: () => str,
  u16: () => u16,
  u32: () => u32,
  u8: () => u8
});
module.exports = __toCommonJS(serialization_exports);

// src/serialization/SoASerializer.ts
var $u8 = Symbol.for("bitecs-u8");
var $i8 = Symbol.for("bitecs-i8");
var $u16 = Symbol.for("bitecs-u16");
var $i16 = Symbol.for("bitecs-i16");
var $u32 = Symbol.for("bitecs-u32");
var $i32 = Symbol.for("bitecs-i32");
var $f32 = Symbol.for("bitecs-f32");
var $f64 = Symbol.for("bitecs-f64");
var $ref = Symbol.for("bitecs-ref");
var $str = Symbol.for("bitecs-str");
var $arr = Symbol.for("bitecs-arr");
var typeTagForSerialization = (symbol) => (a = []) => Object.defineProperty(a, symbol, { value: true, enumerable: false, writable: false, configurable: false });
var u8 = (a = []) => typeTagForSerialization($u8)(a);
var i8 = (a = []) => typeTagForSerialization($i8)(a);
var u16 = (a = []) => typeTagForSerialization($u16)(a);
var i16 = (a = []) => typeTagForSerialization($i16)(a);
var u32 = (a = []) => typeTagForSerialization($u32)(a);
var i32 = (a = []) => typeTagForSerialization($i32)(a);
var f32 = (a = []) => typeTagForSerialization($f32)(a);
var f64 = (a = []) => typeTagForSerialization($f64)(a);
var ref = (a = []) => typeTagForSerialization($ref)(a);
var str = (a = []) => typeTagForSerialization($str)(a);
var functionToSymbolMap = /* @__PURE__ */ new Map([
  [u8, $u8],
  [i8, $i8],
  [u16, $u16],
  [i16, $i16],
  [u32, $u32],
  [i32, $i32],
  [f32, $f32],
  [f64, $f64],
  [ref, $ref],
  [str, $str]
]);
var typeSetters = {
  [$u8]: (view, offset, value) => {
    view.setUint8(offset, value);
    return 1;
  },
  [$i8]: (view, offset, value) => {
    view.setInt8(offset, value);
    return 1;
  },
  [$u16]: (view, offset, value) => {
    view.setUint16(offset, value);
    return 2;
  },
  [$i16]: (view, offset, value) => {
    view.setInt16(offset, value);
    return 2;
  },
  [$u32]: (view, offset, value) => {
    view.setUint32(offset, value);
    return 4;
  },
  [$i32]: (view, offset, value) => {
    view.setInt32(offset, value);
    return 4;
  },
  [$f32]: (view, offset, value) => {
    view.setFloat32(offset, value);
    return 4;
  },
  [$f64]: (view, offset, value) => {
    view.setFloat64(offset, value);
    return 8;
  },
  [$ref]: (view, offset, value) => {
    view.setUint32(offset, value);
    return 4;
  },
  [$str]: (view, offset, value) => {
    const bytes = textEncoder.encode(value);
    growBuffer(view.buffer, view.byteOffset + offset + 4 + bytes.length);
    view.setUint32(offset, bytes.length);
    new Uint8Array(view.buffer, view.byteOffset + offset + 4, bytes.length).set(bytes);
    return 4 + bytes.length;
  }
};
var typeGetters = {
  [$u8]: (view, offset) => ({ value: view.getUint8(offset), size: 1 }),
  [$i8]: (view, offset) => ({ value: view.getInt8(offset), size: 1 }),
  [$u16]: (view, offset) => ({ value: view.getUint16(offset), size: 2 }),
  [$i16]: (view, offset) => ({ value: view.getInt16(offset), size: 2 }),
  [$u32]: (view, offset) => ({ value: view.getUint32(offset), size: 4 }),
  [$i32]: (view, offset) => ({ value: view.getInt32(offset), size: 4 }),
  [$f32]: (view, offset) => ({ value: view.getFloat32(offset), size: 4 }),
  [$f64]: (view, offset) => ({ value: view.getFloat64(offset), size: 8 }),
  [$ref]: (view, offset) => ({ value: view.getUint32(offset), size: 4 }),
  [$str]: (view, offset) => {
    const { value: len, size: lenSize } = typeGetters[$u32](view, offset);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + lenSize, len);
    const dec = textDecoder;
    const strValue = dec.decode(bytes);
    return { value: strValue, size: lenSize + len };
  }
};
var typeSizes = {
  [$u8]: 1,
  [$i8]: 1,
  [$u16]: 2,
  [$i16]: 2,
  [$u32]: 4,
  [$i32]: 4,
  [$f32]: 4,
  [$f64]: 8,
  [$ref]: 4
};
var rawTypeGetters = {
  [$u8]: (view, offset) => view.getUint8(offset),
  [$i8]: (view, offset) => view.getInt8(offset),
  [$u16]: (view, offset) => view.getUint16(offset),
  [$i16]: (view, offset) => view.getInt16(offset),
  [$u32]: (view, offset) => view.getUint32(offset),
  [$i32]: (view, offset) => view.getInt32(offset),
  [$f32]: (view, offset) => view.getFloat32(offset),
  [$f64]: (view, offset) => view.getFloat64(offset),
  [$ref]: (view, offset) => view.getUint32(offset)
};
var createDefaultSerializationBuffer = () => {
  const buffer = new ArrayBuffer(64 * 1024, { maxByteLength: 100 * 1024 * 1024 });
  return buffer.resizable ? buffer : new ArrayBuffer(100 * 1024 * 1024);
};
var ROW_HEADROOM = 64 * 1024;
var growBuffer = (buffer, needed) => {
  if (needed <= buffer.byteLength || !buffer.resizable) return;
  buffer.resize(Math.min(buffer.maxByteLength, Math.max(buffer.byteLength * 2, needed + ROW_HEADROOM)));
};
function resolveTypeToSymbol(type) {
  if (typeof type === "symbol") {
    return type;
  }
  if (typeof type === "function") {
    const symbol = functionToSymbolMap.get(type);
    if (symbol) return symbol;
    throw new Error(`Unknown type function: ${type}`);
  }
  if (isArrayType(type)) {
    return resolveTypeToSymbol(type[$arr]);
  }
  return $f32;
}
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
function array(type = f64) {
  const arr = [];
  Object.defineProperty(arr, $arr, { value: type, enumerable: false, writable: false, configurable: false });
  return arr;
}
function isTypedArrayOrBranded(arr) {
  return arr && (ArrayBuffer.isView(arr) || Array.isArray(arr));
}
function getTypeForArray(arr) {
  if (isArrayType(arr)) {
    return resolveTypeToSymbol(arr[$arr]);
  }
  for (const symbol of [$u8, $i8, $u16, $i16, $u32, $i32, $f32, $f64, $str, $ref]) {
    if (symbol in arr) return symbol;
  }
  if (arr instanceof Int8Array) return $i8;
  if (arr instanceof Uint8Array) return $u8;
  if (arr instanceof Int16Array) return $i16;
  if (arr instanceof Uint16Array) return $u16;
  if (arr instanceof Int32Array) return $i32;
  if (arr instanceof Uint32Array) return $u32;
  if (arr instanceof Float32Array) return $f32;
  return $f64;
}
function isArrayType(value) {
  return Array.isArray(value) && $arr in value;
}
function getArrayElementType(arrayType) {
  return arrayType[$arr];
}
function serializeArrayValue(elementType, value, view, offset) {
  let bytesWritten = 0;
  growBuffer(view.buffer, view.byteOffset + offset + 5);
  const isArrayDefined = Array.isArray(value) ? 1 : 0;
  bytesWritten += typeSetters[$u8](view, offset, isArrayDefined);
  if (!isArrayDefined) {
    return bytesWritten;
  }
  bytesWritten += typeSetters[$u32](view, offset + bytesWritten, value.length);
  const nested = isArrayType(elementType);
  const innerType = nested ? getArrayElementType(elementType) : void 0;
  const symbol = nested ? void 0 : resolveTypeToSymbol(elementType);
  const setter = symbol ? typeSetters[symbol] : void 0;
  const elemSize = symbol ? typeSizes[symbol] : void 0;
  if (elemSize) growBuffer(view.buffer, view.byteOffset + offset + bytesWritten + value.length * elemSize);
  for (let i = 0; i < value.length; i++) {
    const element = value[i];
    if (nested) {
      bytesWritten += serializeArrayValue(innerType, element, view, offset + bytesWritten);
    } else {
      bytesWritten += setter(view, offset + bytesWritten, element);
    }
  }
  return bytesWritten;
}
function deserializeArrayValue(elementType, view, offset, entityIdMapping) {
  let bytesRead = 0;
  const isArrayDefined = view.getUint8(offset + bytesRead);
  bytesRead += 1;
  if (!isArrayDefined) {
    return { size: bytesRead };
  }
  const arrayLength = view.getUint32(offset + bytesRead);
  bytesRead += 4;
  const nested = isArrayType(elementType);
  const innerType = nested ? getArrayElementType(elementType) : void 0;
  const symbol = nested ? void 0 : resolveTypeToSymbol(elementType);
  const rawGetter = symbol ? rawTypeGetters[symbol] : void 0;
  const rawSize = symbol ? typeSizes[symbol] : void 0;
  const getter = symbol ? typeGetters[symbol] : void 0;
  const arr = new Array(arrayLength);
  for (let i = 0; i < arr.length; i++) {
    if (nested) {
      const { value, size } = deserializeArrayValue(innerType, view, offset + bytesRead, entityIdMapping);
      bytesRead += size;
      if (Array.isArray(value)) {
        arr[i] = value;
      }
    } else {
      let value, size;
      if (rawGetter) {
        value = rawGetter(view, offset + bytesRead);
        size = rawSize;
      } else {
        ({ value, size } = getter(view, offset + bytesRead));
      }
      bytesRead += size;
      if (symbol === $ref) {
        const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value;
        arr[i] = mapped;
      } else {
        arr[i] = value;
      }
    }
  }
  return { value: arr, size: bytesRead };
}
var isFloatType = (array2) => {
  const arrayType = getTypeForArray(array2);
  return arrayType === $f32 || arrayType === $f64;
};
var getEpsilonForType = (array2, epsilon) => isFloatType(array2) ? epsilon : 0;
var getShadow = (shadowMap, array2) => {
  let shadow = shadowMap.get(array2);
  if (!shadow) {
    if (ArrayBuffer.isView(array2)) {
      shadow = new array2.constructor(array2.length);
    } else if (isArrayType(array2)) {
      shadow = new Array(array2.length);
    } else {
      shadow = new Array(array2.length).fill(0);
    }
    shadowMap.set(array2, shadow);
  }
  return shadow;
};
var arrayValuesDiffer = (a, b, epsilon) => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return typeof a === "number" && typeof b === "number" && epsilon > 0 ? Math.abs(a - b) > epsilon : a !== b;
  }
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (arrayValuesDiffer(a[i], b[i], epsilon)) return true;
  }
  return false;
};
var copyArrayValue = (a) => Array.isArray(a) ? a.map(copyArrayValue) : a;
var hasChanged = (shadowMap, array2, index, epsilon = 1e-4) => {
  const shadow = getShadow(shadowMap, array2);
  const currentValue = array2[index];
  const actualEpsilon = getEpsilonForType(array2, epsilon);
  if (isArrayType(array2)) {
    const changed2 = arrayValuesDiffer(shadow[index], currentValue, actualEpsilon);
    if (changed2) shadow[index] = copyArrayValue(currentValue);
    return changed2;
  }
  const changed = actualEpsilon > 0 ? Math.abs(shadow[index] - currentValue) > actualEpsilon : shadow[index] !== currentValue;
  shadow[index] = currentValue;
  return changed;
};
var createComponentSerializer = (component, diff = false, shadowMap, epsilon = 1e-4) => {
  if (isArrayType(component)) {
    const elementType = getArrayElementType(component);
    return (view, offset, index, componentId) => {
      let bytesWritten = 0;
      if (diff && shadowMap) {
        if (!hasChanged(shadowMap, component, index, epsilon)) return 0;
        bytesWritten += typeSetters[$u32](view, offset + bytesWritten, index);
        bytesWritten += typeSetters[$u32](view, offset + bytesWritten, componentId);
      } else {
        bytesWritten += typeSetters[$u32](view, offset + bytesWritten, index);
      }
      bytesWritten += serializeArrayValue(elementType, component[index], view, offset + bytesWritten);
      return bytesWritten;
    };
  }
  if (isTypedArrayOrBranded(component)) {
    const type = getTypeForArray(component);
    const setter = typeSetters[type];
    return (view, offset, index, componentId) => {
      if (diff && shadowMap) {
        if (!hasChanged(shadowMap, component, index, epsilon)) return 0;
        let bytesWritten = 0;
        bytesWritten += typeSetters[$u32](view, offset + bytesWritten, index);
        bytesWritten += typeSetters[$u32](view, offset + bytesWritten, componentId);
        bytesWritten += setter(view, offset + bytesWritten, component[index]);
        return bytesWritten;
      } else {
        let bytesWritten = 0;
        bytesWritten += typeSetters[$u32](view, offset + bytesWritten, index);
        bytesWritten += setter(view, offset + bytesWritten, component[index]);
        return bytesWritten;
      }
    };
  }
  const props = Object.keys(component);
  const types = props.map((prop) => {
    const arr = component[prop];
    if (!isTypedArrayOrBranded(arr)) {
      throw new Error(`Invalid array type for property ${prop}`);
    }
    return getTypeForArray(arr);
  });
  const setters = types.map((type) => typeSetters[type] || (() => {
    throw new Error(`Unsupported or unannotated type`);
  }));
  return (view, offset, index, componentId) => {
    if (diff && shadowMap) {
      let changeMask = 0;
      for (let i = 0; i < props.length; i++) {
        const componentProperty = component[props[i]];
        if (hasChanged(shadowMap, componentProperty, index, epsilon)) {
          changeMask |= 1 << i;
        }
      }
      if (changeMask === 0) return 0;
      let bytesWritten = 0;
      bytesWritten += typeSetters[$u32](view, offset + bytesWritten, index);
      bytesWritten += typeSetters[$u32](view, offset + bytesWritten, componentId);
      const maskSetter = props.length <= 8 ? typeSetters[$u8] : props.length <= 16 ? typeSetters[$u16] : typeSetters[$u32];
      bytesWritten += maskSetter(view, offset + bytesWritten, changeMask);
      for (let i = 0; i < props.length; i++) {
        if (changeMask & 1 << i) {
          const componentProperty = component[props[i]];
          if (isArrayType(componentProperty)) {
            bytesWritten += serializeArrayValue(getArrayElementType(componentProperty), componentProperty[index], view, offset + bytesWritten);
          } else {
            bytesWritten += setters[i](view, offset + bytesWritten, componentProperty[index]);
          }
        }
      }
      return bytesWritten;
    } else {
      let bytesWritten = 0;
      bytesWritten += typeSetters[$u32](view, offset + bytesWritten, index);
      for (let i = 0; i < props.length; i++) {
        const componentProperty = component[props[i]];
        if (isArrayType(componentProperty)) {
          bytesWritten += serializeArrayValue(getArrayElementType(componentProperty), componentProperty[index], view, offset + bytesWritten);
        } else {
          bytesWritten += setters[i](view, offset + bytesWritten, componentProperty[index]);
        }
      }
      return bytesWritten;
    }
  };
};
var createComponentDeserializer = (component, diff = false) => {
  if (isArrayType(component)) {
    const elementType = getArrayElementType(component);
    return (view, offset, entityIdMapping) => {
      let bytesRead = 0;
      const originalIndex = view.getUint32(offset);
      bytesRead += 4;
      const index = entityIdMapping ? entityIdMapping.get(originalIndex) ?? originalIndex : originalIndex;
      if (diff) {
        bytesRead += 4;
      }
      const { value, size } = deserializeArrayValue(elementType, view, offset + bytesRead, entityIdMapping);
      if (Array.isArray(value)) {
        ;
        component[index] = value;
      }
      return bytesRead + size;
    };
  }
  if (isTypedArrayOrBranded(component)) {
    const type = getTypeForArray(component);
    const getter = typeGetters[type];
    const rawGetter = rawTypeGetters[type];
    const rawSize = typeSizes[type];
    return (view, offset, entityIdMapping) => {
      let bytesRead = 0;
      const originalIndex = view.getUint32(offset);
      bytesRead += 4;
      const index = entityIdMapping ? entityIdMapping.get(originalIndex) ?? originalIndex : originalIndex;
      if (diff) {
        bytesRead += 4;
      }
      let value, size;
      if (rawGetter) {
        value = rawGetter(view, offset + bytesRead);
        size = rawSize;
      } else {
        ({ value, size } = getter(view, offset + bytesRead));
      }
      if (type === $ref) {
        const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value;
        component[index] = mapped;
      } else {
        ;
        component[index] = value;
      }
      return bytesRead + size;
    };
  }
  const props = Object.keys(component);
  const types = props.map((prop) => {
    const arr = component[prop];
    if (!isTypedArrayOrBranded(arr)) {
      throw new Error(`Invalid array type for property ${prop}`);
    }
    return getTypeForArray(arr);
  });
  const propReaders = props.map((prop, i) => {
    const type = types[i];
    const rawGetter = rawTypeGetters[type];
    const rawSize = typeSizes[type];
    const getter = typeGetters[type] || (() => {
      throw new Error(`Unsupported or unannotated type`);
    });
    return (view, offset, index, entityIdMapping) => {
      const componentProperty = component[prop];
      if (isArrayType(componentProperty)) {
        const { value: value2, size: size2 } = deserializeArrayValue(getArrayElementType(componentProperty), view, offset, entityIdMapping);
        if (Array.isArray(value2)) {
          componentProperty[index] = value2;
        }
        return size2;
      }
      if (rawGetter) {
        const value2 = rawGetter(view, offset);
        componentProperty[index] = type === $ref ? entityIdMapping ? entityIdMapping.get(value2) ?? value2 : value2 : value2;
        return rawSize;
      }
      const { value, size } = getter(view, offset);
      componentProperty[index] = value;
      return size;
    };
  });
  const maskSize = props.length <= 8 ? 1 : props.length <= 16 ? 2 : 4;
  return (view, offset, entityIdMapping) => {
    let bytesRead = 0;
    const originalIndex = view.getUint32(offset + bytesRead);
    bytesRead += 4;
    const index = entityIdMapping ? entityIdMapping.get(originalIndex) ?? originalIndex : originalIndex;
    if (diff) {
      bytesRead += 4;
      const changeMask = maskSize === 1 ? view.getUint8(offset + bytesRead) : maskSize === 2 ? view.getUint16(offset + bytesRead) : view.getUint32(offset + bytesRead);
      bytesRead += maskSize;
      for (let i = 0; i < propReaders.length; i++) {
        if (changeMask & 1 << i) {
          bytesRead += propReaders[i](view, offset + bytesRead, index, entityIdMapping);
        }
      }
    } else {
      for (let i = 0; i < propReaders.length; i++) {
        bytesRead += propReaders[i](view, offset + bytesRead, index, entityIdMapping);
      }
    }
    return bytesRead;
  };
};
var createSoASerializer = (components, options = {}) => {
  const {
    diff = false,
    buffer = createDefaultSerializationBuffer(),
    epsilon = 1e-4
  } = options;
  const view = new DataView(buffer);
  const shadowMap = diff ? /* @__PURE__ */ new Map() : void 0;
  const componentSerializers = components.map((component) => createComponentSerializer(component, diff, shadowMap, epsilon));
  return (indices) => {
    let offset = 0;
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      for (let j = 0; j < componentSerializers.length; j++) {
        growBuffer(buffer, offset + ROW_HEADROOM);
        offset += componentSerializers[j](view, offset, index, j);
      }
    }
    return buffer.slice(0, offset);
  };
};
var createSoADeserializer = (components, options = {}) => {
  const { diff = false } = options;
  const componentDeserializers = components.map((component) => createComponentDeserializer(component, diff));
  return (packet, entityIdMapping) => {
    const view = new DataView(packet);
    let offset = 0;
    while (offset < packet.byteLength) {
      if (diff) {
        const componentId = view.getUint32(offset + 4);
        offset += componentDeserializers[componentId](view, offset, entityIdMapping);
      } else {
        for (let i = 0; i < componentDeserializers.length; i++) {
          offset += componentDeserializers[i](view, offset, entityIdMapping);
        }
      }
    }
  };
};

// src/serialization/AoSSerializer.ts
var getShadowComponent = (shadowMap, component) => {
  let shadow = shadowMap.get(component);
  if (!shadow) {
    shadow = [];
    shadowMap.set(component, shadow);
  }
  return shadow;
};
var hasComponentChanged = (shadowMap, component, entityId, epsilon) => {
  const shadow = getShadowComponent(shadowMap, component);
  const currentValue = component[entityId];
  const shadowValue = shadow[entityId];
  if (currentValue === void 0) return false;
  if (shadowValue === void 0) return true;
  if (Array.isArray(currentValue)) {
    return arrayValuesDiffer(shadowValue, currentValue, getEpsilonForType(component, epsilon));
  }
  if (typeof currentValue === "object" && currentValue !== null) {
    const componentDef = component;
    for (const prop in currentValue) {
      if (componentDef[prop]) {
        const propEpsilon = getEpsilonForType(componentDef[prop], epsilon);
        const changed = propEpsilon > 0 ? Math.abs(shadowValue[prop] - currentValue[prop]) > propEpsilon : shadowValue[prop] !== currentValue[prop];
        if (changed) return true;
      }
    }
    return false;
  } else {
    const valueEpsilon = getEpsilonForType(component, epsilon);
    return valueEpsilon > 0 ? Math.abs(shadowValue - currentValue) > valueEpsilon : shadowValue !== currentValue;
  }
};
var updateShadow = (shadowMap, component, entityId) => {
  const shadow = getShadowComponent(shadowMap, component);
  const currentValue = component[entityId];
  if (Array.isArray(currentValue)) {
    shadow[entityId] = copyArrayValue(currentValue);
  } else if (typeof currentValue === "object" && currentValue !== null) {
    shadow[entityId] = { ...currentValue };
  } else {
    shadow[entityId] = currentValue;
  }
};
var createAoSComponentSerializer = (component, diff, shadowMap, epsilon = 1e-4) => {
  const isObjectComponent = typeof component === "object" && !isArrayType(component) && Object.keys(component).some((key) => isNaN(parseInt(key)) && typeof component[key] === "object");
  if (isObjectComponent) {
    const props = Object.keys(component).filter((key) => isNaN(parseInt(key)));
    const types = props.map((prop) => getTypeForArray(component[prop]));
    const setters = types.map((type) => typeSetters[type]);
    return (view, offset, entityId) => {
      const value = component[entityId];
      if (value === void 0) return 0;
      if (diff && shadowMap) {
        if (!hasComponentChanged(shadowMap, component, entityId, epsilon)) {
          return 0;
        }
        updateShadow(shadowMap, component, entityId);
      }
      let bytesWritten = 0;
      for (let i = 0; i < props.length; i++) {
        const prop = component[props[i]];
        const propValue = value[props[i]];
        if (isArrayType(prop)) {
          bytesWritten += serializeArrayValue(getArrayElementType(prop), propValue, view, offset + bytesWritten);
        } else {
          bytesWritten += setters[i](view, offset + bytesWritten, propValue);
        }
      }
      return bytesWritten;
    };
  } else if (isArrayType(component)) {
    const elementType = getArrayElementType(component);
    return (view, offset, entityId) => {
      if (diff && shadowMap) {
        if (!hasComponentChanged(shadowMap, component, entityId, epsilon)) {
          return 0;
        }
        updateShadow(shadowMap, component, entityId);
      }
      return serializeArrayValue(elementType, component[entityId], view, offset);
    };
  } else {
    const type = getTypeForArray(component);
    const setter = typeSetters[type];
    return (view, offset, entityId) => {
      const value = component[entityId];
      if (value === void 0) return 0;
      if (diff && shadowMap) {
        if (!hasComponentChanged(shadowMap, component, entityId, epsilon)) {
          return 0;
        }
        updateShadow(shadowMap, component, entityId);
      }
      return setter(view, offset, value);
    };
  }
};
var createAoSComponentDeserializer = (component) => {
  const isObjectComponent = typeof component === "object" && !isArrayType(component) && Object.keys(component).some((key) => isNaN(parseInt(key)) && typeof component[key] === "object");
  if (isObjectComponent) {
    const props = Object.keys(component).filter((key) => isNaN(parseInt(key)));
    const types = props.map((prop) => getTypeForArray(component[prop]));
    const getters = types.map((type) => typeGetters[type]);
    const raws = types.map((type) => rawTypeGetters[type]);
    const sizes = types.map((type) => typeSizes[type]);
    return (view, offset, entityId, entityIdMapping) => {
      let bytesRead = 0;
      const value = {};
      for (let i = 0; i < props.length; i++) {
        const prop = component[props[i]];
        if (isArrayType(prop)) {
          const { value: propValue, size } = deserializeArrayValue(getArrayElementType(prop), view, offset + bytesRead, entityIdMapping);
          if (Array.isArray(propValue)) {
            value[props[i]] = propValue;
          }
          bytesRead += size;
        } else {
          const raw = raws[i];
          let propValue, size;
          if (raw) {
            propValue = raw(view, offset + bytesRead);
            size = sizes[i];
          } else {
            ({ value: propValue, size } = getters[i](view, offset + bytesRead));
          }
          if (types[i] === $ref) {
            const mapped = entityIdMapping ? entityIdMapping.get(propValue) ?? propValue : propValue;
            value[props[i]] = mapped;
          } else {
            value[props[i]] = propValue;
          }
          bytesRead += size;
        }
      }
      component[entityId] = value;
      return bytesRead;
    };
  } else if (isArrayType(component)) {
    const elementType = getArrayElementType(component);
    return (view, offset, entityId, entityIdMapping) => {
      const { value, size } = deserializeArrayValue(elementType, view, offset, entityIdMapping);
      if (Array.isArray(value)) {
        ;
        component[entityId] = value;
      }
      return size;
    };
  } else {
    const type = getTypeForArray(component);
    const getter = typeGetters[type];
    const rawGetter = rawTypeGetters[type];
    const rawSize = typeSizes[type];
    return (view, offset, entityId, entityIdMapping) => {
      let value, size;
      if (rawGetter) {
        value = rawGetter(view, offset);
        size = rawSize;
      } else {
        ({ value, size } = getter(view, offset));
      }
      if (type === $ref) {
        const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value;
        component[entityId] = mapped;
      } else {
        ;
        component[entityId] = value;
      }
      return size;
    };
  }
};
var createAoSSerializer = (components, options = {}) => {
  const {
    diff = false,
    buffer = createDefaultSerializationBuffer(),
    epsilon = 1e-4
  } = options;
  const view = new DataView(buffer);
  const shadowMap = diff ? /* @__PURE__ */ new Map() : void 0;
  const componentSerializers = components.map(
    (component) => createAoSComponentSerializer(component, diff, shadowMap, epsilon)
  );
  return (entityIds) => {
    let offset = 0;
    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i];
      growBuffer(buffer, offset + ROW_HEADROOM);
      if (diff) {
        let entityHasChanges = false;
        for (let j = 0; j < components.length; j++) {
          if (shadowMap && hasComponentChanged(shadowMap, components[j], entityId, epsilon)) {
            entityHasChanges = true;
            break;
          }
        }
        if (!entityHasChanges) continue;
        offset += typeSetters[$u32](view, offset, entityId);
        const maskOffset = offset;
        const maskSetter = components.length <= 8 ? typeSetters[$u8] : components.length <= 16 ? typeSetters[$u16] : typeSetters[$u32];
        offset += maskSetter === typeSetters[$u8] ? 1 : maskSetter === typeSetters[$u16] ? 2 : 4;
        let componentMask = 0;
        for (let j = 0; j < componentSerializers.length; j++) {
          const bytesWritten = componentSerializers[j](view, offset, entityId);
          if (bytesWritten > 0) {
            componentMask |= 1 << j;
            offset += bytesWritten;
          }
        }
        maskSetter(view, maskOffset, componentMask);
      } else {
        offset += typeSetters[$u32](view, offset, entityId);
        for (let j = 0; j < componentSerializers.length; j++) {
          offset += componentSerializers[j](view, offset, entityId);
        }
      }
    }
    return buffer.slice(0, offset);
  };
};
var createAoSDeserializer = (components, options = {}) => {
  const { diff = false } = options;
  const componentDeserializers = components.map((component) => createAoSComponentDeserializer(component));
  return (packet, entityIdMapping) => {
    const view = new DataView(packet);
    let offset = 0;
    while (offset < packet.byteLength) {
      const originalEntityId = view.getUint32(offset);
      offset += 4;
      const entityId = entityIdMapping ? entityIdMapping.get(originalEntityId) ?? originalEntityId : originalEntityId;
      if (diff) {
        const maskSize = components.length <= 8 ? 1 : components.length <= 16 ? 2 : 4;
        const componentMask = maskSize === 1 ? view.getUint8(offset) : maskSize === 2 ? view.getUint16(offset) : view.getUint32(offset);
        offset += maskSize;
        for (let i = 0; i < components.length; i++) {
          if (componentMask & 1 << i) {
            offset += componentDeserializers[i](view, offset, entityId, entityIdMapping);
          }
        }
      } else {
        for (let i = 0; i < componentDeserializers.length; i++) {
          offset += componentDeserializers[i](view, offset, entityId, entityIdMapping);
        }
      }
    }
  };
};

// src/serialization/SnapshotSerializer.ts
var import_bitecs = require("bitecs");

// src/serialization/relationData.ts
function serializeRelationData(data, eid, dataView, offset) {
  if (!data) return offset;
  if (Array.isArray(data)) {
    const value = data[eid];
    if (value !== void 0) {
      growBuffer(dataView.buffer, dataView.byteOffset + offset + 8);
      if ($ref in data) {
        dataView.setUint32(offset, value);
        return offset + 4;
      } else {
        dataView.setFloat64(offset, value);
        return offset + 8;
      }
    }
    return offset;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data).sort();
    growBuffer(dataView.buffer, dataView.byteOffset + offset + keys.length * 8);
    for (const key of keys) {
      const arr = data[key];
      const value = arr[eid];
      if (value !== void 0) {
        if (arr instanceof Int8Array || $i8 in arr) {
          dataView.setInt8(offset, value);
          offset += 1;
        } else if (arr instanceof Uint8Array || $u8 in arr) {
          dataView.setUint8(offset, value);
          offset += 1;
        } else if (arr instanceof Int16Array || $i16 in arr) {
          dataView.setInt16(offset, value);
          offset += 2;
        } else if (arr instanceof Uint16Array || $u16 in arr) {
          dataView.setUint16(offset, value);
          offset += 2;
        } else if (arr instanceof Int32Array || $i32 in arr) {
          dataView.setInt32(offset, value);
          offset += 4;
        } else if (arr instanceof Uint32Array || $u32 in arr || $ref in arr) {
          dataView.setUint32(offset, value);
          offset += 4;
        } else if (arr instanceof Float32Array || $f32 in arr) {
          dataView.setFloat32(offset, value);
          offset += 4;
        } else {
          dataView.setFloat64(offset, value);
          offset += 8;
        }
      }
    }
  }
  return offset;
}
function deserializeRelationData(data, eid, dataView, offset, entityIdMapping) {
  if (!data) return offset;
  if (Array.isArray(data)) {
    if ($ref in data) {
      const value = dataView.getUint32(offset);
      const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value;
      data[eid] = mapped;
      return offset + 4;
    }
    data[eid] = dataView.getFloat64(offset);
    return offset + 8;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data).sort();
    for (const key of keys) {
      const arr = data[key];
      if (arr instanceof Int8Array || $i8 in arr) {
        arr[eid] = dataView.getInt8(offset);
        offset += 1;
      } else if (arr instanceof Uint8Array || $u8 in arr) {
        arr[eid] = dataView.getUint8(offset);
        offset += 1;
      } else if (arr instanceof Int16Array || $i16 in arr) {
        arr[eid] = dataView.getInt16(offset);
        offset += 2;
      } else if (arr instanceof Uint16Array || $u16 in arr) {
        arr[eid] = dataView.getUint16(offset);
        offset += 2;
      } else if (arr instanceof Int32Array || $i32 in arr) {
        arr[eid] = dataView.getInt32(offset);
        offset += 4;
      } else if (arr instanceof Uint32Array || $u32 in arr || $ref in arr) {
        const value = dataView.getUint32(offset);
        if ($ref in arr) {
          const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value;
          arr[eid] = mapped;
        } else {
          arr[eid] = value;
        }
        offset += 4;
      } else if (arr instanceof Float32Array || $f32 in arr) {
        arr[eid] = dataView.getFloat32(offset);
        offset += 4;
      } else {
        arr[eid] = dataView.getFloat64(offset);
        offset += 8;
      }
    }
  }
  return offset;
}

// src/serialization/SnapshotSerializer.ts
var createSnapshotSerializer = (world, components, buffer = createDefaultSerializationBuffer()) => {
  const dataView = new DataView(buffer);
  const soaCapacity = buffer.maxByteLength ?? buffer.byteLength;
  const soaSerializer = createSoASerializer(components, {
    buffer: new ArrayBuffer(Math.min(64 * 1024, soaCapacity), { maxByteLength: soaCapacity })
  });
  let offset = 0;
  const serializeEntityComponentRelationships = (entities) => {
    const entityCount = entities.length;
    dataView.setUint32(offset, entityCount);
    offset += 4;
    for (let i = 0; i < entityCount; i++) {
      const entityId = entities[i];
      let componentCount = 0;
      growBuffer(buffer, offset + ROW_HEADROOM);
      dataView.setUint32(offset, entityId);
      offset += 4;
      const componentCountOffset = offset;
      offset += 1;
      for (let j = 0; j < components.length; j++) {
        const component = components[j];
        if ((0, import_bitecs.isRelation)(component)) {
          const targets = (0, import_bitecs.getRelationTargets)(world, entityId, component);
          for (const target of targets) {
            growBuffer(buffer, offset + ROW_HEADROOM);
            dataView.setUint8(offset, j);
            offset += 1;
            dataView.setUint32(offset, target);
            offset += 4;
            const relationData = component(target);
            offset = serializeRelationData(relationData, entityId, dataView, offset);
            componentCount++;
          }
        } else if ((0, import_bitecs.hasComponent)(world, entityId, component)) {
          dataView.setUint8(offset, j);
          offset += 1;
          componentCount++;
        }
      }
      dataView.setUint8(componentCountOffset, componentCount);
    }
  };
  const serializeComponentData = (entities) => {
    const componentData = soaSerializer(entities);
    growBuffer(buffer, offset + componentData.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(componentData), offset);
    offset += componentData.byteLength;
  };
  return (selectedEntities) => {
    offset = 0;
    const entities = selectedEntities ?? (0, import_bitecs.getAllEntities)(world);
    serializeEntityComponentRelationships(entities);
    serializeComponentData(entities);
    return buffer.slice(0, offset);
  };
};
var createSnapshotDeserializer = (world, components, idMap) => {
  let entityIdMapping = idMap || /* @__PURE__ */ new Map();
  const soaDeserializer = createSoADeserializer(components);
  return (packet, idMapOverride) => {
    const currentMapping = idMapOverride || entityIdMapping;
    const dataView = new DataView(packet);
    let offset = 0;
    const entityCount = dataView.getUint32(offset);
    offset += 4;
    for (let entityIndex = 0; entityIndex < entityCount; entityIndex++) {
      const packetEntityId = dataView.getUint32(offset);
      offset += 4;
      let worldEntityId = currentMapping.get(packetEntityId);
      if (worldEntityId === void 0) {
        worldEntityId = (0, import_bitecs.addEntity)(world);
        currentMapping.set(packetEntityId, worldEntityId);
      }
      const componentCount = dataView.getUint8(offset);
      offset += 1;
      for (let i = 0; i < componentCount; i++) {
        const componentIndex = dataView.getUint8(offset);
        offset += 1;
        const component = components[componentIndex];
        if ((0, import_bitecs.isRelation)(component)) {
          const targetId = dataView.getUint32(offset);
          offset += 4;
          let worldTargetId = currentMapping.get(targetId);
          if (worldTargetId === void 0) {
            worldTargetId = (0, import_bitecs.addEntity)(world);
            currentMapping.set(targetId, worldTargetId);
          }
          const relationComponent = component(worldTargetId);
          (0, import_bitecs.addComponent)(world, worldEntityId, relationComponent);
          offset = deserializeRelationData(relationComponent, worldEntityId, dataView, offset, currentMapping);
        } else {
          (0, import_bitecs.addComponent)(world, worldEntityId, component);
        }
      }
    }
    soaDeserializer(packet.slice(offset), currentMapping);
    return currentMapping;
  };
};

// src/serialization/ObserverSerializer.ts
var import_bitecs2 = require("bitecs");
var createObserverSerializer = (world, networkedTag, components, options = {}) => {
  const backingBuffer = options.buffer ?? createDefaultSerializationBuffer();
  const dataView = new DataView(backingBuffer);
  let offset = 0;
  const queue = [];
  const relationTargets = /* @__PURE__ */ new Map();
  (0, import_bitecs2.observe)(world, (0, import_bitecs2.onAdd)(networkedTag), (eid) => {
    queue.push([eid, 0 /* AddEntity */, -1]);
  });
  (0, import_bitecs2.observe)(world, (0, import_bitecs2.onRemove)(networkedTag), (eid) => {
    queue.push([eid, 1 /* RemoveEntity */, -1]);
    relationTargets.delete(eid);
  });
  components.forEach((component, i) => {
    if ((0, import_bitecs2.isRelation)(component)) {
      (0, import_bitecs2.observe)(world, (0, import_bitecs2.onAdd)(networkedTag, component(import_bitecs2.Wildcard)), (eid) => {
        const targets = (0, import_bitecs2.getRelationTargets)(world, eid, component);
        for (const target of targets) {
          if (!relationTargets.has(eid)) {
            relationTargets.set(eid, /* @__PURE__ */ new Map());
          }
          relationTargets.get(eid).set(i, target);
          const relationData = component(target);
          queue.push([eid, 4 /* AddRelation */, i, target, relationData]);
        }
      });
      (0, import_bitecs2.observe)(world, (0, import_bitecs2.onRemove)(networkedTag, component(import_bitecs2.Wildcard)), (eid) => {
        const targetMap = relationTargets.get(eid);
        if (targetMap) {
          const target = targetMap.get(i);
          if (target !== void 0) {
            queue.push([eid, 5 /* RemoveRelation */, i, target]);
            targetMap.delete(i);
            if (targetMap.size === 0) {
              relationTargets.delete(eid);
            }
          }
        }
      });
    } else {
      (0, import_bitecs2.observe)(world, (0, import_bitecs2.onAdd)(networkedTag, component), (eid) => {
        queue.push([eid, 2 /* AddComponent */, i]);
      });
      (0, import_bitecs2.observe)(world, (0, import_bitecs2.onRemove)(networkedTag, component), (eid) => {
        queue.push([eid, 3 /* RemoveComponent */, i]);
      });
    }
  });
  return () => {
    offset = 0;
    for (let i = 0; i < queue.length; i++) {
      const [entityId, type, componentId, targetId, relationData] = queue[i];
      growBuffer(backingBuffer, offset + ROW_HEADROOM);
      dataView.setUint32(offset, entityId);
      offset += 4;
      dataView.setUint8(offset, type);
      offset += 1;
      if (type === 2 /* AddComponent */ || type === 3 /* RemoveComponent */ || type === 4 /* AddRelation */ || type === 5 /* RemoveRelation */) {
        dataView.setUint8(offset, componentId);
        offset += 1;
        if (type === 4 /* AddRelation */ || type === 5 /* RemoveRelation */) {
          dataView.setUint32(offset, targetId);
          offset += 4;
          if (type === 4 /* AddRelation */ && relationData) {
            offset = serializeRelationData(relationData, entityId, dataView, offset);
          }
        }
      }
    }
    queue.length = 0;
    return backingBuffer.slice(0, offset);
  };
};
var createObserverDeserializer = (world, networkedTag, components, options = {}) => {
  let entityIdMapping = options.idMap || /* @__PURE__ */ new Map();
  return (packet, idMap) => {
    const currentMapping = idMap || entityIdMapping;
    const dataView = new DataView(packet);
    let offset = 0;
    while (offset < packet.byteLength) {
      const packetEntityId = dataView.getUint32(offset);
      offset += 4;
      const operationType = dataView.getUint8(offset);
      offset += 1;
      let componentId = -1;
      let targetId = -1;
      if (operationType === 2 /* AddComponent */ || operationType === 3 /* RemoveComponent */ || operationType === 4 /* AddRelation */ || operationType === 5 /* RemoveRelation */) {
        componentId = dataView.getUint8(offset);
        offset += 1;
        if (operationType === 4 /* AddRelation */ || operationType === 5 /* RemoveRelation */) {
          targetId = dataView.getUint32(offset);
          offset += 4;
        }
      }
      const component = components[componentId];
      let worldEntityId = currentMapping.get(packetEntityId);
      if (operationType === 0 /* AddEntity */) {
        if (worldEntityId === void 0) {
          worldEntityId = (0, import_bitecs2.addEntity)(world);
          currentMapping.set(packetEntityId, worldEntityId);
          (0, import_bitecs2.addComponent)(world, worldEntityId, networkedTag);
        } else {
          console.warn(`Attempted to deserialize addEntity with ID ${packetEntityId}, but it has already been deserialzied and exists in the mapping.`);
        }
      } else if (worldEntityId !== void 0 && (0, import_bitecs2.entityExists)(world, worldEntityId)) {
        if (operationType === 1 /* RemoveEntity */) {
          (0, import_bitecs2.removeEntity)(world, worldEntityId);
          currentMapping.delete(packetEntityId);
        } else if (operationType === 2 /* AddComponent */) {
          (0, import_bitecs2.addComponent)(world, worldEntityId, component);
        } else if (operationType === 3 /* RemoveComponent */) {
          (0, import_bitecs2.removeComponent)(world, worldEntityId, component);
        } else if (operationType === 4 /* AddRelation */) {
          const worldTargetId = currentMapping.get(targetId);
          if (worldTargetId !== void 0) {
            const relationComponent = component(worldTargetId);
            (0, import_bitecs2.addComponent)(world, worldEntityId, relationComponent);
            offset = deserializeRelationData(relationComponent, worldEntityId, dataView, offset, currentMapping);
          }
        } else if (operationType === 5 /* RemoveRelation */) {
          const worldTargetId = currentMapping.get(targetId);
          if (worldTargetId !== void 0) {
            (0, import_bitecs2.removeComponent)(world, worldEntityId, component(worldTargetId));
          }
        }
      }
    }
    return currentMapping;
  };
};
//# sourceMappingURL=index.cjs.map
