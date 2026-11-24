import { describe, expect, it } from 'vitest';
import { TUNING } from '@/game/config/tuning';
import { computeResults, createMatch, cycleCommand } from '@/game/sim/match';
import type { GameEvent } from '@/game/sim/types';
import { duelState, input, P1, P2, place, run } from './helpers';

const CAPTURE_TICKS = TUNING.match.captureSeconds * 60;

describe('capture', () => {
  it('an uncontested attacker captures in 8 s and wins', () => {
    const s = duelState();
    place(P1(s), 17, 16);
    place(P2(s), 11, 12);
    run(s, CAPTURE_TICKS - 2);
    expect(s.phase).toBe('PLAYING');
    run(s, 4);
    expect(s.phase).toBe('ENDED');
    expect(s.winner).toBe('ATTACKER');
    expect(s.endReason).toBe('CAPTURE');
  });

  it('a defender in the zone pauses capture (contested)', () => {
    const s = duelState();
    place(P1(s), 15, 16, 1);
    place(P2(s), 19.5, 16, -1);
    run(s, 120);
    expect(s.capture.state).toBe('CONTESTED');
    expect(s.capture.progress).toBe(0);
  });

  it('progress pauses exactly while contested and resumes after', () => {
    const s = duelState();
    place(P1(s), 15, 16);
    place(P2(s), 11, 12);
    run(s, 240);
    const p = s.capture.progress;
    expect(p).toBeCloseTo(240 / CAPTURE_TICKS, 3);
    place(P2(s), 19.5, 16, -1);
    run(s, 60);
    expect(s.capture.progress).toBeCloseTo(p, 6);
    place(P2(s), 11, 12);
    run(s, 60);
    expect(s.capture.progress).toBeGreaterThan(p);
  });

  it('an empty zone decays over 16 s', () => {
    const s = duelState();
    place(P1(s), 15, 16);
    place(P2(s), 11, 12);
    run(s, 240); // 50 %
    place(P1(s), 10, 0);
    run(s, 60);
    expect(s.capture.state).toBe('DECAYING');
    expect(s.capture.progress).toBeCloseTo(0.5 - 60 / (TUNING.match.decaySeconds * 60), 3);
    run(s, 8 * 60);
    expect(s.capture.progress).toBe(0);
  });

  it('dead attackers do not capture', () => {
    const s = duelState();
    const a = P1(s);
    place(a, 17, 16);
    a.action = 'DEAD';
    a.respawnAt = Number.MAX_SAFE_INTEGER;
    run(s, 120);
    expect(s.capture.progress).toBe(0);
  });
});

describe('match flow', () => {
  it('countdown lasts 3 s and freezes fighters', () => {
    const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['HUMAN', 'HUMAN'] }, 7);
    const x0 = P1(s).pos.x;
    run(s, TUNING.match.countdownSeconds * 60 - 1, input({ right: true }));
    expect(s.phase).toBe('COUNTDOWN');
    expect(P1(s).pos.x).toBe(x0);
    run(s, 1);
    expect(s.phase).toBe('PLAYING');
  });

  it('timer expiry gives the defenders the win', () => {
    const s = duelState();
    s.timeLeftTicks = 30;
    const events = run(s, 31);
    expect(s.phase).toBe('ENDED');
    expect(s.winner).toBe('DEFENDER');
    expect(s.endReason).toBe('TIMEOUT');
    expect(events.some((e) => e.type === 'MATCH_END')).toBe(true);
  });

  it('capture beats timeout on the same tick', () => {
    const s = duelState();
    place(P1(s), 17, 16);
    place(P2(s), 11, 12);
    s.capture.progress = 1 - 1 / CAPTURE_TICKS;
    s.timeLeftTicks = 1;
    run(s, 1);
    expect(s.winner).toBe('ATTACKER');
  });

  it('createMatch is deterministic for the same seed (CPU vs CPU)', () => {
    const cfg = { p1Team: 'ATTACKER' as const, weapons: ['SHORT_SWORD', 'IRON_BAR'] as ['SHORT_SWORD', 'IRON_BAR'], controllers: ['CPU', 'CPU'] as ['CPU', 'CPU'] };
    const a = createMatch(cfg, 99);
    const b = createMatch(cfg, 99);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    run(a, 1500);
    run(b, 1500);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a rematch starts completely fresh', () => {
    const cfg = { p1Team: 'ATTACKER' as const, weapons: ['SHORT_SWORD', 'IRON_BAR'] as ['SHORT_SWORD', 'IRON_BAR'], controllers: ['CPU', 'CPU'] as ['CPU', 'CPU'] };
    const fresh = JSON.stringify(createMatch(cfg, 5));
    for (let i = 0; i < 10; i++) {
      const m = createMatch(cfg, 5);
      run(m, 600);
      expect(JSON.stringify(createMatch(cfg, 5))).toBe(fresh);
    }
  });

  it('squad command cycles FOLLOW → HOLD → ATTACK and HOLD anchors at the boss', () => {
    const s = duelState();
    const events: GameEvent[] = [];
    expect(s.squads.ATTACKER.command).toBe('FOLLOW');
    place(P1(s), 5, 0);
    cycleCommand(s, 'ATTACKER', events);
    expect(s.squads.ATTACKER.command).toBe('HOLD');
    expect(Object.values(s.squads.ATTACKER.anchors).every((a) => a.floor === 0 && Math.abs(a.x - 5) <= 1.5)).toBe(true);
    cycleCommand(s, 'ATTACKER', events);
    expect(s.squads.ATTACKER.command).toBe('ATTACK');
    cycleCommand(s, 'ATTACKER', events);
    expect(s.squads.ATTACKER.command).toBe('FOLLOW');
    expect(events.filter((e) => e.type === 'COMMAND').length).toBe(3);
  });

  it('results report winner, duration and per-player stats', () => {
    const s = duelState({ p1Team: 'DEFENDER' });
    s.timeLeftTicks = 60;
    run(s, 61);
    const r = computeResults(s);
    expect(r.winner).toBe('DEFENDER');
    expect(r.players.find((p) => p.player === 0)?.team).toBe('DEFENDER');
    expect(r.durationSeconds).toBeCloseTo(1, 1);
  });
});
