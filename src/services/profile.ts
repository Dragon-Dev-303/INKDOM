/** Player profile, stats, recent matches and cosmetics (GDD §16). */
import { MY_FACTION_ID } from './factions';
import type { Rarity } from './boss';
import { at, HOUR, lazy, resolve, sampleName, seeded } from './mock';

export interface MatchSummary {
  id: string;
  at: string;
  mode: 'local' | 'online' | 'siege' | 'tutorial';
  side: 'attacker' | 'defender';
  result: 'win' | 'loss';
  reason: string;
  opponent: string;
  building: string;
  durationSec: number;
  kos: number;
  isSample: boolean;
}

export interface ProfileCosmetic {
  id: string;
  name: string;
  slot: string;
  rarity: Rarity;
  equipped: boolean;
  isSample: boolean;
}

export interface PlayerProfile {
  name: string;
  title: string;
  level: number;
  xp: number;
  xpToNext: number;
  factionId: string | null;
  joinedAt: string;
  stats: { matches: number; wins: number; losses: number; captures: number; defences: number; kos: number; bestStreak: number; playtimeHours: number };
  badges: { id: string; name: string; icon: string }[];
  recentMatches: MatchSummary[];
  cosmetics: ProfileCosmetic[];
  isSample: boolean;
}

export interface ProfileService {
  getMyProfile(): Promise<PlayerProfile>;
}

const profile = lazy<PlayerProfile>(() => {
  const r = seeded('profile:me');
  const reasons = ['Flag captured', 'Boss KO', 'Time expired: defenders hold', 'Flag captured', 'Boss KO'];
  return {
    name: 'Inkbaron',
    title: 'Stairwell Tyrant',
    level: 17,
    xp: 3420,
    xpToNext: 5000,
    factionId: MY_FACTION_ID,
    joinedAt: at(-150 * 24 * HOUR),
    stats: { matches: 214, wins: 131, losses: 83, captures: 58, defences: 44, kos: 1290, bestStreak: 9, playtimeHours: 96 },
    badges: [
      { id: 'b1', name: 'Season 1 veteran', icon: '🎖' },
      { id: 'b2', name: 'Roof runner', icon: '🏁' },
      { id: 'b3', name: '100 captures club', icon: '💯' },
      { id: 'b4', name: 'Medic friend', icon: '⛑' },
    ],
    recentMatches: Array.from({ length: 8 }, (_, i) => ({
      id: `match${i}`,
      at: at(-(i * 7 + r.int(1, 5)) * HOUR),
      mode: r.pick(['local', 'online', 'online', 'siege'] as const),
      side: r.chance(0.5) ? 'attacker' : 'defender',
      result: r.chance(0.6) ? 'win' : 'loss',
      reason: r.pick(reasons),
      opponent: sampleName(`opp:${i}`),
      building: r.pick(['Serif St. Office', 'Margin St. Factory', 'Folio St. Tower', 'Spine St. Hospital']),
      durationSec: r.int(150, 600),
      kos: r.int(1, 14),
      isSample: true,
    })),
    cosmetics: [
      { id: 'c1', name: 'Crimson scarf', slot: 'Neck', rarity: 'uncommon', equipped: true, isSample: true },
      { id: 'c2', name: 'Ink crown', slot: 'Head', rarity: 'epic', equipped: true, isSample: true },
      { id: 'c3', name: 'Smudge cape', slot: 'Back', rarity: 'legendary', equipped: false, isSample: true },
      { id: 'c4', name: 'Bandana', slot: 'Head', rarity: 'common', equipped: false, isSample: true },
      { id: 'c5', name: 'Victory pose: Quill salute', slot: 'Pose', rarity: 'rare', equipped: true, isSample: true },
    ],
    isSample: true,
  };
});

export const mockProfileService: ProfileService = {
  getMyProfile: () => resolve(profile()),
};
