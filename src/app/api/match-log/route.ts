import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/server/supabase';
import { clientKey, num, oneOf, rateLimited, readJson, str, ValidationError } from '@/lib/server/validate';


const TEAMS = ['ATTACKER', 'DEFENDER'] as const;
const MAX_BYTES = 200_000;
const MAX_EVENTS = 1500;

function firstTimes(v: unknown, name: string): (number | null)[] {
  if (!Array.isArray(v) || v.length !== 2) throw new ValidationError(`${name} must be a 2-item array`);
  return v.map((x, i) => num(x, `${name}[${i}]`, 0, 3600, { nullable: true }));
}

function events(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new ValidationError('events must be an array');
  if (v.length > MAX_EVENTS) throw new ValidationError('too many events');
  for (const e of v) {
    if (!e || typeof e !== 'object' || typeof (e as { type?: unknown }).type !== 'string' || typeof (e as { t?: unknown }).t !== 'number') {
      throw new ValidationError('malformed event');
    }
  }
  return v;
}

/** POST /api/match-log — store one anonymous match summary + event log (brief §5, §11). */
export async function POST(req: Request) {
  if (rateLimited(`log:${clientKey(req)}`, 60, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const b = await readJson(req, MAX_BYTES);
    const row = {
      session_id: str(b.sessionId, 'sessionId', 64, { required: true, min: 8 }),
      build_version: str(b.buildVersion, 'buildVersion', 32, { required: true }),
      seed: num(b.seed, 'seed', -2147483648, 2147483647, { integer: true }),
      p1_team: oneOf(b.p1Team, 'p1Team', TEAMS),
      p2_controller: oneOf(b.p2Controller, 'p2Controller', ['HUMAN', 'CPU'] as const),
      winner: oneOf(b.winner, 'winner', TEAMS),
      end_reason: oneOf(b.endReason, 'endReason', ['CAPTURE', 'TIMEOUT'] as const),
      duration_seconds: num(b.durationSeconds, 'durationSeconds', 0, 3600),
      attacker_kos: num(b.attackerKos, 'attackerKos', 0, 10000, { integer: true }),
      defender_kos: num(b.defenderKos, 'defenderKos', 0, 10000, { integer: true }),
      peak_capture: num(b.peakCapture, 'peakCapture', 0, 1),
      stuck_events: num(b.stuckEvents, 'stuckEvents', 0, 10000, { integer: true }),
      first_move_seconds: firstTimes(b.firstMoveSeconds, 'firstMoveSeconds'),
      first_hit_seconds: firstTimes(b.firstHitSeconds, 'firstHitSeconds'),
      events: events(b.events),
    };
    const db = getSupabase();
    if (!db) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
    const { error } = await db.from('match_logs').insert(row);
    if (error) {
      console.error('match_logs insert failed:', error.message);
      return NextResponse.json({ error: 'Could not save match log' }, { status: 502 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('match-log error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
