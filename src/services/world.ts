/**
 * Persistent territory (GDD §7, §9, §12): World → Region → City (10 buildings) → Building.
 * `WorldService` is the contract screens use; `mockWorldService` serves deterministic sample data.
 */
import { SAMPLE_FACTIONS } from './factions';
import { at, DAY, HOUR, lazy, MOCK_NOW, resolve, sampleName, seeded } from './mock';

export const BUILDINGS_PER_CITY = 10;
/** PROPOSED thresholds (GDD §9, not confirmed). */
export const GOVERNANCE_THRESHOLD = 6;
export const FULL_CONTROL_THRESHOLD = 10;

export type BuildingArchetype =
  | 'apartment' | 'office' | 'factory' | 'hospital' | 'police-station' | 'laboratory' | 'tower' | 'command-center';

export const BUILDING_ARCHETYPES: Record<BuildingArchetype, { label: string; icon: string; trait: string }> = {
  apartment: { label: 'Apartment', icon: '🏠', trait: 'Many small rooms and balconies; close-quarters fights' },
  office: { label: 'Office', icon: '🏢', trait: 'Open floors and glass; long sight lines' },
  factory: { label: 'Factory', icon: '🏭', trait: 'Catwalks, ladders and heavy cover' },
  hospital: { label: 'Hospital', icon: '🏥', trait: 'Medic bots heal faster for the owner' },
  'police-station': { label: 'Police station', icon: '🚓', trait: 'Armoury: defenders start with extra iron bars' },
  laboratory: { label: 'Laboratory', icon: '🧪', trait: 'Unstable experiments; special bot variants' },
  tower: { label: 'Tower', icon: '🗼', trait: 'Tall and narrow; the roof is hard to reach' },
  'command-center': { label: 'Command center', icon: '🛰', trait: 'Recon and squad order bonuses' },
};

export type WonderType = 'command-tower' | 'research-lab' | 'shield-generator' | 'transport-hub';

export const WONDERS: Record<WonderType, { name: string; icon: string; effect: string }> = {
  'command-tower': { name: 'Command tower', icon: '📡', effect: 'Reconnaissance and coordination utility' },
  'research-lab': { name: 'Research laboratory', icon: '🔬', effect: 'Unusual bot variants or limited special skills' },
  'shield-generator': { name: 'Shield generator', icon: '🛡', effect: 'Time-limited defence at one building' },
  'transport-hub': { name: 'Transport hub', icon: '🚁', effect: 'Better logistics and reinforcement routing' },
};

export interface World {
  id: string;
  name: string;
  kind: 'global' | 'private';
  description: string;
  regionIds: string[];
  playersOnline: number;
  isSample: boolean;
}

export interface Region {
  id: string;
  worldId: string;
  name: string;
  /** Box on the 1000 × 620 world map. */
  box: { x: number; y: number; w: number; h: number };
  cityIds: string[];
  isSample: boolean;
}

export type ControlLevel = 'full' | 'governed' | 'contested';

export interface CityControl {
  /** Buildings held per faction id ('' = unclaimed). */
  counts: Record<string, number>;
  /** Faction holding ≥ GOVERNANCE_THRESHOLD buildings, if any. */
  controllerId: string | null;
  level: ControlLevel;
}

export interface Wonder {
  type: WonderType;
  status: 'built' | 'under-construction' | 'locked';
  /** 0–100 for under-construction. */
  progress: number;
}

export interface City {
  id: string;
  regionId: string;
  worldId: string;
  name: string;
  isCapital: boolean;
  /** Position on the world map (same coordinate space as Region.box). */
  pos: { x: number; y: number };
  buildingIds: string[];
  control: CityControl;
  wonders: Wonder[];
  bonuses: string[];
  isSample: boolean;
}

export interface VulnerabilityWindow {
  /** 0 = Sunday … 6 = Saturday (UTC). */
  weekday: number;
  startHourUtc: number;
  durationHours: number;
  status: 'open' | 'scheduled' | 'shielded';
  /** Next opening (or shield expiry when shielded). */
  nextChangeAt: string;
}

