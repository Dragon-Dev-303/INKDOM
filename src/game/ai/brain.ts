import { TUNING } from '../config/tuning';
import { inChainWindow } from '../combat/resolver';
import type { Button } from '../combat/types';
import { nextRandom, randomInt } from '../core/rng';
import type { LevelDef } from '../level/building';
import { attackPhase, currentMove, isAlive, releaseTokensFor } from '../sim/combat';
import { preferredRange, usableRoutines } from './routines';
import {
  EMPTY_INPUT, type BotMemory, type Fighter, type FloorId, type GameEvent, type InputFrame, type MatchState,
} from '../sim/types';
import { navigate, type NavGoal, type NavStep } from './nav';

const AI = TUNING.ai;

export function createBotMemory(): BotMemory {
  return {
    fsm: 'IDLE', targetId: -1, reactionReadyTick: 0, nextDecisionTick: 0, blockUntil: 0, blockLow: false, routine: [], routineStep: 0,
    retreatUntil: 0, retreatCooldownUntil: 0, bestCost: Infinity, lastProgressTick: 0, stuckLevel: 0, goalKey: '',
    prevUp: false,
  };
}

const sameSurface = (a: Fighter, b: Fighter) => a.floor === b.floor && a.mode !== 'LADDER' && b.mode !== 'LADDER';

function boss(state: MatchState, f: Fighter): Fighter {
  return state.fighters.find((o) => o.team === f.team && o.isBoss)!;
}

/** Convert a nav step into held inputs. */
function stepToInput(f: Fighter, step: NavStep, input: InputFrame, reach: number): void {
  switch (step.kind) {
    case 'walk': {
      const dx = step.x - f.pos.x;
      if (dx > reach) input.right = true;
      else if (dx < -reach) input.left = true;
      break;
    }
    case 'stairUp': input.up = true; break;
    case 'stairDown': input.down = true; break;
    case 'ladderUp': input.up = true; break;
    case 'ladderDown': input.down = true; input.left = f.mode !== 'LADDER'; break;
    case 'drop': if (step.dir > 0) input.right = true; else input.left = true; break;
    default: break;
  }
}

/** Inputs that move a fighter one step along its path to `goal` (used by bots and tests). */
export function navInput(level: LevelDef, f: Fighter, goal: NavGoal, allowDrops: boolean): { input: InputFrame; arrived: boolean; cost: number } {
  const input: InputFrame = { ...EMPTY_INPUT };
  const r = navigate(level, f, goal, allowDrops, AI.nodeReach);
  stepToInput(f, r.step, input, AI.nodeReach);
  if (f.mode === 'AIR') { input.up = false; input.down = false; }
  return { input, arrived: r.step.kind === 'arrived', cost: r.cost };
}

const PRESS_FIELD: Record<Button, keyof InputFrame> = {
  P: 'punchPressed', K: 'kickPressed', H: 'heavyPressed', W: 'weaponPressed', S: 'specialPressed',
};

function press(input: InputFrame, b: Button) {
  (input[PRESS_FIELD[b]] as boolean) = true;
}

/** Pick a weighted combo routine that reaches the target from here. */
function chooseRoutine(state: MatchState, f: Fighter, dist: number): readonly Button[] | null {
  const options = usableRoutines(f, dist);
  if (!options.length) return null;
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = nextRandom(state) * total;
  for (const o of options) { r -= o.weight; if (r <= 0) return o.buttons; }
  return options[options.length - 1].buttons;
}

function visibleEnemies(state: MatchState, f: Fighter): Fighter[] {
  return state.fighters.filter(
    (o) => o.team !== f.team && isAlive(o) && sameSurface(f, o) && Math.abs(o.pos.x - f.pos.x) <= AI.visionRange,
  );
}

function pickTarget(state: MatchState, f: Fighter, mem: BotMemory): Fighter | null {
  const enemies = visibleEnemies(state, f);
  if (!enemies.length) return null;
  enemies.sort((a, b) => Math.abs(a.pos.x - f.pos.x) - Math.abs(b.pos.x - f.pos.x) || a.hp - b.hp);
  const best = enemies[0];
  const cur = enemies.find((e) => e.id === mem.targetId);
  if (cur && Math.abs(cur.pos.x - f.pos.x) <= Math.abs(best.pos.x - f.pos.x) + 2) return cur;
  return best;
}

