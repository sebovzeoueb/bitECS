type Func = (...args: any) => any
export const pipe = <T extends Func, U extends Func, R extends Func>
    (...functions: [T, ...U[], R]): ((...args: Parameters<T>) => ReturnType<R>) => {
    return (...args: Parameters<T>): ReturnType<R> => {
        let result = functions[0](...args)
        for (let i = 1; i < functions.length; i++) result = functions[i](result)
        return result
    }
}
