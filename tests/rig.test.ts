import { describe, expect, it } from 'vitest';
import { ATTACKS } from '@/game/config/tuning';
import { ALL_STATIC_POSES, BONES, poseFor, solveRig, type Joints } from '@/game/render/rig';
import type { ActionState, Fighter, Mode } from '@/game/sim/types';
import { duelState, P1 } from './helpers';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function checkJoints(j: Joints, scale: number, label: string) {
  const s = scale;
  const pairs: [keyof Joints, keyof Joints, number][] = [
    ['hip', 'shoulder', BONES.torso], ['shoulder', 'neckTop', BONES.neck], ['neckTop', 'head', BONES.headR],
    ['shoulder', 'elbowF', BONES.upperArm], ['elbowF', 'handF', BONES.forearm],
    ['shoulder', 'elbowB', BONES.upperArm], ['elbowB', 'handB', BONES.forearm],
    ['hip', 'kneeF', BONES.thigh], ['kneeF', 'footF', BONES.shin],
    ['hip', 'kneeB', BONES.thigh], ['kneeB', 'footB', BONES.shin],
  ];
  for (const [a, b, len] of pairs) {
    const pa = j[a] as { x: number; y: number };
    const pb = j[b] as { x: number; y: number };
    expect(Number.isFinite(pa.x) && Number.isFinite(pa.y), `${label}: ${a} finite`).toBe(true);
    expect(dist(pa, pb), `${label}: ${a}-${b} length`).toBeCloseTo(len * s, 6);
  }
}

describe('stickman rig sanity (no disconnected limbs)', () => {
  it('keeps every bone length constant for all static poses', () => {
    for (const [name, pose] of Object.entries(ALL_STATIC_POSES)) {
      for (const scale of [1, 1.15]) checkJoints(solveRig(pose, scale, true, 0.75), scale, name);
    }
  });

  it('keeps bone lengths for runtime poses across every action and mode', () => {
    const s = duelState();
    const f: Fighter = P1(s);
    const actions: ActionState[] = ['NONE', 'BLOCK', 'BLOCKSTUN', 'GUARDBREAK', 'HITSTUN', 'KNOCKDOWN', 'GETUP', 'DEAD'];
    const modes: Mode[] = ['GROUND', 'AIR', 'STAIR', 'LADDER'];
    for (const action of actions) {
      for (const mode of modes) {
        for (let t = 0; t < 40; t += 3) {
          Object.assign(f, { action, mode, actionTick: t, actionDuration: 30, stride: t * 0.37, vel: { x: t % 2 ? 4 : 0, y: t % 4 ? 3 : -3 } });
          checkJoints(solveRig(poseFor(f, t), f.scale, mode === 'GROUND', 0.9), f.scale, `${action}/${mode}/${t}`);
        }
      }
    }
    for (const id of Object.keys(ATTACKS) as (keyof typeof ATTACKS)[]) {
      const def = ATTACKS[id];
      for (let t = 0; t < def.startup + def.active + def.recovery; t++) {
        Object.assign(f, { action: 'ATTACK', attackId: id, mode: 'GROUND', actionTick: t, actionDuration: 99 });
        checkJoints(solveRig(poseFor(f, t), f.scale, true, 0.9), f.scale, `${id}/${t}`);
      }
    }
  });

  it('standing poses keep the head above the hips and feet on the ground', () => {
    const j = solveRig(ALL_STATIC_POSES.IDLE, 1, true, 0.75);
    expect(j.head.y).toBeGreaterThan(j.hip.y);
    expect(Math.min(j.footF.y, j.footB.y)).toBeCloseTo(0, 6);
    expect(j.head.y + BONES.headR).toBeGreaterThan(1.7);
  });
});
