import { describe, expect, it } from 'vitest';
import { validateLevel } from '@/game/level/validate';
import { duelState, input, level, P1, place, run } from './helpers';

describe('level data', () => {
  it('passes validateLevel()', () => {
    expect(validateLevel(level)).toEqual([]);
  });
});

describe('collision', () => {
  it('lands on every floor slab from above', () => {
    for (const fl of level.floors) {
      const s = duelState();
      const f = P1(s);
      const x = fl.id === 0 ? 10 : (fl.x0 + fl.x1) / 2;
      place(f, x, fl.y + 1.2);
      f.grounded = false;
      f.mode = 'AIR';
      run(s, 90);
      expect(f.pos.y).toBeCloseTo(fl.y, 5);
      expect(f.grounded).toBe(true);
      expect(f.floor).toBe(fl.id);
    }
  });

  it('never tunnels through a slab at max fall speed', () => {
    const s = duelState();
    const f = P1(s);
    place(f, 10, 4.25);
    f.grounded = false;
    f.mode = 'AIR';
    f.vel.y = -18;
    run(s, 30);
    expect(f.pos.y).toBeCloseTo(4, 5);
  });

  it('cannot jump from one floor to the next', () => {
    const s = duelState();
    const f = P1(s);
    place(f, 10, 0);
    let maxY = 0;
    run(s, 90, (t) => {
      maxY = Math.max(maxY, f.pos.y);
      return input({ jumpPressed: t === 0, up: t < 3 });
    });
    expect(maxY).toBeLessThan(4 - 1.8 + 0.01);
    expect(f.floor).toBe(0);
  });

  it('blocks walking through the right wall and lets fighters through door D1', () => {
    const s = duelState();
    const f = P1(s);
    place(f, 22, 0);
    run(s, 120, input({ right: true }));
    expect(f.pos.x).toBeLessThanOrEqual(24 - 0.3 + 1e-6);
    place(f, -3, 0);
    run(s, 90, input({ right: true }));
    expect(f.pos.x).toBeGreaterThan(1);
  });

  it('jump has an apex of about 1.67 units', () => {
    const s = duelState();
    const f = P1(s);
    place(f, -6, 0);
    let maxY = 0;
    run(s, 60, (t) => { maxY = Math.max(maxY, f.pos.y); return input({ jumpPressed: t === 0 }); });
    expect(maxY).toBeGreaterThan(1.5);
    expect(maxY).toBeLessThan(1.8);
  });
});

describe('traversal', () => {
  it('climbs every stair up and down using explicit Up/Down', () => {
    for (const st of level.stairs) {
      const s = duelState();
      const f = P1(s);
      place(f, st.foot.x, st.foot.y);
      run(s, 150, input({ up: true }));
      expect(f.mode).toBe('GROUND');
      expect(Math.abs(f.pos.x - st.top.x)).toBeLessThan(0.15); // may slide slightly after stepping off
      expect(f.pos.y).toBeCloseTo(st.top.y, 5);
      expect(f.floor).toBe(st.topFloor);
      run(s, 150, input({ down: true }));
      expect(f.pos.y).toBeCloseTo(st.foot.y, 5);
      expect(f.floor).toBe(st.footFloor);
    }
  });

  it('does not enter a stair when running past its foot without Up', () => {
    const s = duelState();
    const f = P1(s);
    place(f, 17, 0);
    run(s, 50, input({ right: true }));
    expect(f.mode).toBe('GROUND');
    expect(f.pos.y).toBe(0);
    expect(f.pos.x).toBeGreaterThan(20.5);
  });

  it('climbs the outside ladder to the F2 window and back down', () => {
    const s = duelState();
    const f = P1(s);
    place(f, -1.2, 0);
    run(s, 120, input({ up: true }));
    expect(f.floor).toBe(1);
    expect(f.pos.y).toBeCloseTo(4, 5);
    expect(f.pos.x).toBeCloseTo(0.8, 5);
    run(s, 120, input({ down: true, left: true }));
    expect(f.pos.y).toBeCloseTo(0, 5);
    expect(f.floor).toBe(0);
  });

  it('drops through each stairwell opening to the floor below', () => {
    const drops = [
      { x: 15.5, y: 4, dir: 1, to: 0 },
      { x: 8.5, y: 8, dir: -1, to: 1 },
      { x: 15.5, y: 12, dir: 1, to: 2 },
    ];
    for (const d of drops) {
      const s = duelState();
      const f = P1(s);
      place(f, d.x, d.y, d.dir as 1 | -1);
      run(s, 90, input(d.dir > 0 ? { right: true } : { left: true }));
      expect(f.floor).toBe(d.to);
    }
  });
});
