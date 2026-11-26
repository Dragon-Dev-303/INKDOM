import { describe, expect, it } from 'vitest';
import { getClip } from '@/game/anim/library';
import { getMove, MOVES } from '@/game/combat/moves';
import { canUse, neutralStarter } from '@/game/combat/resolver';
import { BUTTONS } from '@/game/combat/types';
import { TUNING } from '@/game/config/tuning';
import { createMatch, stepMatch } from '@/game/sim/match';
import { EMPTY_INPUT, type GameEvent, type InputFrame, type MatchState, type WeaponId } from '@/game/sim/types';
import { duelState, input, P1, P2, place, run } from './helpers';

type Step = { t: number; i: Partial<InputFrame> };

/** Feed a scripted input timeline to P1 (P2 idle unless given) and return the moves P1 started. */
function play(s: MatchState, steps: Step[], ticks: number, p2: (t: number) => InputFrame = () => input()) {
  const started: string[] = [];
  const events: GameEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    const p1 = input(Object.assign({}, ...steps.filter((x) => x.t === t).map((x) => x.i)));
    const ev: GameEvent[] = [];
    stepMatch(s, [p1, p2(t)], ev);
    for (const e of ev) if (e.type === 'ATTACK_START' && e.fighter === P1(s).id) started.push(e.attack);
    events.push(...ev);
  }
  return { started, events };
}

const P = (t: number, extra: Partial<InputFrame> = {}): Step => ({ t, i: { punchPressed: true, ...extra } });
const K = (t: number, extra: Partial<InputFrame> = {}): Step => ({ t, i: { kickPressed: true, ...extra } });
const H = (t: number, extra: Partial<InputFrame> = {}): Step => ({ t, i: { heavyPressed: true, ...extra } });
const W = (t: number, extra: Partial<InputFrame> = {}): Step => ({ t, i: { weaponPressed: true, ...extra } });
const S = (t: number, extra: Partial<InputFrame> = {}): Step => ({ t, i: { specialPressed: true, ...extra } });

/** Duel with P1 alone in open space (whiffs), unarmed unless a weapon is given. */
function solo(weapon: WeaponId = 'FISTS') {
  const s = duelState({ weapons: [weapon, 'FISTS'] });
  place(P1(s), 10, 0, 1);
  place(P2(s), 24, 16, -1);
  return s;
}

describe('combo strings (T-C01–T-C06)', () => {
  it('J,J,J,J → jab, cross, lead hook, rear uppercut', () => {
    const { started } = play(solo(), [P(0), P(6), P(12), P(18)], 70);
    expect(started).toEqual(['jab', 'cross', 'lead_hook', 'rear_uppercut']);
  });

  it('J+K, J+U, J+I (fists / sword), J+O with and without energy', () => {
    expect(play(solo(), [P(0), K(6)], 50).started).toEqual(['jab', 'roundhouse']);
    expect(play(solo(), [P(0), H(6)], 50).started).toEqual(['jab', 'power_straight']);
    expect(play(solo(), [P(0), W(6)], 50).started).toEqual(['jab', 'elbow']);
    expect(play(solo('SHORT_SWORD'), [P(0), W(6)], 50).started).toEqual(['jab', 'sword_slash']);
    expect(play(solo('IRON_BAR'), [P(0), W(6)], 50).started).toEqual(['jab', 'bar_smash']);
    const rich = solo();
    P1(rich).energy = 40;
    expect(play(rich, [P(0), S(6)], 50).started).toEqual(['jab', 'spin_backfist']);
    expect(P1(rich).energy).toBe(15);
    expect(play(solo(), [P(0), S(6)], 50).started).toEqual(['jab']);
  });

  it('J,J,K → low kick; K,K → roundhouse; K,K,K → side kick', () => {
    expect(play(solo(), [P(0), P(6), K(12)], 60).started).toEqual(['jab', 'cross', 'low_kick']);
    expect(play(solo(), [K(0), K(10)], 60).started).toEqual(['front_kick', 'roundhouse']);
    expect(play(solo(), [K(0), K(10), K(20)], 80).started).toEqual(['front_kick', 'roundhouse', 'side_kick']);
  });

  it('weapon strings: sword I,I,I and bar I,I', () => {
    expect(play(solo('SHORT_SWORD'), [W(0), W(12), W(22)], 80).started).toEqual(['sword_slash', 'sword_backslash', 'sword_thrust']);
    expect(play(solo('IRON_BAR'), [W(0), W(16)], 80).started).toEqual(['bar_smash', 'bar_sweep']);
  });

  it('directional and air moves: F+J, F+K, B+K, D+J, D+K, air J/K', () => {
    const s1 = solo();
    const x0 = P1(s1).pos.x;
    expect(play(s1, [P(0, { right: true })], 30).started).toEqual(['lunge_punch']);
    expect(P1(s1).pos.x - x0).toBeGreaterThan(0.8);
    expect(play(solo(), [K(0, { right: true })], 30).started).toEqual(['knee']);
    const s2 = solo();
    expect(play(s2, [K(0, { left: true })], 30).started).toEqual(['back_kick']);
    expect(P1(s2).facing).toBe(-1);
    expect(play(solo(), [P(0, { down: true })], 30).started).toEqual(['crouch_uppercut']);
    expect(play(solo(), [K(0, { down: true })], 30).started).toEqual(['sweep']);
    expect(play(solo(), [{ t: 0, i: { jumpPressed: true, up: true } }, P(8)], 30).started).toEqual(['dive_punch']);
    expect(play(solo(), [{ t: 0, i: { jumpPressed: true, up: true } }, K(8)], 30).started).toEqual(['flying_kick']);
  });

  it('chord U+K (same tick or 2 ticks apart) → axe kick; 8 ticks apart → overhand then roundhouse', () => {
    expect(play(solo(), [{ t: 0, i: { heavyPressed: true, kickPressed: true } }], 50).started).toEqual(['axe_kick']);
    expect(play(solo(), [H(0), K(2)], 50).started).toEqual(['overhand', 'axe_kick']);
    expect(play(solo(), [H(0), K(8)], 60).started).toEqual(['overhand', 'roundhouse']);
  });

  it('a press after the move has ended starts a new string instead of chaining', () => {
    expect(play(solo(), [P(0), P(20)], 50).started).toEqual(['jab', 'jab']);
  });
});

