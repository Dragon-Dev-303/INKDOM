import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/server/supabase';
import { clientKey, num, oneOf, rateLimited, readJson, str, ValidationError } from '@/lib/server/validate';


/** POST /api/feedback — store one anonymous playtest feedback form (plan §9.4). */
export async function POST(req: Request) {
  if (rateLimited(`fb:${clientKey(req)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const b = await readJson(req, 30_000);
    const rating = (v: unknown, n: string) => num(v, n, 1, 5, { integer: true, nullable: true });
    const row = {
      session_id: str(b.sessionId, 'sessionId', 64, { required: true, min: 8 }),
      build_version: str(b.buildVersion, 'buildVersion', 32, { required: true }),
      preferred_side: oneOf(b.preferredSide, 'preferredSide', ['ATTACKER', 'DEFENDER', 'SAME'] as const, { nullable: true }),
      fun_rating: rating(b.funRating, 'funRating'),
      objective_answer: str(b.objectiveAnswer, 'objectiveAnswer', 2000),
      controls_rating: rating(b.controlsRating, 'controlsRating'),
      awkward_actions: str(b.awkwardActions, 'awkwardActions', 2000),
      used_commands: str(b.usedCommands, 'usedCommands', 2000),
      bots_rating: rating(b.botsRating, 'botsRating'),
      unfair: str(b.unfair, 'unfair', 2000),
      confusing: str(b.confusing, 'confusing', 2000),
      bugs: str(b.bugs, 'bugs', 2000),
      play_online: oneOf(b.playOnline, 'playOnline', ['YES', 'MAYBE', 'NO'] as const, { nullable: true }),
      other: str(b.other, 'other', 2000),
    };
    const answered = Object.entries(row).some(([k, v]) => !['session_id', 'build_version'].includes(k) && v !== null && v !== '');
    if (!answered) return NextResponse.json({ error: 'Please answer at least one question' }, { status: 400 });
    const db = getSupabase();
    if (!db) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
    const { error } = await db.from('feedback').insert(row);
    if (error) {
      console.error('feedback insert failed:', error.message);
      return NextResponse.json({ error: 'Could not save feedback' }, { status: 502 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('feedback error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
