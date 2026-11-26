/** Bosses (GDD §4, §6): 10 archetypes, attributes with a point budget and diminishing returns, abilities, equipment. */
import { resolve } from './mock';

export type ArchetypeId =
  | 'commander' | 'warrior' | 'assassin' | 'mage' | 'engineer' | 'medic' | 'sniper' | 'tank' | 'pilot' | 'strategist';

export type AttributeId = 'strength' | 'agility' | 'magic' | 'stamina' | 'defense' | 'precision';
export const ATTRIBUTE_IDS: readonly AttributeId[] = ['strength', 'agility', 'magic', 'stamina', 'defense', 'precision'];

export type Allocation = Record<AttributeId, number>;

export interface AttributeDef {
  id: AttributeId;
  label: string;
  icon: string;
  effect: string;
}

export const ATTRIBUTES: Record<AttributeId, AttributeDef> = {
  strength: { id: 'strength', label: 'Strength', icon: '💪', effect: 'Melee damage, shove and heavy objects' },
  agility: { id: 'agility', label: 'Agility', icon: '🤸', effect: 'Movement, dodge, climb and air control' },
  magic: { id: 'magic', label: 'Magic', icon: '✨', effect: 'Ability access, energy pool, spell scaling' },
  stamina: { id: 'stamina', label: 'Stamina', icon: '🫁', effect: 'Sprinting, blocking, repeated attacks' },
  defense: { id: 'defense', label: 'Defense', icon: '🛡', effect: 'Damage mitigation and stagger resistance' },
  precision: { id: 'precision', label: 'Precision', icon: '🎯', effect: 'Aim stability, scouting, cooldown utility' },
};

/**
 * Attribute rules (PROPOSED, GDD §6). Each archetype gets fixed base points (same total for all),
 * the player spends `budget` more; each attribute is capped at `maxPerAttribute` allocated points.
 * Ranked PvP may normalise builds.
 */
export const ATTRIBUTE_RULES = {
  budget: 24,
  maxPerAttribute: 12,
  baseTotal: 12,
  /** Bonus % per point within each tier: points 1–4, 5–8, 9+ (base + allocated). */
  tiers: [
    { upTo: 4, perPoint: 5 },
    { upTo: 8, perPoint: 3 },
    { upTo: Infinity, perPoint: 1.5 },
  ],
} as const;

/** Total bonus % for a given number of points (diminishing returns). */
export function attributeEffect(points: number): number {
  let total = 0;
  let prev = 0;
  for (const t of ATTRIBUTE_RULES.tiers) {
    const inTier = Math.max(0, Math.min(points, t.upTo) - prev);
    total += inTier * t.perPoint;
    prev = t.upTo;
    if (points <= t.upTo) break;
  }
  return Math.round(total * 10) / 10;
}

/** Marginal bonus % of the next point. */
export const nextPointValue = (points: number) => Math.round((attributeEffect(points + 1) - attributeEffect(points)) * 10) / 10;

export const allocationTotal = (a: Allocation) => ATTRIBUTE_IDS.reduce((s, k) => s + a[k], 0);

export interface Archetype {
  id: ArchetypeId;
  name: string;
  icon: string;
  role: string;
  description: string;
  base: Allocation;
  abilityIds: string[];
  difficulty: 1 | 2 | 3;
  isSample: boolean;
}

export type EquipmentSlot = 'melee' | 'ranged' | 'utility' | 'magic' | 'armor' | 'support';
export const EQUIPMENT_SLOTS: Record<EquipmentSlot, string> = {
  melee: 'Melee', ranged: 'Ranged', utility: 'Utility', magic: 'Magic', armor: 'Armor', support: 'Air support',
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  stats: string;
  unlocked: boolean;
  unlockCost: number;
  isSample: boolean;
}

export interface Ability {
  id: string;
  name: string;
  icon: string;
  archetypeId: ArchetypeId | null;
  element: 'fire' | 'ice' | 'lightning' | 'shadow' | 'gravity' | 'none';
  cooldownSec: number;
  energy: number;
  description: string;
  isSample: boolean;
}

