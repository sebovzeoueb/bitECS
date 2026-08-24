import { 
    $u8, $i8, $u16, $i16, $u32, $i32, $f32, $f64, $arr, $ref,
    TypedArray, TypeSymbol, PrimitiveBrand, ArrayType,
    typeSetters, typeGetters, rawTypeGetters, typeSizes, getTypeForArray, isArrayType, getArrayElementType,
    serializeArrayValue, deserializeArrayValue,
    isFloatType, getEpsilonForType, arrayValuesDiffer, copyArrayValue,
    createDefaultSerializationBuffer, growBuffer, ROW_HEADROOM
} from './SoASerializer'

// Internal helper type for readability only
type AnyAoSComponent =
    | PrimitiveBrand
    | TypedArray
    | ArrayType<any>
    | Record<string, any>

/**
 * Gets or creates a shadow component array for change detection
 */
const getShadowComponent = (shadowMap: Map<any, any>, component: AnyAoSComponent) => {
    let shadow = shadowMap.get(component)
    if (!shadow) {
        shadow = []
        shadowMap.set(component, shadow)
    }
    return shadow
}

/**
 * Checks if a component value has changed for a specific entity
 */
const hasComponentChanged = (shadowMap: Map<any, any>, component: AnyAoSComponent, entityId: number, epsilon: number) => {
    const shadow = getShadowComponent(shadowMap, component)
    const currentValue = component[entityId]
    const shadowValue = shadow[entityId]
    
    if (currentValue === undefined) return false
    if (shadowValue === undefined) return true

    // Top-level array component: the value IS an array, so the object branch
    // below would walk its indices as if they were property names.
    if (Array.isArray(currentValue)) {
        return arrayValuesDiffer(shadowValue, currentValue, getEpsilonForType(component, epsilon))
    }

    if (typeof currentValue === 'object' && currentValue !== null) {
        // Object component - check each property
        const componentDef = component as any // Has property definitions
        for (const prop in currentValue) {
            if (componentDef[prop]) {
                const propEpsilon = getEpsilonForType(componentDef[prop], epsilon)
                const changed = propEpsilon > 0
                    ? Math.abs(shadowValue[prop] - currentValue[prop]) > propEpsilon
                    : shadowValue[prop] !== currentValue[prop]
                if (changed) return true
            }
        }
        return false
    } else {
        // Direct value component
        const valueEpsilon = getEpsilonForType(component, epsilon)
        return valueEpsilon > 0
            ? Math.abs(shadowValue - currentValue) > valueEpsilon
            : shadowValue !== currentValue
    }
}

/**
 * Updates shadow with current value
 */
const updateShadow = (shadowMap: Map<any, any>, component: AnyAoSComponent, entityId: number) => {
    const shadow = getShadowComponent(shadowMap, component)
    const currentValue = component[entityId]
    
    if (Array.isArray(currentValue)) {
        // Deep copy array (spreading it into an object would lose arrayness)
        shadow[entityId] = copyArrayValue(currentValue)
    } else if (typeof currentValue === 'object' && currentValue !== null) {
        // Deep copy object
        shadow[entityId] = { ...currentValue }
    } else {
        // Direct value
        shadow[entityId] = currentValue
    }
}

/**
 * Creates a serializer for a single AoS component
 */
