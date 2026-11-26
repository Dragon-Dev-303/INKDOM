/**
 * Technique segmentation: per-limb strike signals, peak detection, rest→peak→rest windows,
 * resampling to 60 fps and light smoothing.
 */
import type { V3 } from './fk';
import { J, len, mid, sub, type Tracks, TRACKS } from './retarget';

export type Side = 'R' | 'L';
export type SignalKind = 'punch' | 'kick' | 'knee' | 'rise';

export interface Peak { frame: number; value: number; prominence: number; isolation: number }

/** Horizontal facing of the body (from the hips), CMU world: forward = (L − R) × up. */
export function facing(fr: Record<string, V3>): V3 {
  const lr = sub(fr[J.hipL], fr[J.hipR]);
  const sh = sub(fr[J.shoulderL], fr[J.shoulderR]);
  const v: V3 = [lr[0] + sh[0], 0, lr[2] + sh[2]];
  // (v × up) with up = (0,1,0): (vx,vy,vz) × (0,1,0) = (−vz, 0, vx)
  const f: V3 = [-v[2], 0, v[0]];
  const l = Math.hypot(f[0], f[2]) || 1;
  return [f[0] / l, 0, f[2] / l];
}

/**
 * Strike signal per frame (dimensionless):
 *  - punch: wrist distance from shoulder / arm length (+ a small bonus for wrist forward of the chest)
 *  - kick: ankle distance from the "hanging" ankle position below the hip / leg length
 *  - knee: knee height relative to the hip / thigh length (+1)
 *  - rise: wrist height above the shoulder / arm length (blocks, uppercuts)
 */
export function signal(frames: Record<string, V3>[], kind: SignalKind, side: Side, armLen: number, legLen: number): number[] {
  const S = side === 'R';
  return frames.map((fr) => {
    if (kind === 'punch') {
      const sh = fr[S ? J.shoulderR : J.shoulderL], w = fr[S ? J.wristR : J.wristL];
      return len(sub(w, sh)) / armLen;
    }
    if (kind === 'rise') {
      const sh = fr[S ? J.shoulderR : J.shoulderL], w = fr[S ? J.wristR : J.wristL];
      return (w[1] - sh[1]) / armLen;
    }
    const hip = mid(fr[J.hipR], fr[J.hipL]);
    if (kind === 'knee') {
      const k = fr[S ? J.kneeR : J.kneeL];
      return (k[1] - hip[1]) / (legLen / 2) + 1;
    }
    const a = fr[S ? J.ankleR : J.ankleL];
    const hang: V3 = [hip[0], hip[1] - legLen, hip[2]];
    return len(sub(a, hang)) / legLen;
  });
}

export function smooth(a: number[], radius: number): number[] {
  if (radius <= 0) return a.slice();
  return a.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < a.length) { s += a[j]; n++; }
    }
    return s / n;
  });
}

/**
 * Local maxima with prominence (drop to the lowest point within `win` frames on
 * both sides; the smaller side counts) and isolation (distance to the next higher-or-similar peak).
 */
export function findPeaks(sig: number[], win: number, minProm: number): Peak[] {
  const peaks: Peak[] = [];
  for (let i = 1; i < sig.length - 1; i++) {
    if (!(sig[i] >= sig[i - 1] && sig[i] > sig[i + 1])) continue;
    let lo = Infinity, hi = Infinity, ok = true;
    for (let j = i - 1; j >= Math.max(0, i - win); j--) { if (sig[j] > sig[i]) { ok = false; break; } lo = Math.min(lo, sig[j]); }
    if (!ok) continue;
    for (let j = i + 1; j <= Math.min(sig.length - 1, i + win); j++) { if (sig[j] > sig[i]) { ok = false; break; } hi = Math.min(hi, sig[j]); }
    if (!ok) continue;
    if (!isFinite(lo) || !isFinite(hi)) continue;
    const prominence = sig[i] - Math.max(lo, hi);
    if (prominence < minProm) continue;
    peaks.push({ frame: i, value: sig[i], prominence, isolation: 0 });
  }
  for (const p of peaks) {
    let d = Infinity;
    for (const q of peaks) if (q !== p && q.value > p.value - 0.5 * p.prominence) d = Math.min(d, Math.abs(q.frame - p.frame));
    p.isolation = d;
  }
  return peaks;
}

/**
 * Window around a peak: walk outwards until the signal returns close to its local rest level
 * (`restFrac` of the prominence above the local minimum) and the speed is small, bounded by
 * [minPre, maxPre] / [minPost, maxPost] frames.
 */
export function windowAround(sig: number[], peak: number, fps: number, opts: { minPre: number; maxPre: number; minPost: number; maxPost: number; restFrac?: number }): [number, number] {
  const rf = opts.restFrac ?? 0.15;
  const n = sig.length;
  const pre = (s: number) => Math.max(0, peak - Math.round(s * fps));
  const post = (s: number) => Math.min(n - 1, peak + Math.round(s * fps));
  let loPre = Infinity; for (let i = pre(opts.maxPre); i < peak; i++) loPre = Math.min(loPre, sig[i]);
  let loPost = Infinity; for (let i = peak + 1; i <= post(opts.maxPost); i++) loPost = Math.min(loPost, sig[i]);
  const thrPre = loPre + rf * (sig[peak] - loPre);
  const thrPost = loPost + rf * (sig[peak] - loPost);
  let a = pre(opts.minPre);
  while (a > pre(opts.maxPre) && sig[a] > thrPre) a--;
  let b = post(opts.minPost);
  while (b < post(opts.maxPost) && sig[b] > thrPost) b++;
  return [a, b];
}

/** Resample tracks from `srcFps` to `dstFps` with linear interpolation. Returns new tracks and the mapped index fn. */
export function resample(t: Tracks, srcFps: number, dstFps: number): Tracks {
  const n = t.torso.length;
  const dur = (n - 1) / srcFps;
  const m = Math.floor(dur * dstFps + 1e-6) + 1;
  const out = {} as Tracks;
  for (const k of TRACKS) {
    const src = t[k];
    out[k] = Array.from({ length: m }, (_, i) => {
      const x = (i / dstFps) * srcFps;
      const i0 = Math.min(n - 1, Math.floor(x)), i1 = Math.min(n - 1, i0 + 1);
      const u = x - i0;
      return src[i0] * (1 - u) + src[i1] * u;
    });
  }
  return out;
}

/** 3-tap [1 2 1]/4 filter (endpoints kept). */
export function filter3(a: number[]): number[] {
  return a.map((v, i) => (i === 0 || i === a.length - 1 ? v : (a[i - 1] + 2 * v + a[i + 1]) / 4));
}
