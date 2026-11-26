import { describe, expect, it } from 'vitest';
import { COSMETIC_SLOTS, COSMETICS, POINT_PACKS, findPack, packPoints, resolveLoadout, sanitizeLoadout } from '@/game/config/shop';

describe('shop catalog (T-P01, T-P02)', () => {
  it('packs match the plan and are well-formed', () => {
    expect(POINT_PACKS.map((p) => [p.id, p.priceCents, packPoints(p)])).toEqual([
      ['pack_200', 199, 200], ['pack_550', 499, 550], ['pack_1200', 999, 1200], ['pack_2600', 1999, 2600],
    ]);
    expect(new Set(POINT_PACKS.map((p) => p.id)).size).toBe(POINT_PACKS.length);
    expect(findPack('pack_550')?.bonusPoints).toBe(50);
    expect(findPack('nope')).toBeUndefined();
    expect(findPack(42)).toBeUndefined();
  });

  it('items have unique ids, valid slots and positive prices; every slot is stocked', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const c of COSMETICS) {
      expect(COSMETIC_SLOTS).toContain(c.slot);
      expect(c.price).toBeGreaterThan(0);
      expect(Number.isInteger(c.price)).toBe(true);
      expect(c.id.startsWith({ hat: 'hat_', weapon: 'wpn_', trail: 'trail_' }[c.slot])).toBe(true);
    }
    for (const s of COSMETIC_SLOTS) expect(COSMETICS.some((c) => c.slot === s)).toBe(true);
  });

  it('sanitizeLoadout keeps only owned items in the right slot', () => {
    const owned = ['hat_tophat', 'trail_ink'];
    expect(sanitizeLoadout({ hat: 'hat_tophat', weapon: 'wpn_gold', trail: 'hat_tophat' }, owned)).toEqual({ hat: 'hat_tophat' });
    expect(sanitizeLoadout({ trail: 'trail_ink', extra: 'x' }, new Set(owned))).toEqual({ trail: 'trail_ink' });
    expect(sanitizeLoadout(null, owned)).toEqual({});
    expect(sanitizeLoadout('junk', owned)).toEqual({});
  });

  it('resolveLoadout returns styles or null', () => {
    expect(resolveLoadout({})).toBeNull();
    const r = resolveLoadout({ hat: 'hat_crown', weapon: 'wpn_neon' });
    expect(r?.hat).toMatchObject({ kind: 'crown' });
    expect(r?.weapon?.glow).toBeTruthy();
    expect(r?.trail).toBeNull();
  });
});