export interface BossBuild {
  name: string;
  level: number;
  archetypeId: ArchetypeId;
  allocation: Allocation;
  equipment: Partial<Record<EquipmentSlot, string>>;
  abilityIds: string[];
  isSample: boolean;
}

export interface BossService {
  listArchetypes(): Promise<Archetype[]>;
  listEquipment(): Promise<EquipmentItem[]>;
  listAbilities(): Promise<Ability[]>;
  getMyBoss(): Promise<BossBuild>;
}

const A = (s: number, ag: number, m: number, st: number, d: number, p: number): Allocation => ({
  strength: s, agility: ag, magic: m, stamina: st, defense: d, precision: p,
});

export const ARCHETYPES: readonly Archetype[] = [
  { id: 'commander', name: 'Commander', icon: '👑', role: 'Squad coordination', description: 'Order bonuses: squads react faster and hold formation.', base: A(2, 2, 1, 3, 2, 2), abilityIds: ['rally-cry', 'focus-fire'], difficulty: 1, isSample: true },
  { id: 'warrior', name: 'Warrior', icon: '⚔', role: 'Melee pressure', description: 'Long combos, armoured heavies and iron-bar mastery.', base: A(4, 2, 0, 3, 3, 0), abilityIds: ['whirlwind', 'iron-will'], difficulty: 1, isSample: true },
  { id: 'assassin', name: 'Assassin', icon: '🗡', role: 'Mobility & ambush', description: 'Fast, fragile; vents, smoke and back-stabs.', base: A(2, 5, 1, 2, 0, 2), abilityIds: ['shadow-step', 'smoke-veil'], difficulty: 3, isSample: true },
  { id: 'mage', name: 'Mage', icon: '🔮', role: 'Area magic & shields', description: 'Controls rooms with elemental zones and barriers.', base: A(0, 2, 5, 2, 1, 2), abilityIds: ['fireball', 'arcane-ward'], difficulty: 2, isSample: true },
  { id: 'engineer', name: 'Engineer', icon: '🔧', role: 'Barricades & gadgets', description: 'Builds, repairs and breaches; turrets on defence.', base: A(2, 2, 1, 3, 2, 2), abilityIds: ['deploy-barricade', 'breach-charge'], difficulty: 2, isSample: true },
  { id: 'medic', name: 'Medic', icon: '⛑', role: 'Healing & revives', description: 'Keeps the squad standing and calls medevac.', base: A(1, 2, 3, 3, 2, 1), abilityIds: ['field-heal', 'revive'], difficulty: 2, isSample: true },
  { id: 'sniper', name: 'Sniper', icon: '🎯', role: 'Long-range precision', description: 'Picks targets across floors and through windows.', base: A(1, 2, 0, 2, 1, 6), abilityIds: ['steady-aim', 'mark-target'], difficulty: 3, isSample: true },
  { id: 'tank', name: 'Tank', icon: '🛡', role: 'Defence & crowd control', description: 'Holds stairwells and shoves attackers back.', base: A(3, 0, 0, 3, 6, 0), abilityIds: ['shield-wall', 'ground-slam'], difficulty: 1, isSample: true },
  { id: 'pilot', name: 'Pilot', icon: '🚁', role: 'Air support & transport', description: 'Shorter helicopter cooldowns and roof insertions.', base: A(1, 3, 1, 2, 1, 4), abilityIds: ['call-chopper', 'flare'], difficulty: 2, isSample: true },
  { id: 'strategist', name: 'Strategist', icon: '♟', role: 'Recon & reinforcements', description: 'Reveals the floor plan and plans reinforcement waves.', base: A(1, 2, 2, 2, 1, 4), abilityIds: ['recon-ping', 'reinforce'], difficulty: 3, isSample: true },
];

