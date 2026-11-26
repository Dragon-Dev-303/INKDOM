import { json } from '@/lib/server/http';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { clientKey, rateLimited } from '@/lib/server/validate';
import { normalizeUsername, usernameProblem } from '@/lib/usernames';

/** GET /api/account/username?u=name → {available, problem} (live check on the sign-up form). */
export async function GET(req: Request) {
  if (rateLimited(`uname:${clientKey(req)}`, 60, 60_000)) return json({ error: 'Too many requests' }, 429);
  const raw = new URL(req.url).searchParams.get('u') ?? '';
  const problem = usernameProblem(raw);
  if (problem) return json({ available: false, problem });
  const db = getSupabaseAdmin();
  // Without the wallet database the check can't run; sign-up still works (the trigger de-duplicates).
  if (!db) return json({ available: true, problem: null, unchecked: true });
  const { data, error } = await db.from('profiles').select('user_id').eq('username', normalizeUsername(raw)).limit(1);
  if (error) return json({ available: true, problem: null, unchecked: true });
  return json({ available: (data ?? []).length === 0, problem: (data ?? []).length ? 'Already taken' : null });
}
