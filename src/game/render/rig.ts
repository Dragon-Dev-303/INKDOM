import { ARMED_IDLE, BLOCK_HIGH, BLOCK_LOW, CROUCH, DODGE, GUARD, GUARDBREAK, HIT_HIGH, HIT_LOW, HIT_MID, LAUNCHED, LYING } from '../anim/authored';
import { moveClipTime, sampleClip } from '../anim/clips';
import { allClipIds, getClip } from '../anim/library';
import { getMove } from '../combat/moves';
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

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}

/** Base stance: boxing guard when unarmed, weapon stance when armed. */
export const baseStance = (f: Pick<Fighter, 'weapon'>): Pose => (f.weapon === 'FISTS' ? GUARD : ARMED_IDLE);
const over = (base: Pose, p: Partial<Pose>): Pose => ({ ...base, ...p });

function runPose(base: Pose, stride: number, cycleLen: number, lean: number, unarmed: boolean): Pose {
  const p = (stride / cycleLen) * Math.PI * 2;
  const s = Math.sin(p);
  return over(base, {
    torso: lean,
    hF: 0.55 * s, kF: 0.2 + 0.9 * Math.max(0, Math.cos(p)),
    hB: -0.55 * s, kB: 0.2 + 0.9 * Math.max(0, -Math.cos(p)),
    drop: 0,
    ...(unarmed
      ? { aF: base.aF - 0.25 * s, aB: base.aB + 0.25 * s }
      : { aF: -0.6 * s + 0.2, eF: 1.2, aB: 0.6 * s - 0.1, eB: 1.2 }),
  });
}

function reactionPose(f: Fighter): Partial<Pose> {
  switch (f.reaction) {
    case 'mid': return HIT_MID;
    case 'low': return HIT_LOW;
    case 'launch': return LAUNCHED;
    default: return HIT_HIGH;
  }
}

/** Pose for a fighter at the current simulation tick (render-only; never feeds back into the sim). */
export function poseFor(f: Fighter, tick: number): Pose {
  const t = f.actionTick;
  const base = baseStance(f);
  const unarmed = f.weapon === 'FISTS';
  switch (f.action) {
    case 'DEAD': return mixPose(over(base, HIT_HIGH), over(base, LYING), ease(t / 20));
    case 'KNOCKDOWN': return mixPose(over(base, reactionPose(f)), over(base, LYING), ease(t / 10));
    case 'GETUP': return mixPose(over(base, LYING), base, ease(t / Math.max(1, f.actionDuration)));
    case 'HITSTUN': {
      if (f.reaction === 'launch' && f.mode === 'AIR') return over(base, LAUNCHED);
      return mixPose(over(base, reactionPose(f)), base, ease((t - f.actionDuration * 0.5) / (f.actionDuration * 0.5)));
    }
    case 'BLOCKSTUN': {
      const blk = over(base, f.crouching ? BLOCK_LOW : BLOCK_HIGH);
      return mixPose(blk, { ...blk, torso: blk.torso - 0.2 }, 0.6);
    }
    case 'GUARDBREAK': return over(base, GUARDBREAK);
    case 'BLOCK': return mixPose(base, over(base, f.crouching ? BLOCK_LOW : BLOCK_HIGH), ease(t / 3));
    case 'DODGE': return mixPose(over(base, DODGE), base, ease((t - 8) / 6));
    case 'ATTACK': {
      const m = getMove(f.moveId);
      const clip = m ? getClip(m.clip) : null;
      if (!m || !clip) break;
      let pose = sampleClip(clip, moveClipTime(m.frames, t, clip), base);
      if (f.mode === 'AIR' && m.trigger?.air !== 'air' && m.category !== 'kick') pose = { ...pose, hF: 0.7, kF: 1.2, hB: -0.1, kB: 0.6 };
      return pose;
    }
    default: break;
  }
  if (f.mode === 'LADDER') {
    const p = (f.stride / 0.8) * Math.PI * 2;
    const s = Math.sin(p);
    return over(base, { torso: 0, drop: 0, aF: 2.7 + 0.25 * s, eF: 0.6, aB: 2.7 - 0.25 * s, eB: 0.6, hF: 0.9 + 0.3 * s, kF: 1.4, hB: 0.9 - 0.3 * s, kB: 1.4, wpn: 0.8 });
  }
  if (f.mode === 'AIR') {
    return f.vel.y > 0
      ? over(base, { drop: 0, hF: 0.7, kF: 1.3, hB: -0.1, kB: 0.5, aF: 2.2, eF: 0.4, aB: 2.0, eB: 0.4 })
      : over(base, { drop: 0, hF: 0.3, kF: 0.3, hB: -0.2, kB: 0.2, aF: 2.4, eF: 0.3, aB: 2.2, eB: 0.3 });
  }
  if (f.crouching) return over(base, CROUCH);
  if (f.mode === 'STAIR') {
    if (Math.abs(f.vel.x) > 0.1) return runPose(base, f.stride, 1.2, 0.15, unarmed);
    return base;
  }
  if (Math.abs(f.vel.x) > 0.3) return runPose(base, f.stride, 1.6, 0.2, unarmed);
  if (unarmed) {
    const idle = getClip('guard_idle');
    if (idle) return sampleClip(idle, tick / 80, base);
  }
  // Idle breathing.
  const b = Math.sin((tick / 72) * Math.PI * 2) * 0.03;
  return over(base, { torso: 0.05 + b, aF: 0.35 + b, aB: -0.15 - b });
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

export const WEAPON_LENGTH = { FISTS: 0, IRON_BAR: 0.9, SHORT_SWORD: 0.75 } as const;

/** Every pose the game can show (stances, reactions and every clip's keys) — exercised by the rig sanity test. */
export function allStaticPoses(): Record<string, Pose> {
  const out: Record<string, Pose> = { GUARD, ARMED_IDLE };
  const partials: Record<string, Partial<Pose>> = { CROUCH, BLOCK_HIGH, BLOCK_LOW, DODGE, HIT_HIGH, HIT_MID, HIT_LOW, LAUNCHED, GUARDBREAK, LYING };
  for (const [k, p] of Object.entries(partials)) { out[k] = over(GUARD, p); out[k + '_ARMED'] = over(ARMED_IDLE, p); }
  for (const id of allClipIds()) {
    const clip = getClip(id);
    if (!clip) continue;
    for (let i = 0; i <= 20; i++) out[id + '@' + i] = sampleClip(clip, i / 20, GUARD);
  }
  return out;
}
