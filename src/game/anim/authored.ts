import type { Pose } from '../render/rig';
import { strike, type Clip } from './clips';

/**
 * Hand-authored clips: the fallback for every move (used when no mocap clip exists) and the
 * source for techniques missing from the mocap database. Angles follow render/rig.ts:
 * arms/legs absolute from straight down (+ = forward), torso from straight up (+ = lean
 * forward), F limbs = right side (rear hand in orthodox stance), B limbs = left (lead).
 */

/** Unarmed fighting stance (orthodox guard): lead (B) hand forward, rear (F) hand at the chin. */
export const GUARD: Pose = {
  torso: 0.12, neck: -0.08, aF: 0.55, eF: 2.15, aB: 0.85, eB: 1.75, hF: 0.28, kF: 0.3, hB: -0.22, kB: 0.22, wpn: -1.1, lie: 0, drop: 0.05,
};
/** Armed stance (weapon in the F hand). */
export const ARMED_IDLE: Pose = {
  torso: 0.05, neck: 0, aF: 0.35, eF: 0.9, aB: -0.15, eB: 0.5, hF: 0.12, kF: 0.12, hB: -0.12, kB: 0.12, wpn: -1.1, lie: 0, drop: 0,
};
export const CROUCH: Partial<Pose> = { drop: 0.42, torso: 0.3, hF: 0.85, kF: 1.75, hB: -0.25, kB: 1.4, aF: 0.6, eF: 2.1, aB: 0.95, eB: 1.8 };
export const BLOCK_HIGH: Partial<Pose> = { aF: 1.3, eF: 1.9, aB: 1.1, eB: 2.0, torso: -0.05, drop: 0.08, hF: 0.25, kF: 0.5, hB: -0.25, kB: 0.5, wpn: -1.6 };
export const BLOCK_LOW: Partial<Pose> = { ...CROUCH, aF: 1.0, eF: 1.1, aB: 0.8, eB: 1.2, torso: 0.15 };
export const DODGE: Partial<Pose> = { torso: -0.35, neck: 0.1, hF: 0.55, kF: 0.4, hB: -0.45, kB: 0.6, aF: 0.9, eF: 1.9, aB: 1.1, eB: 1.7, drop: 0.12 };
export const HIT_HIGH: Partial<Pose> = { torso: -0.4, neck: -0.45, aF: -0.5, eF: 0.6, aB: 0.9, eB: 0.4, hF: 0.3, kF: 0.4, hB: -0.3, kB: 0.3 };
export const HIT_MID: Partial<Pose> = { torso: 0.5, neck: 0.3, aF: 0.4, eF: 1.6, aB: 0.6, eB: 1.8, hF: 0.35, kF: 0.6, hB: -0.25, kB: 0.5, drop: 0.12 };
export const HIT_LOW: Partial<Pose> = { torso: 0.2, neck: 0.1, hF: 0.1, kF: 1.1, hB: -0.3, kB: 0.2, drop: 0.18, aF: 0.9, eF: 0.8, aB: -0.3, eB: 0.6 };
export const LAUNCHED: Partial<Pose> = { torso: -0.7, neck: -0.4, aF: 2.4, eF: 0.5, aB: 2.0, eB: 0.6, hF: 0.6, kF: 1.2, hB: 0.2, kB: 0.9 };
export const GUARDBREAK: Partial<Pose> = { torso: -0.5, neck: -0.2, aF: 2.4, eF: 0.4, aB: 2.6, eB: 0.4, hF: 0.35, kF: 0.6, hB: -0.35, kB: 0.4 };
export const LYING: Partial<Pose> = { torso: 0, aF: 0.9, eF: 0.3, aB: 1.6, eB: 0.2, hF: 0.15, kF: 0.4, hB: -0.1, kB: 0.1, lie: 1, drop: 0 };

const A = 'authored';

