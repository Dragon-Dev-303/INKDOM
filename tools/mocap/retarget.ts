/**
 * Sagittal-plane retarget: 3D CMU joint positions → the game's 2D FK rig angles.
 *
 * Rig conventions (src/game/render/rig.ts): character faces +x, y up.
 *  - torso: hip→shoulder angle from straight up, + = leaning forward
 *  - neck: added to torso for the neck/head
 *  - aF/aB: absolute upper-arm angle from straight down, + = forward; forearm = aF + eF
 *  - hF/hB: absolute thigh angle from straight down, + = forward; shin = hF − kF
 *  - drop: hip lowering below standing hip height (0.84)
 *  - F = character's RIGHT limbs, B = LEFT limbs
 */
import type { V3 } from './fk';
import type { Asf } from './asf';

export const RIG_LEG = 0.84; // thigh 0.42 + shin 0.42

export type Track = 'torso' | 'neck' | 'aF' | 'eF' | 'aB' | 'eB' | 'hF' | 'kF' | 'hB' | 'kB' | 'drop' | 'rootDx' | 'rootDy';
export const TRACKS: Track[] = ['torso', 'neck', 'aF', 'eF', 'aB', 'eB', 'hF', 'kF', 'hB', 'kB', 'drop', 'rootDx', 'rootDy'];
export type Tracks = Record<Track, number[]>;

/** Named anatomical joints (bone END points in CMU ASF terms). */
export const J = {
  hipR: 'rhipjoint', kneeR: 'rfemur', ankleR: 'rtibia',
  hipL: 'lhipjoint', kneeL: 'lfemur', ankleL: 'ltibia',
  shoulderR: 'rclavicle', elbowR: 'rhumerus', wristR: 'rradius',
  shoulderL: 'lclavicle', elbowL: 'lhumerus', wristL: 'lradius',
  neckBase: 'lowerneck', neckTop: 'upperneck', head: 'head',
} as const;

export const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** Rest-pose leg length (femur + tibia), mean of both legs, in ASF units. */
export function legLength(asf: Asf): number {
  const b = asf.bones;
  return (b.lfemur.length + b.ltibia.length + b.rfemur.length + b.rtibia.length) / 2;
}
export function armLength(asf: Asf): number {
  const b = asf.bones;
  return (b.lhumerus.length + b.lradius.length + b.rhumerus.length + b.rradius.length) / 2;
}

/** Unit horizontal (XZ) vector. */
export function horizontal(v: V3): V3 {
  const l = Math.hypot(v[0], v[2]) || 1;
  return [v[0] / l, 0, v[2] / l];
}

export interface RetargetOptions {
  /** horizontal unit forward vector in CMU world (Y = up) */
  forward: V3;
  /** scale ASF units → game units */
  scale: number;
  /** floor ankle height in ASF units (ankle Y when the foot is planted) */
  floorAnkleY: number;
  /** use projected (2D) elbow/knee flex instead of the true 3D flex magnitude (default false) */
  projectedFlex?: boolean;
}

/** angle from straight down, + = forward, for a 2D vector (dx, dy) */
const fromDown = (dx: number, dy: number) => Math.atan2(dx, -dy);
/** angle from straight up, + = forward */
const fromUp = (dx: number, dy: number) => Math.atan2(dx, dy);

