/**
 * Deterministic PRNG — sfc32 (4×u32 state).
 * The single source of all randomness (PLAN §7). State is fully
 * serializable so a save restores the exact stream.
 */

export type RngState = [number, number, number, number];

export class Rng {
  private s: RngState;

  /**
   * @param seedOrState a 32-bit seed, or a previously serialized state.
   *   Restoring a state continues the exact stream from where it left off.
   */
  constructor(seedOrState: number | RngState) {
    if (Array.isArray(seedOrState)) {
      this.s = seedOrState;
      return;
    }
    // Derive four mixed u32s from a single seed, then warm up so weak
    // low seeds do not produce correlated early draws.
    const a = seedOrState >>> 0;
    this.s = [
      a,
      (a ^ 0x9e3779b9) >>> 0,
      (a ^ 0x85ebca6b) >>> 0,
      (a ^ 0xc2b2ae35) >>> 0,
    ];
    for (let i = 0; i < 16; i++) this.next();
  }

  /** Next float in [0, 1). */
  next(): number {
    let [a, b, c, d] = this.s;
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.s = [a, b, c, d];
    return (t >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Uniform integer in [min, maxExclusive). */
  intRange(min: number, maxExclusive: number): number {
    return min + this.int(maxExclusive - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Deterministic Fisher–Yates; returns a new array. */
  shuffled<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Weighted pick; weights need not be normalized. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      roll -= w;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /** Serialized state (save format: `rng` field, PLAN §7). */
  state(): RngState {
    return this.s;
  }
}

/** Deterministic 32-bit FNV-1a — for named seeds ("tutorial", dates, …). */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