export interface CaptureRecord {
  id: string;
  at: string;
  attackerFactionId: string;
  defenderFactionId: string | null;
  winner: 'attacker' | 'defender';
  durationSec: number;
  attackerBoss: string;
  defenderBoss: string;
  isSample: boolean;
}

export interface Building {
  id: string;
  cityId: string;
  name: string;
  archetype: BuildingArchetype;
  floors: number;
  ownerFactionId: string | null;
  ownerBoss: string | null;
  capturedAt: string | null;
  /** 1–10 upgrade level. */
  defenceLevel: number;
  /** 0–100 overall rating (level, gadgets, garrison). */
  defenceRating: number;
  /** 0–100 structural repair state. */
  repairState: number;
  garrison: number;
  pointsPerDay: number;
  window: VulnerabilityWindow;
  history: CaptureRecord[];
  isSample: boolean;
}

export interface WorldMap {
  world: World;
  regions: (Region & { cities: City[] })[];
}

export interface CityDetail {
  city: City;
  region: Region;
  buildings: Building[];
}

export interface BuildingDetail {
  building: Building;
  city: City;
  neighbours: Building[];
}

export interface WorldService {
  listWorlds(): Promise<World[]>;
  getWorldMap(worldId: string): Promise<WorldMap | null>;
  getCity(id: string): Promise<CityDetail | null>;
  getBuilding(id: string): Promise<BuildingDetail | null>;
  /** All ids, for static generation of city/building pages. */
  listCityIds(): Promise<string[]>;
  listBuildingIds(): Promise<string[]>;
}

/** Governance per GDD §9 PROPOSED rule (6/10 governs, 10/10 full control). */
export function computeControl(owners: (string | null)[]): CityControl {
  const counts: Record<string, number> = {};
  for (const o of owners) counts[o ?? ''] = (counts[o ?? ''] ?? 0) + 1;
  let controllerId: string | null = null;
  let best = 0;
  for (const [id, n] of Object.entries(counts)) {
    if (id && n > best) {
      best = n;
      controllerId = id;
    }
  }
  if (best >= FULL_CONTROL_THRESHOLD) return { counts, controllerId, level: 'full' };
  if (best >= GOVERNANCE_THRESHOLD) return { counts, controllerId, level: 'governed' };
  return { counts, controllerId: null, level: 'contested' };
}

// ---------------------------------------------------------------- sample data

const WORLD_DEFS = [
  {
    id: 'prime', name: 'Inkdom Prime', kind: 'global' as const, players: 4812,
    description: 'The shared persistent world: every faction competes for the same cities.',
    regions: [
      { id: 'northreach', name: 'Northreach', box: { x: 20, y: 20, w: 470, h: 280 } },
      { id: 'glass-coast', name: 'Glass Coast', box: { x: 510, y: 20, w: 470, h: 280 } },
      { id: 'ashmarsh', name: 'Ashmarsh', box: { x: 20, y: 320, w: 470, h: 280 } },
      { id: 'iron-basin', name: 'Iron Basin', box: { x: 510, y: 320, w: 470, h: 280 } },
    ],
  },
  {
    id: 'friends-shard', name: 'Friends Shard #12', kind: 'private' as const, players: 37,
    description: 'A private world with custom rules, higher bot density and a 4-week season.',
    regions: [{ id: 'quiet-cove', name: 'Quiet Cove', box: { x: 20, y: 20, w: 960, h: 580 } }],
  },
];

const CITY_NAMES = [
  'Quillport', 'Inkwell', 'Blotmoor', 'Nibhaven', 'Sketchford', 'Scrawlton', 'Penumbra',
  'Graphite Ridge', 'Vellum', 'Smudge Hollow', 'Parchment Bay', 'Charcoal Keep', 'Linewater', 'Stencil Point',
];
const STREETS = ['Margin', 'Serif', 'Gutter', 'Kerning', 'Folio', 'Ledger', 'Spine', 'Baseline', 'Ascender', 'Ink', 'Draft', 'Cursive'];
const ARCH_LIST = Object.keys(BUILDING_ARCHETYPES) as BuildingArchetype[];
const FACTION_IDS = SAMPLE_FACTIONS.map((f) => f.id);

interface Db {
  worlds: World[];
  regions: Region[];
  cities: City[];
  buildings: Building[];
}

