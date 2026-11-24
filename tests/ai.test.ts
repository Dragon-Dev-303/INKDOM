import { describe, expect, it } from 'vitest';
import { navInput } from '@/game/ai/brain';
import { navigate } from '@/game/ai/nav';
import { updateLocomotion } from '@/game/sim/physics';
import type { FloorId, GameEvent, Team } from '@/game/sim/types';
import { createMatch, stepMatch } from '@/game/sim/match';
import { duelState, input, level, P1, place, run } from './helpers';

describe('navigation graph', () => {
  it('finds a path from every node to every node (defenders may drop)', () => {
    const s = duelState();
    const f = P1(s);
    for (const a of level.nav.nodes) {
      for (const b of level.nav.nodes) {
        place(f, a.x, a.y);
        const r = navigate(level, f, { floor: b.floor, x: b.x }, true, 0.35);
        expect(Number.isFinite(r.cost), `${a.id} -> ${b.id}`).toBe(true);
      }
    }
  });

  it('attackers never use drop edges', () => {
    const s = duelState();
    const f = P1(s);
    place(f, 16, 4); // S1 top, a drop edge start
    const r = navigate(level, f, { floor: 0, x: 18 }, false, 0.35);
    expect(r.step.kind).toBe('stairDown');
  });
});

describe('bot path following', () => {
  for (const team of ['ATTACKER', 'DEFENDER'] as Team[]) {
    it(`a ${team.toLowerCase()} walker reaches every node from its spawn within 60 s`, () => {
      for (const node of level.nav.nodes) {
        const s = duelState();
        const f = P1(s);
        const sp = level.spawns[team][0];
        place(f, sp.x, sp.y);
        const events: GameEvent[] = [];
        let arrived = false;
        for (let t = 0; t < 60 * 60 && !arrived; t++) {
          const nav = navInput(level, f, { floor: node.floor as FloorId, x: node.x }, team === 'DEFENDER');
          if (nav.arrived && f.mode === 'GROUND' && f.floor === node.floor) { arrived = true; break; }
          updateLocomotion(level, f, nav.input, t, events);
        }
        expect(arrived, `${team} -> ${node.id} (${node.name}); ended at floor ${f.floor} x ${f.pos.x.toFixed(2)} mode ${f.mode}`).toBe(true);
      }
    });
  }
});

describe('squad behaviour', () => {
  it('attacker bots on ATTACK reach the roof when unopposed', () => {
    const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['HUMAN', 'HUMAN'] }, 3);
    s.phase = 'PLAYING';
    // Remove the defenders.
    for (const f of s.fighters) if (f.team === 'DEFENDER') { f.action = 'DEAD'; f.respawnAt = Number.MAX_SAFE_INTEGER; f.deathTick = -1e6; }
    s.squads.ATTACKER.command = 'ATTACK';
    run(s, 60 * 60);
    const bots = s.fighters.filter((f) => f.team === 'ATTACKER' && !f.isBoss);
    expect(bots.filter((b) => b.floor === 4).length).toBeGreaterThanOrEqual(2);
  });

  it('never assigns more than 2 bots to attack one target', () => {
    const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['HUMAN', 'HUMAN'] }, 11);
    s.phase = 'PLAYING';
    const victim = P1(s);
    place(victim, 11, 12, -1);
    victim.invulnUntil = Number.MAX_SAFE_INTEGER; // keep the target alive
    for (let t = 0; t < 600; t++) {
      stepMatch(s, [input(), input()], []);
      for (const list of Object.values(s.attackTokens)) expect(list.length).toBeLessThanOrEqual(2);
    }
  });

  it('followers stay near their boss', () => {
    const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['HUMAN', 'HUMAN'] }, 21);
    s.phase = 'PLAYING';
    for (const f of s.fighters) if (f.team === 'DEFENDER') { f.action = 'DEAD'; f.respawnAt = Number.MAX_SAFE_INTEGER; f.deathTick = -1e6; }
    // Boss walks into the building and stops on F1.
    run(s, 240, input({ right: true }));
    run(s, 240);
    const boss = P1(s);
    const bots = s.fighters.filter((f) => f.team === 'ATTACKER' && !f.isBoss);
    for (const b of bots) expect(Math.abs(b.pos.x - boss.pos.x)).toBeLessThan(5);
  });
});
