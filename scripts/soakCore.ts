import { BUILDING } from '../src/game/level/building';
import { createMatch, stepMatch, FIGHTER_COUNT } from '../src/game/sim/match';
import { bodyBox, overlaps } from '../src/game/sim/physics';
import { EMPTY_INPUT, type GameEvent, type MatchConfig, type Team } from '../src/game/sim/types';
import { TUNING } from '../src/game/config/tuning';

export interface SoakReport {
  matches: number;
  failures: string[];
  wins: Record<Team, number>;
  captures: number;
  avgMinutes: number;
  level2Stuck: number;
  level3Stuck: number;
  msPerMatch: number;
}

/**
 * Run CPU-vs-CPU matches headlessly and check invariants every tick (plan §8.3).
 * Any failure reports its seed and tick so the match can be replayed exactly.
 */
export function runSoak(matches: number, seedBase = 1): SoakReport {
  const failures: string[] = [];
  const wins: Record<Team, number> = { ATTACKER: 0, DEFENDER: 0 };
  let captures = 0;
  let totalTicks = 0;
  let level2 = 0;
  let level3 = 0;
  const maxTicks = (TUNING.match.timerSeconds + TUNING.match.countdownSeconds + 5) * 60;
  const t0 = Date.now();

  for (let m = 0; m < matches; m++) {
    const seed = seedBase + m * 7919;
    const config: MatchConfig = {
      p1Team: m % 2 === 0 ? 'ATTACKER' : 'DEFENDER',
      weapons: m % 3 === 0 ? ['IRON_BAR', 'SHORT_SWORD'] : ['SHORT_SWORD', 'IRON_BAR'],
      controllers: ['CPU', 'CPU'],
    };
    const s = createMatch(config, seed);
    const teams = s.fighters.map((f) => f.team);
    let lastTimer = s.timeLeftTicks;
    let ended = false;
    const fail = (msg: string) => failures.push(`seed ${seed} tick ${s.tick}: ${msg}`);

    for (let t = 0; t < maxTicks; t++) {
      const events: GameEvent[] = [];
      try {
        stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT], events);
      } catch (e) {
        fail(`exception ${(e as Error).stack ?? e}`);
        break;
      }
      for (const e of events) {
        if (e.type === 'STUCK' && e.level === 2) level2++;
        if (e.type === 'STUCK' && e.level === 3) level3++;
      }
      if (s.fighters.length !== FIGHTER_COUNT) fail('fighter count changed');
      s.fighters.forEach((f, i) => {
        if (f.team !== teams[i]) fail(`fighter ${i} changed team`);
        if (f.hp < 0 || f.hp > f.maxHp) fail(`fighter ${i} hp ${f.hp}`);
        if (!Number.isFinite(f.pos.x) || !Number.isFinite(f.pos.y)) fail(`fighter ${i} NaN position`);
        if (f.action !== 'DEAD' && (f.mode === 'GROUND' || f.mode === 'AIR')) {
          const b = bodyBox(f);
          for (const solid of BUILDING.solids) {
            if (overlaps(b, solid)) { fail(`fighter ${i} inside solid at (${f.pos.x.toFixed(2)}, ${f.pos.y.toFixed(2)})`); break; }
          }
        }
      });
      if (s.capture.progress < 0 || s.capture.progress > 1) fail(`capture ${s.capture.progress}`);
      if (s.timeLeftTicks > lastTimer) fail('timer increased');
      lastTimer = s.timeLeftTicks;
      if (failures.length > 20) break;
      if (s.phase === 'ENDED') { ended = true; break; }
    }
    if (!ended) fail('match did not end');
    else {
      wins[s.winner!]++;
      if (s.endReason === 'CAPTURE') captures++;
      totalTicks += s.playTicks;
    }
    if (failures.length > 20) break;
  }
  return {
    matches,
    failures,
    wins,
    captures,
    avgMinutes: totalTicks / Math.max(1, matches) / 60 / 60,
    level2Stuck: level2,
    level3Stuck: level3,
    msPerMatch: (Date.now() - t0) / Math.max(1, matches),
  };
}
