/**
 * Reinforcements and the tactical commander overlay (GDD §3 boss-to-commander toggle, §8 helicopters).
 */
import { resolve } from './mock';

export type OrderId = 'attack' | 'defend' | 'follow' | 'retreat' | 'support' | 'patrol';

export interface SquadOrder {
  id: OrderId;
  name: string;
  icon: string;
  behaviour: string;
  isSample: boolean;
}

/** The six squad orders from GDD §3. */
export const SQUAD_ORDERS: readonly Omit<SquadOrder, 'isSample'>[] = [
  { id: 'attack', name: 'Attack', icon: '⚔', behaviour: 'Push marked room, enemy or capture objective' },
  { id: 'defend', name: 'Defend', icon: '🛡', behaviour: 'Hold designated floor, doorway, stairwell or rooftop' },
  { id: 'follow', name: 'Follow', icon: '👣', behaviour: 'Maintain formation around the boss' },
  { id: 'retreat', name: 'Retreat', icon: '↩', behaviour: 'Disengage and regroup at a safe point' },
  { id: 'support', name: 'Support', icon: '➕', behaviour: 'Protect medic, engineer, supply point or allied boss' },
  { id: 'patrol', name: 'Patrol / Scout', icon: '🔭', behaviour: 'Survey a route and report enemies' },
];

export type SupportId = 'troop-insertion' | 'medevac' | 'supply-drop' | 'recon' | 'air-strike' | 'ally-joins';

export interface SupportAction {
  id: SupportId;
  name: string;
  icon: string;
  effect: string;
  limitation: string;
  cooldownSec: number;
  charges: number;
  /** Air strike is optional in the GDD. */
  optional: boolean;
  unlocked: boolean;
  isSample: boolean;
}

export interface TacticalRoom {
  id: string;
  name: string;
  /** Horizontal span in 0–100 units of the floor width. */
  x: number;
  w: number;
  kind: 'room' | 'stairs' | 'ladder' | 'corridor' | 'roof';
}

export interface TacticalSquad {
  id: string;
  name: string;
  order: OrderId;
  floor: number;
  x: number;
  units: { botTypeId: string; hp: number }[];
  side: 'attacker' | 'defender';
}

export interface TacticalSnapshot {
  buildingName: string;
  floors: { level: number; name: string; rooms: TacticalRoom[] }[];
  squads: TacticalSquad[];
  rallyMarkers: { id: string; floor: number; x: number; label: string }[];
  enemySightings: { id: string; floor: number; x: number; count: number; seenSecAgo: number }[];
  flag: { floor: number; x: number; captureProgress: number };
  reinforcementBudget: { used: number; max: number; maxConcurrentBosses: number };
  isSample: boolean;
}

export interface SupportService {
  listOrders(): Promise<SquadOrder[]>;
  listSupportActions(): Promise<SupportAction[]>;
  getTacticalPreview(): Promise<TacticalSnapshot>;
}

const ACTIONS: readonly Omit<SupportAction, 'isSample'>[] = [
  { id: 'troop-insertion', name: 'Troop insertion', icon: '🪂', effect: 'Rappel 3 bots onto the roof or an approved exterior zone', limitation: 'Anti-spawn-camp zones only', cooldownSec: 90, charges: 2, optional: false, unlocked: true },
  { id: 'medevac', name: 'Medical evacuation', icon: '🚑', effect: 'Extract a wounded boss or recover downed bots', limitation: 'Limited charges; needs roof access', cooldownSec: 120, charges: 1, optional: false, unlocked: true },
  { id: 'supply-drop', name: 'Supply drop', icon: '📦', effect: 'Deliver ammo, equipment or repair materials', limitation: 'Can be stolen if dropped in the open', cooldownSec: 60, charges: 3, optional: false, unlocked: true },
  { id: 'recon', name: 'Reconnaissance', icon: '🛰', effect: 'Reveal enemy positions on 2 floors for 4 s', limitation: 'Countered by stealth and jammers', cooldownSec: 45, charges: 3, optional: false, unlocked: true },
  { id: 'air-strike', name: 'Air strike', icon: '💥', effect: 'Telegraphed area hit on the exterior or roof', limitation: '3 s warning, long cooldown (optional feature)', cooldownSec: 180, charges: 1, optional: true, unlocked: false },
  { id: 'ally-joins', name: 'Human ally joins', icon: '🤝', effect: 'A teammate boss enters the active battle', limitation: 'Uses a reinforcement slot', cooldownSec: 0, charges: 1, optional: false, unlocked: true },
];

