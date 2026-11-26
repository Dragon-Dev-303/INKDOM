import { CURRENCY, findPack, packPoints } from '@/game/config/shop';
import type { SessionUser } from '../auth';
import { errorResponse, json, requireJson, requireUser, siteUrl } from '../http';
import { getSupabaseAdmin } from '../supabaseAdmin';
import { rateLimited, readJson } from '../validate';
import type { Provider } from './core';
import { createInvoice, nowPaymentsConfigured } from './nowpayments';
import { SupabasePaymentStore } from './store';
import { createCheckoutSession, stripeConfigured } from './stripe';

/**
 * Shared POST handler for /api/checkout/{stripe,crypto}: authenticate, validate the pack,
 * create a pending payment row, then ask the provider for a hosted payment page.
 */
export async function startCheckout(req: Request, provider: Provider): Promise<Response> {
  const bad = requireJson(req);
  if (bad) return bad;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const user: SessionUser = auth;

  if (provider === 'stripe' ? !stripeConfigured() : !nowPaymentsConfigured()) {
    return json({ error: `${provider === 'stripe' ? 'Card' : 'Crypto'} payments are not configured yet` }, 503);
  }
  const db = getSupabaseAdmin();
  if (!db) return json({ error: 'Wallet storage is not configured' }, 503);
  if (rateLimited(`checkout:${user.id}`, 10, 10 * 60_000)) return json({ error: 'Too many checkout attempts, try again in a few minutes' }, 429);

  try {
    const body = await readJson(req, 2_000);
    const pack = findPack(body.packId);
    if (!pack) return json({ error: 'Unknown pack' }, 400);
    const points = packPoints(pack);

    const store = new SupabasePaymentStore(db);
    const payment = await store.createPending({ userId: user.id, provider, packId: pack.id, points, amountCents: pack.priceCents, currency: CURRENCY });
    const base = siteUrl(req);
    const successUrl = `${base}/shop?checkout=success&payment=${payment.id}`;
    const cancelUrl = `${base}/shop?checkout=cancelled&payment=${payment.id}`;

    try {
      if (provider === 'stripe') {
        const session = await createCheckoutSession({
          paymentId: payment.id, userId: user.id, email: user.email, packId: pack.id, points,
          priceCents: pack.priceCents, currency: CURRENCY, successUrl, cancelUrl,
        });
        await store.setProviderRef(payment.id, session.id);
        return json({ url: session.url, paymentId: payment.id });
      }
      const invoice = await createInvoice({
        priceCents: pack.priceCents, currency: CURRENCY, orderId: payment.id,
        description: `${points} Inkdom Points`, ipnCallbackUrl: `${base}/api/webhooks/nowpayments`, successUrl, cancelUrl,
      });
      await store.setProviderRef(payment.id, invoice.id);
      return json({ url: invoice.invoiceUrl, paymentId: payment.id });
    } catch (e) {
      await store.mark(payment.id, 'failed', 'checkout_create_failed').catch(() => undefined);
      console.error(`${provider} checkout failed:`, e instanceof Error ? e.message : e);
      return json({ error: 'The payment provider is unavailable. Please try again.' }, 502);
    }
  } catch (e) {
    return errorResponse(e, `${provider} checkout`);
  }
}
