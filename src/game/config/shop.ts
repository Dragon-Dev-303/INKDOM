/**
 * Point packs and the cosmetic catalog (INKDOM_Payments_Plan.md §3–§4).
 * Pure data shared by the client (shop UI, renderer) and the server (prices are
 * always taken from here on the server, never from the request).
 */

export interface PointPack {
  id: string;
  basePoints: number;
  bonusPoints: number;
  /** Price in US cents. */
  priceCents: number;
}

export const CURRENCY = 'usd';

export const POINT_PACKS: readonly PointPack[] = [
  { id: 'pack_200', basePoints: 200, bonusPoints: 0, priceCents: 199 },
  { id: 'pack_550', basePoints: 500, bonusPoints: 50, priceCents: 499 },
  { id: 'pack_1200', basePoints: 1000, bonusPoints: 200, priceCents: 999 },
  { id: 'pack_2600', basePoints: 2000, bonusPoints: 600, priceCents: 1999 },
];

export const packPoints = (p: PointPack) => p.basePoints + p.bonusPoints;
export const packBonusPct = (p: PointPack) => Math.round((p.bonusPoints / p.basePoints) * 100);
export const findPack = (id: unknown): PointPack | undefined =>
  typeof id === 'string' ? POINT_PACKS.find((p) => p.id === id) : undefined;
export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ---------------- Cosmetics ----------------

export type CosmeticSlot = 'hat' | 'weapon' | 'trail';
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ['hat', 'weapon', 'trail'];
export const SLOT_LABELS: Record<CosmeticSlot, string> = { hat: 'Hats', weapon: 'Weapon skins', trail: 'Attack trails' };

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9CA3AF',
  rare: '#38BDF8',
  epic: '#C084FC',
  legendary: '#F4D35E',
};

export type HatStyle =
  | { kind: 'headband'; color: string }
  | { kind: 'tophat'; color: string; band: string }
  | { kind: 'horns'; color: string }
  | { kind: 'halo'; color: string }
  | { kind: 'crown'; color: string; gem: string };
export interface WeaponStyle { blade: string; bar: string; hilt: string; guard: string; glow?: string }
export interface TrailStyle { colors: string[] }

interface ItemBase { id: string; name: string; description: string; rarity: Rarity; price: number }
export type CosmeticItem =
  | (ItemBase & { slot: 'hat'; style: HatStyle })
  | (ItemBase & { slot: 'weapon'; style: WeaponStyle })
  | (ItemBase & { slot: 'trail'; style: TrailStyle });

export const COSMETICS: readonly CosmeticItem[] = [
  { id: 'hat_headband', slot: 'hat', name: 'Ink Headband', description: 'A black band with tails that flutter behind you.', rarity: 'common', price: 150, style: { kind: 'headband', color: '#111318' } },
  { id: 'hat_tophat', slot: 'hat', name: "Gentleman's Top Hat", description: 'Fight with dignity.', rarity: 'rare', price: 300, style: { kind: 'tophat', color: '#14161c', band: '#b91c1c' } },
  { id: 'hat_horns', slot: 'hat', name: 'Oni Horns', description: 'Two curved horns. Defenders will remember them.', rarity: 'rare', price: 450, style: { kind: 'horns', color: '#e5e1d3' } },
  { id: 'hat_halo', slot: 'hat', name: 'Halo', description: 'A glowing ring for the righteous (or the smug).', rarity: 'epic', price: 700, style: { kind: 'halo', color: '#fde68a' } },
  { id: 'hat_crown', slot: 'hat', name: 'Golden Crown', description: 'The empire is yours. Wear it.', rarity: 'legendary', price: 1200, style: { kind: 'crown', color: '#f4c430', gem: '#dc2626' } },

  { id: 'wpn_obsidian', slot: 'weapon', name: 'Obsidian', description: 'Black volcanic glass.', rarity: 'common', price: 250, style: { blade: '#2b2d35', bar: '#25272e', hilt: '#111', guard: '#6b7280' } },
  { id: 'wpn_neon', slot: 'weapon', name: 'Neon Edge', description: 'Glows cyan in the dark stairwells.', rarity: 'rare', price: 450, style: { blade: '#67e8f9', bar: '#22d3ee', hilt: '#0f172a', guard: '#a5f3fc', glow: 'rgba(34,211,238,0.55)' } },
  { id: 'wpn_gold', slot: 'weapon', name: 'Gilded', description: 'Polished gold from tip to grip.', rarity: 'epic', price: 600, style: { blade: '#facc15', bar: '#eab308', hilt: '#78350f', guard: '#fde047', glow: 'rgba(250,204,21,0.35)' } },
  { id: 'wpn_sakura', slot: 'weapon', name: 'Sakura', description: 'Pink steel, cherry-wood grip.', rarity: 'legendary', price: 900, style: { blade: '#f9a8d4', bar: '#f472b6', hilt: '#7c2d12', guard: '#fbcfe8', glow: 'rgba(244,114,182,0.45)' } },

  { id: 'trail_ink', slot: 'trail', name: 'Ink Splatter', description: 'Every swing leaves ink drops behind.', rarity: 'common', price: 200, style: { colors: ['#0b0c10', '#1f2330'] } },
  { id: 'trail_ember', slot: 'trail', name: 'Embers', description: 'Sparks and glowing embers.', rarity: 'rare', price: 400, style: { colors: ['#f97316', '#facc15', '#ef4444'] } },
  { id: 'trail_frost', slot: 'trail', name: 'Frost', description: 'Ice crystals in the air.', rarity: 'rare', price: 400, style: { colors: ['#e0f2fe', '#7dd3fc', '#bae6fd'] } },
  { id: 'trail_rainbow', slot: 'trail', name: 'Prism', description: 'All the colours, all the time.', rarity: 'legendary', price: 1000, style: { colors: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'] } },
];

export const findItem = (id: unknown): CosmeticItem | undefined =>
  typeof id === 'string' ? COSMETICS.find((c) => c.id === id) : undefined;

export type Loadout = Partial<Record<CosmeticSlot, string | null>>;

/** Keeps only known items that are owned and sit in the matching slot. */
export function sanitizeLoadout(raw: unknown, owned: ReadonlySet<string> | readonly string[]): Loadout {
  const own = owned instanceof Set ? owned : new Set(owned as readonly string[]);
  const out: Loadout = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const slot of COSMETIC_SLOTS) {
    const id = (raw as Record<string, unknown>)[slot];
    const item = findItem(id);
    if (item && item.slot === slot && own.has(item.id)) out[slot] = item.id;
  }
  return out;
}

/** Resolved styles for the renderer; null when the slot is empty. */
export interface ResolvedCosmetics { hat: HatStyle | null; weapon: WeaponStyle | null; trail: TrailStyle | null }

export function resolveLoadout(l: Loadout | null | undefined): ResolvedCosmetics | null {
  if (!l) return null;
  const pick = <S extends CosmeticSlot>(slot: S) => {
    const item = findItem(l[slot]);
    return item && item.slot === slot ? item : undefined;
  };
  const hat = pick('hat');
  const weapon = pick('weapon');
  const trail = pick('trail');
  if (!hat && !weapon && !trail) return null;
  return {
    hat: hat?.slot === 'hat' ? hat.style : null,
    weapon: weapon?.slot === 'weapon' ? weapon.style : null,
    trail: trail?.slot === 'trail' ? trail.style : null,
  };
}
