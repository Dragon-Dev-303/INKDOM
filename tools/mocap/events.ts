/**
 * Strike events from the extension signal of a limb (segment.ts `signal`): an event is a
 * positive peak of extension velocity. Onset = where the extension starts rising, impact =
 * maximum extension (velocity crosses zero), end = retraction finished (extension back down
 * and slow). Each event carries features used to classify punch types and to pick the
 * cleanest instance.
 */
import type { V3 } from './fk';
import type { Trial } from './load';
import { armLength, J, legLength, len, mid, sub } from './retarget';
import { facing, signal, smooth, type Side, type SignalKind } from './segment';

export interface StrikeEvent {
  side: Side;
  kind: SignalKind;
  start: number;      // onset (extension starts rising)
  impact: number;     // max extension
  end: number;        // retraction finished
  vel: number;        // peak extension velocity (limb lengths / s)
  ext0: number;       // extension at onset
  ext: number;        // extension at impact
  extEnd: number;     // extension at end
  flex: number;       // elbow/knee 3D flex at impact (degrees)
  elbowH: number;     // elbow (knee) height above shoulder (hip) at impact / limb length
  wristH: number;     // effector height above shoulder (hip) at impact / limb length
  rise: number;       // effector vertical displacement onset→impact / limb length
  fwd: number;        // effector forward displacement onset→impact / limb length (body facing at onset)
  toMid: number;      // effector lateral displacement toward the body midline / limb length
  curve: number;      // path length / chord length onset→impact
  hipFwd: number;     // mid-hip forward travel onset→impact / limb length
  sweep: number;      // horizontal yaw sweep (deg) of the effector around the mid-shoulder onset→impact, + = toward the body midline
  maxH: number;       // max effector height above shoulder (hip) during onset..impact / limb length
  restBefore: number; // seconds before onset during which the extension stayed low and slow
  restAfter: number;  // seconds after end during which the extension stayed low and slow
}

const dot2 = (a: V3, f: V3) => a[0] * f[0] + a[2] * f[2];
const flexDeg = (a: V3, b: V3, c: V3) => {
  const u = sub(b, a), v = sub(c, b);
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (len(u) * len(v))))) * 180) / Math.PI;
};

export function derivative(a: number[], fps: number): number[] {
  return a.map((_, i) => {
    const j = Math.min(a.length - 1, i + 1), k = Math.max(0, i - 1);
    return ((a[j] - a[k]) * fps) / ((j - k) || 1);
  });
}

