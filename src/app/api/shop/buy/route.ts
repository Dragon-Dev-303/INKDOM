import { findItem } from '@/game/config/shop';
import { errorResponse, json, requireJson, requireUser } from '@/lib/server/http';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { rateLimited, readJson } from '@/lib/server/validate';

/** POST /api/shop/buy {itemId} — spend points; the price always comes from the server catalog. */
export async function POST(req: Request) {
  const bad = requireJson(req);
  if (bad) return bad;
  const user = await requireUser();
  if (user instanceof Response) return user;
  const db = getSupabaseAdmin();
  if (!db) return json({ error: 'Wallet storage is not configured' }, 503);
  if (rateLimited(`buy:${user.id}`, 30, 60_000)) return json({ error: 'Too many requests' }, 429);
  try {
    const body = await readJson(req, 1_000);
    const item = findItem(body.itemId);
    if (!item) return json({ error: 'Unknown item' }, 400);
    const { data, error } = await db.rpc('purchase_item', { p_user_id: user.id, p_item_id: item.id, p_price: item.price });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; error: string | null; balance: number } | undefined;
    if (!row?.ok) {
      if (row?.error === 'already_owned') return json({ error: 'You already own this item', balance: row.balance }, 409);
      if (row?.error === 'insufficient_points') return json({ error: 'Not enough points', balance: row.balance }, 402);
      throw new Error(`purchase_item returned ${JSON.stringify(row)}`);
    }
    return json({ ok: true, itemId: item.id, balance: row.balance });
  } catch (e) {
    return errorResponse(e, 'shop buy');
  }
}
