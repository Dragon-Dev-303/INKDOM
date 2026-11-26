/** Factions/teams (GDD §4, §11): roster of up to 10 bosses, roles, treasury, diplomacy, battle log. */
import { factionById, MY_FACTION_ID, SAMPLE_FACTIONS, type Faction } from './factions';
import { at, DAY, HOUR, lazy, resolve, sampleName, seeded } from './mock';
import type { ArchetypeId } from './boss';

export const MAX_ROSTER = 10;

export type TeamRole = 'founder' | 'co-leader' | 'officer' | 'member' | 'recruit';
export type TeamPermission =
  | 'invite' | 'spendTreasury' | 'declareSiege' | 'requestAid' | 'diplomacy' | 'manageRoles' | 'transferOwnership';

export interface RoleDef {
  id: TeamRole;
  label: string;
  rank: number;
  permissions: TeamPermission[];
  isSample: boolean;
}

export const PERMISSION_LABELS: Record<TeamPermission, string> = {
  invite: 'Invite players',
  spendTreasury: 'Spend treasury',
  declareSiege: 'Declare sieges',
  requestAid: 'Request allied aid',
  diplomacy: 'Alliances & ceasefires',
  manageRoles: 'Promote / demote',
  transferOwnership: 'Transfer ownership',
};

export interface RosterMember {
  id: string;
  name: string;
  role: TeamRole;
  archetypeId: ArchetypeId;
  level: number;
  power: number;
  contribution: number;
  online: boolean;
  lastActiveAt: string;
  joinedAt: string;
  isYou: boolean;
  isSample: boolean;
}

export type RelationKind = 'alliance' | 'ceasefire' | 'war' | 'betrayal-cooldown';

export interface Relation {
  factionId: string;
  kind: RelationKind;
  since: string;
  /** Ceasefires and cooldowns expire. */
  expiresAt: string | null;
  /** −100 … 100 reputation with that faction. */
  reputation: number;
  note: string;
  isSample: boolean;
}

export interface TreasuryEntry {
  id: string;
  at: string;
  delta: number;
  reason: string;
  by: string;
  isSample: boolean;
}

export interface BattleLogEntry {
  id: string;
  at: string;
  kind: 'siege-won' | 'siege-lost' | 'defended' | 'building-lost' | 'aid-sent' | 'aid-received';
  buildingId: string;
  buildingName: string;
  opponentFactionId: string | null;
  summary: string;
  pointsDelta: number;
  isSample: boolean;
}

export interface Team {
  id: string;
  faction: Faction;
  foundedAt: string;
  roster: RosterMember[];
  maxRoster: number;
  treasury: { balance: number; incomePerDay: number; upkeepPerDay: number; entries: TreasuryEntry[] };
  relations: Relation[];
  battleLog: BattleLogEntry[];
  buildingsHeld: number;
  citiesGoverned: number;
  isSample: boolean;
}

export interface TeamCreationInfo {
  /** GDD §4/§10: whether creation costs real money or earned points is OPEN. */
  costStatus: 'open' | 'points' | 'cash';
  cost: number | null;
  rules: string[];
  isSample: boolean;
}

export interface TeamService {
  getMyTeam(): Promise<Team | null>;
  listFactions(): Promise<Faction[]>;
  listRoles(): Promise<RoleDef[]>;
  getCreationInfo(): Promise<TeamCreationInfo>;
}

export const ROLE_DEFS: readonly RoleDef[] = [
  { id: 'founder', label: 'Founder', rank: 5, permissions: ['invite', 'spendTreasury', 'declareSiege', 'requestAid', 'diplomacy', 'manageRoles', 'transferOwnership'], isSample: true },
  { id: 'co-leader', label: 'Co-leader', rank: 4, permissions: ['invite', 'spendTreasury', 'declareSiege', 'requestAid', 'diplomacy', 'manageRoles'], isSample: true },
  { id: 'officer', label: 'Officer', rank: 3, permissions: ['invite', 'declareSiege', 'requestAid'], isSample: true },
  { id: 'member', label: 'Member', rank: 2, permissions: ['requestAid'], isSample: true },
  { id: 'recruit', label: 'Recruit', rank: 1, permissions: [], isSample: true },
];

const ROSTER_PLAN: { role: TeamRole; arch: ArchetypeId }[] = [
  { role: 'founder', arch: 'commander' },
  { role: 'co-leader', arch: 'strategist' },
  { role: 'officer', arch: 'warrior' },
  { role: 'officer', arch: 'medic' },
  { role: 'member', arch: 'sniper' },
  { role: 'member', arch: 'engineer' },
  { role: 'recruit', arch: 'assassin' },
];

