import { createHmac, timingSafeEqual } from 'node:crypto';

/** NOWPayments (crypto) integration: hosted invoices + signed IPN callbacks. */

export const nowPaymentsConfigured = () => Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
export const nowPaymentsApiBase = () =>
  process.env.NOWPAYMENTS_SANDBOX === 'true' ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
export const creditOnConfirmed = () => process.env.NOWPAYMENTS_CREDIT_ON_CONFIRMED === 'true';

/** Recursively sorts object keys (NOWPayments signs the key-sorted JSON). Arrays keep their order. */
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = sortDeep((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

export function signIpn(body: unknown, secret: string): string {
  return createHmac('sha512', secret).update(JSON.stringify(sortDeep(body))).digest('hex');
}

/** Returns the parsed body when the x-nowpayments-sig header is valid, otherwise null. */
export function verifyIpn(rawBody: string, signature: string | null, secret: string): Record<string, unknown> | null {
  if (!signature || !secret) return null;
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const expected = Buffer.from(signIpn(body, secret), 'hex');
  const given = Buffer.from(signature.trim().toLowerCase(), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return body as Record<string, unknown>;
}

export interface InvoiceRequest {
  priceCents: number;
  currency: string;
  orderId: string;
  description: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}

export interface InvoiceResponse { id: string; invoiceUrl: string }

export async function createInvoice(req: InvoiceRequest, fetchImpl: typeof fetch = fetch): Promise<InvoiceResponse> {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error('NOWPayments is not configured');
  const res = await fetchImpl(`${nowPaymentsApiBase()}/v1/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: Number((req.priceCents / 100).toFixed(2)),
      price_currency: req.currency,
      order_id: req.orderId,
      order_description: req.description,
      ipn_callback_url: req.ipnCallbackUrl,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.invoice_url || data.id === undefined) {
    throw new Error(`NOWPayments invoice failed (${res.status}): ${String(data.message ?? 'no details')}`);
  }
  return { id: String(data.id), invoiceUrl: String(data.invoice_url) };
}
