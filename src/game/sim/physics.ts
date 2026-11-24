import { DT, TUNING } from '../config/tuning';
import { floorFromY, type LevelDef } from '../level/building';
import type { AABB, Fighter, GameEvent, InputFrame } from './types';

const M = TUNING.movement;
const HW = M.bodyHalfWidth;
const H = M.bodyHeight;
const STUN_FRICTION = 15;
const STAIR_HSPEED = M.stairSpeed / Math.SQRT2;

export function overlaps(a: AABB, b: AABB): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Collision body (fixed size for every fighter, plan §4.3). */
export function bodyBox(f: Fighter): AABB {
  return { x0: f.pos.x - HW, y0: f.pos.y, x1: f.pos.x + HW, y1: f.pos.y + H };
}

function approach(v: number, target: number, rate: number): number {
  if (v < target) return Math.min(target, v + rate);
  if (v > target) return Math.max(target, v - rate);
  return v;
}

/** Move horizontally and resolve against static solids. Returns true if blocked. */
export function moveX(level: LevelDef, f: Fighter, dx: number): boolean {
  f.pos.x += dx;
  let blocked = false;
  for (const s of level.solids) {
    const b = bodyBox(f);
    if (!overlaps(b, s)) continue;
    blocked = true;
    if (dx > 0) f.pos.x = s.x0 - HW;
    else if (dx < 0) f.pos.x = s.x1 + HW;
    else {
      // Pushed with no direction (e.g. separation): exit the nearest side.
      const left = b.x1 - s.x0;
      const right = s.x1 - b.x0;
      f.pos.x += left < right ? -left : right;
    }
  }
  return blocked;
}

/** Move vertically and resolve. Returns 'land' | 'ceiling' | null. */
export function moveY(level: LevelDef, f: Fighter, dy: number): 'land' | 'ceiling' | null {
  f.pos.y += dy;
  let result: 'land' | 'ceiling' | null = null;
  for (const s of level.solids) {
    if (!overlaps(bodyBox(f), s)) continue;
    if (dy <= 0) { f.pos.y = s.y1; result = 'land'; }
    else { f.pos.y = s.y0 - H; result = 'ceiling'; }
  }
  return result;
}

/**
 * Push a fighter out of any solid it overlaps (used when a hit or KO knocks it off a
 * stair/ladder, where solids are ignored). Prefers stepping up onto a surface.
 */
export function depenetrate(level: LevelDef, f: Fighter): void {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const s of level.solids) {
      const b = bodyBox(f);
      if (!overlaps(b, s)) continue;
      const up = s.y1 - b.y0;
      const down = b.y1 - s.y0;
      const left = b.x1 - s.x0;
      const right = s.x1 - b.x0;
      const min = Math.min(up, down, left, right);
      if (up <= 0.6 || min === up) f.pos.y += up;
      else if (min === down) f.pos.y -= down;
      else if (min === left) f.pos.x -= left;
      else f.pos.x += right;
      moved = true;
    }
    if (!moved) return;
  }
}

export function groundProbe(level: LevelDef, f: Fighter): boolean {
  const x0 = f.pos.x - HW;
  const x1 = f.pos.x + HW;
  for (const s of level.solids) {
    if (Math.abs(s.y1 - f.pos.y) < 0.02 && x0 < s.x1 && x1 > s.x0) return true;
  }
  return false;
}

export function runSpeed(f: Fighter): number {
  return f.isBoss ? M.bossRunSpeed : M.botRunSpeed;
}

function enterStair(level: LevelDef, f: Fighter, idx: number, atTop: boolean) {
  const st = level.stairs[idx];
  f.mode = 'STAIR';
  f.stairId = idx;
  f.stairS = atTop ? 1 : 0;
  const p = atTop ? st.top : st.foot;
  f.pos.x = p.x;
  f.pos.y = p.y;
  f.vel.x = 0;
  f.vel.y = 0;
  f.buffer.jump = 0;
}

