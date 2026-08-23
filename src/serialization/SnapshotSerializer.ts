import { createSoASerializer, createSoADeserializer, PrimitiveBrand, createDefaultSerializationBuffer, growBuffer, ROW_HEADROOM } from './SoASerializer'
import {
    addComponent,
    hasComponent,
    World,
    getAllEntities,
    addEntity,
    isRelation,
    getRelationTargets,
    Relation,
    ComponentRef
} from 'bitecs'
import { serializeRelationData, deserializeRelationData } from './relationData'

/**
 * Creates a snapshot serializer for the given world and components.
 * @param {World} world - The ECS world object.
 * @param {Record<string, PrimitiveBrand>[]} components - An array of component definitions.
 * @param {ArrayBuffer} [buffer] - The buffer to use for serialization (defaults to a resizable buffer).
 * @returns {Function} A function that, when called, serializes the world state and returns a slice of the buffer.
 */
export const createSnapshotSerializer = (world: World, components: (Record<string, PrimitiveBrand> | ComponentRef)[], buffer: ArrayBuffer = createDefaultSerializationBuffer()) => {
    const dataView = new DataView(buffer)
    // Internal component-data buffer capacity mirrors the snapshot buffer's,
    // so a caller-provided buffer still bounds the whole snapshot (fixed
    // buffers report maxByteLength === byteLength; very old engines lack it)
    const soaCapacity = (buffer as any).maxByteLength ?? buffer.byteLength
    const soaSerializer = createSoASerializer(components, {
        buffer: new ArrayBuffer(Math.min(64 * 1024, soaCapacity), { maxByteLength: soaCapacity })
    })
    let offset = 0

    /**
     * Serializes entity-component relationships.
     * @param {number[]} entities - An array of entity IDs.
     */
    const serializeEntityComponentRelationships = (entities: readonly number[]) => {
        const entityCount = entities.length

        // Write entity count
        dataView.setUint32(offset, entityCount)
        offset += 4

        // Serialize entity-component relationships
        for (let i = 0; i < entityCount; i++) {
            const entityId = entities[i]
            let componentCount = 0

            growBuffer(buffer, offset + ROW_HEADROOM)

            dataView.setUint32(offset, entityId)
            offset += 4

            const componentCountOffset = offset
            offset += 1

            for (let j = 0; j < components.length; j++) {
                const component = components[j]
                if (isRelation(component)) {
                    const targets = getRelationTargets(world, entityId, component as Relation<any>)
                    for (const target of targets) {
                        // Per-target check: many targets on one entity can outrun
                        // the per-entity headroom (relation payloads self-grow)
                        growBuffer(buffer, offset + ROW_HEADROOM)
                        dataView.setUint8(offset, j)
                        offset += 1
                        dataView.setUint32(offset, target)
                        offset += 4
                        const relationData = (component as any)(target)
                        offset = serializeRelationData(relationData, entityId, dataView, offset)
                        componentCount++
                    }
                } else if (hasComponent(world, entityId, component)) {
                    dataView.setUint8(offset, j)
                    offset += 1
                    componentCount++
                }
            }

            dataView.setUint8(componentCountOffset, componentCount)
        }
    }

    /**
     * Serializes component data for all entities.
     * @param {number[]} entities - An array of entity IDs.
     */
    const serializeComponentData = (entities: readonly number[]) => {
        const componentData = soaSerializer(entities)
        growBuffer(buffer, offset + componentData.byteLength)
        new Uint8Array(buffer).set(new Uint8Array(componentData), offset)
        offset += componentData.byteLength
    }

    return (selectedEntities?: readonly number[]) => {
        offset = 0
        const entities = selectedEntities ?? getAllEntities(world)
        serializeEntityComponentRelationships(entities)
        serializeComponentData(entities)
        return buffer.slice(0, offset)
    }
}

/**
 * Creates a snapshot deserializer for the given world and components.
 * @param {World} world - The ECS world object.
 * @param {Record<string, PrimitiveBrand>[]} components - An array of component definitions.
 * @returns {Function} A function that takes a serialized packet and deserializes it into the world, returning a map of packet entity IDs to world entity IDs.
 */
export const createSnapshotDeserializer = (world: World, components: (Record<string, PrimitiveBrand> | ComponentRef)[], idMap?: Map<number, number>) => {
    let entityIdMapping = idMap || new Map<number, number>()
    const soaDeserializer = createSoADeserializer(components)

    return (packet: ArrayBuffer, idMapOverride?: Map<number, number>): Map<number, number> => {
        const currentMapping = idMapOverride || entityIdMapping
        const dataView = new DataView(packet)
        let offset = 0

        // Read entity count
        const entityCount = dataView.getUint32(offset)
        offset += 4

        // Deserialize entity-component relationships
        for (let entityIndex = 0; entityIndex < entityCount; entityIndex++) {
            const packetEntityId = dataView.getUint32(offset)
            offset += 4

            let worldEntityId = currentMapping.get(packetEntityId)
            if (worldEntityId === undefined) {
                worldEntityId = addEntity(world)
                currentMapping.set(packetEntityId, worldEntityId)
            }

            const componentCount = dataView.getUint8(offset)
            offset += 1

            for (let i = 0; i < componentCount; i++) {
                const componentIndex = dataView.getUint8(offset)
                offset += 1
                const component = components[componentIndex]

                if (isRelation(component)) {
                    const targetId = dataView.getUint32(offset)
                    offset += 4
                    let worldTargetId = currentMapping.get(targetId)
                    if (worldTargetId === undefined) {
                        worldTargetId = addEntity(world)
                        currentMapping.set(targetId, worldTargetId)
                    }
                    const relationComponent = (component as (target: any) => any)(worldTargetId)
                    addComponent(world, worldEntityId, relationComponent)
                    offset = deserializeRelationData(relationComponent, worldEntityId, dataView, offset, currentMapping)
                } else {
                    addComponent(world, worldEntityId, component)
                }
            }
        }

        // Deserialize component data
        soaDeserializer(packet.slice(offset), currentMapping)

        return currentMapping
    }
}
