import type { Pose } from '../render/rig';

/**
 * Animation clip format (INKDOM_v2_Plan.md §3). A clip is a list of keyed (partial) poses on a
 * normalised 0..1 timeline. `contact` is where the strike lands; `release` where the active
 * phase ends. Moves map their frame data onto these marks, so gameplay timing can be tuned
 * without distorting the motion's shape. Mocap clips and authored clips share this format.
 */
export interface ClipKey { t: number; pose: Partial<Pose> }

export interface Clip {
  id: string;
  keys: ClipKey[];
  contact: number;
  release: number;
  /** Where the motion comes from (shown in the move list / docs). */
  source: string;
  loop?: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export const POSE_KEYS: readonly (keyof Pose)[] = ['torso', 'neck', 'aF', 'eF', 'aB', 'eB', 'hF', 'kF', 'hB', 'kB', 'wpn', 'lie', 'drop'];

/** Sample a clip at normalised time t over a base pose (fields a key omits come from `base`). */
export function sampleClip(clip: Clip, t: number, base: Pose): Pose {
  const keys = clip.keys;
  const tt = clip.loop ? t - Math.floor(t) : Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= tt) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t;
  const u = span > 0 ? smooth(Math.max(0, Math.min(1, (tt - a.t) / span))) : 0;
  const out = { ...base };
  for (const k of POSE_KEYS) {
    const va = a.pose[k] ?? base[k];
    const vb = b.pose[k] ?? base[k];
    out[k] = va + (vb - va) * u;
  }
  return out;
}

/** Map a move's frame position onto clip time: startup → [0, contact), active → [contact, release), recovery → [release, 1]. */
export function moveClipTime(frames: { startup: number; active: number; recovery: number }, tick: number, clip: Clip): number {
  const { startup, active, recovery } = frames;
  if (tick < startup) return clip.contact * (tick / Math.max(1, startup));
  if (tick < startup + active) return clip.contact + (clip.release - clip.contact) * ((tick - startup) / Math.max(1, active));
  return clip.release + (1 - clip.release) * Math.min(1, (tick - startup - active) / Math.max(1, recovery));
}

/** Helper for authored strikes: rest → wind-up → contact (held) → rest. */
export function strike(id: string, wind: Partial<Pose>, contact: Partial<Pose>, opts: { windT?: number; contactT?: number; releaseT?: number; source?: string; extra?: ClipKey[] } = {}): Clip {
  const windT = opts.windT ?? 0.22;
  const contactT = opts.contactT ?? 0.45;
  const releaseT = opts.releaseT ?? 0.56;
  const keys: ClipKey[] = [{ t: 0, pose: {} }, { t: windT, pose: wind }, ...(opts.extra ?? []), { t: contactT, pose: contact }, { t: releaseT, pose: contact }, { t: 1, pose: {} }];
  keys.sort((x, y) => x.t - y.t);
  return { id, keys, contact: contactT, release: releaseT, source: opts.source ?? 'authored' };
}
