import { ATTACKS, TUNING, secondsToTicks } from '../config/tuning';
import { BUILDING, type LevelDef } from '../level/building';
import { computeAiInput, createBotMemory } from '../ai/brain';
import { isAlive, killFighter, releaseTokensFor, resolveHits, startAttack, weaponAttack } from './combat';
import { bodyBox, depenetrate, overlaps, separateEnemies, updateLocomotion } from './physics';
import {
  EMPTY_INPUT, otherTeam,
  type Fighter, type FloorId, type GameEvent, type InputFrame, type MatchConfig, type MatchState,
  type SquadCommand, type Team, type WeaponId,
} from './types';

const COMMAND_CYCLE: SquadCommand[] = ['FOLLOW', 'HOLD', 'ATTACK'];
export const FIGHTER_COUNT = 8;

export const DEFAULT_CONFIG: MatchConfig = {
  p1Team: 'ATTACKER',
  weapons: ['SHORT_SWORD', 'IRON_BAR'],
  controllers: ['HUMAN', 'HUMAN'],
};

function makeFighter(
  id: number, team: Team, isBoss: boolean, playerIndex: 0 | 1 | -1, botIndex: number, weapon: WeaponId, level: LevelDef,
): Fighter {
  const sp = level.spawns[team][isBoss ? 0 : botIndex];
  const maxHp = isBoss ? TUNING.fighters.bossHp : TUNING.fighters.botHp;
  return {
    id, team, isBoss, playerIndex, botIndex, weapon,
    scale: isBoss ? TUNING.fighters.bossScale : 1,
    pos: { x: sp.x, y: sp.y }, prevPos: { x: sp.x, y: sp.y }, vel: { x: 0, y: 0 },
    facing: team === 'ATTACKER' ? 1 : -1,
    grounded: true, lastGroundedTick: 0, floor: (Math.round(sp.y / 4) as FloorId),
    mode: 'GROUND', stairId: 0, stairS: 0, ladderId: 0,
    action: 'NONE', actionTick: 0, actionDuration: 0, attackId: null, attackHitIds: [],
    hp: maxHp, maxHp, stagger: 0, lastHitTick: -1000, lastHitterId: -1,
    invulnUntil: 0, spawnProtected: false, hitstop: 0, flashUntil: 0, deathTick: -1, respawnAt: -1,
    buffer: { jump: 0, punch: 0, kick: 0, weapon: 0 },
    stride: 0, stats: { kos: 0, deaths: 0 },
  };
}

/** Build a fresh match. Rematches always call this — no state is carried over (plan §5.4). */
export function createMatch(config: MatchConfig, seed: number, level: LevelDef = BUILDING): MatchState {
  const fighters: Fighter[] = [];
  const p1Team = config.p1Team;
  const botWeapons: WeaponId[] = ['IRON_BAR', 'SHORT_SWORD', 'IRON_BAR'];
  for (const team of ['ATTACKER', 'DEFENDER'] as Team[]) {
    const playerIndex: 0 | 1 = team === p1Team ? 0 : 1;
    const base = team === 'ATTACKER' ? 0 : 4;
    fighters.push(makeFighter(base, team, true, playerIndex, 0, config.weapons[playerIndex], level));
    for (let b = 1; b <= 3; b++) fighters.push(makeFighter(base + b, team, false, -1, b, botWeapons[b - 1], level));
  }

  const defenderAnchors: MatchState['squads']['DEFENDER']['anchors'] = {};
  for (const f of fighters) if (f.team === 'DEFENDER' && !f.isBoss) defenderAnchors[f.id] = { ...level.homeAnchors[f.botIndex] };

  const state: MatchState = {
    version: 1,
    seed,
    rngState: seed | 0,
    tick: 0,
    phase: 'COUNTDOWN',
    phaseTick: 0,
    playTicks: 0,
    timeLeftTicks: secondsToTicks(TUNING.match.timerSeconds),
    capture: { progress: 0, state: 'IDLE', peak: 0, milestones: 0 },
    fighters,
    squads: {
      ATTACKER: { command: 'FOLLOW', anchors: {} },
      DEFENDER: { command: 'HOLD', anchors: defenderAnchors },
    },
    bots: {},
    attackTokens: {},
    winner: null,
    endReason: null,
    config: { p1Team, weapons: [...config.weapons], controllers: [...config.controllers] },
    stuckEvents: 0,
  };
  for (const f of fighters) if (isAiControlled(state, f)) state.bots[f.id] = createBotMemory();
  // A CPU attacker boss sends its squad straight at the flag.
  const atkBoss = fighters[0];
  if (isAiControlled(state, atkBoss)) state.squads.ATTACKER.command = 'ATTACK';
  return state;
}

