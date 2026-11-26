/**
 * Service registry. Screens call `services.<name>.<method>()` and never import a mock directly,
 * so swapping sample data for a real backend is one `configureServices({ world: apiWorldService })`
 * call (or a change of the defaults below) with no UI rewrite.
 *
 * Every method returns a Promise. Sample objects carry `isSample: true`; real implementations set
 * it to false. Widgets show a "Sample" tag while their data is sample data; the page-level
 * "Preview · sample data" ribbon comes from the feature status in `src/features/registry.ts`.
 */
import { mockBossService, type BossService } from './boss';
import { mockBotService, type BotService } from './bots';
import { mockEventsService, type EventsService } from './events';
import { mockInboxService, type InboxService } from './inbox';
import { mockLeaderboardService, type LeaderboardService } from './leaderboard';
import { mockProfileService, type ProfileService } from './profile';
import { mockSupportService, type SupportService } from './support';
import { mockTeamService, type TeamService } from './team';
import { mockWorldService, type WorldService } from './world';

export interface Services {
  world: WorldService;
  team: TeamService;
  boss: BossService;
  bots: BotService;
  leaderboard: LeaderboardService;
  events: EventsService;
  inbox: InboxService;
  support: SupportService;
  profile: ProfileService;
}

export const mockServices: Readonly<Services> = Object.freeze({
  world: mockWorldService,
  team: mockTeamService,
  boss: mockBossService,
  bots: mockBotService,
  leaderboard: mockLeaderboardService,
  events: mockEventsService,
  inbox: mockInboxService,
  support: mockSupportService,
  profile: mockProfileService,
});

/** The active implementations. Mutated only through `configureServices`. */
export const services: Services = { ...mockServices };

/** Replace one or more services (e.g. at app start-up, or in tests). */
export function configureServices(overrides: Partial<Services>): void {
  Object.assign(services, overrides);
}

/** Restore every service to its mock implementation. */
export function resetServices(): void {
  Object.assign(services, mockServices);
}

export type { Faction } from './factions';
export { SAMPLE_FACTIONS, MY_FACTION_ID, factionById } from './factions';
