import Stripe from 'stripe';
import type { StripeLikeEvent } from './core';

/** Stripe integration: hosted Checkout (all payment methods enabled in the Dashboard) + webhooks. */

let stripe: Stripe | null | undefined;

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

export function getStripe(): Stripe | null {
  if (stripe !== undefined) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  stripe = key ? new Stripe(key, { appInfo: { name: 'Inkdom' }, maxNetworkRetries: 2, timeout: 20000 }) : null;
  return stripe;
}

export interface CheckoutRequest {
  paymentId: string;
  userId: string;
  email: string | null;
  packId: string;
  points: number;
  priceCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(req: CheckoutRequest): Promise<{ id: string; url: string }> {
  const client = getStripe();
  if (!client) throw new Error('Stripe is not configured');
  const metadata = { payment_id: req.paymentId, user_id: req.userId, pack_id: req.packId };
  const session = await client.checkout.sessions.create(
    {
      mode: 'payment',
      // No payment_method_types: Stripe shows every method enabled in the Dashboard
      // (cards, Apple Pay, Google Pay, Link, PayPal, Klarna, iDEAL, stablecoins…).
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency,
            unit_amount: req.priceCents,
            product_data: {
              name: `${req.points.toLocaleString('en-US')} Inkdom Points`,
              description: 'In-game points for cosmetic items. No cash value.',
            },
          },
        },
      ],
      client_reference_id: req.paymentId,
      metadata,
      payment_intent_data: { metadata },
      ...(req.email ? { customer_email: req.email } : {}),
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    },
    { idempotencyKey: `checkout_${req.paymentId}` },
  );
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return { id: session.id, url: session.url };
}

/** Verifies the Stripe-Signature header against the raw body. Throws on a bad signature. */
export function constructStripeEvent(rawBody: string, signature: string, secret: string): StripeLikeEvent {
  // Signature checks need no API key; a placeholder keeps tests independent of env vars.
  const client = getStripe() ?? new Stripe('sk_test_placeholder');
  return client.webhooks.constructEvent(rawBody, signature, secret) as unknown as StripeLikeEvent;
}
