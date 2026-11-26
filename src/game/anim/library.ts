import type { Pose } from '../render/rig';
import { AUTHORED_CLIPS } from './authored';
import { POSE_KEYS, type Clip, type ClipKey } from './clips';
import { MOCAP_ATTRIBUTION, MOCAP_CLIPS, type MocapClip } from './data/mocap.generated';

/**
 * Clip library: motion-capture clips first (tools/mocap → data/mocap.generated.ts), then the
 * authored fallback. Swapping or adding motion is a data change only.
 */
const cache = new Map<string, Clip>();

/** Mocap tracks → clip keys (every 2nd frame is plenty at 60 fps; contact frame always kept). */
function fromMocap(m: MocapClip): Clip {
  const keys: ClipKey[] = [];
  const last = m.length - 1;
  for (let i = 0; i <= last; i++) {
    if (i % 2 !== 0 && i !== last && i !== m.contact) continue;
    const pose: Partial<Pose> = {};
    for (const k of POSE_KEYS) {
      const track = (m.tracks as Record<string, number[] | undefined>)[k];
      if (track && Number.isFinite(track[i])) pose[k] = track[i];
    }
    keys.push({ t: last > 0 ? i / last : 0, pose });
  }
  const contact = last > 0 ? m.contact / last : 0;
  // Active phase ≈ 3 source frames around the peak.
  const release = Math.min(1, contact + 3 / Math.max(1, last));
  return { id: m.id, keys, contact, release, source: `CMU mocap subject ${m.source.subject} trial ${m.source.trial} (${m.source.motion})`, loop: m.id.endsWith('_idle') };
}

export function getClip(id: string): Clip | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const mocap = MOCAP_CLIPS[id];
  const clip = mocap ? fromMocap(mocap) : AUTHORED_CLIPS[id] ?? null;
  if (clip) cache.set(id, clip);
  return clip;
}

export const hasMocap = (id: string) => Boolean(MOCAP_CLIPS[id]);
export const mocapClipIds = () => Object.keys(MOCAP_CLIPS);
export const allClipIds = () => [...new Set([...Object.keys(AUTHORED_CLIPS), ...Object.keys(MOCAP_CLIPS)])];
export { MOCAP_ATTRIBUTION };