const team = lazy<Team>(() => {
  const r = seeded('team:crimson-quill');
  const faction = factionById(MY_FACTION_ID)!;
  const roster: RosterMember[] = ROSTER_PLAN.map((p, i) => ({
    id: `m${i + 1}`,
    name: i === 2 ? 'You' : sampleName(`member:${i}`),
    role: p.role,
    archetypeId: p.arch,
    level: r.int(8, 42),
    power: r.int(900, 2400),
    contribution: r.int(200, 9000),
    online: r.chance(0.45),
    lastActiveAt: at(-r.int(0, 72) * HOUR),
    joinedAt: at(-r.int(5, 120) * DAY),
    isYou: i === 2,
    isSample: true,
  }));
  const rivals = SAMPLE_FACTIONS.filter((f) => f.id !== faction.id);
  const relations: Relation[] = [
    { factionId: rivals[2].id, kind: 'alliance', since: at(-21 * DAY), expiresAt: null, reputation: 64, note: 'Shared attack plans on Iron Basin', isSample: true },
    { factionId: rivals[3].id, kind: 'ceasefire', since: at(-3 * DAY), expiresAt: at(4 * DAY), reputation: 5, note: '7-day ceasefire during the rogue AI event', isSample: true },
    { factionId: rivals[0].id, kind: 'war', since: at(-10 * DAY), expiresAt: null, reputation: -58, note: 'Contesting Quillport', isSample: true },
    { factionId: rivals[4].id, kind: 'betrayal-cooldown', since: at(-1 * DAY), expiresAt: at(2 * DAY), reputation: -20, note: 'They broke an alliance: 72 h cooldown before new pacts', isSample: true },
  ];
  const kinds: BattleLogEntry['kind'][] = ['siege-won', 'defended', 'siege-lost', 'aid-sent', 'building-lost', 'aid-received'];
  const battleLog: BattleLogEntry[] = Array.from({ length: 10 }, (_, i) => {
    const kind = kinds[i % kinds.length];
    const opp = r.pick(rivals);
    const bname = `${r.pick(['Serif', 'Margin', 'Folio', 'Kerning'])} St. ${r.pick(['Office', 'Factory', 'Tower', 'Hospital'])}`;
    const delta = kind === 'siege-won' ? 120 : kind === 'defended' ? 40 : kind === 'building-lost' ? -80 : kind === 'siege-lost' ? -25 : 0;
    const summary = {
      'siege-won': `Captured ${bname} from ${opp.name}`,
      defended: `Held ${bname} against ${opp.name}`,
      'siege-lost': `Failed to take ${bname} from ${opp.name}`,
      'building-lost': `Lost ${bname} to ${opp.name}`,
      'aid-sent': `Sent 2 bosses and a supply drop to an ally at ${bname}`,
      'aid-received': `Ally helicopter inserted troops at ${bname}`,
    }[kind];
    return {
      id: `log${i}`, at: at(-(i * 9 + r.int(1, 8)) * HOUR), kind, buildingId: 'quillport-3', buildingName: bname,
      opponentFactionId: kind.startsWith('aid') ? null : opp.id, summary, pointsDelta: delta, isSample: true,
    };
  });
  const entries: TreasuryEntry[] = Array.from({ length: 8 }, (_, i) => {
    const income = i % 3 !== 2;
    return {
      id: `t${i}`, at: at(-(i * 11 + 2) * HOUR),
      delta: income ? r.int(80, 420) : -r.int(60, 300),
      reason: income ? r.pick(['Territory income', 'Siege reward', 'Member contribution']) : r.pick(['Building repairs', 'Bot unlock: Engineer', 'Shield generator upkeep']),
      by: income ? 'System' : roster[r.int(0, 1)].name,
      isSample: true,
    };
  });
  return {
    id: 'team-crimson-quill', faction, foundedAt: at(-140 * DAY), roster, maxRoster: MAX_ROSTER,
    treasury: { balance: 18_450, incomePerDay: 760, upkeepPerDay: 210, entries },
    relations, battleLog, buildingsHeld: 23, citiesGoverned: 2, isSample: true,
  };
});

export const mockTeamService: TeamService = {
  getMyTeam: () => resolve(team()),
  listFactions: () => resolve([...SAMPLE_FACTIONS]),
  listRoles: () => resolve([...ROLE_DEFS]),
  getCreationInfo: () =>
    resolve({
      costStatus: 'open' as const,
      cost: null,
      rules: [
        'The creation cost is OPEN (GDD §4, §10): real money or earned points has not been decided.',
        'Paying to create a team never buys combat power; an earnable route is planned.',
        'A team starts with 1 boss and can grow to 10.',
        'New teams get temporary territory protection.',
      ],
      isSample: true,
    }),
};
