import { getMove, moveTotal } from '../combat/moves';
import type { MoveDef } from '../combat/types';
import { TUNING } from '../config/tuning';
import { overlaps } from './physics';
import type { AABB, Fighter, GameEvent, HitReaction, MatchState } from './types';

/**
 * Hit engine (INKDOM_v2_Plan.md §2.4): hitboxes from the move database, block heights,
 * counter-hits, combo damage scaling, juggle limit, stamina guard crush, energy gain.
 */
const C = TUNING.combat;
const HW = TUNING.movement.bodyHalfWidth;
const H = TUNING.movement.bodyHeight;

export function attackPhase(f: Fighter): 'startup' | 'active' | 'recovery' | null {
  const m = f.action === 'ATTACK' ? getMove(f.moveId) : null;
  if (!m) return null;
  if (f.actionTick < m.frames.startup) return 'startup';
  if (f.actionTick < m.frames.startup + m.frames.active) return 'active';
  return 'recovery';
}

export const currentMove = (f: Fighter): MoveDef | null => (f.action === 'ATTACK' ? getMove(f.moveId) : null);

export function isAlive(f: Fighter): boolean {
  return f.action !== 'DEAD';
}

export function isInvulnerable(f: Fighter, tick: number): boolean {
  return tick < f.invulnUntil;
}

export function hurtbox(f: Fighter): AABB {
  if (f.action === 'KNOCKDOWN' || (f.action === 'GETUP' && f.actionTick < f.actionDuration / 2)) {
    return { x0: f.pos.x - 0.8, y0: f.pos.y, x1: f.pos.x + 0.8, y1: f.pos.y + 0.5 };
  }
  const height = H * f.scale * (f.crouching ? C.crouchHeightFactor : 1);
  return { x0: f.pos.x - HW, y0: f.pos.y, x1: f.pos.x + HW, y1: f.pos.y + height };
}

export function hitbox(f: Fighter): AABB | null {
  const m = currentMove(f);
  if (!m || attackPhase(f) !== 'active') return null;
  const front = f.pos.x + f.facing * HW;
  const far = front + f.facing * m.hit.reach * f.scale;
  return {
    x0: Math.min(front, far),
    x1: Math.max(front, far),
    y0: f.pos.y + m.hit.yBand[0] * f.scale,
    y1: f.pos.y + m.hit.yBand[1] * f.scale,
  };
}

/** Spend stamina and pause regeneration. */
export function spendStamina(f: Fighter, amount: number, tick: number): void {
  if (amount <= 0) return;
  f.stamina = Math.max(0, f.stamina - amount);
  f.staminaRegenAt = tick + C.stamina.regenDelayTicks;
}

export function startMove(state: MatchState, f: Fighter, m: MoveDef, events: GameEvent[]): void {
  if (m.turn) f.facing = (f.facing === 1 ? -1 : 1) as 1 | -1;
  f.action = 'ATTACK';
  f.moveId = m.id;
  f.actionTick = 0;
  f.actionDuration = moveTotal(m);
  f.attackHitIds = [];
  f.dashTicks = m.dash ? m.frames.startup + 1 : 0;
  if (m.dash) f.vel.x = (f.facing * m.dash * 60) / Math.max(1, m.frames.startup);
  if (m.cost?.energy) f.energy = Math.max(0, f.energy - m.cost.energy);
  if (m.cost?.stamina) spendStamina(f, m.cost.stamina, state.tick);
  if (f.spawnProtected) {
    f.spawnProtected = false;
    f.invulnUntil = state.tick;
  }
  events.push({ type: 'ATTACK_START', fighter: f.id, attack: m.id });
}

function setAction(f: Fighter, action: Fighter['action'], duration: number) {
  f.action = action;
  f.actionTick = 0;
  f.actionDuration = duration;
  f.moveId = null;
  f.attackHitIds = [];
  f.dashTicks = 0;
}

export function killFighter(state: MatchState, v: Fighter, killerId: number, events: GameEvent[]): void {
  const respawnSeconds = v.isBoss ? TUNING.fighters.bossRespawnSeconds : TUNING.fighters.botRespawnSeconds;
  setAction(v, 'DEAD', 0);
  v.hp = 0;
  v.crouching = false;
  v.deathTick = state.tick;
  v.respawnAt = state.tick + Math.round(respawnSeconds * 60);
  v.stats.deaths++;
  if (v.mode === 'STAIR' || v.mode === 'LADDER') v.mode = 'AIR';
  v.grounded = false;
  const killer = state.fighters[killerId];
  if (killer && killer.team !== v.team) killer.stats.kos++;
  releaseTokensFor(state, v.id);
  events.push({ type: 'KO', victim: v.id, killer: killerId, x: v.pos.x, y: v.pos.y });
}

export function releaseTokensFor(state: MatchState, fighterId: number): void {
  delete state.attackTokens[fighterId];
  for (const key of Object.keys(state.attackTokens)) {
    const list = state.attackTokens[+key];
    const idx = list.indexOf(fighterId);
    if (idx >= 0) list.splice(idx, 1);
  }
}

function facesAttacker(v: Fighter, a: Fighter): boolean {
  const dx = a.pos.x - v.pos.x;
  const towards = dx === 0 ? (-a.facing as 1 | -1) : (Math.sign(dx) as 1 | -1);
  return v.facing === towards;
}

/** Block rules: standing stops high/mid/overhead, crouching stops mid/low. */
export function blocksHeight(v: Fighter, height: MoveDef['hit']['height']): boolean {
  if (v.crouching) return height === 'mid' || height === 'low';
  return height !== 'low';
}

/** Is the victim still inside a combo (has not recovered since the last hit)? */
const inCombo = (v: Fighter) => v.action === 'HITSTUN' || v.action === 'KNOCKDOWN' || (!v.grounded && v.comboHits > 0);