export function isAiControlled(state: MatchState, f: Fighter): boolean {
  if (!f.isBoss) return true;
  return state.config.controllers[f.playerIndex as 0 | 1] === 'CPU';
}

export function bossOf(state: MatchState, team: Team): Fighter {
  return state.fighters[team === 'ATTACKER' ? 0 : 4];
}

export function bossForPlayer(state: MatchState, player: 0 | 1): Fighter {
  return state.fighters.find((f) => f.isBoss && f.playerIndex === player)!;
}

export function respawnFighter(state: MatchState, f: Fighter, level: LevelDef, events: GameEvent[]): void {
  const sp = level.spawns[f.team][f.isBoss ? 0 : f.botIndex];
  f.pos = { x: sp.x, y: sp.y };
  f.prevPos = { x: sp.x, y: sp.y };
  f.vel = { x: 0, y: 0 };
  f.facing = f.team === 'ATTACKER' ? 1 : -1;
  f.grounded = true;
  f.lastGroundedTick = state.tick;
  f.floor = Math.round(sp.y / 4) as FloorId;
  f.mode = 'GROUND';
  f.action = 'NONE';
  f.actionTick = 0;
  f.actionDuration = 0;
  f.attackId = null;
  f.attackHitIds = [];
  f.hp = f.maxHp;
  f.stagger = 0;
  f.hitstop = 0;
  f.respawnAt = -1;
  f.invulnUntil = state.tick + secondsToTicks(TUNING.fighters.spawnProtectionSeconds);
  f.spawnProtected = true;
  f.buffer = { jump: 0, punch: 0, kick: 0, weapon: 0 };
  events.push({ type: 'RESPAWN', fighter: f.id });
}

function setCommand(state: MatchState, team: Team, command: SquadCommand, events: GameEvent[]) {
  const squad = state.squads[team];
  squad.command = command;
  if (command === 'HOLD') {
    const b = bossOf(state, team);
    const anchors: typeof squad.anchors = {};
    for (const f of state.fighters) {
      if (f.team !== team || f.isBoss) continue;
      const fl = BUILDING.floors[b.floor];
      const x = Math.max(fl.x0, Math.min(fl.x1, b.pos.x + (f.botIndex - 2) * 1.5));
      anchors[f.id] = { floor: b.floor, x };
    }
    squad.anchors = anchors;
  }
  events.push({ type: 'COMMAND', team, command });
}

/** Upper floors (F4 and roof) the defenders must not lose control of. */
export function attackersThreatenTop(state: MatchState): boolean {
  return state.capture.progress > 0
    || state.fighters.some((f) => f.team === 'ATTACKER' && isAlive(f) && f.floor >= 3);
}

/**
 * A CPU defender boss reorders its squad once a second: HOLD home anchors while the
 * attack is far away, ATTACK (hunt) once attackers reach floor 4 or the roof.
 */