/** Decide whether the bot may engage `target` under its current orders (plan §4.7.5). */
function mayEngage(state: MatchState, f: Fighter, target: Fighter): boolean {
  const dx = Math.abs(target.pos.x - f.pos.x);
  if (f.isBoss) return f.team === 'ATTACKER' ? dx <= AI.engageRange + 1 : dx <= AI.visionRange;
  const squad = state.squads[f.team];
  const b = boss(state, f);
  switch (squad.command) {
    case 'FOLLOW': {
      if (!isAlive(b)) return dx <= AI.holdEngage;
      const nearBoss = b.floor === f.floor && Math.abs(b.pos.x - f.pos.x) <= AI.followLeash;
      return nearBoss && dx <= AI.followEngageRange;
    }
    case 'HOLD': {
      const anchor = squad.anchors[f.id];
      if (!anchor || anchor.floor !== f.floor) return dx <= AI.engageRange;
      const tFromAnchor = Math.abs(target.pos.x - anchor.x);
      return tFromAnchor <= AI.holdEngage || (dx <= 1.5 && tFromAnchor <= AI.holdLeash);
    }
    case 'ATTACK':
      return f.team === 'ATTACKER' ? dx <= AI.engageRange : true;
  }
}

/** Where the bot should go when not fighting. Null = stay put. */
function commandGoal(state: MatchState, f: Fighter, level: LevelDef): NavGoal | null {
  const flagX = level.flagPoleX;
  if (f.isBoss) {
    // CPU boss behaviour (practice mode and soak tests).
    if (f.team === 'ATTACKER') return { floor: 4, x: flagX + (state.tick % 600 < 300 ? -1 : 1) };
    const threat = state.capture.progress > 0
      || state.fighters.some((o) => o.team === 'ATTACKER' && isAlive(o) && o.floor >= 3);
    if (threat) return { floor: 4, x: flagX };
    const prey = nearestEnemyByPath(state, f, level);
    return prey ? { floor: prey.floor, x: prey.pos.x } : { floor: 4, x: flagX };
  }
  const squad = state.squads[f.team];
  const slot = f.botIndex - 2; // -1, 0, 1
  switch (squad.command) {
    case 'FOLLOW': {
      const b = boss(state, f);
      if (!isAlive(b)) return null;
      return { floor: b.floor, x: b.pos.x - b.facing * (1.4 + 0.9 * (f.botIndex - 1)) };
    }
    case 'HOLD': {
      const a = squad.anchors[f.id];
      return a ? { floor: a.floor, x: a.x } : null;
    }
    case 'ATTACK': {
      if (f.team === 'ATTACKER') return { floor: 4, x: flagX + slot * 1.2 };
      const prey = nearestEnemyByPath(state, f, level);
      return prey ? { floor: prey.floor, x: prey.pos.x } : { floor: 4, x: flagX + slot * 1.2 };
    }
  }
}

function nearestEnemyByPath(state: MatchState, f: Fighter, level: LevelDef): Fighter | null {
  let best: Fighter | null = null;
  let bestCost = Infinity;
  for (const o of state.fighters) {
    if (o.team === f.team || !isAlive(o)) continue;
    const r = navigate(level, f, { floor: o.floor, x: o.pos.x }, f.team === 'DEFENDER', AI.nodeReach);
    if (r.cost < bestCost) { bestCost = r.cost; best = o; }
  }
  return best;
}

function holdsToken(state: MatchState, f: Fighter, targetId: number): boolean {
  if (f.isBoss) return true;
  const list = (state.attackTokens[targetId] ??= []);
  if (list.includes(f.id)) return true;
  if (list.length < AI.maxAttackersPerTarget) { list.push(f.id); return true; }
  return false;
}

function dropTokens(state: MatchState, f: Fighter, exceptTarget: number): void {
  for (const key of Object.keys(state.attackTokens)) {
    if (+key === exceptTarget) continue;
    const list = state.attackTokens[+key];
    const i = list.indexOf(f.id);
    if (i >= 0) list.splice(i, 1);
  }
}

function forceRespawnBot(state: MatchState, f: Fighter, level: LevelDef): void {
  const sp = level.spawns[f.team][f.isBoss ? 0 : f.botIndex];
  f.pos = { x: sp.x, y: sp.y };
  f.prevPos = { x: sp.x, y: sp.y };
  f.vel = { x: 0, y: 0 };
  f.mode = 'GROUND';
  f.grounded = true;
  f.floor = sp.y === 0 ? 0 : (Math.round(sp.y / 4) as FloorId);
  f.invulnUntil = state.tick + Math.round(TUNING.fighters.spawnProtectionSeconds * 60);
  f.spawnProtected = true;
}

/**
 * Produce this tick's InputFrame for an AI-controlled fighter (bot or CPU boss).
 * Movement is evaluated every tick (precise stair/edge handling); decisions
 * (targets, attacks, blocks, retreats) at 10 Hz, staggered per fighter.
 */
