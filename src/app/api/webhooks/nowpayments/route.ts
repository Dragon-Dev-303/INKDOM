import { json } from '@/lib/server/http';
import { handleNowPaymentsIpn } from '@/lib/server/payments/core';
import { creditOnConfirmed, verifyIpn } from '@/lib/server/payments/nowpayments';
import { SupabasePaymentStore } from '@/lib/server/payments/store';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

/** POST /api/webhooks/nowpayments — signed IPN (HMAC-SHA512, key-sorted JSON). */
export async function POST(req: Request) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  const db = getSupabaseAdmin();
  if (!secret || !db) return json({ error: 'Crypto webhooks are not configured' }, 503);

  const raw = await req.text();
  if (raw.length > 20_000) return json({ error: 'Payload too large' }, 413);
  const body = verifyIpn(raw, req.headers.get('x-nowpayments-sig'), secret);
  if (!body) return json({ error: 'Invalid signature' }, 401);

  try {
    const result = await handleNowPaymentsIpn(body, new SupabasePaymentStore(db), { creditOnConfirmed: creditOnConfirmed() });
    if (result.outcome === 'amount_mismatch' || result.outcome === 'unknown_payment') {
      console.warn(`nowpayments ${String(body.payment_status)}: ${result.outcome}`, result.paymentId ?? String(body.order_id ?? ''));
    }
    return json({ received: true, outcome: result.outcome });
  } catch (e) {
    console.error('nowpayments ipn failed:', e instanceof Error ? e.message : e);
    return json({ error: 'Processing failed' }, 500);
  }
}