function ownerPattern(cityIndex: number, r: ReturnType<typeof seeded>): (string | null)[] {
  const dom = FACTION_IDS[(cityIndex * 5 + 1) % FACTION_IDS.length];
  const other = () => r.pick(FACTION_IDS.filter((f) => f !== dom));
  switch (cityIndex % 4) {
    case 0: return Array(10).fill(dom); // full control
    case 1: return [...Array(7).fill(dom), other(), other(), null]; // governed
    case 2: return [dom, dom, dom, dom, other(), other(), other(), null, null, other()]; // contested
    default: return [...Array(6).fill(dom), null, null, other(), other()]; // just governed
  }
}

function buildHistory(buildingId: string, owner: string | null, capturedAt: number, r: ReturnType<typeof seeded>): CaptureRecord[] {
  const n = r.int(owner ? 1 : 0, 4);
  const out: CaptureRecord[] = [];
  let t = capturedAt;
  for (let i = 0; i < n; i++) {
    const attacker = i === 0 && owner ? owner : r.pick(FACTION_IDS);
    const won = i === 0 && owner ? true : r.chance(0.35);
    out.push({
      id: `${buildingId}-h${i}`,
      at: new Date(t).toISOString(),
      attackerFactionId: attacker,
      defenderFactionId: r.chance(0.15) ? null : r.pick(FACTION_IDS.filter((f) => f !== attacker)),
      winner: won ? 'attacker' : 'defender',
      durationSec: r.int(180, 900),
      attackerBoss: sampleName(`${buildingId}-a${i}`),
      defenderBoss: sampleName(`${buildingId}-d${i}`),
      isSample: true,
    });
    t -= r.int(1, 9) * DAY + r.int(0, 20) * HOUR;
  }
  return out;
}

function makeWindow(r: ReturnType<typeof seeded>, capturedAt: number | null): VulnerabilityWindow {
  const weekday = r.int(0, 6);
  const startHourUtc = r.pick([12, 16, 18, 19, 20, 21]);
  const durationHours = r.pick([1, 2, 2, 3]);
  if (capturedAt && MOCK_NOW - capturedAt < DAY) {
    return { weekday, startHourUtc, durationHours, status: 'shielded', nextChangeAt: new Date(capturedAt + DAY).toISOString() };
  }
  if (r.chance(0.12)) {
    // MOCK_NOW is Thursday 12:00 UTC: this window opened at 11:00 and is open right now.
    const dur = Math.max(2, durationHours);
    return { weekday: 4, startHourUtc: 11, durationHours: dur, status: 'open', nextChangeAt: at((dur - 1) * HOUR) };
  }
  const nowDay = new Date(MOCK_NOW).getUTCDay();
  const daysAhead = ((weekday - nowDay + 7) % 7) || 7;
  const next = Date.UTC(2026, 10, 26 + daysAhead, startHourUtc);
  return { weekday, startHourUtc, durationHours, status: 'scheduled', nextChangeAt: new Date(next).toISOString() };
}