const ABILITIES: readonly Omit<Ability, 'isSample'>[] = [
  { id: 'rally-cry', name: 'Rally cry', icon: '📣', archetypeId: 'commander', element: 'none', cooldownSec: 40, energy: 20, description: 'Nearby squads gain speed and obey orders instantly for 8 s.' },
  { id: 'focus-fire', name: 'Focus fire', icon: '🎯', archetypeId: 'commander', element: 'none', cooldownSec: 30, energy: 15, description: 'Mark an enemy; squad damage against it +20%.' },
  { id: 'whirlwind', name: 'Whirlwind', icon: '🌀', archetypeId: 'warrior', element: 'none', cooldownSec: 18, energy: 25, description: 'Spinning bar strike that hits all sides.' },
  { id: 'iron-will', name: 'Iron will', icon: '🧱', archetypeId: 'warrior', element: 'none', cooldownSec: 45, energy: 30, description: 'Ignore hit stun for 4 s.' },
  { id: 'shadow-step', name: 'Shadow step', icon: '👣', archetypeId: 'assassin', element: 'shadow', cooldownSec: 12, energy: 20, description: 'Teleport behind the nearest enemy.' },
  { id: 'smoke-veil', name: 'Smoke veil', icon: '🌫', archetypeId: 'assassin', element: 'none', cooldownSec: 25, energy: 15, description: 'Smoke cloud breaks enemy targeting.' },
  { id: 'fireball', name: 'Fireball', icon: '🔥', archetypeId: 'mage', element: 'fire', cooldownSec: 8, energy: 25, description: 'Arcing projectile that leaves a burning patch.' },
  { id: 'arcane-ward', name: 'Arcane ward', icon: '🔷', archetypeId: 'mage', element: 'none', cooldownSec: 30, energy: 35, description: 'Barrier that blocks projectiles in a doorway.' },
  { id: 'deploy-barricade', name: 'Barricade', icon: '🚧', archetypeId: 'engineer', element: 'none', cooldownSec: 20, energy: 20, description: 'Repairable cover; blocks a corridor.' },
  { id: 'breach-charge', name: 'Breach charge', icon: '💥', archetypeId: 'engineer', element: 'none', cooldownSec: 35, energy: 30, description: 'Opens a destructible wall or door.' },
  { id: 'field-heal', name: 'Field heal', icon: '💚', archetypeId: 'medic', element: 'none', cooldownSec: 15, energy: 20, description: 'Heal self and allies in the room.' },
  { id: 'revive', name: 'Revive', icon: '➕', archetypeId: 'medic', element: 'none', cooldownSec: 60, energy: 40, description: 'Bring a downed bot back at half health.' },
  { id: 'steady-aim', name: 'Steady aim', icon: '🔭', archetypeId: 'sniper', element: 'none', cooldownSec: 20, energy: 15, description: 'Zero sway and +50% range for 5 s.' },
  { id: 'mark-target', name: 'Mark target', icon: '📍', archetypeId: 'sniper', element: 'none', cooldownSec: 25, energy: 10, description: 'Reveal an enemy to your whole team.' },
  { id: 'shield-wall', name: 'Shield wall', icon: '🛡', archetypeId: 'tank', element: 'none', cooldownSec: 30, energy: 25, description: 'Block everything from the front while walking.' },
  { id: 'ground-slam', name: 'Ground slam', icon: '🌋', archetypeId: 'tank', element: 'gravity', cooldownSec: 22, energy: 30, description: 'Knock down nearby enemies.' },
  { id: 'call-chopper', name: 'Call chopper', icon: '🚁', archetypeId: 'pilot', element: 'none', cooldownSec: 90, energy: 50, description: 'Request a helicopter support action at half cooldown.' },
  { id: 'flare', name: 'Flare', icon: '🎇', archetypeId: 'pilot', element: 'fire', cooldownSec: 20, energy: 15, description: 'Lights the area and blinds briefly.' },
  { id: 'recon-ping', name: 'Recon ping', icon: '📡', archetypeId: 'strategist', element: 'none', cooldownSec: 30, energy: 20, description: 'Reveal enemies on one floor for 3 s.' },
  { id: 'reinforce', name: 'Reinforce', icon: '🧭', archetypeId: 'strategist', element: 'none', cooldownSec: 80, energy: 40, description: 'Spawn the next bot wave at a chosen entrance.' },
  { id: 'frost-nova', name: 'Frost nova', icon: '❄', archetypeId: null, element: 'ice', cooldownSec: 28, energy: 30, description: 'Slows everything nearby. Unlocked by territory.' },
  { id: 'chain-lightning', name: 'Chain lightning', icon: '⚡', archetypeId: null, element: 'lightning', cooldownSec: 24, energy: 35, description: 'Jumps between up to 3 targets. Legendary boss skill.' },
];

