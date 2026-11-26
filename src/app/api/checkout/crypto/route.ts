import { startCheckout } from '@/lib/server/payments/checkout';

/** POST /api/checkout/crypto {packId} → {url} of a NOWPayments invoice (BTC, ETH, USDT, USDC, SOL, …). */
export async function POST(req: Request) {
  return startCheckout(req, 'nowpayments');
}