/** Retarget a run of frames. Angles are unwrapped over time. */
export function retarget(frames: Record<string, V3>[], o: RetargetOptions): Tracks {
  const out = Object.fromEntries(TRACKS.map((t) => [t, [] as number[]])) as Tracks;
  const f = o.forward;
  const P = (p: V3) => ({ x: (p[0] * f[0] + p[2] * f[2]) * o.scale, y: p[1] * o.scale });
  const floor = o.floorAnkleY * o.scale;
  let hip0x = 0, low0 = 0;
  frames.forEach((fr, i) => {
    const g = (n: string) => P(fr[n]);
    const hip = P(mid(fr[J.hipR], fr[J.hipL]));
    const sh = P(mid(fr[J.shoulderR], fr[J.shoulderL]));
    const head = g(J.head);
    const nb = g(J.neckBase);
    const torso = fromUp(sh.x - hip.x, sh.y - hip.y);
    const neckAbs = fromUp(head.x - nb.x, head.y - nb.y);
    const S3 = o.scale;
    /** 3D flex angle at joint b for chain a→b→c (0 = straight) */
    const flex3 = (a: string, b: string, c: string) => {
      const u = sub(fr[b], fr[a]), v = sub(fr[c], fr[b]);
      return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (len(u) * len(v)))));
    };
    /**
     * Proximal segment angle from the projection. When the segment is strongly foreshortened
     * (pointing at the camera) its projected angle is unreliable, so blend towards the angle
     * implied by the whole-limb chord: chord ≈ seg + k·flex (sign s).
     */
    const segAngle = (p: string, m: string, d: string, flex: number, s: 1 | -1) => {
      const Pp = g(p), M = g(m), D = g(d);
      const seg = fromDown(M.x - Pp.x, M.y - Pp.y);
      const real = len(sub(fr[m], fr[p])) * S3;
      const w = Math.max(0, Math.min(1, (Math.hypot(M.x - Pp.x, M.y - Pp.y) / (real || 1) - 0.25) / 0.35));
      if (w >= 1) return seg;
      const est = fromDown(D.x - Pp.x, D.y - Pp.y) - s * 0.5 * flex;
      let dlt = seg - est;
      while (dlt > Math.PI) dlt -= 2 * Math.PI;
      while (dlt < -Math.PI) dlt += 2 * Math.PI;
      return est + w * dlt;
    };
    const arm = (s: string, e: string, w: string) => {
      const fl = o.projectedFlex ? NaN : flex3(s, e, w);
      if (o.projectedFlex) { const S = g(s), E = g(e), W = g(w); const a = fromDown(E.x - S.x, E.y - S.y); return [a, fromDown(W.x - E.x, W.y - E.y) - a] as const; }
      return [segAngle(s, e, w, fl, 1), fl] as const;
    };
    const leg = (h: string, k: string, an: string) => {
      const A = g(an);
      if (o.projectedFlex) { const H = g(h), K = g(k); const a = fromDown(K.x - H.x, K.y - H.y); return [a, a - fromDown(A.x - K.x, A.y - K.y), A.y] as const; }
      const fl = flex3(h, k, an);
      return [segAngle(h, k, an, fl, -1), fl, A.y] as const;
    };
    const [aR, eR] = arm(J.shoulderR, J.elbowR, J.wristR);
    const [aL, eL] = arm(J.shoulderL, J.elbowL, J.wristL);
    const [hR, kR, yR] = leg(J.hipR, J.kneeR, J.ankleR);
    const [hL, kL, yL] = leg(J.hipL, J.kneeL, J.ankleL);
    const lowest = Math.min(yR, yL) - floor; // lowest ankle above the floor (airborne height)
    const hipAbove = hip.y - floor - lowest; // hip above the lowest ankle
    if (i === 0) { hip0x = hip.x; low0 = lowest; }
    out.torso.push(torso);
    out.neck.push(neckAbs - torso);
    out.aF.push(aR); out.eF.push(eR);
    out.aB.push(aL); out.eB.push(eL);
    out.hF.push(hR); out.kF.push(kR);
    out.hB.push(hL); out.kB.push(kL);
    out.drop.push(Math.max(0, RIG_LEG - hipAbove));
    out.rootDx.push(hip.x - hip0x);
    out.rootDy.push(lowest - low0);
  });
  for (const t of ['torso', 'neck', 'aF', 'aB', 'hF', 'hB'] as Track[]) unwrapInPlace(out[t]);
  for (const t of ['eF', 'eB', 'kF', 'kB'] as Track[]) wrapPiInPlace(out[t]);
  return out;
}

export function unwrapInPlace(a: number[]): void {
  for (let i = 1; i < a.length; i++) {
    while (a[i] - a[i - 1] > Math.PI) a[i] -= 2 * Math.PI;
    while (a[i] - a[i - 1] < -Math.PI) a[i] += 2 * Math.PI;
  }
}
/** wrap each value to (−π, π] (relative joint angles) */
export function wrapPiInPlace(a: number[]): void {
  for (let i = 0; i < a.length; i++) {
    while (a[i] > Math.PI) a[i] -= 2 * Math.PI;
    while (a[i] <= -Math.PI) a[i] += 2 * Math.PI;
  }
}

/** Swap right/left (F/B) tracks: the character strikes with the other limb. */
export function mirrorTracks(t: Tracks): Tracks {
  return { ...t, aF: t.aB, eF: t.eB, aB: t.aF, eB: t.eF, hF: t.hB, kF: t.kB, hB: t.hF, kB: t.kF };
}