const db = lazy<Db>(() => {
  const worlds: World[] = [];
  const regions: Region[] = [];
  const cities: City[] = [];
  const buildings: Building[] = [];
  let cityIndex = 0;

  for (const w of WORLD_DEFS) {
    const world: World = {
      id: w.id, name: w.name, kind: w.kind, description: w.description, regionIds: [], playersOnline: w.players, isSample: true,
    };
    worlds.push(world);
    for (const rd of w.regions) {
      const region: Region = { id: rd.id, worldId: w.id, name: rd.name, box: rd.box, cityIds: [], isSample: true };
      world.regionIds.push(region.id);
      regions.push(region);
      const cityCount = w.kind === 'global' ? 3 : 2;
      for (let c = 0; c < cityCount; c++) {
        const name = CITY_NAMES[cityIndex % CITY_NAMES.length];
        const id = name.toLowerCase().replace(/\s+/g, '-');
        const r = seeded(`city:${id}`);
        const owners = ownerPattern(cityIndex, r);
        const isCapital = c === 0;
        const city: City = {
          id, regionId: region.id, worldId: w.id, name, isCapital,
          pos: {
            x: Math.round(rd.box.x + rd.box.w * (0.2 + 0.3 * c) + r.int(-20, 20)),
            y: Math.round(rd.box.y + rd.box.h * (c % 2 === 0 ? 0.42 : 0.7) + r.int(-15, 15)),
          },
          buildingIds: [], control: computeControl(owners), wonders: [], bonuses: [], isSample: true,
        };
        city.wonders = (Object.keys(WONDERS) as WonderType[]).map((type, i) => {
          const roll = (cityIndex + i) % 4;
          if (!isCapital && i > 1) return { type, status: 'locked' as const, progress: 0 };
          return roll === 0
            ? { type, status: 'under-construction' as const, progress: r.int(15, 85) }
            : roll === 3 ? { type, status: 'locked' as const, progress: 0 } : { type, status: 'built' as const, progress: 100 };
        });
        city.bonuses = [
          ...(city.control.level === 'full' ? ['Full control: +400 points/day to the controller (illustrative)', 'Special bot variant unlocked'] : []),
          ...(city.control.level === 'governed' ? ['Governance: city tax +10% on building income (illustrative)'] : []),
          ...(isCapital ? ['Regional capital: wonders can be built here'] : []),
          'Each held building: +20 points/day (illustrative, GDD §10)',
        ];
        for (let b = 0; b < BUILDINGS_PER_CITY; b++) {
          const bid = `${id}-${b + 1}`;
          const br = seeded(`building:${bid}`);
          const archetype: BuildingArchetype = b === 0 && isCapital ? 'command-center' : ARCH_LIST[br.int(0, ARCH_LIST.length - 2)];
          const owner = owners[b];
          const capturedAt = owner ? MOCK_NOW - br.int(2, 24 * 30) * HOUR : null;
          const defenceLevel = owner ? br.int(1, 10) : 1;
          buildings.push({
            id: bid, cityId: id,
            name: `${br.pick(STREETS)} St. ${BUILDING_ARCHETYPES[archetype].label}`,
            archetype, floors: br.int(3, 5),
            ownerFactionId: owner, ownerBoss: owner ? sampleName(`owner:${bid}`) : null,
            capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
            defenceLevel,
            defenceRating: Math.min(100, defenceLevel * 8 + br.int(5, 20)),
            repairState: owner ? br.int(55, 100) : br.int(20, 70),
            garrison: owner ? br.int(4, 12) : br.int(0, 3),
            pointsPerDay: owner ? 20 + (archetype === 'command-center' ? 15 : 0) : 0,
            window: makeWindow(br, capturedAt),
            history: buildHistory(bid, owner, capturedAt ?? MOCK_NOW - 3 * DAY, br),
            isSample: true,
          });
          city.buildingIds.push(bid);
        }
        region.cityIds.push(id);
        cities.push(city);
        cityIndex++;
      }
    }
  }
  return { worlds, regions, cities, buildings };
});

export const mockWorldService: WorldService = {
  listWorlds: () => resolve(db().worlds),
  getWorldMap(worldId) {
    const d = db();
    const world = d.worlds.find((w) => w.id === worldId);
    if (!world) return resolve(null);
    const regions = d.regions
      .filter((r) => r.worldId === worldId)
      .map((r) => ({ ...r, cities: d.cities.filter((c) => c.regionId === r.id) }));
    return resolve({ world, regions });
  },
  getCity(id) {
    const d = db();
    const city = d.cities.find((c) => c.id === id);
    if (!city) return resolve(null);
    const region = d.regions.find((r) => r.id === city.regionId)!;
    return resolve({ city, region, buildings: d.buildings.filter((b) => b.cityId === id) });
  },
  getBuilding(id) {
    const d = db();
    const building = d.buildings.find((b) => b.id === id);
    if (!building) return resolve(null);
    const city = d.cities.find((c) => c.id === building.cityId)!;
    return resolve({ building, city, neighbours: d.buildings.filter((b) => b.cityId === city.id && b.id !== id) });
  },
  listCityIds: () => resolve(db().cities.map((c) => c.id)),
  listBuildingIds: () => resolve(db().buildings.map((b) => b.id)),
};
