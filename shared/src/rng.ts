/**
 * Small deterministic PRNG (mulberry32). Used for world generation so that the
 * server and every client produce the exact same forest from a seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function randInt(rng: () => number, min: number, maxInclusive: number): number {
  return Math.floor(randRange(rng, min, maxInclusive + 1));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}