const createAoSComponentSerializer = (component: AnyAoSComponent, diff: boolean, shadowMap?: Map<any, any>, epsilon = 0.0001) => {
    // Determine if this is an object component by checking if it has property definitions
    // !isArrayType guards the ordering: an ArrayType is a JS Array whose keys
    // are entity indices, so it must never be mistaken for a props object.
    const isObjectComponent = typeof component === 'object' && !isArrayType(component) &&
        Object.keys(component).some(key => isNaN(parseInt(key)) && typeof component[key] === 'object')
    
    if (isObjectComponent) {
        // Object component like { x: f32(), y: f32() }
        const props = Object.keys(component).filter(key => isNaN(parseInt(key)))
        const types = props.map(prop => getTypeForArray(component[prop]))
        const setters = types.map(type => typeSetters[type])
        
        return (view: DataView, offset: number, entityId: number) => {
            const value = component[entityId]
            if (value === undefined) return 0
            
            if (diff && shadowMap) {
                if (!hasComponentChanged(shadowMap, component, entityId, epsilon)) {
                    return 0
                }
                updateShadow(shadowMap, component, entityId)
            }
            
            let bytesWritten = 0
            
            // Serialize all properties
            for (let i = 0; i < props.length; i++) {
                const prop = component[props[i]]
                const propValue = value[props[i]]
                
                if (isArrayType(prop)) {
                    bytesWritten += serializeArrayValue(getArrayElementType(prop), propValue, view, offset + bytesWritten)
                } else {
                    bytesWritten += setters[i](view, offset + bytesWritten, propValue)
                }
            }
            
            return bytesWritten
        }
    } else if (isArrayType(component)) {
        // Component that IS an array type: `const Position = array(f32)`.
        // getTypeForArray would unwrap it to its ELEMENT type and the direct
        // branch would coerce each per-entity array through a scalar setter.
        // Unlike the direct branch this always writes (serializeArrayValue
        // emits a defined/undefined flag), so an unset slot cannot desync the
        // non-diff stream, which reads every component unconditionally.
        const elementType = getArrayElementType(component)

        return (view: DataView, offset: number, entityId: number) => {
            if (diff && shadowMap) {
                if (!hasComponentChanged(shadowMap, component, entityId, epsilon)) {
                    return 0
                }
                updateShadow(shadowMap, component, entityId)
            }
            return serializeArrayValue(elementType, (component as any)[entityId], view, offset)
        }
    } else {
        // Direct value component
        const type = getTypeForArray(component as PrimitiveBrand | TypedArray | ArrayType<any>)
        const setter = typeSetters[type]
        
        return (view: DataView, offset: number, entityId: number) => {
            const value = (component as any)[entityId]
            if (value === undefined) return 0
            
            if (diff && shadowMap) {
                if (!hasComponentChanged(shadowMap, component as any, entityId, epsilon)) {
                    return 0
                }
                updateShadow(shadowMap, component as any, entityId)
            }
            
            return setter(view, offset, value)
        }
    }
}

/**
 * Creates a deserializer for a single AoS component
 */
const createAoSComponentDeserializer = (component: AnyAoSComponent) => {
    // Determine if this is an object component
    // !isArrayType guards the ordering: an ArrayType is a JS Array whose keys
    // are entity indices, so it must never be mistaken for a props object.
    const isObjectComponent = typeof component === 'object' && !isArrayType(component) &&
        Object.keys(component).some(key => isNaN(parseInt(key)) && typeof component[key] === 'object')
    
    if (isObjectComponent) {
        // Object component
        const props = Object.keys(component).filter(key => isNaN(parseInt(key)))
        const types = props.map(prop => getTypeForArray(component[prop]))
        const getters = types.map(type => typeGetters[type])
        const raws = types.map(type => rawTypeGetters[type])
        const sizes = types.map(type => typeSizes[type])

        return (view: DataView, offset: number, entityId: number, entityIdMapping?: Map<number, number>) => {
            let bytesRead = 0
            const value: any = {}
            
            // Deserialize all properties
            for (let i = 0; i < props.length; i++) {
                const prop = component[props[i]]
                
                if (isArrayType(prop)) {
                    const { value: propValue, size } = deserializeArrayValue(getArrayElementType(prop), view, offset + bytesRead, entityIdMapping)
                    if (Array.isArray(propValue)) {
                        value[props[i]] = propValue
                    }
                    bytesRead += size
                } else {
                    const raw = raws[i]
                    let propValue: any, size: number
                    if (raw) {
                        propValue = raw(view, offset + bytesRead)
                        size = sizes[i]!
                    } else {
                        ({ value: propValue, size } = getters[i](view, offset + bytesRead))
                    }
                    if (types[i] === $ref) {
                        const mapped = entityIdMapping ? entityIdMapping.get(propValue) ?? propValue : propValue
                        value[props[i]] = mapped
                    } else {
                        value[props[i]] = propValue
                    }
                    bytesRead += size
                }
            }
            
            component[entityId] = value
            return bytesRead
        }
    } else if (isArrayType(component)) {
        // Mirror of the serializer's top-level ArrayType case.
        const elementType = getArrayElementType(component)

        return (view: DataView, offset: number, entityId: number, entityIdMapping?: Map<number, number>) => {
            const { value, size } = deserializeArrayValue(elementType, view, offset, entityIdMapping)
            if (Array.isArray(value)) {
                ;(component as any)[entityId] = value
            }
            return size
        }
    } else {
        // Direct value component
        const type = getTypeForArray(component as PrimitiveBrand | TypedArray | ArrayType<any>)
        const getter = typeGetters[type]
        const rawGetter = rawTypeGetters[type]
        const rawSize = typeSizes[type]

        return (view: DataView, offset: number, entityId: number, entityIdMapping?: Map<number, number>) => {
            let value: any, size: number
            if (rawGetter) {
                value = rawGetter(view, offset)
                size = rawSize!
            } else {
                ({ value, size } = getter(view, offset))
            }
            if (type === $ref) {
                const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value
                ;(component as any)[entityId] = mapped
            } else {
                ;(component as any)[entityId] = value
            }
            return size
        }
    }
}