function enterLadder(level: LevelDef, f: Fighter, idx: number, atTop: boolean) {
  const l = level.ladders[idx];
  f.mode = 'LADDER';
  f.ladderId = idx;
  f.pos.x = l.x;
  f.pos.y = atTop ? l.y1 : l.y0;
  f.vel.x = 0;
  f.vel.y = 0;
  f.buffer.jump = 0;
  f.grounded = false;
}

/** Try entering a stair or ladder from the ground. Returns true if a traversal mode was entered. */
function tryTraversalEntry(level: LevelDef, f: Fighter, input: InputFrame): boolean {
  if (!f.grounded || (!input.up && !input.down)) return false;
  for (let i = 0; i < level.stairs.length; i++) {
    const st = level.stairs[i];
    if (input.up && Math.abs(f.pos.y - st.foot.y) < 0.05 && Math.abs(f.pos.x - st.foot.x) < M.stairEntryRange) {
      enterStair(level, f, i, false);
      return true;
    }
    if (input.down && Math.abs(f.pos.y - st.top.y) < 0.05 && Math.abs(f.pos.x - st.top.x) < M.stairEntryRange) {
      enterStair(level, f, i, true);
      return true;
    }
  }
  for (let i = 0; i < level.ladders.length; i++) {
    const l = level.ladders[i];
    if (input.up && Math.abs(f.pos.y - l.y0) < 0.05 && Math.abs(f.pos.x - l.x) < M.ladderEntryRange) {
      enterLadder(level, f, i, false);
      return true;
    }
    const facingLeft = input.left || (!input.right && f.facing === -1);
    if (input.down && facingLeft && Math.abs(f.pos.y - l.y1) < 0.05 && f.pos.x < M.ladderGrabFromTopRange && f.pos.x > l.x - 0.5) {
      enterLadder(level, f, i, true);
      return true;
    }
  }
  return false;
}

function updateStair(level: LevelDef, f: Fighter, input: InputFrame, actionable: boolean) {
  const st = level.stairs[f.stairId];
  const span = st.top.x - st.foot.x; // signed horizontal length
  const sx = Math.sign(span);
  if (actionable) {
    let dirS = 0;
    if (input.up) dirS = 1;
    else if (input.down) dirS = -1;
    else if (input.right !== input.left) dirS = (input.right ? 1 : -1) * sx;
    f.vel.x = dirS * sx * STAIR_HSPEED;
    if (f.vel.x !== 0) f.facing = f.vel.x > 0 ? 1 : -1;
  } else if (f.action === 'ATTACK' || f.action === 'BLOCK') {
    f.vel.x *= M.attackRootFriction;
  } else {
    f.vel.x = approach(f.vel.x, 0, STUN_FRICTION * DT);
  }
  const dx = f.vel.x * DT;
  f.stairS += dx / span;
  f.stride += Math.abs(dx) * Math.SQRT2;
  f.vel.y = 0;
  f.grounded = true;
  if (f.stairS >= 1) {
    f.stairS = 1;
    f.mode = 'GROUND';
    f.pos.x = st.top.x;
    f.pos.y = st.top.y;
    f.floor = st.topFloor;
    return;
  }
  if (f.stairS <= 0) {
    f.stairS = 0;
    f.mode = 'GROUND';
    f.pos.x = st.foot.x;
    f.pos.y = st.foot.y;
    f.floor = st.footFloor;
    return;
  }
  f.pos.x = st.foot.x + span * f.stairS;
  f.pos.y = st.foot.y + (st.top.y - st.foot.y) * f.stairS;
  f.floor = f.stairS > 0.5 ? st.topFloor : st.footFloor;
}

function updateLadder(level: LevelDef, f: Fighter, input: InputFrame, actionable: boolean) {
  const l = level.ladders[f.ladderId];
  let vy = 0;
  if (actionable) {
    if (input.up) vy = M.ladderSpeed;
    else if (input.down) vy = -M.ladderSpeed;
  }
  const dy = vy * DT;
  f.pos.y += dy;
  f.pos.x = l.x;
  f.vel.x = 0;
  f.vel.y = 0;
  f.stride += Math.abs(dy);
  f.grounded = false;
  if (f.pos.y >= l.y1) {
    f.pos.y = l.y1;
    if (actionable && input.up) {
      f.mode = 'GROUND';
      f.pos.x = l.topExit.x;
      f.pos.y = l.topExit.y;
      f.floor = l.topFloor;
      f.facing = 1;
      f.grounded = true;
    }
  } else if (f.pos.y <= l.y0) {
    f.pos.y = l.y0;
    if (actionable && input.down) {
      f.mode = 'GROUND';
      f.floor = l.bottomFloor;
      f.grounded = true;
    }
  }
  f.floor = f.pos.y > (l.y0 + l.y1) / 2 ? l.topFloor : l.bottomFloor;
}

