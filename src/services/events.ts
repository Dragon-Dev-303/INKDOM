/** Seasons, dynamic world events, calendar and daily rewards (GDD §12, §16). */
import { at, DAY, HOUR, resolve } from './mock';

export interface Season {
  id: string;
  number: number;
  name: string;
  theme: string;
  startsAt: string;
  endsAt: string;
  status: 'past' | 'current' | 'upcoming';
  rewards: string[];
  resetRules: string[];
  isSample: boolean;
}

export type WorldEventKind = 'rogue-ai' | 'blackout' | 'storm' | 'supply-crisis' | 'lab-incident' | 'rare-boss' | 'portal';

export const EVENT_KINDS: Record<WorldEventKind, { label: string; icon: string }> = {
  'rogue-ai': { label: 'Rogue AI invasion', icon: '🤖' },
  blackout: { label: 'City blackout', icon: '🌑' },
  storm: { label: 'Storm', icon: '⛈' },
  'supply-crisis': { label: 'Supply crisis', icon: '📉' },
  'lab-incident': { label: 'Laboratory incident', icon: '☣' },
  'rare-boss': { label: 'Rare boss', icon: '👹' },
  portal: { label: 'Temporary portal', icon: '🌀' },
};

export interface WorldEvent {
  id: string;
  kind: WorldEventKind;
  title: string;
  description: string;
  cityId: string;
  cityName: string;
  startsAt: string;
  endsAt: string;
  status: 'live' | 'upcoming' | 'ended';
  reward: string;
  /** Rival factions may cooperate during this event. */
  cooperative: boolean;
  isSample: boolean;
}

export interface CalendarEntry {
  id: string;
  date: string;
  title: string;
  kind: 'event' | 'season' | 'siege-window' | 'maintenance' | 'reward';
  isSample: boolean;
}

export interface DailyReward {
  day: number;
  reward: string;
  points: number;
  state: 'claimed' | 'today' | 'locked';
  isSample: boolean;
}

export interface EventsService {
  getCurrentSeason(): Promise<Season>;
  listSeasons(): Promise<Season[]>;
  listWorldEvents(): Promise<WorldEvent[]>;
  /** Entries for a calendar month (`month` is 0-based). */
  getCalendar(year: number, month: number): Promise<CalendarEntry[]>;
  getDailyRewards(): Promise<DailyReward[]>;
}

const SEASONS: readonly Season[] = [
  { id: 's1', number: 1, name: 'First Draft', theme: 'The founding war', startsAt: at(-120 * DAY), endsAt: at(-62 * DAY), status: 'past', rewards: ['Founder banner', 'Quill emote'], resetRules: ['Building ownership reset', 'Cosmetics kept'], isSample: true },
  { id: 's2', number: 2, name: 'Smudge War', theme: 'Rogue AI from the labs', startsAt: at(-60 * DAY), endsAt: at(18 * DAY), status: 'current', rewards: ['Top 100: Smudge cape', 'Top faction: city statue', 'All participants: season badge'], resetRules: ['City control resets to 50%', 'Treasuries keep 25%', 'Purchased cosmetics and boss levels are kept'], isSample: true },
  { id: 's3', number: 3, name: 'Graphite Winter', theme: 'Storms and blackouts', startsAt: at(20 * DAY), endsAt: at(80 * DAY), status: 'upcoming', rewards: ['Frost cosmetics', 'New region: Frostline'], resetRules: ['Published before launch (GDD §12)'], isSample: true },
];

const EVENTS: readonly Omit<WorldEvent, 'isSample'>[] = [
  { id: 'ev1', kind: 'rogue-ai', title: 'Rogue AI swarm in Blotmoor', description: 'Lab bots broke loose. Every faction scores for kills; buildings cannot change owner during the event.', cityId: 'blotmoor', cityName: 'Blotmoor', startsAt: at(-5 * HOUR), endsAt: at(19 * HOUR), status: 'live', reward: '2× points, Glitch skin', cooperative: true },
  { id: 'ev2', kind: 'storm', title: 'Ink storm over Glass Coast', description: 'Helicopters grounded; ranged weapons lose 30% range.', cityId: 'nibhaven', cityName: 'Nibhaven', startsAt: at(-2 * HOUR), endsAt: at(6 * HOUR), status: 'live', reward: 'Storm badge', cooperative: false },
  { id: 'ev3', kind: 'rare-boss', title: 'The Eraser appears', description: 'A legendary boss holds the tower in Graphite Ridge. Defeat it for an elemental skill.', cityId: 'graphite-ridge', cityName: 'Graphite Ridge', startsAt: at(1 * DAY + 6 * HOUR), endsAt: at(1 * DAY + 10 * HOUR), status: 'upcoming', reward: 'Chain lightning skill', cooperative: true },
  { id: 'ev4', kind: 'blackout', title: 'Blackout in Inkwell', description: 'Lights out: recon is stronger and sniper range halves.', cityId: 'inkwell', cityName: 'Inkwell', startsAt: at(3 * DAY), endsAt: at(3 * DAY + 3 * HOUR), status: 'upcoming', reward: 'Night-vision goggles', cooperative: false },
  { id: 'ev5', kind: 'supply-crisis', title: 'Supply crisis', description: 'Repair costs +50% everywhere for 2 days.', cityId: 'quillport', cityName: 'Quillport', startsAt: at(-4 * DAY), endsAt: at(-2 * DAY), status: 'ended', reward: '—', cooperative: false },
  { id: 'ev6', kind: 'portal', title: 'Portal on the Vellum rooftops', description: 'A portal links two rooftops for 1 hour.', cityId: 'vellum', cityName: 'Vellum', startsAt: at(6 * DAY), endsAt: at(6 * DAY + HOUR), status: 'upcoming', reward: 'Portal emote', cooperative: false },
];

export const mockEventsService: EventsService = {
  getCurrentSeason: () => resolve(SEASONS[1]),
  listSeasons: () => resolve([...SEASONS]),
  listWorldEvents: () => resolve(EVENTS.map((e) => ({ ...e, isSample: true }))),
  getCalendar(year, month) {
    const entries: CalendarEntry[] = [];
    const add = (iso: string, title: string, kind: CalendarEntry['kind']) => {
      const d = new Date(iso);
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
        entries.push({ id: `${kind}-${iso}-${entries.length}`, date: iso.slice(0, 10), title, kind, isSample: true });
      }
    };
    for (const e of EVENTS) add(e.startsAt, e.title, 'event');
    for (const s of SEASONS) {
      add(s.startsAt, `Season ${s.number} starts: ${s.name}`, 'season');
      add(s.endsAt, `Season ${s.number} ends`, 'season');
    }
    for (let i = -30; i <= 40; i += 7) add(at(i * DAY + 6 * HOUR), 'Weekend siege windows (most cities)', 'siege-window');
    add(at(9 * DAY), 'Server maintenance 02:00–03:00 UTC', 'maintenance');
    add(at(4 * DAY), 'Weekly faction rewards paid', 'reward');
    return resolve(entries.sort((a, b) => a.date.localeCompare(b.date)));
  },
  getDailyRewards: () =>
    resolve(
      [50, 75, 100, 125, 150, 200, 400].map((points, i) => ({
        day: i + 1,
        points,
        reward: i === 6 ? `${points} ◆ + bot skin crate` : `${points} ◆`,
        state: (i < 3 ? 'claimed' : i === 3 ? 'today' : 'locked') as DailyReward['state'],
        isSample: true,
      })),
    ),
};
