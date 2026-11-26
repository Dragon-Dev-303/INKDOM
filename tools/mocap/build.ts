/**
 * Build the mocap clip set and write src/game/anim/data/mocap.generated.ts.
 *
 *   npx tsx tools/mocap/build.ts                 # download (cached) + build + write
 *   npx tsx tools/mocap/build.ts --candidates    # list the top-scoring candidate events per clip
 *   npx tsx tools/mocap/build.ts --preview       # also write SVG flipbooks to tools/mocap/.cache/preview/
 *
 * Every clip is chosen automatically: strike events are detected per source trial (events.ts),
 * scored with the clip's `score` function, and the best one wins. A clip can be pinned to a
 * specific event with `pin` (impact frame in the source trial) once you have inspected candidates.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { downloadAll } from './download';
import { fmtEvent, strikeEvents, type StrikeEvent } from './events';
import type { V3 } from './fk';
import { loadTrial, type Trial } from './load';
import { J, legLength, mid, mirrorTracks, retarget, RIG_LEG, sub, TRACKS, type Tracks, horizontal, len } from './retarget';
import { filter3, resample, type Side, type SignalKind } from './segment';
import { writePreview } from './preview';

type Limb = 'aF' | 'aB' | 'hF' | 'hB';

interface Source { subject: number; trial: number; motion: string }

interface Ctx { tr: Trial; lead: Side }

interface ClipSpec {
  id: string;
  label: string;
  limb: Limb;
  kind: SignalKind;
  sources: Source[];
  /** which source arm/leg may be used: 'lead' / 'rear' relative to the stance, or a fixed side */
  role: 'lead' | 'rear' | 'any';
  /** score an event (higher = better); return null to reject */
  score: (e: StrikeEvent, c: Ctx) => number | null;
  /** seconds of lead-in before onset / tail after the end */
  pad?: [number, number];
  /** max clip duration in seconds */
  maxDur?: number;
  /** pin a specific event: source subject/trial + impact frame (±6 frames) */
  pin?: { subject: number; trial: number; impact: number };
}

const S = (subject: number, trial: number, motion: string): Source => ({ subject, trial, motion });

const KARATE = {
  front: S(135, 4, 'Front Kick (mae-geri)'),
  gedan: S(135, 5, 'Gedanbarai (low block)'),
  mawashi: S(135, 7, 'Mawashigeri (roundhouse kick)'),
  oizuki: S(135, 9, 'Oiduki (lunge punch)'),
  syuto: S(135, 10, 'Syutouuke (knife-hand block)'),
  yoko: S(135, 11, 'Yokogeri (side kick)'),
};
const BOXING = [S(13, 17, 'boxing'), S(13, 18, 'boxing'), S(14, 1, 'boxing'), S(14, 2, 'boxing'), S(14, 3, 'boxing')];
const PUNCH144 = [S(144, 20, 'Punch_Sequence'), S(144, 21, 'Punch_Sequence'), S(144, 13, 'Left_Punch_Sequence'), S(144, 14, 'Left_Punch_Sequence')];
const PUNCH143 = [S(143, 23, 'Punching')];

const isolation = (e: StrikeEvent) => Math.min(0.4, e.restBefore) + Math.min(0.4, e.restAfter);

/** straight punch: extended elbow, big extension change, fast, little vertical travel */
function straight(e: StrikeEvent): number | null {
  if (e.flex > 35 || e.ext < 0.92 || e.ext - e.ext0 < 0.35 || e.fwd < 0.4) return null;
  return e.vel / 3 + (e.ext - e.ext0) - e.flex / 60 - Math.abs(e.rise) / 2 + isolation(e) - Math.abs(e.impact - e.start - 18) / 40;
}

