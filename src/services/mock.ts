/**
 * Helpers shared by the mock (sample-data) services. Everything is deterministic: data is
 * generated from string seeds, never from Math.random or the current clock, so server
 * rendering, client rendering and tests all see identical values.
 */

/** Fixed "now" for sample data (2026-11-26 12:00 UTC). Real services use the real clock. */
export const MOCK_NOW = Date.UTC(2026, 10, 26, 12, 0, 0);

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** ISO timestamp relative to MOCK_NOW (negative = in the past). */
export const at = (offsetMs: number): string => new Date(MOCK_NOW + offsetMs).toISOString();

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function seeded(key: string) {
  let a = hashSeed(key);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer in [min, max]. */
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

/** Memoise a generator so sample data is built once, on first use (not at module load). */
export function lazy<T>(fn: () => T): () => T {
  let v: { value: T } | null = null;
  return () => (v ??= { value: fn() }).value;
}

/** Resolve with a deep copy, so screens can't mutate the shared sample data. */
export function resolve<T>(value: T): Promise<T> {
  return Promise.resolve(value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
}

const SYL_A = ['Ink', 'Quill', 'Nib', 'Blot', 'Scrawl', 'Sketch', 'Smudge', 'Line', 'Stroke', 'Dash', 'Graph', 'Char'];
const SYL_B = ['baron', 'fist', 'wolf', 'storm', 'shade', 'blade', 'fox', 'crow', 'knight', 'rook', 'viper', 'spark'];

/** Deterministic gamer-tag style name. */
export function sampleName(key: string): string {
  const r = seeded(key);
  return `${r.pick(SYL_A)}${r.pick(SYL_B)}${r.chance(0.4) ? r.int(2, 99) : ''}`;
}
