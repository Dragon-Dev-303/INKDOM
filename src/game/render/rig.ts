import { ATTACKS } from '../config/tuning';
import type { Fighter } from '../sim/types';

/**
 * Forward-kinematics stickman rig (plan §4.10.1, §4.11).
 * Limb positions are derived from joint angles, so limbs can never detach.
 * Angles: limbs measured from straight down, positive = forward (+x, facing right).
 * Poses are computed from simulation state only (`action`, `actionTick`, `stride`).
 */

export const BONES = {
  thigh: 0.42,
  shin: 0.42,
  torso: 0.55,
  neck: 0.08,
  headR: 0.18,
  upperArm: 0.3,
  forearm: 0.28,
} as const;

export const JOINT_LIMITS = { elbow: [0, 2.62], knee: [0, 2.62] } as const; // 0–150°

export interface Pose {
  torso: number; neck: number;
  aF: number; eF: number; aB: number; eB: number;
  hF: number; kF: number; hB: number; kB: number;
  wpn: number; lie: number; drop: number;
}

export interface Vec { x: number; y: number }
export interface Joints {
  hip: Vec; shoulder: Vec; neckTop: Vec; head: Vec;
  elbowF: Vec; handF: Vec; elbowB: Vec; handB: Vec;
  kneeF: Vec; footF: Vec; kneeB: Vec; footB: Vec;
  weaponTip: Vec; weaponAngle: number;
}

const IDLE: Pose = { torso: 0.05, neck: 0, aF: 0.35, eF: 0.9, aB: -0.15, eB: 0.5, hF: 0.12, kF: 0.12, hB: -0.12, kB: 0.12, wpn: -1.1, lie: 0, drop: 0 };

const P = (over: Partial<Pose>): Pose => ({ ...IDLE, ...over });

const ATTACK_POSES = {
  PUNCH: { wind: P({ aF: -0.4, eF: 2.3, torso: -0.05, aB: 0.6, eB: 1.8 }), ext: P({ aF: 1.55, eF: 0.05, torso: 0.25, aB: -0.4, eB: 1.6 }) },
  KICK: {
    wind: P({ hF: 1.2, kF: 1.9, torso: -0.15, aF: 0.8, aB: -0.6 }),
    ext: P({ hF: 1.55, kF: 0.05, torso: -0.3, hB: -0.05, kB: 0.1, aF: 0.6, aB: -0.9 }),
  },
  IRON_BAR: {
    wind: P({ aF: 3.5, eF: 0.3, aB: 3.3, eB: 0.5, torso: -0.15, wpn: 0 }),
    ext: P({ aF: 1.0, eF: 0.1, aB: 0.9, eB: 0.2, torso: 0.35, hF: 0.45, kF: 0.5, wpn: 0 }),
  },
  SHORT_SWORD: {
    wind: P({ aF: -0.7, eF: 1.0, torso: -0.1, wpn: 0.2 }),
    ext: P({ aF: 1.65, eF: 0.05, torso: 0.3, hF: 0.45, kF: 0.4, wpn: 0 }),
  },
} as const;

const BLOCK = P({ aF: 1.3, eF: 1.9, aB: 1.1, eB: 2.0, torso: -0.05, drop: 0.08, hF: 0.25, kF: 0.5, hB: -0.25, kB: 0.5, wpn: -1.6 });
const HIT = P({ torso: -0.4, neck: -0.3, aF: -0.6, eF: 0.6, aB: 0.9, eB: 0.4, hF: 0.3, kF: 0.4, hB: -0.3, kB: 0.3 });
const GUARDBREAK = P({ torso: -0.5, neck: -0.2, aF: 2.4, eF: 0.4, aB: 2.6, eB: 0.4, hF: 0.35, kF: 0.6, hB: -0.35, kB: 0.4 });
const LYING = P({ torso: 0, aF: 0.9, eF: 0.3, aB: 1.6, eB: 0.2, hF: 0.15, kF: 0.4, hB: -0.1, kB: 0.1, lie: 1 });

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}

