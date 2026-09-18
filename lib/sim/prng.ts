// Seeded PRNG — SPEC §4.1. mulberry32: tiny, fast, good enough for a sim.
// Math.random() is forbidden anywhere under lib/sim.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  uniform(lo: number, hi: number): number;
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number;
  /** nominal × (1 + U(−jitter, +jitter)). */
  jitter(nominal: number, jitter: number): number;
  /** Index drawn with the given non-negative weights. */
  weightedIndex(weights: number[]): number;
  /** Fresh generator seeded from this stream (for independent sub-streams). */
  fork(): Rng;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    jitter: (nominal, jitter) => nominal * (1 + (next() * 2 - 1) * jitter),
    weightedIndex: (weights) => {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    fork: () => mulberry32(Math.floor(next() * 4294967296)),
  };
  return rng;
}