interface PendingHit { a: Fighter; v: Fighter; m: MoveDef }

function applyHit(state: MatchState, { a, v, m }: PendingHit, events: GameEvent[]): void {
  const tick = state.tick;
  const hit = m.hit;
  const mult = a.isBoss ? 1 : C.botDamageMultiplier;
  const blocking = v.action === 'BLOCK' && v.actionTick >= C.block.activationTicks && facesAttacker(v, a);
  const blocked = blocking && blocksHeight(v, hit.height);
  const counter = !blocked && v.action === 'ATTACK' && attackPhase(v) === 'startup';
  let damage = hit.damage * mult;
  let kb = hit.knockback;
  let guardBreak = false;
  let combo = 0;

  if (blocked) {
    damage *= C.block.chip;
    kb *= C.block.knockbackFactor;
    spendStamina(v, hit.damage * C.stamina.blockCostFactor + (hit.guardCrush ?? 0), tick);
    if (hit.guardBreak || v.stamina <= 0) {
      guardBreak = true;
      setAction(v, 'GUARDBREAK', C.block.guardBreakTicks);
    } else {
      setAction(v, 'BLOCKSTUN', Math.round(hit.hitstun * C.block.stunFactor));
    }
  } else {
    combo = inCombo(v) ? v.comboHits + 1 : 1;
    v.comboHits = combo;
    const scale = Math.max(C.scalingMin, 1 - C.scalingStep * (combo - 1));
    damage *= scale * (counter ? C.counterDamage : 1);
    v.comboDamage = (combo === 1 ? 0 : v.comboDamage) + damage;
    const hitstun = Math.max(6, hit.hitstun + (counter ? C.counterHitstun : 0) - Math.max(0, combo - C.hitstunDecayAfter));

    if (tick - v.lastHitTick > C.stagger.resetTicks) v.stagger = 0;
    v.stagger += hit.stagger;
    const airborne = !v.grounded && v.mode === 'AIR';
    if (airborne) v.juggleHits++;
    const knockdown = hit.knockdown === true || (hit.knockdown === 'counter' && counter) ||
      v.stagger >= C.stagger.threshold || v.juggleHits > C.juggleLimit;
    if (knockdown) {
      v.stagger = 0;
      setAction(v, 'KNOCKDOWN', C.stagger.knockdownTicks);
      if (v.mode === 'STAIR') v.mode = 'AIR';
    } else {
      setAction(v, 'HITSTUN', hitstun);
    }
    const reaction: HitReaction = hit.launch ? 'launch' : hit.height === 'low' ? 'low' : hit.height === 'mid' ? 'mid' : 'high';
    v.reaction = reaction;
    v.crouching = false;
    v.energy = Math.min(C.energy.max, v.energy + C.energy.onHurt);
    a.energy = Math.min(C.energy.max, a.energy + C.energy.onHit);
  }

  v.hp = Math.max(0, v.hp - damage);
  v.lastHitTick = tick;
  v.lastHitterId = a.id;
  v.flashUntil = tick + TUNING.fx.hitFlashTicks;
  const away = (Math.sign(v.pos.x - a.pos.x) || a.facing) as 1 | -1;
  v.vel.x = kb * away;
  if (v.mode === 'LADDER') {
    v.mode = 'AIR';
    v.grounded = false;
  } else if (!blocked && v.mode !== 'STAIR') {
    if (hit.launch && v.juggleHits <= C.juggleLimit) {
      v.vel.y = hit.launch;
      v.grounded = false;
      v.mode = 'AIR';
    } else if (v.grounded) {
      v.vel.y = C.hopVelocity;
      v.grounded = false;
    }
  }
  a.hitstop = hit.hitstop;
  v.hitstop = hit.hitstop;

  events.push({
    type: 'HIT', attacker: a.id, victim: v.id, attack: m.id, blocked, guardBreak, counter, combo,
    damage, x: v.pos.x + (a.pos.x - v.pos.x) * 0.3, y: v.pos.y + 1.2 * v.scale, heavy: hit.damage >= 11 || counter,
  });

  if (v.hp <= 0) killFighter(state, v, a.id, events);
}

/** Collect every active hitbox overlap this tick, then apply them together so trades work. */
export function resolveHits(state: MatchState, events: GameEvent[]): void {
  const pending: PendingHit[] = [];
  for (const a of state.fighters) {
    if (!isAlive(a)) continue;
    const hb = hitbox(a);
    const m = currentMove(a);
    if (!hb || !m) continue;
    for (const v of state.fighters) {
      if (v.team === a.team || !isAlive(v) || isInvulnerable(v, state.tick)) continue;
      if (a.attackHitIds.includes(v.id)) continue;
      if (m.hit.height === 'high' && v.crouching) continue; // ducked
      if (!overlaps(hb, hurtbox(v))) continue;
      a.attackHitIds.push(v.id);
      pending.push({ a, v, m });
    }
  }
  for (const p of pending) {
    if (!isAlive(p.v)) continue;
    applyHit(state, p, events);
  }
}

/** Reset victim combo bookkeeping once they are back in control. */
export function updateComboState(f: Fighter): void {
  if (f.comboHits > 0 && f.grounded && f.action !== 'HITSTUN' && f.action !== 'KNOCKDOWN') {
    f.comboHits = 0;
    f.comboDamage = 0;
    f.juggleHits = 0;
  }
}

/** Stamina regeneration after the delay. */
export function regenStamina(f: Fighter, tick: number): void {
  if (tick >= f.staminaRegenAt && f.stamina < C.stamina.max && f.action !== 'BLOCK') {
    f.stamina = Math.min(C.stamina.max, f.stamina + C.stamina.regenPerSecond / 60);
  }
}