const SNAPSHOT: TacticalSnapshot = {
  buildingName: 'Serif St. Office (sample)',
  floors: [
    { level: 5, name: 'Roof', rooms: [{ id: 'r5a', name: 'Flag pad', x: 30, w: 40, kind: 'roof' }, { id: 'r5b', name: 'Helipad', x: 72, w: 26, kind: 'roof' }, { id: 'r5c', name: 'Hatch', x: 4, w: 10, kind: 'ladder' }] },
    { level: 4, name: 'Floor 4', rooms: [{ id: 'r4a', name: 'Boardroom', x: 2, w: 40, kind: 'room' }, { id: 'r4b', name: 'Corridor', x: 42, w: 30, kind: 'corridor' }, { id: 'r4c', name: 'Stairs', x: 72, w: 12, kind: 'stairs' }, { id: 'r4d', name: 'Archive', x: 84, w: 14, kind: 'room' }] },
    { level: 3, name: 'Floor 3', rooms: [{ id: 'r3a', name: 'Open office', x: 2, w: 50, kind: 'room' }, { id: 'r3b', name: 'Stairs', x: 52, w: 12, kind: 'stairs' }, { id: 'r3c', name: 'Server room', x: 64, w: 34, kind: 'room' }] },
    { level: 2, name: 'Floor 2', rooms: [{ id: 'r2a', name: 'Kitchen', x: 2, w: 26, kind: 'room' }, { id: 'r2b', name: 'Corridor', x: 28, w: 44, kind: 'corridor' }, { id: 'r2c', name: 'Stairs', x: 72, w: 12, kind: 'stairs' }, { id: 'r2d', name: 'Storage', x: 84, w: 14, kind: 'room' }] },
    { level: 1, name: 'Ground', rooms: [{ id: 'r1a', name: 'Front door', x: 2, w: 14, kind: 'room' }, { id: 'r1b', name: 'Lobby', x: 16, w: 36, kind: 'room' }, { id: 'r1c', name: 'Stairs', x: 52, w: 12, kind: 'stairs' }, { id: 'r1d', name: 'Rear exit', x: 64, w: 34, kind: 'room' }] },
  ],
  squads: [
    { id: 'alpha', name: 'Alpha', order: 'attack', floor: 2, x: 40, side: 'attacker', units: [{ botTypeId: 'basic', hp: 80 }, { botTypeId: 'heavy', hp: 95 }, { botTypeId: 'sniper', hp: 60 }] },
    { id: 'bravo', name: 'Bravo', order: 'follow', floor: 1, x: 30, side: 'attacker', units: [{ botTypeId: 'medic', hp: 100 }, { botTypeId: 'basic', hp: 45 }] },
    { id: 'charlie', name: 'Charlie', order: 'patrol', floor: 3, x: 20, side: 'attacker', units: [{ botTypeId: 'scout', hp: 70 }] },
  ],
  rallyMarkers: [
    { id: 'rm1', floor: 3, x: 58, label: 'Stairwell push' },
    { id: 'rm2', floor: 1, x: 10, label: 'Regroup' },
  ],
  enemySightings: [
    { id: 'e1', floor: 4, x: 20, count: 3, seenSecAgo: 4 },
    { id: 'e2', floor: 3, x: 80, count: 2, seenSecAgo: 11 },
    { id: 'e3', floor: 5, x: 50, count: 1, seenSecAgo: 2 },
  ],
  flag: { floor: 5, x: 50, captureProgress: 0 },
  reinforcementBudget: { used: 1, max: 3, maxConcurrentBosses: 2 },
  isSample: true,
};

export const mockSupportService: SupportService = {
  listOrders: () => resolve(SQUAD_ORDERS.map((o) => ({ ...o, isSample: true }))),
  listSupportActions: () => resolve(ACTIONS.map((a) => ({ ...a, isSample: true }))),
  getTacticalPreview: () => resolve(SNAPSHOT),
};