function cpuDefenderOrders(state: MatchState, events: GameEvent[]) {
  const boss = bossOf(state, 'DEFENDER');
  if (!isAiControlled(state, boss) || state.playTicks % 60 !== 0) return;
  const threat = attackersThreatenTop(state);
  const squad = state.squads.DEFENDER;
  const anchors: typeof squad.anchors = {};
  for (const f of state.fighters) {
    if (f.team !== 'DEFENDER' || f.isBoss) continue;
    anchors[f.id] = threat
      ? { floor: 4, x: BUILDING.flagPoleX + (f.botIndex - 2) * 2 }
      : { ...BUILDING.homeAnchors[f.botIndex] };
  }
  if (squad.command === 'HOLD' && JSON.stringify(squad.anchors) === JSON.stringify(anchors)) return;
  squad.command = 'HOLD';
  squad.anchors = anchors;
  events.push({ type: 'COMMAND', team: 'DEFENDER', command: 'HOLD' });
}

export function cycleCommand(state: MatchState, team: Team, events: GameEvent[]): void {
  const cur = state.squads[team].command;
  const next = COMMAND_CYCLE[(COMMAND_CYCLE.indexOf(cur) + 1) % COMMAND_CYCLE.length];
  setCommand(state, team, next, events);
}

/** Per-fighter action timers (plan §4.4.6). */
function advanceAction(state: MatchState, f: Fighter, level: LevelDef, events: GameEvent[]) {
  const S = TUNING.combat.stagger;
  f.actionTick++;
  switch (f.action) {
    case 'ATTACK':
    case 'BLOCKSTUN':
    case 'GUARDBREAK':
    case 'HITSTUN':
    case 'GETUP':
      if (f.actionTick >= f.actionDuration) {
        f.action = 'NONE';
        f.attackId = null;
        f.actionTick = 0;
      }
      break;
    case 'KNOCKDOWN':
      if (f.actionTick >= f.actionDuration) {
        f.action = 'GETUP';
        f.actionTick = 0;
        f.actionDuration = S.getupTicks;
        f.invulnUntil = state.tick + S.getupInvulnTicks;
      }
      break;
    case 'DEAD':
      if (f.respawnAt >= 0 && state.tick >= f.respawnAt) respawnFighter(state, f, level, events);
      break;
    default:
      break;
  }
  if (f.spawnProtected && state.tick >= f.invulnUntil) f.spawnProtected = false;
}

/** Turn an InputFrame into buffered actions (plan §4.2.2). */
function applyInput(state: MatchState, f: Fighter, input: InputFrame, events: GameEvent[]) {
  const B = TUNING.movement.bufferTicks;
  const buf = f.buffer;
  buf.jump = Math.max(0, buf.jump - 1);
  buf.punch = Math.max(0, buf.punch - 1);
  buf.kick = Math.max(0, buf.kick - 1);
  buf.weapon = Math.max(0, buf.weapon - 1);
  if (input.jumpPressed) buf.jump = B;
  if (input.punchPressed) buf.punch = B;
  if (input.kickPressed) buf.kick = B;
  if (input.weaponPressed) buf.weapon = B;

  if (f.action === 'BLOCK' && !input.block) { f.action = 'NONE'; f.actionTick = 0; }
  if (f.action !== 'NONE') return;

  if (f.mode !== 'LADDER' && f.mode !== 'STAIR' && input.left !== input.right) f.facing = input.left ? -1 : 1;

  if (input.block && f.grounded && (f.mode === 'GROUND' || f.mode === 'STAIR')) {
    f.action = 'BLOCK';
    f.actionTick = 0;
    f.vel.x *= 0.5;
    return;
  }
  if (f.mode === 'LADDER') return;
  if (buf.weapon > 0) { buf.weapon = 0; startAttack(state, f, weaponAttack(f), events); return; }
  if (buf.kick > 0) { buf.kick = 0; startAttack(state, f, 'KICK', events); return; }
  if (buf.punch > 0) { buf.punch = 0; startAttack(state, f, 'PUNCH', events); }
}

