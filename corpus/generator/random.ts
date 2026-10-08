export interface Random {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
}

/** Seeded PRNG (mulberry32): the same seed always gives the same sequence. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1))

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)]
    if (item === undefined) throw new Error("pick() on an empty list")
    return item
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(0, i)
      ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
    }
    return copy
  }

  return { next, int, pick, shuffle }
}
