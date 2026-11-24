import type { MatchLogPayload } from '@/game/telemetry/matchLog';

export interface FeedbackPayload {
  sessionId: string;
  buildVersion: string;
  preferredSide: 'ATTACKER' | 'DEFENDER' | 'SAME' | null;
  funRating: number | null;
  objectiveAnswer: string;
  controlsRating: number | null;
  awkwardActions: string;
  usedCommands: string;
  botsRating: number | null;
  unfair: string;
  confusing: string;
  bugs: string;
  playOnline: 'YES' | 'MAYBE' | 'NO' | null;
  other: string;
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export const submitMatchLog = (log: MatchLogPayload) => post('/api/match-log', log);
export const submitFeedback = (fb: FeedbackPayload) => post('/api/feedback', fb);