/** P1 at x=10 facing right, P2 at x=10.9 facing left (in range of jabs and kicks). */
function duel(p1Weapon: WeaponId = 'FISTS') {
  const s = duelState({ weapons: [p1Weapon, 'FISTS'] });
  place(P1(s), 10, 0, 1);
  place(P2(s), 10.9, 0, -1);
  return s;
}
const hitsOn = (events: GameEvent[], victim: number) => events.filter((e): e is Extract<GameEvent, { type: 'HIT' }> => e.type === 'HIT' && e.victim === victim);

describe('hit rules (T-C07–T-C11)', () => {
  it('standing block stops high but loses to low; crouch block stops low but loses to overhead', () => {
    const lowVsStand = duel();
    const r1 = play(lowVsStand, [P(0), P(6), K(12)], 60, () => input({ block: true }));
    const lowHit = hitsOn(r1.events, P2(lowVsStand).id).find((e) => e.attack === 'low_kick');
    expect(lowHit?.blocked).toBe(false);
    expect(hitsOn(r1.events, P2(lowVsStand).id).find((e) => e.attack === 'jab')?.blocked).toBe(true);

    const lowVsCrouch = duel();
    const r2 = play(lowVsCrouch, [K(0, { down: true })], 40, () => input({ block: true, down: true }));
    expect(hitsOn(r2.events, P2(lowVsCrouch).id)[0]?.blocked).toBe(true);

    const overVsCrouch = duel();
    const r3 = play(overVsCrouch, [{ t: 0, i: { heavyPressed: true, kickPressed: true } }], 40, () => input({ block: true, down: true }));
    expect(hitsOn(r3.events, P2(overVsCrouch).id)[0]?.blocked).toBe(false);

    const overVsStand = duel();
    const r4 = play(overVsStand, [{ t: 0, i: { heavyPressed: true, kickPressed: true } }], 40, () => input({ block: true }));
    expect(hitsOn(r4.events, P2(overVsStand).id)[0]?.blocked).toBe(true);
  });

  it('crouching ducks high attacks', () => {
    const s = duel();
    const r = play(s, [P(0)], 20, () => input({ down: true }));
    expect(hitsOn(r.events, P2(s).id)).toHaveLength(0);
  });

  it('counter-hit adds damage; combo damage scales down and reports the hit count', () => {
    const s = duel();
    // P2 starts a slow overhand; P1's jab lands during its startup.
    const r = play(s, [P(2)], 12, (t) => input({ heavyPressed: t === 0 }));
    const hit = hitsOn(r.events, P2(s).id)[0];
    expect(hit.counter).toBe(true);
    expect(hit.damage).toBeCloseTo(getMove('jab')!.hit.damage * TUNING.combat.counterDamage, 5);

    const c = duel();
    const r2 = play(c, [P(0), P(6), P(12), P(18)], 60);
    const hits = hitsOn(r2.events, P2(c).id);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.map((h) => h.combo)).toEqual(hits.map((_, i) => i + 1));
    const third = hits[2];
    const base = getMove(third.attack)!.hit.damage;
    expect(third.damage).toBeCloseTo(base * (1 - 2 * TUNING.combat.scalingStep), 5);
  });

  it('juggle limit: an airborne victim past the limit is knocked down', () => {
    const s = duel();
    const v = P2(s);
    Object.assign(v, { grounded: false, mode: 'AIR', juggleHits: TUNING.combat.juggleLimit, comboHits: 3, action: 'HITSTUN', actionDuration: 30 });
    v.pos.y = 0.3;
    run(s, 6, (t) => input({ punchPressed: t === 0 }));
    expect(v.action).toBe('KNOCKDOWN');
  });

  it('stamina: dodge costs stamina, grants invulnerability, regenerates after a delay; empty stamina breaks guard', () => {
    const s = duel();
    const a = P1(s);
    run(s, 1, input({ dodgePressed: true }));
    expect(a.action).toBe('DODGE');
    expect(a.stamina).toBe(TUNING.combat.stamina.max - TUNING.combat.dodge.stamina);
    expect(a.invulnUntil).toBeGreaterThan(s.tick);
    run(s, 10);
    const low = a.stamina;
    run(s, TUNING.combat.stamina.regenDelayTicks + 30);
    expect(a.stamina).toBeGreaterThan(low);

    const g = duel();
    P2(g).stamina = 2;
    const r = play(g, [P(0)], 12, () => input({ block: true }));
    expect(hitsOn(r.events, P2(g).id)[0]?.guardBreak).toBe(true);
    expect(P2(g).action).toBe('GUARDBREAK');
  });

  it('energy builds on hit and when hit', () => {
    const s = duel();
    run(s, 8, (t) => input({ punchPressed: t === 0 }));
    expect(P1(s).energy).toBe(TUNING.combat.energy.onHit);
    expect(P2(s).energy).toBe(TUNING.combat.energy.onHurt);
  });
});