export function computeAiInput(state: MatchState, f: Fighter, level: LevelDef, events: GameEvent[]): InputFrame {
  const mem = (state.bots[f.id] ??= createBotMemory());
  const input: InputFrame = { ...EMPTY_INPUT };
  const tick = state.tick;

  if (!isAlive(f)) {
    if (mem.fsm !== 'DEAD') { mem.fsm = 'DEAD'; releaseTokensFor(state, f.id); mem.targetId = -1; }
    return input;
  }
  if (mem.fsm === 'DEAD') { mem.fsm = 'RESPAWN'; resetStuck(mem, tick); }

  // Mid-combo: feed the next button of the routine when the chain window opens.
  if (f.action === 'ATTACK' && mem.routineStep < mem.routine.length && inChainWindow(f)) {
    press(input, mem.routine[mem.routineStep++]);
    resetStuck(mem, tick);
    return input;
  }
  // Busy (stunned / attacking): the simulation controls the body.
  if (f.action !== 'NONE' && f.action !== 'BLOCK') { resetStuck(mem, tick); return input; }
  mem.routine = [];
  mem.routineStep = 0;
  if (tick < mem.blockUntil) { input.block = true; input.down = mem.blockLow; return input; }

  const decide = tick >= mem.nextDecisionTick;
  if (decide) mem.nextDecisionTick = tick + AI.decisionInterval;

  // --- Retreat check ---
  if (decide && tick >= mem.retreatCooldownUntil && f.hp < f.maxHp * AI.retreatHpFraction) {
    const close = visibleEnemies(state, f).filter((e) => Math.abs(e.pos.x - f.pos.x) <= 3).length;
    if (close >= 2) {
      mem.retreatUntil = tick + AI.retreatTicks;
      mem.retreatCooldownUntil = tick + AI.retreatCooldownTicks;
    }
  }
  if (tick < mem.retreatUntil) {
    mem.fsm = 'RETREAT';
    const enemies = visibleEnemies(state, f);
    const nearest = enemies.sort((a, b) => Math.abs(a.pos.x - f.pos.x) - Math.abs(b.pos.x - f.pos.x))[0];
    const away = nearest ? (f.pos.x >= nearest.pos.x ? 1 : -1) : f.facing;
    const r = navigate(level, f, { floor: f.floor, x: f.pos.x + away * 4 }, false, AI.nodeReach);
    stepToInput(f, r.step, input, AI.nodeReach);
    resetStuck(mem, tick);
    return input;
  }

  // --- Target selection ---
  let target: Fighter | null = mem.targetId >= 0 ? state.fighters[mem.targetId] : null;
  if (decide) {
    const t = pickTarget(state, f, mem);
    if (t && t.id !== mem.targetId) {
      mem.reactionReadyTick = tick + randomInt(state, AI.reactionMinTicks, AI.reactionMaxTicks);
    }
    target = t && mayEngage(state, f, t) ? t : null;
    mem.targetId = target ? target.id : -1;
    dropTokens(state, f, mem.targetId);
  }
  if (target && (!isAlive(target) || !sameSurface(f, target))) { target = null; mem.targetId = -1; }

  if (target) {
    mem.fsm = 'ATTACK';
    resetStuck(mem, tick);
    return fightInput(state, f, target, mem, decide, input, level);
  }

  // --- Move to command goal ---
  const goal = commandGoal(state, f, level);
  if (!goal) { mem.fsm = 'IDLE'; resetStuck(mem, tick); return input; }
  mem.fsm = f.isBoss || state.squads[f.team].command !== 'FOLLOW' ? 'MOVE' : 'FOLLOW';
  const allowDrops = f.team === 'DEFENDER';
  const r = navigate(level, f, goal, allowDrops, AI.nodeReach);
  if (r.step.kind === 'arrived' || r.cost < 1) {
    mem.fsm = 'IDLE';
    resetStuck(mem, tick);
    return input;
  }
  stepToInput(f, r.step, input, AI.nodeReach);
  if (f.mode === 'AIR') { input.up = false; input.down = false; }
  checkStuck(state, f, mem, goal, r.cost, r.firstNode, input, level, events);
  // Avoid turning a held "up" into an accidental jump: only stairs/ladders use it.
  mem.prevUp = input.up;
  return input;
}

