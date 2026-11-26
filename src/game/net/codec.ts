/**
 * Binary-friendly encodings for the online protocol (INKDOM_v2_Plan.md §4.2, T-N01):
 * InputFrame ⇄ 14-bit mask, MatchState → compact numeric snapshot → applied onto a client
 * MatchState. Only render-relevant fields travel; AI memory, RNG and input logs stay on the server.
 */
import { MOVES } from '../combat/moves';
import type {
  ActionState, CaptureState, Fighter, HitReaction, InputFrame, MatchPhase, MatchState, Mode, SquadCommand, Team,
} from '../sim/types';
import { EMPTY_INPUT } from '../sim/types';
import type { EncodedState } from './protocol';

// ---------------- input bitmask ----------------
const INPUT_KEYS: readonly (keyof InputFrame)[] = [
  'left', 'right', 'up', 'down', 'jumpPressed', 'punchPressed', 'kickPressed', 'heavyPressed',
  'weaponPressed', 'specialPressed', 'block', 'dodgePressed', 'commandPressed',
];
/** Edge-triggered fields (must never be dropped; merged when frames are coalesced). */
export const PRESS_KEYS: readonly (keyof InputFrame)[] = INPUT_KEYS.filter((k) => k.endsWith('Pressed'));

export function encodeInput(i: InputFrame): number {
  let bits = 0;
  INPUT_KEYS.forEach((k, n) => { if (i[k]) bits |= 1 << n; });
  return bits;
}

export function decodeInput(bits: number): InputFrame {
  const out = { ...EMPTY_INPUT } as InputFrame;
  INPUT_KEYS.forEach((k, n) => { (out[k] as boolean) = (bits & (1 << n)) !== 0; });
  return out;
}

/** Keep only held keys (used when the server repeats the last frame). */
export function heldOnly(i: InputFrame): InputFrame {
  const out = { ...i };
  for (const k of PRESS_KEYS) (out[k] as boolean) = false;
  return out;
}

// ---------------- enums as small integers ----------------
const PHASES: readonly MatchPhase[] = ['COUNTDOWN', 'PLAYING', 'ENDED'];
const CAPTURE: readonly CaptureState[] = ['IDLE', 'CAPTURING', 'CONTESTED', 'DECAYING'];
const COMMANDS: readonly SquadCommand[] = ['FOLLOW', 'HOLD', 'ATTACK'];
const MODES: readonly Mode[] = ['GROUND', 'AIR', 'STAIR', 'LADDER'];
const ACTIONS: readonly ActionState[] = ['NONE', 'ATTACK', 'BLOCK', 'BLOCKSTUN', 'GUARDBREAK', 'HITSTUN', 'KNOCKDOWN', 'GETUP', 'DODGE', 'DEAD'];
const REACTIONS: readonly HitReaction[] = ['high', 'mid', 'low', 'launch'];
const MOVE_IDS: readonly string[] = MOVES.map((m) => m.id);
const TEAMS: readonly Team[] = ['ATTACKER', 'DEFENDER'];

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Per-fighter fields in snapshot order. */
const FIGHTER_FIELDS = [
  'x', 'y', 'vx', 'vy', 'facing', 'grounded', 'floor', 'mode', 'action', 'actionTick', 'actionDuration', 'move',
  'hp', 'invulnUntil', 'spawnProtected', 'flashUntil', 'deathTick', 'respawnAt', 'crouching', 'stamina', 'energy',
  'comboHits', 'reaction', 'stride', 'kos', 'deaths', 'stagger',
] as const;