export const AUTHORED_CLIPS: Record<string, Clip> = {
  // Boxing
  jab: strike('jab', { aB: 1.0, eB: 1.4, torso: 0.1 }, { aB: 1.66, eB: 0.05, torso: 0.24, neck: -0.12, hF: 0.38, hB: -0.28, drop: 0.08 }, { windT: 0.15, contactT: 0.4, releaseT: 0.5, source: A }),
  cross: strike('cross', { aF: 0.45, eF: 2.25, torso: 0.02 }, { aF: 1.7, eF: 0.05, torso: 0.38, neck: -0.15, aB: 0.6, eB: 2.2, hF: 0.3, kF: 0.4, hB: -0.38, kB: 0.08, drop: 0.1 }, { source: A }),
  lead_hook: strike('lead_hook', { aB: 0.55, eB: 1.95, torso: 0.0 }, { aB: 1.45, eB: 1.25, torso: 0.32, neck: -0.1, drop: 0.12, hF: 0.35, kF: 0.45 }, { source: A }),
  rear_uppercut: strike('rear_uppercut', { aF: 0.25, eF: 1.7, torso: 0.15, drop: 0.2, hF: 0.45, kF: 0.7, hB: -0.3, kB: 0.6 }, { aF: 1.1, eF: 1.55, torso: 0.05, neck: -0.2, drop: 0.0, hF: 0.2, kF: 0.15, hB: -0.2, kB: 0.1 }, { source: A }),
  overhand: strike('overhand', { aF: 0.15, eF: 2.45, torso: -0.12, drop: 0.12, hB: -0.35 }, { aF: 1.78, eF: 0.1, torso: 0.48, neck: -0.1, drop: 0.14, hF: 0.48, kF: 0.55, hB: -0.42, kB: 0.1, aB: 0.5, eB: 2.2 }, { windT: 0.28, source: A }),
  elbow: strike('elbow', { aF: 0.4, eF: 2.5, torso: 0.0 }, { aF: 1.72, eF: 2.45, torso: 0.38, neck: -0.1, drop: 0.08 }, { source: A }),
  spin_backfist: strike('spin_backfist', { aB: -0.6, eB: 0.4, aF: -0.4, eF: 0.6, torso: -0.25, hB: 0.3, hF: -0.2 }, { aB: 1.62, eB: 0.12, torso: 0.22, neck: -0.1, aF: 0.3, eF: 1.8 }, { windT: 0.25, source: A }),
  // Kicks
  front_kick: strike('front_kick', { hF: 1.25, kF: 2.05, torso: -0.08, aF: 0.6, aB: 0.9 }, { hF: 1.48, kF: 0.08, torso: -0.3, neck: 0.1, hB: -0.05, kB: 0.15 }, { source: A }),
  roundhouse: strike('roundhouse', { hF: 1.15, kF: 2.1, torso: -0.22, hB: -0.1 }, { hF: 1.78, kF: 0.15, torso: -0.55, neck: 0.15, hB: -0.08, kB: 0.1, aF: -0.3, eF: 1.0, aB: 0.9, eB: 1.6 }, { source: A }),
  side_kick: strike('side_kick', { hF: 1.4, kF: 2.35, torso: -0.35 }, { hF: 1.62, kF: 0.0, torso: -0.78, neck: 0.3, hB: 0.05, kB: 0.1, aF: -0.5, eF: 1.2, aB: 1.2, eB: 1.4 }, { source: A }),
  low_kick: strike('low_kick', { hF: 0.7, kF: 1.25, torso: -0.08 }, { hF: 0.98, kF: 0.12, torso: -0.28, aF: 0.3, eF: 1.9, aB: -0.2, eB: 0.8 }, { source: A }),
  knee: strike('knee', { hF: 0.6, kF: 1.6, aF: 1.5, eF: 1.9, aB: 1.5, eB: 1.9 }, { hF: 1.65, kF: 2.4, torso: -0.18, aF: 1.25, eF: 1.3, aB: 1.25, eB: 1.3, hB: -0.1, kB: 0.05 }, { source: A }),
  back_kick: strike('back_kick', { hF: 0.9, kF: 2.3, torso: -0.5, neck: 0.4, aF: -0.6, aB: 1.3 }, { hF: 1.6, kF: 0.02, torso: -1.05, neck: 0.55, hB: 0.1, kB: 0.15, aF: -0.9, eF: 0.8, aB: 1.4, eB: 1.5 }, { source: A }),
  lunge_punch: strike('lunge_punch', { aF: 0.4, eF: 2.0, hF: 0.45, kF: 0.6, torso: 0.1 }, { aF: 1.64, eF: 0.0, torso: 0.3, hF: 0.68, kF: 0.75, hB: -0.58, kB: 0.08, drop: 0.2, aB: 0.2, eB: 2.0 }, { windT: 0.3, source: A }),
  crouch_uppercut: strike('crouch_uppercut', { ...CROUCH, aF: 0.3, eF: 1.8 }, { drop: 0.1, aF: 1.15, eF: 1.45, torso: 0.05, neck: -0.2, hF: 0.4, kF: 0.6, hB: -0.2, kB: 0.4 }, { windT: 0.15, source: A }),
  sweep: strike('sweep', { drop: 0.45, hB: 0.4, kB: 2.2, hF: 0.4, kF: 2.0, torso: 0.5, aF: 1.0, eF: 0.3 }, { drop: 0.5, hF: 1.55, kF: 0.05, hB: 0.6, kB: 2.4, torso: 0.62, aF: 0.95, eF: 0.2, aB: 1.15, eB: 0.3 }, { windT: 0.2, source: A }),
  axe_kick: strike('axe_kick', { hF: 2.55, kF: 0.3, torso: -0.35, neck: 0.2 }, { hF: 1.0, kF: 0.05, torso: 0.12 }, { windT: 0.3, contactT: 0.5, releaseT: 0.6, source: A }),
  tornado_kick: strike('tornado_kick', { hB: -0.8, kB: 1.2, torso: -0.4, drop: 0.18 }, { hF: 1.8, kF: 0.05, torso: -0.7, hB: 0.3, kB: 1.6, drop: -0.3 }, { windT: 0.2, source: A, extra: [{ t: 0.33, pose: { hF: 2.0, kF: 1.5, torso: -0.6, drop: -0.2 } }] }),
  dive_punch: strike('dive_punch', { aF: 0.6, eF: 2.0, hF: 0.6, kF: 1.4 }, { aF: 1.95, eF: 0.1, torso: 0.4, hF: 0.6, kF: 1.4, hB: -0.2, kB: 1.0 }, { windT: 0.2, source: A }),
  flying_kick: strike('flying_kick', { hF: 1.0, kF: 2.0, hB: 0.2, kB: 2.2 }, { hF: 1.42, kF: 0.05, hB: 0.25, kB: 2.4, torso: -0.3, aF: -0.4, aB: 1.6, eB: 1.2 }, { windT: 0.2, source: A }),
  // Weapons
  sword_slash: strike('sword_slash', { aF: -0.7, eF: 1.0, torso: -0.1, wpn: 0.2 }, { aF: 1.65, eF: 0.05, torso: 0.3, hF: 0.45, kF: 0.4, wpn: 0 }, { source: A }),
  sword_backslash: strike('sword_backslash', { aF: 2.4, eF: 0.3, wpn: 0.4, torso: 0.1 }, { aF: 0.9, eF: 0.2, torso: 0.25, wpn: -0.3, hF: 0.4, kF: 0.4 }, { source: A }),
  sword_thrust: strike('sword_thrust', { aF: 0.6, eF: 2.0, wpn: -0.9, torso: -0.1 }, { aF: 1.6, eF: 0.0, wpn: 0, torso: 0.42, hF: 0.62, kF: 0.6, hB: -0.5, kB: 0.1, drop: 0.16 }, { source: A }),
  bar_smash: strike('bar_smash', { aF: 3.5, eF: 0.3, aB: 3.3, eB: 0.5, torso: -0.15, wpn: 0 }, { aF: 1.0, eF: 0.1, aB: 0.9, eB: 0.2, torso: 0.35, hF: 0.45, kF: 0.5, wpn: 0 }, { windT: 0.3, source: A }),
  bar_sweep: strike('bar_sweep', { aF: 0.2, eF: 0.2, aB: 0.1, eB: 0.3, torso: 0.1, wpn: 0.2, drop: 0.2 }, { aF: 1.0, eF: 0.3, aB: 0.9, eB: 0.3, torso: 0.62, wpn: 0.9, drop: 0.36, hF: 0.8, kF: 1.4 }, { source: A }),
  // Stances (loops)
  guard_idle: { id: 'guard_idle', source: A, contact: 0, release: 0, loop: true, keys: [
    { t: 0, pose: {} }, { t: 0.5, pose: { drop: 0.09, torso: 0.15, aB: 0.9, aF: 0.58 } }, { t: 1, pose: {} },
  ] },
  block_high: { id: 'block_high', source: A, contact: 0, release: 0, keys: [{ t: 0, pose: BLOCK_HIGH }, { t: 1, pose: BLOCK_HIGH }] },
  block_low: { id: 'block_low', source: A, contact: 0, release: 0, keys: [{ t: 0, pose: BLOCK_LOW }, { t: 1, pose: BLOCK_LOW }] },
};
