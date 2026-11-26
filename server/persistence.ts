import { BUILD_VERSION } from '../src/game/config/tuning';
import type { MatchResults } from '../src/game/sim/match';
import { getAdmin } from './auth';

export interface MatchRecord {
  roomCode: string;
  attacker: { userId: string; name: string; guest: boolean } | null;
  defender: { userId: string; name: string; guest: boolean } | null;
  results: MatchResults;
  disconnects: number;
}

export interface MatchStore { save(r: MatchRecord): Promise<void> }

const uuidOrNull = (p: MatchRecord['attacker']) => (p && !p.guest && /^[0-9a-f-]{36}$/i.test(p.userId) ? p.userId : null);

/** Writes finished online matches to Supabase `online_matches` (no-op when not configured). */
export const supabaseMatchStore: MatchStore = {
  async save(r) {
    const db = getAdmin();
    if (!db) return;
    const { error } = await db.from('online_matches').insert({
      room_code: r.roomCode,
      attacker_user: uuidOrNull(r.attacker),
      defender_user: uuidOrNull(r.defender),
      attacker_name: r.attacker?.name ?? null,
      defender_name: r.defender?.name ?? null,
      winner: r.results.winner,
      reason: r.results.reason,
      duration_seconds: Math.round(r.results.durationSeconds * 100) / 100,
      attacker_kos: r.results.kos.ATTACKER,
      defender_kos: r.results.kos.DEFENDER,
      disconnects: r.disconnects,
      build_version: BUILD_VERSION,
      seed: r.results.seed,
    });
    if (error) console.warn('online_matches insert failed:', error.message);
  },
};

export const memoryMatchStore = (): MatchStore & { records: MatchRecord[] } => {
  const records: MatchRecord[] = [];
  return { records, async save(r) { records.push(r); } };
};