function updateCapture(state: MatchState, level: LevelDef, events: GameEvent[]) {
  const T = TUNING.match;
  let attackers = 0;
  let attackerBoss = false;
  let defenders = 0;
  for (const f of state.fighters) {
    if (!isAlive(f) || !overlaps(bodyBox(f), level.flagZone)) continue;
    if (f.team === 'ATTACKER') { attackers++; if (f.isBoss) attackerBoss = true; } else defenders++;
  }
  const canCapture = attackers > 0 && (!T.captureRequiresBoss || attackerBoss);
  const cap = state.capture;
  const prevState = cap.state;
  if (canCapture && defenders === 0) {
    cap.progress += 1 / (T.captureSeconds * 60);
    cap.state = 'CAPTURING';
  } else if (attackers > 0 && defenders > 0) {
    cap.state = 'CONTESTED';
  } else if (cap.progress > 0) {
    cap.progress -= 1 / (T.decaySeconds * 60);
    cap.state = 'DECAYING';
  } else {
    cap.state = 'IDLE';
  }
  cap.progress = Math.max(0, Math.min(1, cap.progress));
  if (cap.progress === 0 && cap.state === 'DECAYING') cap.state = 'IDLE';
  cap.peak = Math.max(cap.peak, cap.progress);
  if (cap.state !== prevState) events.push({ type: 'CAPTURE_STATE', state: cap.state });
  const milestone = Math.floor(cap.progress * 4); // 1..3 => 25/50/75
  if (milestone > cap.milestones && milestone <= 3) {
    cap.milestones = milestone;
    events.push({ type: 'CAPTURE_MILESTONE', pct: (milestone * 25) as 25 | 50 | 75 });
  }
  if (cap.progress < 0.25 * cap.milestones - 0.125) cap.milestones = Math.max(0, Math.floor(cap.progress * 4));
}

function endMatch(state: MatchState, winner: Team, reason: 'CAPTURE' | 'TIMEOUT', events: GameEvent[]) {
  state.phase = 'ENDED';
  state.phaseTick = 0;
  state.winner = winner;
  state.endReason = reason;
  events.push({ type: 'MATCH_END', winner, reason });
}

/**
 * Advance the match by one 60 Hz tick (plan §5.5).
 * `playerInputs[0]` = P1, `[1]` = P2. AI fighters compute their own inputs.
 */