export function strikeEvents(tr: Trial, side: Side, kind: SignalKind, minVel?: number): StrikeEvent[] {
  const { frames, fps } = tr;
  const R = side === 'R';
  const arm = kind === 'punch' || kind === 'rise';
  const A = armLength(tr.asf), Lg = legLength(tr.asf);
  const norm = arm ? A : Lg;
  const sig = smooth(signal(frames, kind, side, A, Lg), Math.round(fps / 40));
  const vel = smooth(derivative(sig, fps), Math.round(fps / 60));
  const vmin = minVel ?? (arm ? 2 : 1.5);
  const n = frames.length;
  const proxJ = arm ? (R ? J.shoulderR : J.shoulderL) : null;
  const midJ = arm ? (R ? J.elbowR : J.elbowL) : R ? J.kneeR : J.kneeL;
  const eff = arm ? (R ? J.wristR : J.wristL) : kind === 'knee' ? midJ : R ? J.ankleR : J.ankleL;
  const prox = (fr: Record<string, V3>) => (proxJ ? fr[proxJ] : mid(fr[J.hipR], fr[J.hipL]));
  const out: StrikeEvent[] = [];
  const W = Math.round(0.12 * fps);
  for (let i = 1; i < n - 1; i++) {
    if (!(vel[i] >= vmin && vel[i] >= vel[i - 1] && vel[i] > vel[i + 1])) continue;
    let isMax = true;
    for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) if (vel[k] > vel[i]) { isMax = false; break; }
    if (!isMax) continue;
    let start = i;
    while (start > 0 && vel[start] > 0.08 * vel[i] && i - start < 0.6 * fps) start--;
    let impact = i;
    while (impact < n - 1 && vel[impact] > 0 && impact - i < 0.5 * fps) impact++;
    // refine impact to the max of the signal around the zero crossing
    for (let k = impact; k < Math.min(n, impact + Math.round(0.03 * fps)); k++) if (sig[k] > sig[impact]) impact = k;
    // end: after the retraction velocity minimum, velocity back near zero
    let vmn = impact;
    for (let k = impact; k < Math.min(n, impact + Math.round(0.6 * fps)); k++) { if (vel[k] < vel[vmn]) vmn = k; if (vel[k] > 0.3 * vel[i] && k > vmn) break; }
    let end = vmn;
    while (end < n - 1 && vel[end] < -0.08 * vel[i] && end - impact < 0.8 * fps) end++;
    if (vel[vmn] > -0.15 * vel[i]) end = Math.min(n - 1, impact + Math.round(0.35 * fps)); // held technique: no retraction
    const f0 = frames[start], fi = frames[impact];
    const fw = facing(f0);
    const lat: V3 = [fw[2], 0, -fw[0]];
    const hip0 = mid(f0[J.hipR], f0[J.hipL]);
    const leftSign = dot2(sub(f0[J.hipL], hip0), lat) > 0 ? 1 : -1;
    const d = sub(fi[eff], f0[eff]);
    const latLeft = (leftSign * dot2(d, lat)) / norm;
    let path = 0, maxH = -Infinity;
    for (let k = start + 1; k <= impact; k++) {
      path += len(sub(frames[k][eff], frames[k - 1][eff]));
      maxH = Math.max(maxH, (frames[k][eff][1] - prox(frames[k])[1]) / norm);
    }
    const pi = prox(fi);
    const yaw = (v: V3) => Math.atan2(v[0], v[2]);
    let dy = yaw(sub(fi[eff], mid(fi[J.shoulderR], fi[J.shoulderL]))) - yaw(sub(f0[eff], mid(f0[J.shoulderR], f0[J.shoulderL])));
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    const restLevel = sig[start] + 0.2 * (sig[impact] - sig[start]);
    let rb = start; while (rb > 0 && sig[rb] < restLevel && Math.abs(vel[rb]) < 0.25 * vel[i]) rb--;
    const restLevel2 = sig[end] + 0.2 * (sig[impact] - sig[end]);
    let ra = end; while (ra < n - 1 && sig[ra] < restLevel2 && Math.abs(vel[ra]) < 0.25 * vel[i]) ra++;
    out.push({
      side, kind, start, impact, end, vel: vel[i], ext0: sig[start], ext: sig[impact], extEnd: sig[end],
      flex: arm ? flexDeg(fi[proxJ!], fi[midJ], fi[R ? J.wristR : J.wristL]) : flexDeg(pi, fi[midJ], fi[R ? J.ankleR : J.ankleL]),
      elbowH: (fi[midJ][1] - pi[1]) / norm,
      wristH: (fi[eff][1] - pi[1]) / norm,
      rise: d[1] / norm,
      fwd: dot2(d, fw) / norm,
      toMid: R ? latLeft : -latLeft,
      curve: path / (len(d) || 1e-9),
      hipFwd: dot2(sub(mid(fi[J.hipR], fi[J.hipL]), hip0), fw) / norm,
      sweep: ((R ? dy : -dy) * 180) / Math.PI,
      maxH,
      restBefore: (start - rb) / fps,
      restAfter: (ra - end) / fps,
    });
  }
  return out;
}

export function fmtEvent(e: StrikeEvent, fps: number): string {
  const f = (v: number) => v.toFixed(2);
  return `${e.side} ${e.start}-${e.impact}-${e.end} (${f(e.impact / fps)}s pre ${f((e.impact - e.start) / fps)} post ${f((e.end - e.impact) / fps)}) v ${e.vel.toFixed(1)} ext ${f(e.ext0)}>${f(e.ext)}>${f(e.extEnd)} flex ${e.flex.toFixed(0)} elbH ${f(e.elbowH)} wrH ${f(e.wristH)} maxH ${f(e.maxH)} rise ${f(e.rise)} fwd ${f(e.fwd)} mid ${f(e.toMid)} curve ${f(e.curve)} sweep ${e.sweep.toFixed(0)} hip ${f(e.hipFwd)} rest ${f(e.restBefore)}/${f(e.restAfter)}`;
}
