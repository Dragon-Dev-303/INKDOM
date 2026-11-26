import { describe, expect, it } from 'vitest';
import { BUILDING } from '@/game/level/building';
import { Fx } from '@/game/render/fx';
import { PALETTES, Renderer } from '@/game/render/renderer';
import { createMatch, stepMatch } from '@/game/sim/match';
import { EMPTY_INPUT, type GameEvent } from '@/game/sim/types';
import { resolveLoadout } from '@/game/config/shop';

/** A fake 2D context that records calls and rejects non-finite coordinates. */
function fakeCanvas() {
  let calls = 0;
  let bad = 0;
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') return () => gradient;
      if (prop === 'measureText') return (s: string) => ({ width: s.length * 7 });
      return (...args: unknown[]) => {
        calls++;
        if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) bad++;
      };
    },
    set(target, prop: string, value) { target[prop] = value; return true; },
  });
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1366, height: 768 }),
  } as unknown as HTMLCanvasElement;
  return { canvas, stats: () => ({ calls, bad }) };
}

describe('canvas renderer', () => {
  it('renders whole CPU matches (all states, HUD, debug overlay) without errors or NaN coordinates', () => {
    (globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 };
    const { canvas, stats } = fakeCanvas();
    const r = new Renderer(canvas, BUILDING);
    const fx = new Fx();
    for (const seed of [1, 2]) {
      const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['CPU', 'CPU'] }, seed);
      let frame = 0;
      while (s.phase !== 'ENDED' && frame < 20000) {
        const events: GameEvent[] = [];
        stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT], events);
        for (const e of events) {
          if (e.type === 'HIT') fx.hit(e.x, e.y, e.heavy, e.blocked);
          if (e.type === 'KO') fx.ko(e.x, e.y);
        }
        fx.update(1 / 60);
        if (frame % 5 === 0) {
          r.render(s, 0.5, fx, {
            palette: frame % 2 ? PALETTES.standard : PALETTES.highContrast,
            showHints: true, debug: frame % 50 === 0, showFps: true, fps: 60, stepMs: 0.3, now: frame * 16,
            banners: [{ text: 'TEST', sub: 'sub', color: '#fff', start: 0, until: 1e12 }],
            toasts: [{ text: 'toast', color: '#fff', until: 1e12 }], smallWindow: frame % 2 === 0,
          });
        }
        frame++;
      }
      expect(s.phase).toBe('ENDED');
    }
    expect(stats().calls).toBeGreaterThan(10000);
    expect(stats().bad).toBe(0);
    expect(fx.activeCount()).toBeLessThanOrEqual(200);
  });

  it('draws cosmetic hats, weapon skins and trails on both bosses (T-P15)', () => {
    (globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 };
    const opts = (cosmetics?: ReturnType<typeof resolveLoadout>[]) => ({
      palette: PALETTES.standard, showHints: false, debug: false, showFps: false, fps: 60, stepMs: 0, now: 0,
      banners: [], toasts: [], smallWindow: false, cosmetics,
    });
    const hats = ['hat_headband', 'hat_tophat', 'hat_horns', 'hat_halo', 'hat_crown'];
    for (const hat of hats) {
      const plain = fakeCanvas();
      const dressed = fakeCanvas();
      const fxA = new Fx();
      const fxB = new Fx();
      const rA = new Renderer(plain.canvas, BUILDING);
      const rB = new Renderer(dressed.canvas, BUILDING);
      const look = [resolveLoadout({ hat, weapon: 'wpn_neon', trail: 'trail_rainbow' }), resolveLoadout({ hat: 'hat_crown', weapon: 'wpn_gold' })];
      const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['CPU', 'CPU'] }, 7);
      for (let i = 0; i < 1500; i++) {
        stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT], []);
        if (i % 3 === 0) {
          rA.render(s, 1, fxA, opts());
          rB.render(s, 1, fxB, opts(look));
        }
      }
      expect(dressed.stats().bad).toBe(0);
      expect(dressed.stats().calls).toBeGreaterThan(plain.stats().calls);
      expect(fxB.activeCount()).toBeLessThanOrEqual(200);
    }
  });
});