/**
 * Options for AoS serializer
 */
export type AoSSerializerOptions = {
    diff?: boolean
    buffer?: ArrayBuffer
    epsilon?: number
}

/**
 * Creates a serializer function for Array of Structures (AoS) components.
 * @param {AoSComponentRef[]} components - The AoS components to serialize.
 * @param {AoSSerializerOptions} [options] - Serializer options.
 * @returns {Function} A function that serializes the AoS data.
 */
export const createAoSSerializer = (components: AnyAoSComponent[], options: AoSSerializerOptions = {}) => {
    const {
        diff = false,
        buffer = createDefaultSerializationBuffer(),
        epsilon = 0.0001
    } = options

    const view = new DataView(buffer)
    const shadowMap = diff ? new Map<any, any>() : undefined
    const componentSerializers = components.map(component => 
        createAoSComponentSerializer(component, diff, shadowMap, epsilon)
    )

    return (entityIds: number[] | readonly number[]): ArrayBuffer => {
        let offset = 0
        
        for (let i = 0; i < entityIds.length; i++) {
            const entityId = entityIds[i]
            growBuffer(buffer, offset + ROW_HEADROOM)

            if (diff) {
                // Check if any component has changes for this entity
                let entityHasChanges = false
                for (let j = 0; j < components.length; j++) {
                    if (shadowMap && hasComponentChanged(shadowMap, components[j], entityId, epsilon)) {
                        entityHasChanges = true
                        break
                    }
                }
                
                if (!entityHasChanges) continue
                
                // Write entity ID
                offset += typeSetters[$u32](view, offset, entityId)
                
                // Write changed components and build mask
                const maskOffset = offset
                const maskSetter = components.length <= 8 ? typeSetters[$u8] : components.length <= 16 ? typeSetters[$u16] : typeSetters[$u32]
                offset += maskSetter === typeSetters[$u8] ? 1 : maskSetter === typeSetters[$u16] ? 2 : 4
                
                let componentMask = 0
                for (let j = 0; j < componentSerializers.length; j++) {
                    const bytesWritten = componentSerializers[j](view, offset, entityId)
                    if (bytesWritten > 0) {
                        componentMask |= 1 << j
                        offset += bytesWritten
                    }
                }
                
                // Write the component mask
                maskSetter(view, maskOffset, componentMask)
            } else {
                // Write entity ID
                offset += typeSetters[$u32](view, offset, entityId)
                
                // Write all components
                for (let j = 0; j < componentSerializers.length; j++) {
                    offset += componentSerializers[j](view, offset, entityId)
                }
            }
        }
        
        return buffer.slice(0, offset)
    }
}

/**
 * Options for AoS deserializer
 */
export type AoSDeserializerOptions = {
    diff?: boolean
}

/**
 * Creates a deserializer function for Array of Structures (AoS) components.
 * @param {AoSComponentRef[]} components - The AoS components to deserialize.
 * @param {AoSDeserializerOptions} [options] - Deserializer options.
 * @returns {Function} A function that deserializes the AoS data.
 */
export const createAoSDeserializer = (components: AnyAoSComponent[], options: AoSDeserializerOptions = {}) => {
    const { diff = false } = options
    const componentDeserializers = components.map(component => createAoSComponentDeserializer(component))

    return (packet: ArrayBuffer, entityIdMapping?: Map<number, number>): void => {
        const view = new DataView(packet)
        let offset = 0

        while (offset < packet.byteLength) {
            // Read entity ID
            const originalEntityId = view.getUint32(offset)
            offset += 4
            const entityId = entityIdMapping ? entityIdMapping.get(originalEntityId) ?? originalEntityId : originalEntityId

            if (diff) {
                // Read component mask
                const maskSize = components.length <= 8 ? 1 : components.length <= 16 ? 2 : 4
                const componentMask = maskSize === 1 ? view.getUint8(offset) : maskSize === 2 ? view.getUint16(offset) : view.getUint32(offset)
                offset += maskSize

                // Read changed components
                for (let i = 0; i < components.length; i++) {
                    if (componentMask & (1 << i)) {
                        offset += componentDeserializers[i](view, offset, entityId, entityIdMapping)
                    }
                }
            } else {
                // Read all components
                for (let i = 0; i < componentDeserializers.length; i++) {
                    offset += componentDeserializers[i](view, offset, entityId, entityIdMapping)
                }
            }
        }
    }
}