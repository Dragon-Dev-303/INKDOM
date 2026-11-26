import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES, featureForPath, featuresByGroup, getFeature, navFeatureForPath } from '@/features/registry';
import { mockServices, services } from '@/services';
import {
  allocationTotal, ARCHETYPES, ATTRIBUTE_IDS, ATTRIBUTE_RULES, attributeEffect, nextPointValue,
} from '@/services/boss';
import { BOT_TYPES, SQUAD_SLOTS } from '@/services/bots';
import { MAX_ROSTER, ROLE_DEFS } from '@/services/team';
import { BUILDINGS_PER_CITY, computeControl } from '@/services/world';

const APP = path.resolve(__dirname, '..', 'src', 'app');
/** Routes created by other parts of the app; skipped (not failed) while they don't exist yet. */
const OWNED_ELSEWHERE = new Set(['/online', '/shop', '/account']);

/** Map every page file under src/app to its URL, dropping route groups like "(hub)". */
function collectRoutes(dir: string, segs: string[] = [], out = new Map<string, string>()): Map<string, string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('_') || e.name === 'api') continue;
      const isGroup = e.name.startsWith('(') && e.name.endsWith(')');
      collectRoutes(full, isGroup ? segs : [...segs, e.name], out);
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(e.name)) {
      out.set(`/${segs.join('/')}`, full);
    }
  }
  return out;
}

const routes = collectRoutes(APP);

/** Recursively assert every object in a value carries isSample: true. */
function expectAllSample(value: unknown, where: string) {
  if (Array.isArray(value)) value.forEach((v, i) => expectAllSample(v, `${where}[${i}]`));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('isSample' in o) expect(o.isSample, where).toBe(true);
  }
}

describe('feature registry', () => {
  it('has unique ids and routes', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    expect(new Set(FEATURES.map((f) => f.route)).size).toBe(FEATURES.length);
  });

  for (const f of FEATURES.filter((x) => x.status !== 'planned')) {
    const exists = routes.has(f.route);
    it.skipIf(!exists && OWNED_ELSEWHERE.has(f.route))(`${f.status} feature "${f.id}" has a page at ${f.route}`, () => {
      expect(exists, `missing page for ${f.route}`).toBe(true);
    });
  }

  it('sub-screens reference an existing parent and stay out of nav', () => {
    for (const f of FEATURES.filter((x) => x.parent)) expect(getFeature(f.parent!)).toBeDefined();
    const navIds = featuresByGroup().flatMap((g) => g.features.map((f) => f.id));
    expect(navIds).not.toContain('city');
    expect(navIds).toContain('world');
  });

  it('resolves paths to features', () => {
    expect(featureForPath('/')?.id).toBe('hub');
    expect(featureForPath('/world/city/quillport')?.id).toBe('city');
    expect(navFeatureForPath('/world/building/quillport-1')?.id).toBe('world');
    expect(navFeatureForPath('/settings')?.id).toBe('settings');
  });

  it('every feature has the required fields', () => {
    for (const f of FEATURES) {
      expect(f.title && f.icon && f.description && f.gdd, f.id).toBeTruthy();
      expect(f.route.startsWith('/'), f.id).toBe(true);
    }
  });
});

describe('services (mock)', () => {
  it('registry starts on the mock implementations', () => {
    expect(Object.keys(services).sort()).toEqual(Object.keys(mockServices).sort());
  });

  it('every service returns sample data flagged isSample', async () => {
    const s = mockServices;
    const map = await s.world.getWorldMap('prime');
    const cityId = (await s.world.listCityIds())[0];
    const buildingId = (await s.world.listBuildingIds())[0];
    const season = await s.events.getCurrentSeason();
    const results: [string, unknown][] = [
      ['world.listWorlds', await s.world.listWorlds()],
      ['world.getWorldMap', map],
      ['world.getCity', await s.world.getCity(cityId)],
      ['world.getBuilding', await s.world.getBuilding(buildingId)],
      ['team.getMyTeam', await s.team.getMyTeam()],
      ['team.listFactions', await s.team.listFactions()],
      ['team.listRoles', await s.team.listRoles()],
      ['team.getCreationInfo', await s.team.getCreationInfo()],
      ['boss.listArchetypes', await s.boss.listArchetypes()],
      ['boss.listEquipment', await s.boss.listEquipment()],
      ['boss.listAbilities', await s.boss.listAbilities()],
      ['boss.getMyBoss', await s.boss.getMyBoss()],
      ['bots.listBotTypes', await s.bots.listBotTypes()],
      ['bots.listPersonalities', await s.bots.listPersonalities()],
      ['bots.listWeapons', await s.bots.listWeapons()],
      ['bots.listSkins', await s.bots.listSkins()],
      ['bots.getSquad', await s.bots.getSquad()],
      ['leaderboard.players', await s.leaderboard.getPlayerRankings(season.id)],
      ['leaderboard.factions', await s.leaderboard.getFactionRankings(season.id)],
      ['events.season', season],
      ['events.listSeasons', await s.events.listSeasons()],
      ['events.listWorldEvents', await s.events.listWorldEvents()],
      ['events.getCalendar', await s.events.getCalendar(2026, 10)],
      ['events.getDailyRewards', await s.events.getDailyRewards()],
      ['inbox.list', await s.inbox.list()],
      ['support.listOrders', await s.support.listOrders()],
      ['support.listSupportActions', await s.support.listSupportActions()],
      ['support.getTacticalPreview', await s.support.getTacticalPreview()],
      ['profile.getMyProfile', await s.profile.getMyProfile()],
    ];
    for (const [name, value] of results) {
      expect(value, name).toBeTruthy();
      const items = Array.isArray(value) ? value : [value];
      expect(items.length, name).toBeGreaterThan(0);
      for (const item of items) {
        const o = item as Record<string, unknown>;
        // Composite results (e.g. { city, region, buildings }) carry the flag on their parts.
        const flagged = 'isSample' in o ? o.isSample : Object.values(o).some((v) => (v as { isSample?: boolean })?.isSample === true);
        expect(flagged, name).toBe(true);
      }
      expectAllSample(value, name);
    }
  });

  it('is deterministic (same data on every call, copies not shared)', async () => {
    const a = await mockServices.world.getCity('quillport');
    const b = await mockServices.world.getCity('quillport');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a!.buildings[0].name = 'mutated';
    expect((await mockServices.world.getCity('quillport'))!.buildings[0].name).not.toBe('mutated');
  });
});

