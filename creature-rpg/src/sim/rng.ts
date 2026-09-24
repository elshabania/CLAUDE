// Seeded PRNG (sfc32) with fully serializable state. PURE: never touches Math.random.
export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 to spread the seed across four words
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  // warm up
  let r = new Rng(st);
  for (let i = 0; i < 12; i++) r.nextU32();
  return r.state();
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }
  state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }
  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }
  /** Uniform integer in [lo, hi] inclusive (rejection sampling, unbiased). */
  int(lo: number, hi: number): number {
    const span = hi - lo + 1;
    if (span <= 1) return lo;
    const limit = Math.floor(0x100000000 / span) * span;
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return lo + (x % span);
  }
  /** rng.chance(p) ≡ int(1,100) <= p */
  chance(p: number): boolean {
    if (p >= 100) return true;
    if (p <= 0) return false;
    return this.int(1, 100) <= p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

/** Simple string hash (FNV-1a 32) for deriving seeds from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
