import { startCheckout } from '@/lib/server/payments/checkout';

/** POST /api/checkout/stripe {packId} → {url} of a Stripe Checkout page (cards, wallets, local methods). */
export async function POST(req: Request) {
  return startCheckout(req, 'stripe');
}