const SPECS: ClipSpec[] = [
  {
    id: 'jab', label: 'Jab (lead straight)', limb: 'aB', kind: 'punch', role: 'lead',
    sources: [...BOXING, ...PUNCH144, ...PUNCH143],
    score: (e) => { const s = straight(e); return s === null ? null : s + (e.impact - e.start < 22 ? 0.5 : 0) - Math.max(0, e.hipFwd) ; },
    pad: [0.05, 0.05], maxDur: 0.7,
  },
  {
    id: 'cross', label: 'Cross (rear straight)', limb: 'aF', kind: 'punch', role: 'rear',
    sources: [...BOXING, ...PUNCH144, ...PUNCH143],
    score: straight,
    pad: [0.05, 0.05], maxDur: 0.8,
  },
  {
    id: 'lead_hook', label: 'Lead hook', limb: 'aB', kind: 'punch', role: 'lead',
    sources: [...BOXING, ...PUNCH143, ...PUNCH144],
    score: (e) => {
      if (e.flex < 60 || e.flex > 130 || e.sweep < 35 || e.wristH < -0.35 || e.ext < 0.55) return null;
      return e.sweep / 40 - Math.abs(e.wristH) * 2 - Math.abs(e.flex - 90) / 60 + e.vel / 4 + isolation(e);
    },
    pad: [0.05, 0.05], maxDur: 0.8,
  },
  {
    id: 'rear_uppercut', label: 'Rear uppercut', limb: 'aF', kind: 'rise', role: 'rear',
    sources: [...BOXING, ...PUNCH143, ...PUNCH144],
    score: (e) => {
      if (e.flex < 50 || e.flex > 130 || e.rise < 0.5 || e.elbowH > 0.15 || e.wristH < -0.2) return null;
      return e.rise * 1.5 + e.vel / 6 - Math.abs(e.flex - 85) / 60 - Math.abs(e.fwd) / 2 + isolation(e) - Math.max(0, e.elbowH) * 2;
    },
    pad: [0.05, 0.05], maxDur: 0.8,
  },
  {
    id: 'overhand', label: 'Overhand (rear power punch)', limb: 'aF', kind: 'punch', role: 'rear',
    sources: [...BOXING, ...PUNCH143, ...PUNCH144],
    score: (e) => {
      if (e.flex > 28 || e.ext < 0.92 || e.fwd < 0.5) return null;
      return e.hipFwd * 4 + (e.maxH - e.wristH) * 3 + Math.max(0, e.maxH) + e.vel / 6 + isolation(e) * 0.5;
    },
    pad: [0.1, 0.08], maxDur: 0.95,
  },
  {
    id: 'lunge_punch', label: 'Lunge punch (oi-zuki)', limb: 'aF', kind: 'punch', role: 'any',
    sources: [KARATE.oizuki],
    score: (e) => (e.ext < 0.9 || e.hipFwd < 0.4 ? null : e.hipFwd + e.ext - e.ext0 - e.start / 5000),
    pad: [0.08, 0.1], maxDur: 0.95,
  },
  {
    id: 'front_kick', label: 'Front kick (mae-geri)', limb: 'hF', kind: 'kick', role: 'any',
    sources: [KARATE.front],
    score: (e) => (e.ext < 1.3 ? null : e.ext + e.vel / 10 + isolation(e)),
    pad: [0.05, 0.08], maxDur: 1.0,
  },
  {
    id: 'roundhouse', label: 'Roundhouse kick (mawashi-geri)', limb: 'hF', kind: 'kick', role: 'any',
    sources: [KARATE.mawashi],
    score: (e) => (e.ext < 1.3 ? null : e.ext + e.vel / 10 + isolation(e)),
    pad: [0.05, 0.08], maxDur: 1.0,
  },
  {
    id: 'side_kick', label: 'Side kick (yoko-geri)', limb: 'hF', kind: 'kick', role: 'any',
    sources: [KARATE.yoko],
    score: (e) => (e.ext < 1.3 ? null : e.ext + e.vel / 10 + isolation(e)),
    pad: [0.05, 0.08], maxDur: 1.0,
  },
  {
    id: 'knee', label: 'Knee strike', limb: 'hF', kind: 'knee', role: 'any',
    sources: [S(86, 6, 'knee kicking')],
    score: (e) => (e.ext < 1.2 ? null : e.ext + e.vel / 10 + isolation(e)),
    pad: [0.05, 0.08], maxDur: 0.9,
  },
  {
    id: 'flying_kick', label: 'Flying (jump) kick', limb: 'hF', kind: 'kick', role: 'any',
    sources: [S(75, 16, 'jump kick')],
    score: (e) => (e.ext < 1.0 ? null : e.ext + e.vel / 10),
    pad: [0.35, 0.3], maxDur: 1.4,
  },
  {
    id: 'block_high', label: 'High block', limb: 'aF', kind: 'rise', role: 'any',
    sources: [S(144, 26, 'Right_Blocks'), S(144, 27, 'Right_Blocks')],
    score: (e) => (e.wristH < 0.15 ? null : e.wristH + e.rise + e.vel / 10 + isolation(e)),
    pad: [0.05, 0.1], maxDur: 0.9,
  },
  {
    id: 'block_low', label: 'Low block (gedan-barai)', limb: 'aF', kind: 'punch', role: 'any',
    sources: [KARATE.gedan],
    score: (e) => (e.ext < 0.85 || e.wristH > -0.3 ? null : -e.wristH + e.ext - e.ext0 + isolation(e)),
    pad: [0.05, 0.1], maxDur: 0.9,
  },
];

