export const defineHiddenProperty = (obj:any,key:any,value:any) => Object.defineProperty(obj, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
})