function fightInput(
  state: MatchState, f: Fighter, target: Fighter, mem: BotMemory, decide: boolean, input: InputFrame, level: LevelDef,
): InputFrame {
  const tick = state.tick;
  const dx = target.pos.x - f.pos.x;
  const dist = Math.abs(dx);
  const towards: 1 | -1 = dx >= 0 ? 1 : -1;
  const away: 1 | -1 = dx >= 0 ? -1 : 1;
  const hasToken = holdsToken(state, f, target.id);

  if (f.mode === 'STAIR') {
    // Fighting on stairs: walk along the slope toward the target.
    if (dist > 1.2) { if (towards > 0) input.right = true; else input.left = true; }
  }

  // Block reaction to an incoming attack.
  if (decide && target.action === 'ATTACK' && attackPhase(target) === 'startup' && target.facing === -towards) {
    const def = currentMove(target);
    if (def && dist <= 0.6 + def.hit.reach * target.scale + 0.4) {
      const roll = nextRandom(state);
      if (roll < AI.dodgeChance && f.stamina > 40 && f.mode === 'GROUND') {
        input.dodgePressed = true;
        return input;
      }
      if (roll < AI.dodgeChance + AI.blockChance) {
        mem.blockUntil = tick + (def.frames.startup - target.actionTick) + def.frames.active + 2;
        input.block = true;
        mem.blockLow = def.hit.height === 'low';
        input.down = mem.blockLow;
        return input;
      }
    }
  }

  if (!hasToken) {
    // Wait outside the brawl.
    const want = AI.circleDistance;
    if (dist < want - 0.3) moveAlong(f, away, input, level);
    else if (dist > want + 0.6) moveAlong(f, towards, input, level);
    else if (f.facing !== towards && f.mode !== 'STAIR') pressFacing(towards, input);
    return input;
  }

  const desired = preferredRange(f);
  if (dist > desired + 0.25) {
    moveAlong(f, towards, input, level);
    return input;
  }
  if (f.facing !== towards) { pressFacing(towards, input); return input; }

  if (decide && tick >= mem.reactionReadyTick && nextRandom(state) < AI.attackChancePerDecision) {
    const routine = chooseRoutine(state, f, dist);
    if (routine) {
      mem.routine = [...routine];
      mem.routineStep = 1;
      press(input, routine[0]);
    }
  }
  return input;
}

function pressFacing(dir: 1 | -1, input: InputFrame) {
  if (dir > 0) input.right = true; else input.left = true;
}

/** Walk horizontally without stepping off the safe part of the current floor. */
function moveAlong(f: Fighter, dir: 1 | -1, input: InputFrame, level: LevelDef) {
  if (f.mode === 'GROUND' || f.mode === 'AIR') {
    const fl = level.floors[f.floor];
    if (dir > 0 && f.pos.x >= fl.x1 - 0.1) return;
    if (dir < 0 && f.pos.x <= fl.x0 + 0.1) return;
  }
  pressFacing(dir, input);
}

function resetStuck(mem: BotMemory, tick: number) {
  mem.bestCost = Infinity;
  mem.lastProgressTick = tick;
  mem.stuckLevel = 0;
}

/** Three-step stuck recovery (plan §4.7.6). */
function checkStuck(
  state: MatchState, f: Fighter, mem: BotMemory, goal: NavGoal, cost: number,
  firstNode: { x: number; y: number; floor: FloorId } | null, input: InputFrame, level: LevelDef, events: GameEvent[],
) {
  const S = AI.stuck;
  const tick = state.tick;
  const key = `${goal.floor}:${Math.round(goal.x / 2)}`;
  if (key !== mem.goalKey) { mem.goalKey = key; resetStuck(mem, tick); }
  if (cost < mem.bestCost - S.progressEpsilon) {
    mem.bestCost = cost;
    mem.lastProgressTick = tick;
    mem.stuckLevel = 0;
    return;
  }
  const elapsed = tick - mem.lastProgressTick;
  if (elapsed >= S.repathTicks && mem.stuckLevel < 1) {
    mem.stuckLevel = 1;
    if (f.mode === 'GROUND') input.jumpPressed = true;
    events.push({ type: 'STUCK', bot: f.id, level: 1, x: f.pos.x, y: f.pos.y });
  } else if (elapsed >= S.teleportTicks && mem.stuckLevel < 2) {
    mem.stuckLevel = 2;
    const n = firstNode;
    if (n) {
      f.pos = { x: n.x, y: n.y };
      f.prevPos = { x: n.x, y: n.y };
      f.vel = { x: 0, y: 0 };
      f.mode = 'GROUND';
      f.grounded = true;
      f.floor = n.floor;
    }
    events.push({ type: 'STUCK', bot: f.id, level: 2, x: f.pos.x, y: f.pos.y });
  } else if (elapsed >= S.respawnTicks && mem.stuckLevel < 3) {
    mem.stuckLevel = 3;
    state.stuckEvents++;
    events.push({ type: 'STUCK', bot: f.id, level: 3, x: f.pos.x, y: f.pos.y });
    forceRespawnBot(state, f, level);
    resetStuck(mem, tick);
  }
}