/**
 * Locomotion for one fighter for one tick (plan §4.3).
 * `actionable` = the fighter is free to act (action NONE and alive).
 */
export function updateLocomotion(
  level: LevelDef, f: Fighter, input: InputFrame, tick: number, events: GameEvent[],
): void {
  const actionable = f.action === 'NONE';
  if (f.mode === 'STAIR') { updateStair(level, f, input, actionable); return; }
  if (f.mode === 'LADDER') { updateLadder(level, f, input, actionable); return; }

  if (actionable && tryTraversalEntry(level, f, input)) {
    if ((f.mode as string) === 'STAIR') updateStair(level, f, input, actionable);
    return;
  }

  // Horizontal velocity.
  const dir = actionable ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  const speed = runSpeed(f);
  if (f.grounded) {
    if (actionable) {
      const target = dir * speed;
      const accelerating = target !== 0 && Math.sign(target) === Math.sign(f.vel.x || target) && Math.abs(target) >= Math.abs(f.vel.x);
      f.vel.x = approach(f.vel.x, target, (accelerating ? M.groundAccel : M.groundDecel) * DT);
    } else if (f.action === 'ATTACK' || f.action === 'BLOCK') {
      f.vel.x *= M.attackRootFriction;
      if (Math.abs(f.vel.x) < 0.01) f.vel.x = 0;
    } else {
      f.vel.x = approach(f.vel.x, 0, STUN_FRICTION * DT);
    }
  } else if (actionable && dir !== 0) {
    f.vel.x = approach(f.vel.x, dir * speed, M.airAccel * DT);
  }

  // Jump (with coyote time and input buffer).
  if (actionable && f.buffer.jump > 0 && (f.grounded || tick - f.lastGroundedTick <= M.coyoteTicks)) {
    f.vel.y = M.jumpVelocity;
    f.grounded = false;
    f.buffer.jump = 0;
    f.lastGroundedTick = -1000;
    events.push({ type: 'JUMP', fighter: f.id });
  }

  f.vel.y = Math.max(f.vel.y - M.gravity * DT, -M.maxFallSpeed);

  const x0 = f.pos.x;
  if (moveX(level, f, f.vel.x * DT)) f.vel.x = 0;
  const yr = moveY(level, f, f.vel.y * DT);
  if (yr) f.vel.y = 0;

  f.grounded = groundProbe(level, f);
  if (f.grounded) {
    f.mode = 'GROUND';
    f.lastGroundedTick = tick;
    f.floor = floorFromY(f.pos.y);
    if (f.vel.y < 0) f.vel.y = 0;
    f.stride += Math.abs(f.pos.x - x0);
  } else {
    f.mode = 'AIR';
  }
}

/** Gentle push between overlapping enemies so bodies never fully block stairs (plan §5.6.3). */
export function separateEnemies(level: LevelDef, fighters: Fighter[]): void {
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    if (a.action === 'DEAD' || a.mode === 'LADDER' || a.mode === 'STAIR') continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const b = fighters[j];
      if (b.team === a.team || b.action === 'DEAD' || b.mode === 'LADDER' || b.mode === 'STAIR') continue;
      if (Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
      const dx = b.pos.x - a.pos.x;
      const overlap = 2 * HW - Math.abs(dx);
      if (overlap <= 0) continue;
      const sign = dx !== 0 ? Math.sign(dx) : a.id < b.id ? 1 : -1;
      const push = Math.min(overlap / 2, M.separationMaxPerTick);
      moveX(level, a, -push * sign);
      moveX(level, b, push * sign);
    }
  }
}
