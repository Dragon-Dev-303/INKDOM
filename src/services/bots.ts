/** AI soldiers (GDD §5, §6): 10 bot types, personalities, weapons, skins, 4-slot squads. */
import type { Rarity } from './boss';
import { resolve } from './mock';

export const SQUAD_SLOTS = 4;

export type BotTypeId =
  | 'basic' | 'heavy' | 'sniper' | 'medic' | 'engineer' | 'scout' | 'guardian' | 'berserker' | 'special' | 'transport';

export interface BotType {
  id: BotTypeId;
  name: string;
  icon: string;
  role: string;
  description: string;
  /** 1–5 bars for the stat card. */
  stats: { health: number; damage: number; speed: number; range: number };
  defaultWeaponId: string;
  defaultPersonalityId: string;
  unlocked: boolean;
  unlockCost: number;
  /** e.g. "Hold 1 laboratory" for territory-gated bots. */
  unlockRequirement: string | null;
  squadCost: number;
  isSample: boolean;
}

export interface Personality {
  id: string;
  name: string;
  icon: string;
  description: string;
  behaviours: string[];
  isSample: boolean;
}

export interface BotWeapon {
  id: string;
  name: string;
  kind: 'melee' | 'ranged' | 'utility';
  damage: number;
  range: 'short' | 'medium' | 'long';
  unlocked: boolean;
  unlockCost: number;
  isSample: boolean;
}

export interface BotSkin {
  id: string;
  name: string;
  rarity: Rarity;
  cost: number;
  owned: boolean;
  /** null = any bot type. */
  botTypeId: BotTypeId | null;
  color: string;
  isSample: boolean;
}

export interface SquadSlot {
  botTypeId: BotTypeId | null;
  personalityId: string;
  weaponId: string;
  skinId: string | null;
}

export interface Squad {
  name: string;
  slots: SquadSlot[];
  /** Squad cost cap per match (PROPOSED bot budget, GDD §5). */
  budget: number;
  isSample: boolean;
}

export interface BotService {
  listBotTypes(): Promise<BotType[]>;
  listPersonalities(): Promise<Personality[]>;
  listWeapons(): Promise<BotWeapon[]>;
  listSkins(): Promise<BotSkin[]>;
  getSquad(): Promise<Squad>;
}

const S = (health: number, damage: number, speed: number, range: number) => ({ health, damage, speed, range });

export const BOT_TYPES: readonly BotType[] = [
  { id: 'basic', name: 'Basic soldier', icon: '🪖', role: 'Balanced frontline', description: 'Affordable all-rounder. Swings an iron bar.', stats: S(3, 3, 3, 1), defaultWeaponId: 'iron-bar', defaultPersonalityId: 'balanced', unlocked: true, unlockCost: 0, unlockRequirement: null, squadCost: 1, isSample: true },
  { id: 'heavy', name: 'Heavy / tank', icon: '🦏', role: 'Holds chokepoints', description: 'Absorbs damage on stairs and doorways.', stats: S(5, 3, 1, 1), defaultWeaponId: 'shield', defaultPersonalityId: 'guardian', unlocked: true, unlockCost: 0, unlockRequirement: null, squadCost: 2, isSample: true },
  { id: 'sniper', name: 'Sniper / archer', icon: '🏹', role: 'Long-range cover', description: 'Picks targets from windows and stairwells.', stats: S(2, 4, 2, 5), defaultWeaponId: 'bow', defaultPersonalityId: 'sentinel', unlocked: true, unlockCost: 0, unlockRequirement: null, squadCost: 2, isSample: true },
  { id: 'medic', name: 'Medic', icon: '⛑', role: 'Heals and revives', description: 'Follows the most wounded ally.', stats: S(2, 1, 3, 2), defaultWeaponId: 'medkit', defaultPersonalityId: 'medic', unlocked: false, unlockCost: 800, unlockRequirement: null, squadCost: 2, isSample: true },
  { id: 'engineer', name: 'Engineer', icon: '🔧', role: 'Repairs and breaches', description: 'Builds barriers and fixes doors.', stats: S(3, 2, 2, 2), defaultWeaponId: 'repair-kit', defaultPersonalityId: 'balanced', unlocked: false, unlockCost: 900, unlockRequirement: null, squadCost: 2, isSample: true },
  { id: 'scout', name: 'Scout', icon: '🦊', role: 'Finds routes', description: 'Fast; reports enemies on other floors.', stats: S(2, 2, 5, 3), defaultWeaponId: 'knife', defaultPersonalityId: 'scout', unlocked: false, unlockCost: 600, unlockRequirement: null, squadCost: 1, isSample: true },
  { id: 'guardian', name: 'Guardian', icon: '🗿', role: 'Protects boss & flag', description: 'Never strays far from the boss or the flag.', stats: S(4, 2, 2, 1), defaultWeaponId: 'shield', defaultPersonalityId: 'guardian', unlocked: false, unlockCost: 1000, unlockRequirement: null, squadCost: 2, isSample: true },
  { id: 'berserker', name: 'Berserker', icon: '🐗', role: 'High-risk melee', description: 'Charges the nearest enemy and ignores pain.', stats: S(3, 5, 4, 1), defaultWeaponId: 'club', defaultPersonalityId: 'berserker', unlocked: false, unlockCost: 1100, unlockRequirement: null, squadCost: 2, isSample: true },
  { id: 'special', name: 'Special / magic', icon: '🧙', role: 'Area utility powers', description: 'Casts slows, decoys and small shields.', stats: S(2, 4, 2, 4), defaultWeaponId: 'wand', defaultPersonalityId: 'sentinel', unlocked: false, unlockCost: 0, unlockRequirement: 'Hold a laboratory or a city with a research lab', squadCost: 3, isSample: true },
  { id: 'transport', name: 'Transport / support', icon: '📦', role: 'Supplies & troop drops', description: 'Carries ammo and repair parts in approved zones.', stats: S(3, 1, 3, 1), defaultWeaponId: 'fists', defaultPersonalityId: 'balanced', unlocked: false, unlockCost: 0, unlockRequirement: 'City control with a transport hub', squadCost: 2, isSample: true },
];

