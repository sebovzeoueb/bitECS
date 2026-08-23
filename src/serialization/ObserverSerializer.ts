import {
    addComponent,
    removeComponent,
    addEntity,
    removeEntity,
    observe,
    onAdd,
    onRemove,
    World,
    ComponentRef,
    entityExists,
    isRelation,
    getRelationTargets,
    Wildcard,
    EntityId
} from 'bitecs'

enum OperationType {
    AddEntity = 0,
    RemoveEntity = 1,
    AddComponent = 2,
    RemoveComponent = 3,
    AddRelation = 4,
    RemoveRelation = 5,
}
import { createDefaultSerializationBuffer, growBuffer, ROW_HEADROOM } from './SoASerializer'
import { serializeRelationData, deserializeRelationData } from './relationData'

export type ObserverSerializerOptions = {
    buffer?: ArrayBuffer
}

/**
 * Creates a serializer for observing and serializing changes in networked entities.
 */
export const createObserverSerializer = (world: World, networkedTag: ComponentRef, components: ComponentRef[], options: ObserverSerializerOptions = {}) => {
    const backingBuffer = options.buffer ?? createDefaultSerializationBuffer()
    const dataView = new DataView(backingBuffer)
    let offset = 0
    const queue: [number, OperationType, number, number?, any?][] = []
    const relationTargets = new Map<number, Map<number, number>>()
    
    observe(world, onAdd(networkedTag), (eid: EntityId) => {
        queue.push([eid, OperationType.AddEntity, -1])
    })

    observe(world, onRemove(networkedTag), (eid: EntityId) => {
        queue.push([eid, OperationType.RemoveEntity, -1])
        relationTargets.delete(eid)
    })

    components.forEach((component, i) => {
        if (isRelation(component)) {
            observe(world, onAdd(networkedTag, component(Wildcard)), (eid: EntityId) => {
                const targets = getRelationTargets(world, eid, component)
                for (const target of targets) {
                    if (!relationTargets.has(eid)) {
                        relationTargets.set(eid, new Map())
                    }
                    relationTargets.get(eid).set(i, target)
                    const relationData = component(target)
                    queue.push([eid, OperationType.AddRelation, i, target, relationData])
                }
            })

            observe(world, onRemove(networkedTag, component(Wildcard)), (eid: EntityId) => {
                const targetMap = relationTargets.get(eid)
                if (targetMap) {
                    const target = targetMap.get(i)
                    if (target !== undefined) {
                        queue.push([eid, OperationType.RemoveRelation, i, target])
                        targetMap.delete(i)
                        if (targetMap.size === 0) {
                            relationTargets.delete(eid)
                        }
                    }
                }
            })
        } else {
            observe(world, onAdd(networkedTag, component), (eid: EntityId) => {
                queue.push([eid, OperationType.AddComponent, i])
            })

            observe(world, onRemove(networkedTag, component), (eid: EntityId) => {
                queue.push([eid, OperationType.RemoveComponent, i])
            })
        }
    })
    
    return () => {
        offset = 0
        
        for (let i = 0; i < queue.length; i++) {
            const [entityId, type, componentId, targetId, relationData] = queue[i]
            growBuffer(backingBuffer, offset + ROW_HEADROOM)
            dataView.setUint32(offset, entityId)
            offset += 4
            dataView.setUint8(offset, type)
            offset += 1
            if (type === OperationType.AddComponent || 
                type === OperationType.RemoveComponent || 
                type === OperationType.AddRelation ||
                type === OperationType.RemoveRelation) {
                dataView.setUint8(offset, componentId)
                offset += 1
                
                if (type === OperationType.AddRelation || type === OperationType.RemoveRelation) {
                    dataView.setUint32(offset, targetId)
                    offset += 4
                    
                    if (type === OperationType.AddRelation && relationData) {
                        offset = serializeRelationData(relationData, entityId, dataView, offset)
                    }
                }
            }
        }
        queue.length = 0

        return backingBuffer.slice(0, offset)
    }
}

export type ObserverDeserializerOptions = {
    idMap?: Map<number, number>
}

/**
 * Creates a deserializer for applying serialized changes to a world.
 */
export const createObserverDeserializer = (world: World, networkedTag: ComponentRef, components: ComponentRef[], options: ObserverDeserializerOptions = {}) => {
    let entityIdMapping = options.idMap || new Map<number, number>()
    
    return (packet: ArrayBuffer, idMap?: Map<number, number>) => {
        // Allow overriding the mapping for this call
        const currentMapping = idMap || entityIdMapping
        const dataView = new DataView(packet)
        let offset = 0

        while (offset < packet.byteLength) {
            const packetEntityId = dataView.getUint32(offset)
            offset += 4
            const operationType = dataView.getUint8(offset)
            offset += 1
            let componentId = -1
            let targetId = -1
            
            if (operationType === OperationType.AddComponent || 
                operationType === OperationType.RemoveComponent ||
                operationType === OperationType.AddRelation ||
                operationType === OperationType.RemoveRelation) {
                componentId = dataView.getUint8(offset)
                offset += 1
                
                if (operationType === OperationType.AddRelation || operationType === OperationType.RemoveRelation) {
                    targetId = dataView.getUint32(offset)
                    offset += 4
                }
            }

            const component = components[componentId]
            let worldEntityId = currentMapping.get(packetEntityId)

            if (operationType === OperationType.AddEntity) {
                if (worldEntityId === undefined) {
                    worldEntityId = addEntity(world)
                    currentMapping.set(packetEntityId, worldEntityId)
                    addComponent(world, worldEntityId, networkedTag)
                } else {
                    // TODO: figure out if this should ignore, throw, warn, or if the observer serializer should maybe do a snapshot on first call?
                    // throw new Error(`Entity with ID ${packetEntityId} already exists in the mapping.`)
                    console.warn(`Attempted to deserialize addEntity with ID ${packetEntityId}, but it has already been deserialzied and exists in the mapping.`)
                }
            } else if (worldEntityId !== undefined && entityExists(world, worldEntityId)) {
                if (operationType === OperationType.RemoveEntity) {
                    removeEntity(world, worldEntityId)
                    currentMapping.delete(packetEntityId)
                } else if (operationType === OperationType.AddComponent) {
                    addComponent(world, worldEntityId, component)
                } else if (operationType === OperationType.RemoveComponent) {
                    removeComponent(world, worldEntityId, component)
                } else if (operationType === OperationType.AddRelation) {
                    const worldTargetId = currentMapping.get(targetId)
                    if (worldTargetId !== undefined) {
                        const relationComponent = component(worldTargetId)
                        addComponent(world, worldEntityId, relationComponent)
                        offset = deserializeRelationData(relationComponent, worldEntityId, dataView, offset, currentMapping)
                    }
                } else if (operationType === OperationType.RemoveRelation) {
                    const worldTargetId = currentMapping.get(targetId)
                    if (worldTargetId !== undefined) {
                        removeComponent(world, worldEntityId, component(worldTargetId))
                    }
                }
            }
        }

        return currentMapping
    }
}
