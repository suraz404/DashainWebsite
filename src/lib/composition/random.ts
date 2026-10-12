/** FNV-1a 32-bit string hash → unsigned int. Deterministic across platforms (pure integer math). */
export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Hash → float in [0, 1). */
export const unit = (input: string): number => hash32(input) / 4294967296;

/** mulberry32: tiny seeded PRNG. Same seed → same sequence; we never call Math.random(). */
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
