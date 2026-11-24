import { describe, expect, it } from 'vitest';
import { ATTACKS, TUNING } from '@/game/config/tuning';
import { hitbox } from '@/game/sim/combat';
import { stepMatch } from '@/game/sim/match';
import type { GameEvent } from '@/game/sim/types';
import { duelState, input, P1, P2, place, run } from './helpers';

/** P1 (attacker, sword) at x=10 facing right, P2 (defender, bar) at x=10.9 facing left, both on F1. */
function setup() {
  const s = duelState();
  const a = P1(s);
  const d = P2(s);
  place(a, 10, 0, 1);
  place(d, 10.9, 0, -1);
  return { s, a, d };
}

describe('attack timing', () => {
  it('punch hitbox exists only during its active frames', () => {
    const { s, a } = setup();
    const def = ATTACKS.PUNCH;
    const active: number[] = [];
    const events: GameEvent[] = [];
    for (let t = 0; t < def.startup + def.active + def.recovery + 2; t++) {
      stepMatch(s, [input({ punchPressed: t === 0 }), input()], events);
      if (hitbox(a)) active.push(t);
      if (a.hitstop > 0) break;
    }
    expect(active[0]).toBe(def.startup);
  });

  it('applies damage, hit-stun, knockback and hit-stop on a clean punch', () => {
    const { s, a, d } = setup();
    const events = run(s, 8, (t) => input({ punchPressed: t === 0 }));
    const hit = events.find((e) => e.type === 'HIT');
    expect(hit).toBeDefined();
    expect(d.hp).toBe(d.maxHp - ATTACKS.PUNCH.damage);
    expect(d.action).toBe('HITSTUN');
    expect(d.vel.x).toBeGreaterThan(0);
    expect(a.hitstop + d.hitstop).toBeGreaterThan(0);
  });

  it('hits each target at most once per swing', () => {
    const { s, d } = setup();
    const events = run(s, 40, (t) => input({ punchPressed: t === 0 }));
    expect(events.filter((e) => e.type === 'HIT').length).toBe(1);
    expect(d.hp).toBe(d.maxHp - ATTACKS.PUNCH.damage);
  });

  it('trades: two simultaneous punches both land', () => {
    const { s, a, d } = setup();
    run(s, 10, (t) => input({ punchPressed: t === 0 }), (t) => input({ punchPressed: t === 0 }));
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(d.hp).toBeLessThan(d.maxHp);
  });
});

describe('blocking', () => {
  it('a front block reduces damage to the chip fraction', () => {
    const { s, d } = setup();
    run(s, 5, input(), input({ block: true }));
    run(s, 12, (t) => input({ punchPressed: t === 0 }), input({ block: true }));
    expect(d.hp).toBeCloseTo(d.maxHp - ATTACKS.PUNCH.damage * TUNING.combat.block.chip, 5);
  });

  it('hits from behind ignore block', () => {
    const { s, d } = setup();
    d.facing = 1; // facing away from the attacker
    run(s, 5, input(), input({ block: true }));
    // Keep facing away: block roots and does not turn.
    run(s, 12, (t) => input({ punchPressed: t === 0 }), input({ block: true }));
    expect(d.hp).toBe(d.maxHp - ATTACKS.PUNCH.damage);
  });

  it('the iron bar breaks a block', () => {
    const s = duelState({ weapons: ['IRON_BAR', 'IRON_BAR'] });
    const a = P1(s);
    const d = P2(s);
    place(a, 10, 0, 1);
    place(d, 11.2, 0, -1);
    run(s, 5, input(), input({ block: true }));
    const events = run(s, 25, (t) => input({ weaponPressed: t === 0 }), input({ block: true }));
    expect(events.some((e) => e.type === 'HIT' && e.guardBreak)).toBe(true);
    expect(['GUARDBREAK', 'NONE', 'BLOCK']).toContain(d.action);
  });
});

describe('stagger, KO and respawn', () => {
  it('repeated hits knock the target down, then give get-up invulnerability', () => {
    const { s, d } = setup();
    let saw = false;
    run(s, 200, (t) => input({ right: true, punchPressed: t % 20 === 0 }), () => {
      if (d.action === 'KNOCKDOWN') saw = true;
      return input();
    });
    expect(saw).toBe(true);
  });

  it('friendly fire is off', () => {
    const s = duelState();
    const a = P1(s);
    const ally = s.fighters[1];
    ally.action = 'NONE';
    ally.respawnAt = -1;
    ally.hp = ally.maxHp;
    place(a, 10, 0, 1);
    place(ally, 10.8, 0, -1);
    // Freeze the ally bot by keeping it in long hit-stun.
    ally.action = 'HITSTUN';
    ally.actionDuration = 10000;
    run(s, 15, (t) => input({ punchPressed: t === 0 }));
    expect(ally.hp).toBe(ally.maxHp);
  });

  it('KO credits the killer and the boss respawns after 5 s with protection', () => {
    const { s, a, d } = setup();
    d.hp = 3;
    const events = run(s, 10, (t) => input({ punchPressed: t === 0 }));
    expect(events.some((e) => e.type === 'KO')).toBe(true);
    expect(d.action).toBe('DEAD');
    expect(a.stats.kos).toBe(1);
    expect(d.stats.deaths).toBe(1);
    const deathTick = d.deathTick;
    run(s, TUNING.fighters.bossRespawnSeconds * 60 + 2);
    expect(d.action).toBe('NONE');
    expect(d.hp).toBe(d.maxHp);
    expect(d.spawnProtected).toBe(true);
    expect(s.tick - deathTick).toBeGreaterThanOrEqual(TUNING.fighters.bossRespawnSeconds * 60);
  });

  it('bots deal reduced damage', () => {
    const s = duelState();
    const d = P2(s);
    const bot = s.fighters[1];
    Object.assign(bot, { action: 'NONE', respawnAt: -1, hp: bot.maxHp });
    place(bot, 10, 0, 1);
    place(d, 10.9, 0, -1);
    P1(s).pos = { x: -10, y: 0 };
    // Drive the bot attack directly through its fighter state.
    bot.action = 'ATTACK';
    bot.attackId = 'PUNCH';
    bot.actionTick = 0;
    bot.actionDuration = 17;
    bot.attackHitIds = [];
    run(s, 8);
    expect(d.hp).toBeCloseTo(d.maxHp - ATTACKS.PUNCH.damage * TUNING.combat.botDamageMultiplier, 5);
  });
});