const EQUIPMENT: readonly Omit<EquipmentItem, 'isSample'>[] = [
  { id: 'fists', name: 'Bare fists', slot: 'melee', rarity: 'common', stats: 'Fast · full combo list', unlocked: true, unlockCost: 0 },
  { id: 'iron-bar', name: 'Iron bar', slot: 'melee', rarity: 'common', stats: 'Dmg 14 · reach +20%', unlocked: true, unlockCost: 0 },
  { id: 'katana', name: 'Ink katana', slot: 'melee', rarity: 'rare', stats: 'Dmg 18 · fast slashes', unlocked: false, unlockCost: 1200 },
  { id: 'spear', name: 'Spear', slot: 'melee', rarity: 'uncommon', stats: 'Dmg 15 · longest reach', unlocked: false, unlockCost: 600 },
  { id: 'bow', name: 'Recurve bow', slot: 'ranged', rarity: 'uncommon', stats: 'Dmg 20 · 6 arrows', unlocked: true, unlockCost: 0 },
  { id: 'rifle', name: 'Precision rifle', slot: 'ranged', rarity: 'epic', stats: 'Dmg 35 · 3 rounds · slow reload', unlocked: false, unlockCost: 2400 },
  { id: 'medkit', name: 'Medkit', slot: 'utility', rarity: 'common', stats: 'Heal 30 · 2 charges', unlocked: true, unlockCost: 0 },
  { id: 'smoke', name: 'Smoke grenade', slot: 'utility', rarity: 'uncommon', stats: '6 s cloud', unlocked: true, unlockCost: 0 },
  { id: 'repair-kit', name: 'Repair kit', slot: 'utility', rarity: 'common', stats: 'Fix doors & barricades', unlocked: false, unlockCost: 300 },
  { id: 'fire-tome', name: 'Tome of embers', slot: 'magic', rarity: 'rare', stats: 'Fire spells +15%', unlocked: true, unlockCost: 0 },
  { id: 'gravity-orb', name: 'Gravity orb', slot: 'magic', rarity: 'legendary', stats: 'Pull enemies; territory reward', unlocked: false, unlockCost: 0 },
  { id: 'vest', name: 'Padded vest', slot: 'armor', rarity: 'common', stats: 'Mitigation +5%', unlocked: true, unlockCost: 0 },
  { id: 'riot-plate', name: 'Riot plate', slot: 'armor', rarity: 'epic', stats: 'Mitigation +12% · −5% speed', unlocked: false, unlockCost: 1800 },
  { id: 'beacon', name: 'Support beacon', slot: 'support', rarity: 'rare', stats: 'Calls one helicopter action', unlocked: true, unlockCost: 0 },
];

const MY_BOSS: BossBuild = {
  name: 'Inkbaron',
  level: 17,
  archetypeId: 'warrior',
  allocation: A(8, 5, 0, 5, 4, 2),
  equipment: { melee: 'iron-bar', ranged: 'bow', utility: 'medkit', armor: 'vest', support: 'beacon' },
  abilityIds: ['whirlwind', 'iron-will'],
  isSample: true,
};

export const mockBossService: BossService = {
  listArchetypes: () => resolve([...ARCHETYPES]),
  listEquipment: () => resolve(EQUIPMENT.map((e) => ({ ...e, isSample: true }))),
  listAbilities: () => resolve(ABILITIES.map((a) => ({ ...a, isSample: true }))),
  getMyBoss: () => resolve(MY_BOSS),
};