function runPose(stride: number, cycleLen: number, lean: number): Pose {
  const p = (stride / cycleLen) * Math.PI * 2;
  const s = Math.sin(p);
  return P({
    torso: lean,
    hF: 0.55 * s, kF: 0.2 + 0.9 * Math.max(0, Math.cos(p)),
    hB: -0.55 * s, kB: 0.2 + 0.9 * Math.max(0, -Math.cos(p)),
    aF: -0.6 * s + 0.2, eF: 1.2, aB: 0.6 * s - 0.1, eB: 1.2,
  });
}

/** Pose for a fighter at the current simulation tick. */
export function poseFor(f: Fighter, tick: number): Pose {
  const t = f.actionTick;
  switch (f.action) {
    case 'DEAD': return mixPose(HIT, LYING, ease(t / 20));
    case 'KNOCKDOWN': return mixPose(HIT, LYING, ease(t / 10));
    case 'GETUP': return mixPose(LYING, IDLE, ease(t / Math.max(1, f.actionDuration)));
    case 'HITSTUN': return mixPose(HIT, IDLE, ease((t - f.actionDuration * 0.5) / (f.actionDuration * 0.5)));
    case 'BLOCKSTUN': return mixPose(BLOCK, P({ ...BLOCK, torso: -0.2 }), 0.6);
    case 'GUARDBREAK': return GUARDBREAK;
    case 'BLOCK': return mixPose(IDLE, BLOCK, ease(t / 3));
    case 'ATTACK': {
      if (!f.attackId) break;
      const def = ATTACKS[f.attackId];
      const poses = ATTACK_POSES[f.attackId];
      let pose: Pose;
      if (t < def.startup) pose = mixPose(IDLE, poses.wind, ease(t / def.startup));
      else if (t < def.startup + def.active) pose = mixPose(poses.wind, poses.ext, ease((t - def.startup + 1) / 2));
      else pose = mixPose(poses.ext, IDLE, ease((t - def.startup - def.active) / def.recovery));
      if (f.mode === 'AIR' && f.attackId !== 'KICK') pose = { ...pose, hF: 0.7, kF: 1.2, hB: -0.1, kB: 0.6 };
      return pose;
    }
    default: break;
  }
  if (f.mode === 'LADDER') {
    const p = (f.stride / 0.8) * Math.PI * 2;
    const s = Math.sin(p);
    return P({ torso: 0, aF: 2.7 + 0.25 * s, eF: 0.6, aB: 2.7 - 0.25 * s, eB: 0.6, hF: 0.9 + 0.3 * s, kF: 1.4, hB: 0.9 - 0.3 * s, kB: 1.4, wpn: 0.8 });
  }
  if (f.mode === 'AIR') {
    return f.vel.y > 0
      ? P({ hF: 0.7, kF: 1.3, hB: -0.1, kB: 0.5, aF: 2.2, eF: 0.4, aB: 2.0, eB: 0.4 })
      : P({ hF: 0.3, kF: 0.3, hB: -0.2, kB: 0.2, aF: 2.4, eF: 0.3, aB: 2.2, eB: 0.3 });
  }
  if (f.mode === 'STAIR') {
    if (Math.abs(f.vel.x) > 0.1) return runPose(f.stride, 1.2, 0.15);
    return IDLE;
  }
  if (Math.abs(f.vel.x) > 0.3) return runPose(f.stride, 1.6, 0.2);
  // Idle breathing.
  const b = Math.sin((tick / 72) * Math.PI * 2) * 0.03;
  return P({ torso: 0.05 + b, aF: 0.35 + b, aB: -0.15 - b });
}

const limb = (from: Vec, len: number, ang: number): Vec => ({ x: from.x + len * Math.sin(ang), y: from.y - len * Math.cos(ang) });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Solve joint positions in local space (facing +x, feet near y=0).
 * `grounded` shifts the figure so the lowest foot touches the ground.
 */