export function encodeState(s: MatchState): EncodedState {
  const m = [
    s.tick, PHASES.indexOf(s.phase), s.phaseTick, s.playTicks, s.timeLeftTicks,
    r3(s.capture.progress), CAPTURE.indexOf(s.capture.state), r3(s.capture.peak),
    COMMANDS.indexOf(s.squads.ATTACKER.command), COMMANDS.indexOf(s.squads.DEFENDER.command),
    s.winner ? TEAMS.indexOf(s.winner) : -1, s.endReason === 'CAPTURE' ? 0 : s.endReason === 'TIMEOUT' ? 1 : -1,
    (s.config.controllers[0] === 'CPU' ? 1 : 0) | (s.config.controllers[1] === 'CPU' ? 2 : 0),
  ];
  const f = s.fighters.map((x) => [
    r3(x.pos.x), r3(x.pos.y), r1(x.vel.x), r1(x.vel.y), x.facing, x.grounded ? 1 : 0, x.floor, MODES.indexOf(x.mode),
    ACTIONS.indexOf(x.action), x.actionTick, x.actionDuration, x.moveId ? MOVE_IDS.indexOf(x.moveId) : -1,
    r1(x.hp), x.invulnUntil, x.spawnProtected ? 1 : 0, x.flashUntil, x.deathTick, x.respawnAt, x.crouching ? 1 : 0,
    Math.round(x.stamina), Math.round(x.energy), x.comboHits, REACTIONS.indexOf(x.reaction), r3(x.stride),
    x.stats.kos, x.stats.deaths, r1(x.stagger),
  ]);
  return { m, f };
}

/**
 * Apply a snapshot onto a client-side MatchState created with the same config/seed.
 * prevPos is set to the previous position so the renderer can interpolate between snapshots.
 */
export function applySnapshot(s: MatchState, e: EncodedState): void {
  const m = e.m;
  s.tick = m[0];
  s.phase = PHASES[m[1]] ?? 'PLAYING';
  s.phaseTick = m[2];
  s.playTicks = m[3];
  s.timeLeftTicks = m[4];
  s.capture.progress = m[5];
  s.capture.state = CAPTURE[m[6]] ?? 'IDLE';
  s.capture.peak = m[7];
  s.squads.ATTACKER.command = COMMANDS[m[8]] ?? 'FOLLOW';
  s.squads.DEFENDER.command = COMMANDS[m[9]] ?? 'FOLLOW';
  s.winner = m[10] >= 0 ? TEAMS[m[10]] : null;
  s.endReason = m[11] === 0 ? 'CAPTURE' : m[11] === 1 ? 'TIMEOUT' : null;
  s.config.controllers = [m[12] & 1 ? 'CPU' : 'HUMAN', m[12] & 2 ? 'CPU' : 'HUMAN'];
  e.f.forEach((v, i) => {
    const x: Fighter | undefined = s.fighters[i];
    if (!x || v.length !== FIGHTER_FIELDS.length) return;
    x.prevPos = { x: x.pos.x, y: x.pos.y };
    x.pos = { x: v[0], y: v[1] };
    x.vel = { x: v[2], y: v[3] };
    x.facing = v[4] === -1 ? -1 : 1;
    x.grounded = v[5] === 1;
    x.floor = v[6] as Fighter['floor'];
    x.mode = MODES[v[7]] ?? 'GROUND';
    x.action = ACTIONS[v[8]] ?? 'NONE';
    x.actionTick = v[9];
    x.actionDuration = v[10];
    x.moveId = v[11] >= 0 ? MOVE_IDS[v[11]] ?? null : null;
    x.hp = v[12];
    x.invulnUntil = v[13];
    x.spawnProtected = v[14] === 1;
    x.flashUntil = v[15];
    x.deathTick = v[16];
    x.respawnAt = v[17];
    x.crouching = v[18] === 1;
    x.stamina = v[19];
    x.energy = v[20];
    x.comboHits = v[21];
    x.reaction = REACTIONS[v[22]] ?? 'high';
    x.stride = v[23];
    x.stats.kos = v[24];
    x.stats.deaths = v[25];
    x.stagger = v[26];
  });
}

/** Snap prevPos to pos (after a teleport-like jump, e.g. first snapshot or reconnect). */
export function settle(s: MatchState): void {
  for (const f of s.fighters) f.prevPos = { x: f.pos.x, y: f.pos.y };
}