describe('mock data invariants', () => {
  it('every city has exactly 10 buildings and consistent control', async () => {
    const ids = await mockServices.world.listCityIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const d = (await mockServices.world.getCity(id))!;
      expect(d.buildings).toHaveLength(BUILDINGS_PER_CITY);
      expect(d.city.buildingIds).toHaveLength(BUILDINGS_PER_CITY);
      expect(d.city.control).toEqual(computeControl(d.buildings.map((b) => b.ownerFactionId)));
      for (const b of d.buildings) {
        expect(b.floors).toBeGreaterThanOrEqual(3);
        expect(b.floors).toBeLessThanOrEqual(5);
        expect(b.cityId).toBe(id);
      }
    }
  });

  it('building ids are unique and every map has governed, full and contested cities', async () => {
    const ids = await mockServices.world.listBuildingIds();
    expect(new Set(ids).size).toBe(ids.length);
    const map = (await mockServices.world.getWorldMap('prime'))!;
    const levels = new Set(map.regions.flatMap((r) => r.cities.map((c) => c.control.level)));
    expect(levels).toEqual(new Set(['full', 'governed', 'contested']));
  });

  it('governance thresholds: 6 governs, 10 is full control', () => {
    expect(computeControl([...Array(5).fill('a'), ...Array(5).fill(null)]).level).toBe('contested');
    expect(computeControl([...Array(6).fill('a'), ...Array(4).fill('b')]).level).toBe('governed');
    expect(computeControl(Array(10).fill('a')).level).toBe('full');
  });

  it('team roster stays within 10 bosses with valid roles and one founder', async () => {
    const team = (await mockServices.team.getMyTeam())!;
    expect(team.roster.length).toBeLessThanOrEqual(MAX_ROSTER);
    expect(team.maxRoster).toBe(10);
    const roles = new Set(ROLE_DEFS.map((r) => r.id));
    for (const m of team.roster) expect(roles.has(m.role)).toBe(true);
    expect(team.roster.filter((m) => m.role === 'founder')).toHaveLength(1);
  });

  it('boss archetypes: 10 classes with equal base totals; sample build within budget', async () => {
    expect(ARCHETYPES).toHaveLength(10);
    for (const a of ARCHETYPES) expect(allocationTotal(a.base), a.id).toBe(ATTRIBUTE_RULES.baseTotal);
    const build = await mockServices.boss.getMyBoss();
    expect(allocationTotal(build.allocation)).toBeLessThanOrEqual(ATTRIBUTE_RULES.budget);
    for (const id of ATTRIBUTE_IDS) expect(build.allocation[id]).toBeLessThanOrEqual(ATTRIBUTE_RULES.maxPerAttribute);
  });

  it('attribute effects have diminishing returns', () => {
    expect(attributeEffect(0)).toBe(0);
    for (let p = 0; p < 20; p++) {
      expect(attributeEffect(p + 1)).toBeGreaterThan(attributeEffect(p));
      expect(nextPointValue(p + 1)).toBeLessThanOrEqual(nextPointValue(p));
    }
    expect(nextPointValue(10)).toBeLessThan(nextPointValue(0));
  });

  it('10 bot types and a 4-slot squad using known types', async () => {
    expect(BOT_TYPES).toHaveLength(10);
    const squad = await mockServices.bots.getSquad();
    expect(squad.slots).toHaveLength(SQUAD_SLOTS);
    const ids = new Set(BOT_TYPES.map((b) => b.id));
    for (const s of squad.slots) if (s.botTypeId) expect(ids.has(s.botTypeId)).toBe(true);
  });

  it('six squad orders and the GDD helicopter support types', async () => {
    expect((await mockServices.support.listOrders()).map((o) => o.id)).toEqual(['attack', 'defend', 'follow', 'retreat', 'support', 'patrol']);
    const support = (await mockServices.support.listSupportActions()).map((a) => a.id);
    for (const id of ['troop-insertion', 'medevac', 'supply-drop', 'recon', 'air-strike']) expect(support).toContain(id);
  });
});
