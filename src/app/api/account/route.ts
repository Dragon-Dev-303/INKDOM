import { sanitizeLoadout } from '@/game/config/shop';
import { authConfigured, getSessionUser } from '@/lib/server/auth';
import { errorResponse, json } from '@/lib/server/http';
import { nowPaymentsConfigured } from '@/lib/server/payments/nowpayments';
import { stripeConfigured } from '@/lib/server/payments/stripe';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

/**
 * GET /api/account — wallet for the signed-in player: balance, owned items, loadout and history.
 * Signed out → {signedIn:false} (200) so the client can still show what is available.
 */
export async function GET() {
  const db = getSupabaseAdmin();
  const base = {
    authEnabled: authConfigured(),
    walletEnabled: Boolean(db),
    providers: { stripe: stripeConfigured(), crypto: nowPaymentsConfigured() },
  };
  const user = await getSessionUser();
  if (!user) return json({ ...base, signedIn: false });
  if (!db) return json({ ...base, signedIn: true, email: user.email, balance: 0, owned: [], loadout: {}, payments: [], ledger: [] });

  try {
    const [profile, owned, payments, ledger] = await Promise.all([
      db.from('profiles').select('balance,loadout,username,display_name').eq('user_id', user.id).maybeSingle(),
      db.from('owned_items').select('item_id').eq('user_id', user.id),
      db.from('payments')
        .select('id,provider,pack_id,points,amount_cents,currency,status,provider_status,created_at,paid_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      db.from('point_ledger')
        .select('id,delta,reason,item_id,payment_id,balance_after,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);
    const err = profile.error ?? owned.error ?? payments.error ?? ledger.error;
    if (err) throw new Error(err.message);
    const ownedIds = (owned.data ?? []).map((r) => r.item_id as string);
    return json({
      ...base,
      signedIn: true,
      email: user.email,
      username: (profile.data?.username as string | null | undefined) ?? null,
      displayName: (profile.data?.display_name as string | null | undefined) ?? null,
      balance: (profile.data?.balance as number | undefined) ?? 0,
      owned: ownedIds,
      loadout: sanitizeLoadout(profile.data?.loadout, ownedIds),
      payments: payments.data ?? [],
      ledger: ledger.data ?? [],
    });
  } catch (e) {
    return errorResponse(e, 'account');
  }
}