// ---------------------------------------------------------------------------

const limbSide = (l: Limb): Side => (l === 'aF' || l === 'hF' ? 'R' : 'L');
const isArm = (l: Limb) => l[0] === 'a';

/** Lead side at a frame: the foot further forward along `dir`. */
function leadSide(fr: Record<string, V3>, dir: V3): Side {
  const r = fr[J.ankleR][0] * dir[0] + fr[J.ankleR][2] * dir[2];
  const l = fr[J.ankleL][0] * dir[0] + fr[J.ankleL][2] * dir[2];
  return r > l ? 'R' : 'L';
}

/** Horizontal strike direction: effector at impact relative to the mid-hip (fallback: body facing). */
function strikeDir(tr: Trial, e: StrikeEvent): V3 {
  const fi = tr.frames[e.impact];
  const arm = e.kind === 'punch' || e.kind === 'rise';
  const eff = arm ? (e.side === 'R' ? J.wristR : J.wristL) : e.kind === 'knee' ? (e.side === 'R' ? J.kneeR : J.kneeL) : e.side === 'R' ? J.ankleR : J.ankleL;
  const hip = mid(fi[J.hipR], fi[J.hipL]);
  const d = sub(fi[eff], hip);
  const h = Math.hypot(d[0], d[2]);
  const f0 = tr.frames[e.start];
  // body facing at onset (hips + shoulders)
  const lr = sub(f0[J.hipL], f0[J.hipR]), sh = sub(f0[J.shoulderL], f0[J.shoulderR]);
  const v: V3 = [lr[0] + sh[0], 0, lr[2] + sh[2]];
  const face = horizontal([-v[2], 0, v[0]]);
  if (h < 0.25 * legLength(tr.asf)) return face;
  const dir = horizontal(d);
  // keep it in the body's front half-space
  return dir[0] * face[0] + dir[2] * face[2] < 0 ? face : dir;
}

interface Candidate { spec: ClipSpec; src: Source; tr: Trial; e: StrikeEvent; score: number; mirrored: boolean }

