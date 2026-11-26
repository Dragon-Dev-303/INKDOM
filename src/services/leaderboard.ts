/** Season, player and faction rankings (GDD §12, §16). */
import { SAMPLE_FACTIONS, MY_FACTION_ID } from './factions';
import { lazy, resolve, sampleName, seeded } from './mock';

export interface PlayerRank {
  rank: number;
  playerId: string;
  name: string;
  factionId: string | null;
  rating: number;
  wins: number;
  losses: number;
  captures: number;
  /** Rank change since yesterday (+ = up). */
  change: number;
  isYou: boolean;
  isSample: boolean;
}

export interface FactionRank {
  rank: number;
  factionId: string;
  buildings: number;
  cities: number;
  seasonPoints: number;
  members: number;
  change: number;
  isYou: boolean;
  isSample: boolean;
}

export interface LeaderboardService {
  getPlayerRankings(seasonId: string): Promise<PlayerRank[]>;
  getFactionRankings(seasonId: string): Promise<FactionRank[]>;
}

const players = lazy(() => {
  const out: PlayerRank[] = [];
  for (let i = 0; i < 30; i++) {
    const r = seeded(`player-rank:${i}`);
    const wins = Math.max(5, 220 - i * 6 + r.int(-10, 10));
    out.push({
      rank: i + 1,
      playerId: `p${i}`,
      name: i === 17 ? 'You (Inkbaron)' : sampleName(`rank:${i}`),
      factionId: r.chance(0.85) ? r.pick(SAMPLE_FACTIONS).id : null,
      rating: 2400 - i * 23 - r.int(0, 15),
      wins,
      losses: r.int(20, 120),
      captures: r.int(2, 60),
      change: r.int(-4, 5),
      isYou: i === 17,
      isSample: true,
    });
  }
  out[17].factionId = MY_FACTION_ID;
  return out;
});

const factions = lazy(() =>
  SAMPLE_FACTIONS.map((f, i) => {
    const r = seeded(`faction-rank:${f.id}`);
    return {
      rank: i + 1,
      factionId: f.id,
      buildings: 48 - i * 7 + r.int(0, 3),
      cities: Math.max(0, 4 - i),
      seasonPoints: 92_000 - i * 11_500 + r.int(0, 900),
      members: r.int(6, 10),
      change: r.int(-2, 2),
      isYou: f.id === MY_FACTION_ID,
      isSample: true,
    } satisfies FactionRank;
  }),
);

export const mockLeaderboardService: LeaderboardService = {
  getPlayerRankings: () => resolve(players()),
  getFactionRankings: () => resolve(factions()),
};