describe('move database (T-C12)', () => {
  it('every move is valid: frames, hit data, clips, chain targets and starters', () => {
    const ids = new Set(MOVES.map((m) => m.id));
    expect(ids.size).toBe(MOVES.length);
    for (const m of MOVES) {
      expect(m.frames.startup).toBeGreaterThan(0);
      expect(m.frames.active).toBeGreaterThan(0);
      expect(m.frames.recovery).toBeGreaterThan(0);
      expect(m.hit.damage).toBeGreaterThan(0);
      expect(m.hit.yBand[1]).toBeGreaterThan(m.hit.yBand[0]);
      expect(getClip(m.clip), `${m.id} clip`).not.toBeNull();
      for (const targets of Object.values(m.chains ?? {})) for (const t of targets ?? []) expect(ids.has(t), `${m.id} → ${t}`).toBe(true);
    }
    // Every chain-only move is reachable from some chain.
    const reachable = new Set(MOVES.flatMap((m) => Object.values(m.chains ?? {}).flat()));
    for (const m of MOVES) if (!m.trigger) expect(reachable.has(m.id), `${m.id} reachable`).toBe(true);
  });

  it('every weapon has a neutral move on every button that needs none', () => {
    const s = duelState();
    const f = P1(s);
    for (const weapon of ['FISTS', 'SHORT_SWORD', 'IRON_BAR'] as const) {
      f.weapon = weapon;
      f.energy = 100;
      for (const b of BUTTONS) {
        const m = neutralStarter(f, b);
        expect(m, `${weapon}/${b}`).not.toBeNull();
        expect(canUse(f, m!)).toBe(true);
      }
    }
  });
});

describe('determinism and AI (T-C13, T-C14)', () => {
  it('identical seeds and inputs give identical states with combos', () => {
    const go = () => {
      const s = createMatch({ p1Team: 'ATTACKER', weapons: ['FISTS', 'SHORT_SWORD'], controllers: ['CPU', 'CPU'] }, 77);
      for (let t = 0; t < 2400; t++) stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT], []);
      return JSON.stringify(s);
    };
    expect(go()).toBe(go());
  });

  it('bots and CPU bosses use chain moves', () => {
    const s = createMatch({ p1Team: 'ATTACKER', weapons: ['FISTS', 'FISTS'], controllers: ['CPU', 'CPU'] }, 5);
    const chained: string[] = [];
    for (let t = 0; t < 6000 && s.phase !== 'ENDED'; t++) {
      const ev: GameEvent[] = [];
      stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT], ev);
      for (const e of ev) if (e.type === 'ATTACK_START' && !getMove(e.attack)?.trigger) chained.push(e.attack);
    }
    expect(chained.length).toBeGreaterThan(5);
  });
});
