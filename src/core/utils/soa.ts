export const soa = <S extends Record<string, unknown>>(spec: S): S => spec as S

export function aos<T, S extends Record<string, unknown> = Record<string, unknown>>(spec?: S): T[] & S {
    const base = [] as T[]
    return spec ? Object.assign(base, spec) : (base as T[] & S)
}