function candidates(spec: ClipSpec): Candidate[] {
  const out: Candidate[] = [];
  for (const src of spec.sources) {
    const tr = loadTrial(src.subject, src.trial);
    for (const side of ['R', 'L'] as Side[]) {
      for (const e of strikeEvents(tr, side, spec.kind)) {
        const dir = strikeDir(tr, e);
        const lead = leadSide(tr.frames[e.start], dir);
        if (spec.role === 'lead' && side !== lead) continue;
        if (spec.role === 'rear' && side === lead) continue;
        if (spec.pin && !(spec.pin.subject === src.subject && spec.pin.trial === src.trial && Math.abs(spec.pin.impact - e.impact) <= 6)) continue;
        const sc = spec.score(e, { tr, lead });
        if (sc === null) continue;
        const mirrored = side !== limbSide(spec.limb);
        // prefer the natural side when scores are close (no mirroring artefacts)
        out.push({ spec, src, tr, e, score: sc + (mirrored ? 0 : 0.3), mirrored });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Floor ankle height: a low percentile of the lower ankle over the trial. */
function floorAnkle(tr: Trial): number {
  const ys = tr.frames.map((f) => Math.min(f[J.ankleR][1], f[J.ankleL][1])).sort((a, b) => a - b);
  return ys[Math.floor(ys.length * 0.05)];
}

export interface BuiltClip {
  id: string;
  label: string;
  source: { subject: number; trial: number; motion: string; frames: [number, number]; fps: number };
  fps: 60;
  length: number;
  contact: number;
  limb: Limb;
  mirrored: boolean;
  tracks: Tracks;
  raw: { eMin: number; eMax: number; kMin: number; kMax: number };
}

function finish(t: Tracks, srcFps: number): Tracks {
  const f = {} as Tracks;
  for (const k of TRACKS) f[k] = filter3(t[k]);
  return resample(f, srcFps, 60);
}

function buildStrike(c: Candidate): BuiltClip {
  const { spec, tr, e } = c;
  const [padA, padB] = spec.pad ?? [0.05, 0.08];
  const a = Math.max(0, e.start - Math.round(padA * tr.fps));
  let b = Math.min(tr.frames.length - 1, e.end + Math.round(padB * tr.fps));
  const maxN = Math.round((spec.maxDur ?? 1) * tr.fps);
  if (b - a > maxN) {
    // keep the lead-in, trim the tail but never before impact + 0.15 s
    b = Math.max(e.impact + Math.round(0.15 * tr.fps), a + maxN);
  }
  const frames = tr.frames.slice(a, b + 1);
  const scale = RIG_LEG / legLength(tr.asf);
  let tracks = retarget(frames, { forward: strikeDir(tr, e), scale, floorAnkleY: floorAnkle(tr) });
  tracks = finish(tracks, tr.fps);
  if (c.mirrored) tracks = mirrorTracks(tracks);
  const length = tracks.torso.length;
  const contact = Math.min(length - 1, Math.round(((e.impact - a) * 60) / tr.fps));
  return pack(spec.id, spec.label, c.src, [a, b], tr.fps, contact, spec.limb, c.mirrored, tracks);
}

function pack(id: string, label: string, src: Source, frames: [number, number], fps: number, contact: number, limb: Limb, mirrored: boolean, tracks: Tracks): BuiltClip {
  const all = (ks: (keyof Tracks)[]) => ks.flatMap((k) => tracks[k]);
  const e = all(['eF', 'eB']), k = all(['kF', 'kB']);
  return {
    id, label,
    // AMC frame numbers are 1-based
    source: { subject: src.subject, trial: src.trial, motion: src.motion, frames: [frames[0] + 1, frames[1] + 1], fps },
    fps: 60, length: tracks.torso.length, contact, limb, mirrored, tracks,
    raw: { eMin: Math.min(...e), eMax: Math.max(...e), kMin: Math.min(...k), kMax: Math.max(...k) },
  };
}

/** Guard idle: the calmest 1.5 s of a boxing trial with both hands up, looped by cross-fading the ends. */
function buildGuardIdle(): BuiltClip | null {
  const srcs = BOXING;
  let best: { src: Source; tr: Trial; a: number; cost: number } | null = null;
  for (const src of srcs) {
    const tr = loadTrial(src.subject, src.trial);
    const n = Math.round(1.5 * tr.fps);
    const F = tr.frames;
    const joints = [J.wristR, J.wristL, J.elbowR, J.elbowL, J.ankleR, J.ankleL, J.head];
    const motion = F.map((fr, i) => {
      if (i === 0) return 0;
      const h0 = mid(F[i - 1][J.hipR], F[i - 1][J.hipL]), h1 = mid(fr[J.hipR], fr[J.hipL]);
      let s = len(sub(h1, h0)) * 2;
      for (const j of joints) s += len(sub(sub(fr[j], h1), sub(F[i - 1][j], h0)));
      return s;
    });
    const guard = F.map((fr) => {
      const shY = (fr[J.shoulderR][1] + fr[J.shoulderL][1]) / 2;
      const A = len(sub(fr[J.elbowR], fr[J.shoulderR])) * 2;
      return fr[J.wristR][1] > shY - 0.45 * A && fr[J.wristL][1] > shY - 0.45 * A ? 1 : 0;
    });
    const cm = [0], cg = [0];
    for (let i = 0; i < F.length; i++) { cm.push(cm[i] + motion[i]); cg.push(cg[i] + guard[i]); }
    for (let a = Math.round(tr.fps); a + n < F.length - tr.fps; a += 4) {
      if (cg[a + n] - cg[a] < n) continue;
      const cost = (cm[a + n] - cm[a]) / n;
      if (!best || cost < best.cost) best = { src, tr, a, cost };
    }
  }
  if (!best) return null;
  const { tr, a, src } = best;
  const n = Math.round(1.5 * tr.fps);
  const frames = tr.frames.slice(a, a + n + 1);
  // forward = body facing at the window start
  const f0 = frames[0];
  const lr = sub(f0[J.hipL], f0[J.hipR]), sh = sub(f0[J.shoulderL], f0[J.shoulderR]);
  const v: V3 = [lr[0] + sh[0], 0, lr[2] + sh[2]];
  const face = horizontal([-v[2], 0, v[0]]);
  // a boxer stands bladed: aim forward at the lead fist
  const hip = mid(f0[J.hipR], f0[J.hipL]);
  const lead = leadSide(f0, face);
  const fist = horizontal(sub(f0[lead === 'R' ? J.wristR : J.wristL], hip));
  const dir = horizontal([face[0] + fist[0], 0, face[2] + fist[2]]);
  let tracks = finish(retarget(frames, { forward: dir, scale: RIG_LEG / legLength(tr.asf), floorAnkleY: floorAnkle(tr) }), tr.fps);
  // root travel is meaningless for a loop
  tracks.rootDx = tracks.rootDx.map(() => 0);
  tracks.rootDy = tracks.rootDy.map(() => 0);
  // loop: blend the last 15 frames towards the first frame
  const L = tracks.torso.length, B = 15;
  for (const k of TRACKS) {
    const t = tracks[k];
    for (let i = 0; i < B; i++) {
      const w = (i + 1) / (B + 1);
      const idx = L - B + i;
      const target = t[0] + (t[1] - t[0]) * (i - B) / B; // extrapolate so the wrap has ~continuous velocity
      t[idx] = t[idx] * (1 - w * w) + target * (w * w);
    }
  }
  // drop the last frame so frame L-1 → frame 0 is a normal step
  for (const k of TRACKS) tracks[k] = tracks[k].slice(0, L - 1);
  const mirrored = lead === 'R'; // orthodox convention: lead (left) = B
  if (mirrored) tracks = mirrorTracks(tracks);
  return pack('guard_idle', 'Boxing guard (idle loop)', src, [a, a + n - 1], tr.fps, 0, 'aF', mirrored, tracks);
}

// ---------------------------------------------------------------------------

const r3 = (v: number) => {
  const x = Math.round(v * 1000) / 1000;
  return Object.is(x, -0) ? 0 : x;
};

function emit(clips: BuiltClip[]): string {
  const lines: string[] = [];
  lines.push('// GENERATED by tools/mocap/build.ts — do not edit');
  lines.push('// Motion data: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with funding from NSF EIA-0196217).');
  lines.push('// Regenerate with: npx tsx tools/mocap/build.ts (see docs/MOCAP.md)');
  lines.push('');
  lines.push("export type MocapTrack = 'torso' | 'neck' | 'aF' | 'eF' | 'aB' | 'eB' | 'hF' | 'kF' | 'hB' | 'kB' | 'drop' | 'rootDx' | 'rootDy';");
  lines.push('export interface MocapClip {');
  lines.push('  id: string;');
  lines.push('  label: string;');
  lines.push('  source: { subject: number; trial: number; motion: string; frames: [number, number]; fps: number };');
  lines.push('  fps: 60;');
  lines.push('  length: number;      // number of frames in every track');
  lines.push('  contact: number;     // 0-based frame index of peak extension');
  lines.push("  limb: 'aF' | 'aB' | 'hF' | 'hB';");
  lines.push('  mirrored: boolean;');
  lines.push('  tracks: Record<MocapTrack, number[]>;');
  lines.push('}');
  lines.push("export const MOCAP_ATTRIBUTION = 'Motion data: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with funding from NSF EIA-0196217).';");
  lines.push('');
  lines.push('export const MOCAP_CLIPS: Record<string, MocapClip> = {');
  for (const c of clips) {
    lines.push(`  ${c.id}: {`);
    lines.push(`    id: ${JSON.stringify(c.id)},`);
    lines.push(`    label: ${JSON.stringify(c.label)},`);
    lines.push(`    source: { subject: ${c.source.subject}, trial: ${c.source.trial}, motion: ${JSON.stringify(c.source.motion)}, frames: [${c.source.frames[0]}, ${c.source.frames[1]}], fps: ${c.source.fps} },`);
    lines.push(`    fps: 60,`);
    lines.push(`    length: ${c.length},`);
    lines.push(`    contact: ${c.contact},`);
    lines.push(`    limb: ${JSON.stringify(c.limb)},`);
    lines.push(`    mirrored: ${c.mirrored},`);
    lines.push('    tracks: {');
    for (const k of TRACKS) lines.push(`      ${k}: [${c.tracks[k].map(r3).join(', ')}],`);
    lines.push('    },');
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

export const OUT_FILE = path.resolve(__dirname, '../../src/game/anim/data/mocap.generated.ts');

async function main() {
  const args = new Set(process.argv.slice(2));
  await downloadAll();
  if (args.has('--candidates')) {
    const only = [...args].find((a) => a.startsWith('--only='))?.slice(7);
    for (const spec of SPECS) {
      if (only && spec.id !== only) continue;
      const cs = candidates(spec);
      console.log(`${spec.id} (${cs.length} candidates)`);
      for (const c of cs.slice(0, 6)) console.log(`  ${c.score.toFixed(2)} ${c.src.subject}_${c.src.trial} ${fmtEvent(c.e, c.tr.fps)}`);
    }
    return;
  }
  const clips: BuiltClip[] = [];
  const missing: string[] = [];
  for (const spec of SPECS) {
    const cs = candidates(spec);
    if (!cs.length) { missing.push(spec.id); continue; }
    const c = cs[0];
    const clip = buildStrike(c);
    clips.push(clip);
  }
  const gi = buildGuardIdle();
  if (gi) clips.splice(0, 0, gi); else missing.push('guard_idle');
  for (const c of clips) {
    const L = c.tracks;
    const ms = (n: number) => Math.round((n * 1000) / 60);
    console.log(`${c.id.padEnd(14)} ${c.source.subject}_${String(c.source.trial).padStart(2, '0')} frames ${c.source.frames[0]}-${c.source.frames[1]} @${c.source.fps} len ${c.length} (${ms(c.length)} ms) contact ${c.contact} (${ms(c.contact)} ms) ${c.mirrored ? 'mirrored' : ''}`);
    const at = c.contact;
    console.log(`    contact: torso ${L.torso[at].toFixed(2)} aF ${L.aF[at].toFixed(2)} eF ${L.eF[at].toFixed(2)} aB ${L.aB[at].toFixed(2)} eB ${L.eB[at].toFixed(2)} hF ${L.hF[at].toFixed(2)} kF ${L.kF[at].toFixed(2)} hB ${L.hB[at].toFixed(2)} kB ${L.kB[at].toFixed(2)} drop ${L.drop[at].toFixed(2)} rootDx ${L.rootDx[L.rootDx.length - 1].toFixed(2)} rootDy[max] ${Math.max(...L.rootDy).toFixed(2)}  raw e ${c.raw.eMin.toFixed(2)}..${c.raw.eMax.toFixed(2)} k ${c.raw.kMin.toFixed(2)}..${c.raw.kMax.toFixed(2)}`);
  }
  if (missing.length) console.log(`MISSING: ${missing.join(', ')}`);
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, emit(clips));
  console.log(`wrote ${path.relative(process.cwd(), OUT_FILE)} (${clips.length} clips)`);
  if (args.has('--preview')) {
    const dir = path.resolve(__dirname, '.cache/preview');
    for (const c of clips) writePreview(dir, c);
    console.log(`previews in ${dir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { SPECS, isArm };