export function stepMatch(
  state: MatchState, playerInputs: [InputFrame, InputFrame], events: GameEvent[], level: LevelDef = BUILDING,
): void {
  for (const f of state.fighters) { f.prevPos.x = f.pos.x; f.prevPos.y = f.pos.y; }

  if (state.phase === 'COUNTDOWN') {
    const total = secondsToTicks(TUNING.match.countdownSeconds);
    const before = Math.ceil((total - state.phaseTick) / 60);
    if (state.phaseTick === 0) events.push({ type: 'COUNTDOWN', value: before });
    state.phaseTick++;
    const after = Math.ceil((total - state.phaseTick) / 60);
    if (after !== before && after > 0) events.push({ type: 'COUNTDOWN', value: after });
    if (state.phaseTick >= total) {
      state.phase = 'PLAYING';
      state.phaseTick = 0;
      events.push({ type: 'MATCH_START' });
    }
    state.tick++;
    return;
  }

  const playing = state.phase === 'PLAYING';
  if (!playing) state.phaseTick++;

  // 1. Inputs.
  const inputs: InputFrame[] = state.fighters.map((f) => {
    if (!playing) return EMPTY_INPUT;
    if (f.isBoss && !isAiControlled(state, f)) return playerInputs[f.playerIndex as 0 | 1] ?? EMPTY_INPUT;
    return computeAiInput(state, f, level, events);
  });

  // 2. Squad commands.
  if (playing) {
    for (const f of state.fighters) {
      if (f.isBoss && inputs[f.id].commandPressed) cycleCommand(state, f.team, events);
    }
    cpuDefenderOrders(state, events);
  }

  // 3. Fighter updates.
  for (const f of state.fighters) {
    if (f.hitstop > 0) { f.hitstop--; continue; }
    advanceAction(state, f, level, events);
    if (isAlive(f)) applyInput(state, f, inputs[f.id], events);
    updateLocomotion(level, f, isAlive(f) ? inputs[f.id] : EMPTY_INPUT, state.tick, events);
  }

  // 4. Soft separation, 5. combat.
  separateEnemies(level, state.fighters);
  if (playing) resolveHits(state, events);
  // Hits/KOs can knock fighters off stairs or ladders (where solids are ignored).
  for (const f of state.fighters) if (f.mode === 'AIR' || f.mode === 'GROUND') depenetrate(level, f);

  // Safety net: anything that left the world (should never happen) is respawned.
  for (const f of state.fighters) {
    if (isAlive(f) && (f.pos.y < -5 || !Number.isFinite(f.pos.x) || !Number.isFinite(f.pos.y))) {
      killFighter(state, f, -1, events);
    }
  }

  if (playing) {
    state.playTicks++;
    updateCapture(state, level, events);
    if (state.capture.progress >= 1) {
      endMatch(state, 'ATTACKER', 'CAPTURE', events);
    } else {
      state.timeLeftTicks = Math.max(0, state.timeLeftTicks - 1);
      if (state.timeLeftTicks % 60 === 0) {
        const s = state.timeLeftTicks / 60;
        if ((TUNING.match.timerWarnings as readonly number[]).includes(s)) events.push({ type: 'TIMER_WARNING', secondsLeft: s });
      }
      if (state.timeLeftTicks === 0) endMatch(state, 'DEFENDER', 'TIMEOUT', events);
    }
    // Release tokens on dead targets.
    for (const key of Object.keys(state.attackTokens)) {
      const t = state.fighters[+key];
      if (!t || !isAlive(t)) delete state.attackTokens[+key];
    }
  }
  state.tick++;
}

export function isMatchOverForUi(state: MatchState): boolean {
  return state.phase === 'ENDED' && state.phaseTick >= secondsToTicks(TUNING.match.endBannerSeconds);
}

export interface MatchResults {
  winner: Team;
  reason: 'CAPTURE' | 'TIMEOUT';
  durationSeconds: number;
  peakCapture: number;
  kos: Record<Team, number>;
  players: { player: 0 | 1; team: Team; kos: number; deaths: number; controller: 'HUMAN' | 'CPU' }[];
  seed: number;
  stuckEvents: number;
}

export function computeResults(state: MatchState): MatchResults {
  const kos: Record<Team, number> = { ATTACKER: 0, DEFENDER: 0 };
  for (const f of state.fighters) kos[f.team] += f.stats.kos;
  const players = ([0, 1] as const).map((p) => {
    const b = bossForPlayer(state, p);
    return { player: p, team: b.team, kos: b.stats.kos, deaths: b.stats.deaths, controller: state.config.controllers[p] };
  });
  return {
    winner: state.winner ?? 'DEFENDER',
    reason: state.endReason ?? 'TIMEOUT',
    durationSeconds: state.playTicks / 60,
    peakCapture: state.capture.peak,
    kos,
    players,
    seed: state.seed,
    stuckEvents: state.stuckEvents,
  };
}

// ---- Debug helpers (plan §5.9) ----
export function debugKillBots(state: MatchState, team: Team, events: GameEvent[]): void {
  for (const f of state.fighters) if (f.team === team && !f.isBoss && isAlive(f)) killFighter(state, f, -1, events);
}
export function debugSetCapture(state: MatchState, value: number): void {
  state.capture.progress = value;
}
export function debugSetTimer(state: MatchState, seconds: number): void {
  state.timeLeftTicks = secondsToTicks(seconds);
}

export { otherTeam, releaseTokensFor, ATTACKS };
