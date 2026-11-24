import { ATTACKS, TUNING, type AttackDef, type AttackId } from '../config/tuning';
import { overlaps } from './physics';
import type { AABB, Fighter, GameEvent, MatchState } from './types';

const C = TUNING.combat;
const HW = TUNING.movement.bodyHalfWidth;
const H = TUNING.movement.bodyHeight;

export function attackTotal(def: AttackDef): number {
  return def.startup + def.active + def.recovery;
}

export function attackPhase(f: Fighter): 'startup' | 'active' | 'recovery' | null {
  if (f.action !== 'ATTACK' || !f.attackId) return null;
  const def = ATTACKS[f.attackId];
  if (f.actionTick < def.startup) return 'startup';
  if (f.actionTick < def.startup + def.active) return 'active';
  return 'recovery';
}

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
  return { x0: f.pos.x - HW, y0: f.pos.y, x1: f.pos.x + HW, y1: f.pos.y + H * f.scale };
}

export function hitbox(f: Fighter): AABB | null {
  if (attackPhase(f) !== 'active' || !f.attackId) return null;
  const def = ATTACKS[f.attackId];
  const front = f.pos.x + f.facing * HW;
  const far = front + f.facing * def.reach * f.scale;
  return {
    x0: Math.min(front, far),
    x1: Math.max(front, far),
    y0: f.pos.y + def.yBand[0] * f.scale,
    y1: f.pos.y + def.yBand[1] * f.scale,
  };
}

/** Which attack a "weapon strike" uses for this fighter. */
export function weaponAttack(f: Fighter): AttackId {
  return f.weapon;
}

export function startAttack(state: MatchState, f: Fighter, id: AttackId, events: GameEvent[]): void {
  f.action = 'ATTACK';
  f.attackId = id;
  f.actionTick = 0;
  f.actionDuration = attackTotal(ATTACKS[id]);
  f.attackHitIds = [];
  if (f.spawnProtected) {
    f.spawnProtected = false;
    f.invulnUntil = state.tick;
  }
  events.push({ type: 'ATTACK_START', fighter: f.id, attack: id });
}

function setAction(f: Fighter, action: Fighter['action'], duration: number) {
  f.action = action;
  f.actionTick = 0;
  f.actionDuration = duration;
  f.attackId = null;
  f.attackHitIds = [];
}

export function killFighter(state: MatchState, v: Fighter, killerId: number, events: GameEvent[]): void {
  const respawnSeconds = v.isBoss ? TUNING.fighters.bossRespawnSeconds : TUNING.fighters.botRespawnSeconds;
  setAction(v, 'DEAD', 0);
  v.hp = 0;
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

interface PendingHit { a: Fighter; v: Fighter; def: AttackDef }

/** Apply one hit (plan §4.4.2–4.4.3). */
function applyHit(state: MatchState, { a, v, def }: PendingHit, events: GameEvent[]): void {
  const tick = state.tick;
  const mult = a.isBoss ? 1 : C.botDamageMultiplier;
  const blocked = v.action === 'BLOCK' && v.actionTick >= C.block.activationTicks && facesAttacker(v, a);
  let damage = def.damage * mult;
  let kb = def.knockback;
  let guardBreak = false;

  if (blocked) {
    damage *= C.block.chip;
    kb *= C.block.knockbackFactor;
    if (def.guardBreak) {
      guardBreak = true;
      setAction(v, 'GUARDBREAK', C.block.guardBreakTicks);
    } else {
      setAction(v, 'BLOCKSTUN', Math.round(def.hitstun * C.block.stunFactor));
    }
  } else {
    if (tick - v.lastHitTick > C.stagger.resetTicks) v.stagger = 0;
    v.stagger += def.staggerPoints;
    if (v.stagger >= C.stagger.threshold) {
      v.stagger = 0;
      setAction(v, 'KNOCKDOWN', C.stagger.knockdownTicks);
      if (v.mode === 'STAIR') v.mode = 'AIR';
    } else {
      setAction(v, 'HITSTUN', def.hitstun);
    }
  }

  v.hp = Math.max(0, v.hp - damage);
  v.lastHitTick = tick;
  v.lastHitterId = a.id;
  v.flashUntil = tick + TUNING.fx.hitFlashTicks;
  v.vel.x = kb * a.facing;
  if (v.mode === 'LADDER') {
    v.mode = 'AIR';
    v.grounded = false;
  } else if (v.mode !== 'STAIR' && v.grounded && !blocked) {
    v.vel.y = C.hopVelocity;
    v.grounded = false;
  }
  a.hitstop = def.hitstop;
  v.hitstop = def.hitstop;

  events.push({
    type: 'HIT', attacker: a.id, victim: v.id, attack: def.id, blocked, guardBreak,
    damage, x: v.pos.x + (a.pos.x - v.pos.x) * 0.3, y: v.pos.y + 1.2 * v.scale, heavy: def.damage >= 12,
  });

  if (v.hp <= 0) killFighter(state, v, a.id, events);
}

/** Collect every active hitbox overlap this tick, then apply them together so trades work. */
export function resolveHits(state: MatchState, events: GameEvent[]): void {
  const pending: PendingHit[] = [];
  for (const a of state.fighters) {
    if (!isAlive(a)) continue;
    const hb = hitbox(a);
    if (!hb || !a.attackId) continue;
    const def = ATTACKS[a.attackId];
    for (const v of state.fighters) {
      if (v.team === a.team || !isAlive(v) || isInvulnerable(v, state.tick)) continue;
      if (a.attackHitIds.includes(v.id)) continue;
      if (!overlaps(hb, hurtbox(v))) continue;
      a.attackHitIds.push(v.id);
      pending.push({ a, v, def });
    }
  }
  for (const p of pending) {
    if (!isAlive(p.v)) continue;
    applyHit(state, p, events);
  }
}
