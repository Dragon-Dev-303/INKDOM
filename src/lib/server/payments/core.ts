/**
 * Provider-independent payment logic (INKDOM_Payments_Plan.md §6). Webhook handlers turn a
 * verified provider event into calls on a PaymentStore. The store's SQL functions are
 * idempotent, so duplicated or out-of-order events never credit points twice.
 */

export type Provider = 'stripe' | 'nowpayments';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export interface PaymentRow {
  id: string;
  user_id: string;
  provider: Provider;
  provider_ref: string | null;
  provider_payment_intent: string | null;
  pack_id: string;
  points: number;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  provider_status: string | null;
  created_at?: string;
  paid_at?: string | null;
}

export interface PaymentStore {
  get(id: string): Promise<PaymentRow | null>;
  findByPaymentIntent(paymentIntent: string): Promise<PaymentRow | null>;
  credit(id: string, providerStatus: string, paymentIntent?: string | null): Promise<{ credited: boolean; balance: number | null }>;
  refund(id: string, providerStatus: string): Promise<{ refunded: boolean }>;
  /** pending/failed/expired → given status (never touches paid/refunded rows). */
  mark(id: string, status: 'pending' | 'failed' | 'expired', providerStatus: string): Promise<boolean>;
}

export type Outcome =
  | 'credited'
  | 'already_processed'
  | 'pending'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'amount_mismatch'
  | 'unknown_payment'
  | 'ignored';

export interface HandleResult { outcome: Outcome; paymentId?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** Stripe fields such as payment_intent are either an id string or an expanded object. */
const idOf = (v: unknown): string | null => asString(v) ?? asString(asRecord(v).id);

// ---------------------------------------------------------------- Stripe

/** The parts of a Stripe event this module reads (works with Stripe.Event). */
export interface StripeLikeEvent { id: string; type: string; data: { object: unknown } }

async function loadByStripeSession(store: PaymentStore, session: Record<string, unknown>) {
  const meta = asRecord(session.metadata);
  const id = asString(meta.payment_id) ?? asString(session.client_reference_id);
  if (!isUuid(id)) return null;
  return store.get(id);
}

function amountMatches(pay: PaymentRow, amountCents: unknown, currency: unknown): boolean {
  return amountCents === pay.amount_cents && typeof currency === 'string' && currency.toLowerCase() === pay.currency.toLowerCase();
}

async function creditChecked(store: PaymentStore, pay: PaymentRow, ok: boolean, providerStatus: string, intent: string | null): Promise<HandleResult> {
  if (!ok) {
    // Keep the current status; only record why it was not credited (no-op on paid rows).
    await store.mark(pay.id, pay.status === 'failed' || pay.status === 'expired' ? pay.status : 'pending', 'amount_mismatch');
    return { outcome: pay.status === 'paid' ? 'already_processed' : 'amount_mismatch', paymentId: pay.id };
  }
  const r = await store.credit(pay.id, providerStatus, intent);
  return { outcome: r.credited ? 'credited' : 'already_processed', paymentId: pay.id };
}

export async function handleStripeEvent(event: StripeLikeEvent, store: PaymentStore): Promise<HandleResult> {
  const obj = asRecord(event.data?.object);
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const pay = await loadByStripeSession(store, obj);
      if (!pay || pay.provider !== 'stripe') return { outcome: 'unknown_payment' };
      const intent = idOf(obj.payment_intent);
      const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
      if (!paid) {
        await store.mark(pay.id, 'pending', `stripe:${String(obj.payment_status ?? 'unpaid')}`);
        return { outcome: 'pending', paymentId: pay.id };
      }
      return creditChecked(store, pay, amountMatches(pay, obj.amount_total, obj.currency), `stripe:${event.type}`, intent);
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const pay = await loadByStripeSession(store, obj);
      if (!pay || pay.provider !== 'stripe') return { outcome: 'unknown_payment' };
      const status = event.type === 'checkout.session.expired' ? 'expired' : 'failed';
      await store.mark(pay.id, status, `stripe:${event.type}`);
      return { outcome: status, paymentId: pay.id };
    }
    case 'charge.refunded':
    case 'charge.dispute.created': {
      if (event.type === 'charge.refunded') {
        // Only a full refund removes points; partial refunds are a manual decision.
        const full = obj.refunded === true || (typeof obj.amount === 'number' && obj.amount_refunded === obj.amount);
        if (!full) return { outcome: 'ignored' };
      }
      const intent = idOf(obj.payment_intent);
      let pay = intent ? await store.findByPaymentIntent(intent) : null;
      if (!pay) {
        const metaId = asString(asRecord(obj.metadata).payment_id);
        if (isUuid(metaId)) pay = await store.get(metaId);
      }
      if (!pay || pay.provider !== 'stripe') return { outcome: 'unknown_payment' };
      const r = await store.refund(pay.id, `stripe:${event.type}`);
      return { outcome: r.refunded ? 'refunded' : 'already_processed', paymentId: pay.id };
    }
    default:
      return { outcome: 'ignored' };
  }
}

// ---------------------------------------------------------------- NOWPayments

export interface NowPaymentsOptions { creditOnConfirmed: boolean }

export async function handleNowPaymentsIpn(body: Record<string, unknown>, store: PaymentStore, opt: NowPaymentsOptions): Promise<HandleResult> {
  const orderId = asString(body.order_id);
  if (!isUuid(orderId)) return { outcome: 'unknown_payment' };
  const pay = await store.get(orderId);
  if (!pay || pay.provider !== 'nowpayments') return { outcome: 'unknown_payment' };

  const status = String(body.payment_status ?? '').toLowerCase();
  const providerStatus = `np:${status}`.slice(0, 60);
  const creditable = status === 'finished' || (opt.creditOnConfirmed && status === 'confirmed');

  if (creditable) {
    const priceCents = Math.round(Number(body.price_amount) * 100);
    const ok = Number.isFinite(priceCents) && priceCents === pay.amount_cents &&
      typeof body.price_currency === 'string' && body.price_currency.toLowerCase() === pay.currency.toLowerCase();
    const npPaymentId = body.payment_id === undefined || body.payment_id === null ? null : String(body.payment_id);
    return creditChecked(store, pay, ok, providerStatus, npPaymentId ? `np_${npPaymentId}` : null);
  }
  switch (status) {
    case 'waiting':
    case 'confirming':
    case 'confirmed':
    case 'sending':
    case 'partially_paid':
      await store.mark(pay.id, 'pending', providerStatus);
      return { outcome: 'pending', paymentId: pay.id };
    case 'failed':
    case 'expired':
      // A failed attempt never overrides a paid one (mark ignores paid rows).
      await store.mark(pay.id, status, providerStatus);
      return { outcome: status, paymentId: pay.id };
    case 'refunded': {
      const r = await store.refund(pay.id, providerStatus);
      return { outcome: r.refunded ? 'refunded' : 'already_processed', paymentId: pay.id };
    }
    default:
      return { outcome: 'ignored', paymentId: pay.id };
  }
}
