import { BUILDING } from '@/game/level/building';
import { createMatch, stepMatch } from '@/game/sim/match';
import { EMPTY_INPUT, type Fighter, type GameEvent, type InputFrame, type MatchConfig, type MatchState } from '@/game/sim/types';

export const level = BUILDING;

export function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...over };
}

/** A PLAYING match with every bot parked dead (never respawning) so tests control the bosses alone. */
export function duelState(config: Partial<MatchConfig> = {}, seed = 1234): MatchState {
  const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['HUMAN', 'HUMAN'], ...config }, seed);
  s.phase = 'PLAYING';
  for (const f of s.fighters) {
    if (!f.isBoss) {
      f.action = 'DEAD';
      f.respawnAt = Number.MAX_SAFE_INTEGER;
      f.deathTick = -100000;
      f.pos = { x: -11, y: 0 };
    }
  }
  return s;
}

export function place(f: Fighter, x: number, y: number, facing: 1 | -1 = 1) {
  f.pos = { x, y };
  f.prevPos = { x, y };
  f.vel = { x: 0, y: 0 };
  f.facing = facing;
  f.mode = 'GROUND';
  f.grounded = true;
  f.floor = Math.round(y / 4) as Fighter['floor'];
  f.invulnUntil = 0;
  f.spawnProtected = false;
}

export function run(s: MatchState, ticks: number, p1: InputFrame | ((t: number) => InputFrame) = EMPTY_INPUT, p2: InputFrame | ((t: number) => InputFrame) = EMPTY_INPUT): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    const a = typeof p1 === 'function' ? p1(t) : p1;
    const b = typeof p2 === 'function' ? p2(t) : p2;
    stepMatch(s, [a, b], all);
  }
  return all;
}

/** P1 boss / P2 boss for the default duel (P1 attacker = fighter 0, P2 defender = fighter 4). */
export const P1 = (s: MatchState) => s.fighters.find((f) => f.isBoss && f.playerIndex === 0)!;
export const P2 = (s: MatchState) => s.fighters.find((f) => f.isBoss && f.playerIndex === 1)!;