export function solveRig(pose: Pose, scale: number, grounded: boolean, weaponLen: number): Joints {
  const s = scale;
  const eF = clamp(pose.eF, JOINT_LIMITS.elbow[0], JOINT_LIMITS.elbow[1]);
  const eB = clamp(pose.eB, JOINT_LIMITS.elbow[0], JOINT_LIMITS.elbow[1]);
  const kF = clamp(pose.kF, JOINT_LIMITS.knee[0], JOINT_LIMITS.knee[1]);
  const kB = clamp(pose.kB, JOINT_LIMITS.knee[0], JOINT_LIMITS.knee[1]);

  const hip: Vec = { x: 0, y: (BONES.thigh + BONES.shin - pose.drop) * s };
  const shoulder: Vec = { x: hip.x + BONES.torso * s * Math.sin(pose.torso), y: hip.y + BONES.torso * s * Math.cos(pose.torso) };
  const na = pose.torso + pose.neck;
  const neckTop: Vec = { x: shoulder.x + BONES.neck * s * Math.sin(na), y: shoulder.y + BONES.neck * s * Math.cos(na) };
  const head: Vec = { x: neckTop.x + BONES.headR * s * Math.sin(na), y: neckTop.y + BONES.headR * s * Math.cos(na) };

  const elbowF = limb(shoulder, BONES.upperArm * s, pose.aF);
  const handF = limb(elbowF, BONES.forearm * s, pose.aF + eF);
  const elbowB = limb(shoulder, BONES.upperArm * s, pose.aB);
  const handB = limb(elbowB, BONES.forearm * s, pose.aB + eB);
  const kneeF = limb(hip, BONES.thigh * s, pose.hF);
  const footF = limb(kneeF, BONES.shin * s, pose.hF - kF);
  const kneeB = limb(hip, BONES.thigh * s, pose.hB);
  const footB = limb(kneeB, BONES.shin * s, pose.hB - kB);
  const weaponAngle = pose.aF + eF + pose.wpn;
  const weaponTip = limb(handF, weaponLen * s, weaponAngle);

  let j: Joints = { hip, shoulder, neckTop, head, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB, weaponTip, weaponAngle };

  if (pose.lie > 0) {
    // Fall backwards: rotate around the feet (counter-clockwise in local space).
    const th = (pose.lie * Math.PI) / 2;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const rot = (p: Vec): Vec => ({ x: p.x * c - p.y * sn, y: p.x * sn + p.y * c });
    j = mapJoints(j, rot);
    j.weaponAngle += th;
  }
  if (grounded || pose.lie > 0) {
    const pts = pose.lie > 0 ? allPoints(j) : [j.footF, j.footB];
    let minY = Math.min(...pts.map((p) => p.y));
    if (pose.lie > 0) minY -= 0.05 * s;
    j = mapJoints(j, (p) => ({ x: p.x, y: p.y - minY }));
  }
  return j;
}

function allPoints(j: Joints): Vec[] {
  return [j.hip, j.shoulder, j.neckTop, { x: j.head.x, y: j.head.y - BONES.headR }, j.elbowF, j.handF, j.elbowB, j.handB, j.kneeF, j.footF, j.kneeB, j.footB];
}

function mapJoints(j: Joints, fn: (p: Vec) => Vec): Joints {
  return {
    hip: fn(j.hip), shoulder: fn(j.shoulder), neckTop: fn(j.neckTop), head: fn(j.head),
    elbowF: fn(j.elbowF), handF: fn(j.handF), elbowB: fn(j.elbowB), handB: fn(j.handB),
    kneeF: fn(j.kneeF), footF: fn(j.footF), kneeB: fn(j.kneeB), footB: fn(j.footB),
    weaponTip: fn(j.weaponTip), weaponAngle: j.weaponAngle,
  };
}

export const WEAPON_LENGTH = { IRON_BAR: 0.9, SHORT_SWORD: 0.75 } as const;

/** All pose clips used by the game — exercised by the rig sanity test. */
export const ALL_STATIC_POSES: Record<string, Pose> = {
  IDLE, BLOCK, HIT, GUARDBREAK, LYING,
  PUNCH_WIND: ATTACK_POSES.PUNCH.wind, PUNCH_EXT: ATTACK_POSES.PUNCH.ext,
  KICK_WIND: ATTACK_POSES.KICK.wind, KICK_EXT: ATTACK_POSES.KICK.ext,
  BAR_WIND: ATTACK_POSES.IRON_BAR.wind, BAR_EXT: ATTACK_POSES.IRON_BAR.ext,
  SWORD_WIND: ATTACK_POSES.SHORT_SWORD.wind, SWORD_EXT: ATTACK_POSES.SHORT_SWORD.ext,
};
