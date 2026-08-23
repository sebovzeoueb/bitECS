import { $u8, $i8, $u16, $i16, $u32, $i32, $f32, $ref, growBuffer } from './SoASerializer'

/**
 * Serializes relation data for a specific entity. Grows the buffer for its own
 * writes (bounded by 8 bytes per key), so callers' headroom checks don't need
 * to account for relation payload size.
 */
export function serializeRelationData(data: any, eid: number, dataView: DataView, offset: number) {
    if (!data) return offset

    // Handle array data (AoS) - defaults to f64
    if (Array.isArray(data)) {
        const value = data[eid]
        if (value !== undefined) {
            growBuffer(dataView.buffer as ArrayBuffer, dataView.byteOffset + offset + 8)
            if ($ref in data) {
                dataView.setUint32(offset, value)
                return offset + 4
            } else {
                dataView.setFloat64(offset, value)
                return offset + 8
            }
        }
        return offset
    }

    // Handle object data (SoA)
    if (typeof data === 'object') {
        const keys = Object.keys(data).sort()
        growBuffer(dataView.buffer as ArrayBuffer, dataView.byteOffset + offset + keys.length * 8)
        for (const key of keys) {
            const arr = data[key]
            const value = arr[eid]

            if (value !== undefined) {
                if (arr instanceof Int8Array || $i8 in arr) {
                    dataView.setInt8(offset, value)
                    offset += 1
                } else if (arr instanceof Uint8Array || $u8 in arr) {
                    dataView.setUint8(offset, value)
                    offset += 1
                } else if (arr instanceof Int16Array || $i16 in arr) {
                    dataView.setInt16(offset, value)
                    offset += 2
                } else if (arr instanceof Uint16Array || $u16 in arr) {
                    dataView.setUint16(offset, value)
                    offset += 2
                } else if (arr instanceof Int32Array || $i32 in arr) {
                    dataView.setInt32(offset, value)
                    offset += 4
                } else if (arr instanceof Uint32Array || $u32 in arr || $ref in arr) {
                    dataView.setUint32(offset, value)
                    offset += 4
                } else if (arr instanceof Float32Array || $f32 in arr) {
                    dataView.setFloat32(offset, value)
                    offset += 4
                } else {
                    // Default to f64
                    dataView.setFloat64(offset, value)
                    offset += 8
                }
            }
        }
    }

    return offset
}

/**
 * Deserializes relation data for a specific entity
 */
export function deserializeRelationData(data: any, eid: number, dataView: DataView, offset: number, entityIdMapping?: Map<number, number>) {
    if (!data) return offset

    // Handle array data (AoS) - defaults to f64
    if (Array.isArray(data)) {
        if ($ref in data) {
            const value = dataView.getUint32(offset)
            const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value
            data[eid] = mapped
            return offset + 4
        }
        data[eid] = dataView.getFloat64(offset)
        return offset + 8
    }

    // Handle object data (SoA)
    if (typeof data === 'object') {
        const keys = Object.keys(data).sort()
        for (const key of keys) {
            const arr = data[key]

            if (arr instanceof Int8Array || $i8 in arr) {
                arr[eid] = dataView.getInt8(offset)
                offset += 1
            } else if (arr instanceof Uint8Array || $u8 in arr) {
                arr[eid] = dataView.getUint8(offset)
                offset += 1
            } else if (arr instanceof Int16Array || $i16 in arr) {
                arr[eid] = dataView.getInt16(offset)
                offset += 2
            } else if (arr instanceof Uint16Array || $u16 in arr) {
                arr[eid] = dataView.getUint16(offset)
                offset += 2
            } else if (arr instanceof Int32Array || $i32 in arr) {
                arr[eid] = dataView.getInt32(offset)
                offset += 4
            } else if (arr instanceof Uint32Array || $u32 in arr || $ref in arr) {
                const value = dataView.getUint32(offset)
                if ($ref in arr) {
                    const mapped = entityIdMapping ? entityIdMapping.get(value) ?? value : value
                    arr[eid] = mapped
                } else {
                    arr[eid] = value
                }
                offset += 4
            } else if (arr instanceof Float32Array || $f32 in arr) {
                arr[eid] = dataView.getFloat32(offset)
                offset += 4
            } else {
                // Default to f64
                arr[eid] = dataView.getFloat64(offset)
                offset += 8
            }
        }
    }

    return offset
}
