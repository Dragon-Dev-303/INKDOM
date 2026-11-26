import { COSMETIC_SLOTS, findItem, sanitizeLoadout, type CosmeticSlot } from '@/game/config/shop';
import { errorResponse, json, requireJson, requireUser } from '@/lib/server/http';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { oneOf, readJson } from '@/lib/server/validate';

/** POST /api/shop/equip {slot, itemId|null} — equip an owned item (or clear the slot). */
export async function POST(req: Request) {
  const bad = requireJson(req);
  if (bad) return bad;
  const user = await requireUser();
  if (user instanceof Response) return user;
  const db = getSupabaseAdmin();
  if (!db) return json({ error: 'Wallet storage is not configured' }, 503);
  try {
    const body = await readJson(req, 1_000);
    const slot = oneOf(body.slot, 'slot', COSMETIC_SLOTS) as CosmeticSlot;
    const itemId = body.itemId === null || body.itemId === undefined ? null : body.itemId;
    if (itemId !== null) {
      const item = findItem(itemId);
      if (!item || item.slot !== slot) return json({ error: 'That item does not fit this slot' }, 400);
    }
    const [profile, owned] = await Promise.all([
      db.from('profiles').select('loadout').eq('user_id', user.id).maybeSingle(),
      db.from('owned_items').select('item_id').eq('user_id', user.id),
    ]);
    if (profile.error || owned.error) throw new Error((profile.error ?? owned.error)!.message);
    const ownedIds = (owned.data ?? []).map((r) => r.item_id as string);
    if (itemId !== null && !ownedIds.includes(itemId as string)) return json({ error: 'Buy this item first' }, 403);

    const loadout = sanitizeLoadout({ ...(profile.data?.loadout as object | null ?? {}), [slot]: itemId }, ownedIds);
    const { error } = await db.from('profiles').upsert({ user_id: user.id, loadout, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return json({ ok: true, loadout });
  } catch (e) {
    return errorResponse(e, 'shop equip');
  }
}