const PERSONALITIES: readonly Omit<Personality, 'isSample'>[] = [
  { id: 'balanced', name: 'Balanced', icon: '⚖', description: 'Follows orders, engages in range, retreats when low.', behaviours: ['Follow', 'Engage', 'Retreat at 25% HP'] },
  { id: 'guardian', name: 'Guardian', icon: '🛡', description: 'Stays near the boss or the flag and blocks.', behaviours: ['Defend', 'Block more', 'Never chase'] },
  { id: 'berserker', name: 'Berserker', icon: '🔥', description: 'Rushes the closest enemy and never retreats.', behaviours: ['Charge', 'Ignore retreat', 'Heavy attacks'] },
  { id: 'medic', name: 'Medic', icon: '💚', description: 'Prioritises healing over fighting.', behaviours: ['Heal lowest', 'Stay behind', 'Revive'] },
  { id: 'scout', name: 'Scout', icon: '👁', description: 'Moves ahead and reports enemies.', behaviours: ['Patrol', 'Report', 'Evade'] },
  { id: 'sentinel', name: 'Sentinel', icon: '🗼', description: 'Holds a position with line of sight.', behaviours: ['Hold', 'Ranged first', 'Reposition on hit'] },
];

const WEAPONS: readonly Omit<BotWeapon, 'isSample'>[] = [
  { id: 'fists', name: 'Fists', kind: 'melee', damage: 6, range: 'short', unlocked: true, unlockCost: 0 },
  { id: 'iron-bar', name: 'Iron bar', kind: 'melee', damage: 12, range: 'short', unlocked: true, unlockCost: 0 },
  { id: 'club', name: 'Club', kind: 'melee', damage: 14, range: 'short', unlocked: true, unlockCost: 0 },
  { id: 'knife', name: 'Knife', kind: 'melee', damage: 9, range: 'short', unlocked: true, unlockCost: 0 },
  { id: 'shield', name: 'Riot shield', kind: 'melee', damage: 5, range: 'short', unlocked: true, unlockCost: 0 },
  { id: 'spear', name: 'Spear', kind: 'melee', damage: 13, range: 'medium', unlocked: false, unlockCost: 400 },
  { id: 'sword', name: 'Sword', kind: 'melee', damage: 16, range: 'medium', unlocked: false, unlockCost: 650 },
  { id: 'bow', name: 'Bow', kind: 'ranged', damage: 15, range: 'long', unlocked: true, unlockCost: 0 },
  { id: 'rifle', name: 'Precision rifle', kind: 'ranged', damage: 28, range: 'long', unlocked: false, unlockCost: 1500 },
  { id: 'wand', name: 'Spark wand', kind: 'ranged', damage: 12, range: 'medium', unlocked: false, unlockCost: 900 },
  { id: 'medkit', name: 'Medkit', kind: 'utility', damage: 0, range: 'short', unlocked: true, unlockCost: 0 },
  { id: 'repair-kit', name: 'Repair kit', kind: 'utility', damage: 0, range: 'short', unlocked: true, unlockCost: 0 },
];

const SKINS: readonly Omit<BotSkin, 'isSample'>[] = [
  { id: 'ink-black', name: 'Ink black', rarity: 'common', cost: 0, owned: true, botTypeId: null, color: '#e5e7eb' },
  { id: 'crimson', name: 'Crimson ranks', rarity: 'uncommon', cost: 150, owned: true, botTypeId: null, color: '#e4572e' },
  { id: 'camo', name: 'Pencil camo', rarity: 'uncommon', cost: 200, owned: false, botTypeId: null, color: '#84cc16' },
  { id: 'chrome', name: 'Chrome heavy', rarity: 'rare', cost: 450, owned: false, botTypeId: 'heavy', color: '#cbd5e1' },
  { id: 'ghost', name: 'Ghost scout', rarity: 'epic', cost: 900, owned: false, botTypeId: 'scout', color: '#a5f3fc' },
  { id: 'ember', name: 'Ember berserker', rarity: 'legendary', cost: 1600, owned: false, botTypeId: 'berserker', color: '#f97316' },
];

const SQUAD: Squad = {
  name: 'Alpha squad',
  budget: 7,
  slots: [
    { botTypeId: 'basic', personalityId: 'balanced', weaponId: 'iron-bar', skinId: 'crimson' },
    { botTypeId: 'heavy', personalityId: 'guardian', weaponId: 'shield', skinId: null },
    { botTypeId: 'sniper', personalityId: 'sentinel', weaponId: 'bow', skinId: null },
    { botTypeId: null, personalityId: 'balanced', weaponId: 'fists', skinId: null },
  ],
  isSample: true,
};

export const mockBotService: BotService = {
  listBotTypes: () => resolve([...BOT_TYPES]),
  listPersonalities: () => resolve(PERSONALITIES.map((p) => ({ ...p, isSample: true }))),
  listWeapons: () => resolve(WEAPONS.map((w) => ({ ...w, isSample: true }))),
  listSkins: () => resolve(SKINS.map((s) => ({ ...s, isSample: true }))),
  getSquad: () => resolve(SQUAD),
};
