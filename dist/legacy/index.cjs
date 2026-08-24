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

// src/legacy/index.ts
var legacy_exports = {};
__export(legacy_exports, {
  $modifier: () => $modifier,
  Changed: () => Changed,
  DESERIALIZE_MODE: () => DESERIALIZE_MODE,
  Not: () => Not,
  Or: () => Or,
  Types: () => Types,
  addComponent: () => addComponent2,
  defineComponent: () => defineComponent,
  defineDeserializer: () => defineDeserializer,
  defineQuery: () => defineQuery,
  defineSerializer: () => defineSerializer,
  enterQuery: () => enterQuery,
  exitQuery: () => exitQuery,
  hasComponent: () => hasComponent,
  removeComponent: () => removeComponent2
});
module.exports = __toCommonJS(legacy_exports);
var import_bitecs2 = require("bitecs");

// src/serialization/ObserverSerializer.ts
var import_bitecs = require("bitecs");

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
var isFloatType = (array) => {
  const arrayType = getTypeForArray(array);
  return arrayType === $f32 || arrayType === $f64;
};
var getEpsilonForType = (array, epsilon) => isFloatType(array) ? epsilon : 0;
var getShadow = (shadowMap, array) => {
  let shadow = shadowMap.get(array);
  if (!shadow) {
    if (ArrayBuffer.isView(array)) {
      shadow = new array.constructor(array.length);
    } else if (isArrayType(array)) {
      shadow = new Array(array.length);
    } else {
      shadow = new Array(array.length).fill(0);
    }
    shadowMap.set(array, shadow);
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
var hasChanged = (shadowMap, array, index, epsilon = 1e-4) => {
  const shadow = getShadow(shadowMap, array);
  const currentValue = array[index];
  const actualEpsilon = getEpsilonForType(array, epsilon);
  if (isArrayType(array)) {
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

// src/serialization/ObserverSerializer.ts
var createObserverSerializer = (world, networkedTag, components, options = {}) => {
  const backingBuffer = options.buffer ?? createDefaultSerializationBuffer();
  const dataView = new DataView(backingBuffer);
  let offset = 0;
  const queue = [];
  const relationTargets = /* @__PURE__ */ new Map();
  (0, import_bitecs.observe)(world, (0, import_bitecs.onAdd)(networkedTag), (eid) => {
    queue.push([eid, 0 /* AddEntity */, -1]);
  });
  (0, import_bitecs.observe)(world, (0, import_bitecs.onRemove)(networkedTag), (eid) => {
    queue.push([eid, 1 /* RemoveEntity */, -1]);
    relationTargets.delete(eid);
  });
  components.forEach((component, i) => {
    if ((0, import_bitecs.isRelation)(component)) {
      (0, import_bitecs.observe)(world, (0, import_bitecs.onAdd)(networkedTag, component(import_bitecs.Wildcard)), (eid) => {
        const targets = (0, import_bitecs.getRelationTargets)(world, eid, component);
        for (const target of targets) {
          if (!relationTargets.has(eid)) {
            relationTargets.set(eid, /* @__PURE__ */ new Map());
          }
          relationTargets.get(eid).set(i, target);
          const relationData = component(target);
          queue.push([eid, 4 /* AddRelation */, i, target, relationData]);
        }
      });
      (0, import_bitecs.observe)(world, (0, import_bitecs.onRemove)(networkedTag, component(import_bitecs.Wildcard)), (eid) => {
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
      (0, import_bitecs.observe)(world, (0, import_bitecs.onAdd)(networkedTag, component), (eid) => {
        queue.push([eid, 2 /* AddComponent */, i]);
      });
      (0, import_bitecs.observe)(world, (0, import_bitecs.onRemove)(networkedTag, component), (eid) => {
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
          worldEntityId = (0, import_bitecs.addEntity)(world);
          currentMapping.set(packetEntityId, worldEntityId);
          (0, import_bitecs.addComponent)(world, worldEntityId, networkedTag);
        } else {
          console.warn(`Attempted to deserialize addEntity with ID ${packetEntityId}, but it has already been deserialzied and exists in the mapping.`);
        }
      } else if (worldEntityId !== void 0 && (0, import_bitecs.entityExists)(world, worldEntityId)) {
        if (operationType === 1 /* RemoveEntity */) {
          (0, import_bitecs.removeEntity)(world, worldEntityId);
          currentMapping.delete(packetEntityId);
        } else if (operationType === 2 /* AddComponent */) {
          (0, import_bitecs.addComponent)(world, worldEntityId, component);
        } else if (operationType === 3 /* RemoveComponent */) {
          (0, import_bitecs.removeComponent)(world, worldEntityId, component);
        } else if (operationType === 4 /* AddRelation */) {
          const worldTargetId = currentMapping.get(targetId);
          if (worldTargetId !== void 0) {
            const relationComponent = component(worldTargetId);
            (0, import_bitecs.addComponent)(world, worldEntityId, relationComponent);
            offset = deserializeRelationData(relationComponent, worldEntityId, dataView, offset, currentMapping);
          }
        } else if (operationType === 5 /* RemoveRelation */) {
          const worldTargetId = currentMapping.get(targetId);
          if (worldTargetId !== void 0) {
            (0, import_bitecs.removeComponent)(world, worldEntityId, component(worldTargetId));
          }
        }
      }
    }
    return currentMapping;
  };
};

// src/legacy/serialization.ts
function defineSerializer(components, maxBytes) {
  const initSet = /* @__PURE__ */ new WeakSet();
  let serializeObservations, serializeData;
  return (world, ents) => {
    if (!initSet.has(world)) {
      initSet.add(world);
      serializeObservations = createObserverSerializer(world, components[0], components);
      serializeData = createSoASerializer(components);
    }
    const observerData = serializeObservations();
    const soaData = serializeData(ents);
    const combinedData = new ArrayBuffer(observerData.byteLength + soaData.byteLength);
    const combinedView = new Uint8Array(combinedData);
    combinedView.set(new Uint8Array(observerData), 0);
    combinedView.set(new Uint8Array(soaData), observerData.byteLength);
    return combinedData;
  };
}
function defineDeserializer(components) {
  const initSet = /* @__PURE__ */ new WeakSet();
  let deserializeObservations, deserializeData;
  return (world, packet, mode) => {
    if (!initSet.has(world)) {
      initSet.add(world);
      deserializeObservations = createObserverDeserializer(world, components[0], components);
      deserializeData = createSoADeserializer(components);
    }
    const observerDataLength = deserializeObservations(packet, mode);
    const soaData = packet.slice(observerDataLength);
    return deserializeData(soaData, mode);
  };
}
var DESERIALIZE_MODE = /* @__PURE__ */ ((DESERIALIZE_MODE2) => {
  DESERIALIZE_MODE2[DESERIALIZE_MODE2["REPLACE"] = 0] = "REPLACE";
  DESERIALIZE_MODE2[DESERIALIZE_MODE2["APPEND"] = 1] = "APPEND";
  DESERIALIZE_MODE2[DESERIALIZE_MODE2["MAP"] = 2] = "MAP";
  return DESERIALIZE_MODE2;
})(DESERIALIZE_MODE || {});

// src/legacy/index.ts
var $modifier = Symbol("$modifier");
function modifier(c, mod) {
  const inner = () => [c, mod];
  inner[$modifier] = true;
  return inner;
}
var Not = (c) => modifier(c, "not");
var Or = (c) => modifier(c, "or");
var Changed = (c) => modifier(c, "changed");
function defineQuery(components) {
  const queryFn = (world) => (0, import_bitecs2.query)(world, components);
  queryFn.components = components;
  return queryFn;
}
function enterQuery(queryFn) {
  let queue = [];
  const initSet = /* @__PURE__ */ new WeakSet();
  return (world) => {
    if (!initSet.has(world)) {
      (0, import_bitecs2.observe)(world, (0, import_bitecs2.onAdd)(...queryFn.components), (eid) => queue.push(eid));
      initSet.add(world);
    }
    const results = queue.slice();
    queue.length = 0;
    return results;
  };
}
function exitQuery(queryFn) {
  let queue = [];
  const initSet = /* @__PURE__ */ new WeakSet();
  return (world) => {
    if (!initSet.has(world)) {
      (0, import_bitecs2.observe)(world, (0, import_bitecs2.onRemove)(...queryFn.components), (eid) => queue.push(eid));
      initSet.add(world);
    }
    const results = queue.slice();
    queue.length = 0;
    return results;
  };
}
var addComponent2 = (world, component, eid) => (0, import_bitecs2.addComponent)(world, eid, component);
var hasComponent = (world, component, eid) => (0, import_bitecs2.hasComponent)(world, eid, component);
var removeComponent2 = (world, component, eid) => (0, import_bitecs2.removeComponent)(world, eid, component);
var Types = {
  i8: "i8",
  ui8: "ui8",
  ui8c: "ui8c",
  i16: "i16",
  ui16: "ui16",
  i32: "i32",
  ui32: "ui32",
  f32: "f32",
  f64: "f64",
  eid: "eid"
};
var arrayByTypeMap = {
  "i8": Int8Array,
  "ui8": Uint8Array,
  "ui8c": Uint8ClampedArray,
  "i16": Int16Array,
  "ui16": Uint16Array,
  "i32": Int32Array,
  "ui32": Uint32Array,
  "f32": Float32Array,
  "f64": Float64Array,
  "eid": Uint32Array
};
var defineComponent = (schema, max = 1e5) => {
  const createSoA = (schema2, max2) => {
    const component = {};
    for (const key in schema2) {
      if (Array.isArray(schema2[key])) {
        const [type, length] = schema2[key];
        component[key] = Array.from({ length }, () => new arrayByTypeMap[type](max2));
      } else if (typeof schema2[key] === "object") {
        component[key] = createSoA(schema2[key], max2);
      } else {
        const type = schema2[key];
        const TypeConstructor = arrayByTypeMap[type];
        if (TypeConstructor) {
          component[key] = new TypeConstructor(max2);
        } else {
          throw new Error(`Unsupported type: ${schema2[key]}`);
        }
      }
    }
    return component;
  };
  return createSoA(schema, max);
};
//# sourceMappingURL=index.cjs.map
