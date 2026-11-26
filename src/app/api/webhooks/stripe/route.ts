import { json } from '@/lib/server/http';
import { handleStripeEvent } from '@/lib/server/payments/core';
import { SupabasePaymentStore } from '@/lib/server/payments/store';
import { constructStripeEvent } from '@/lib/server/payments/stripe';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

/**
 * POST /api/webhooks/stripe — signed Stripe events. Points are credited here only, never
 * from the browser redirect. Returns 500 on storage errors so Stripe retries.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const db = getSupabaseAdmin();
  if (!secret || !db) return json({ error: 'Stripe webhooks are not configured' }, 503);

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);
  let event;
  try {
    event = constructStripeEvent(raw, signature, secret);
  } catch {
    return json({ error: 'Invalid signature' }, 400);
  }

  try {
    const result = await handleStripeEvent(event, new SupabasePaymentStore(db));
    if (result.outcome === 'amount_mismatch' || result.outcome === 'unknown_payment') {
      console.warn(`stripe ${event.type} ${event.id}: ${result.outcome}`, result.paymentId ?? '');
    }
    return json({ received: true, outcome: result.outcome });
  } catch (e) {
    console.error(`stripe webhook ${event.type} ${event.id} failed:`, e instanceof Error ? e.message : e);
    return json({ error: 'Processing failed' }, 500);
  }
}
