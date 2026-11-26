import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { handleNowPaymentsIpn, handleStripeEvent, type PaymentRow, type PaymentStore, type StripeLikeEvent } from '@/lib/server/payments/core';
import { signIpn, sortDeep, verifyIpn } from '@/lib/server/payments/nowpayments';
import { constructStripeEvent } from '@/lib/server/payments/stripe';

/** In-memory store that mirrors the SQL functions' rules (status machine + idempotency). */
class FakeStore implements PaymentStore {
  rows = new Map<string, PaymentRow>();
  balance = new Map<string, number>();
  ledger: { user: string; delta: number; reason: string; payment: string }[] = [];

  add(p: Partial<PaymentRow> & { id: string; provider: PaymentRow['provider'] }): PaymentRow {
    const row: PaymentRow = {
      user_id: 'user-1', provider_ref: null, provider_payment_intent: null, pack_id: 'pack_550', points: 550,
      amount_cents: 499, currency: 'usd', status: 'pending', provider_status: null, ...p,
    };
    this.rows.set(row.id, row);
    return row;
  }
  bal(user = 'user-1') { return this.balance.get(user) ?? 0; }
  async get(id: string) { const r = this.rows.get(id); return r ? { ...r } : null; }
  async findByPaymentIntent(pi: string) { const r = [...this.rows.values()].find((x) => x.provider_payment_intent === pi); return r ? { ...r } : null; }
  async credit(id: string, ps: string, pi?: string | null) {
    const r = this.rows.get(id)!;
    if (r.status === 'paid' || r.status === 'refunded') return { credited: false, balance: this.bal(r.user_id) };
    r.status = 'paid'; r.provider_status = ps; r.provider_payment_intent = pi ?? r.provider_payment_intent;
    this.balance.set(r.user_id, this.bal(r.user_id) + r.points);
    this.ledger.push({ user: r.user_id, delta: r.points, reason: 'purchase', payment: id });
    return { credited: true, balance: this.bal(r.user_id) };
  }
  async refund(id: string, ps: string) {
    const r = this.rows.get(id)!;
    if (r.status !== 'paid') return { refunded: false };
    r.status = 'refunded'; r.provider_status = ps;
    this.balance.set(r.user_id, this.bal(r.user_id) - r.points);
    this.ledger.push({ user: r.user_id, delta: -r.points, reason: 'refund', payment: id });
    return { refunded: true };
  }
  async mark(id: string, status: 'pending' | 'failed' | 'expired', ps: string) {
    const r = this.rows.get(id)!;
    if (!['pending', 'failed', 'expired'].includes(r.status)) return false;
    r.status = status; r.provider_status = ps;
    return true;
  }
}

const PID = '11111111-2222-4333-8444-555555555555';
const PID2 = '99999999-2222-4333-8444-555555555555';
const session = (type: string, extra: Record<string, unknown> = {}): StripeLikeEvent => ({
  id: `evt_${type}`, type,
  data: { object: { id: 'cs_1', client_reference_id: PID, metadata: { payment_id: PID }, payment_status: 'paid', amount_total: 499, currency: 'usd', payment_intent: 'pi_1', ...extra } },
});

describe('NOWPayments signature (T-P03)', () => {
  const secret = 'ipn-secret';
  const body = { payment_status: 'finished', order_id: PID, price_amount: 4.99, nested: { b: 2, a: 1 }, actually_paid: 0.0001 };
  it('sorts keys deeply and matches a reference HMAC', () => {
    expect(JSON.stringify(sortDeep(body))).toBe('{"actually_paid":0.0001,"nested":{"a":1,"b":2},"order_id":"' + PID + '","payment_status":"finished","price_amount":4.99}');
    const reference = createHmac('sha512', secret).update(JSON.stringify(sortDeep(body))).digest('hex');
    expect(signIpn(body, secret)).toBe(reference);
  });
  it('accepts a valid signature and rejects tampering, wrong secret, junk', () => {
    const raw = JSON.stringify(body);
    const sig = signIpn(body, secret);
    expect(verifyIpn(raw, sig, secret)).toMatchObject({ order_id: PID });
    expect(verifyIpn(raw.replace('4.99', '0.01'), sig, secret)).toBeNull();
    expect(verifyIpn(raw, sig, 'other')).toBeNull();
    expect(verifyIpn(raw, null, secret)).toBeNull();
    expect(verifyIpn('not json', sig, secret)).toBeNull();
    expect(verifyIpn(raw, 'zz', secret)).toBeNull();
  });
});

describe('Stripe signature (T-P04)', () => {
  it('accepts a correctly signed payload and rejects a tampered one', () => {
    const secret = 'whsec_test_secret';
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: {} } });
    const header = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret });
    expect(constructStripeEvent(payload, header, secret).type).toBe('checkout.session.completed');
    expect(() => constructStripeEvent(payload.replace('evt_1', 'evt_2'), header, secret)).toThrow();
    expect(() => constructStripeEvent(payload, header, 'whsec_wrong')).toThrow();
  });
});

describe('Stripe event handling (T-P05…T-P09, T-P14)', () => {
  it('credits a paid checkout exactly once', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'stripe' });
    expect((await handleStripeEvent(session('checkout.session.completed'), s)).outcome).toBe('credited');
    expect((await handleStripeEvent(session('checkout.session.completed'), s)).outcome).toBe('already_processed');
    expect((await handleStripeEvent(session('checkout.session.async_payment_succeeded'), s)).outcome).toBe('already_processed');
    expect(s.bal()).toBe(550);
    expect(s.ledger).toHaveLength(1);
    expect(s.rows.get(PID)!.provider_payment_intent).toBe('pi_1');
  });
  it('waits for async methods and credits on async_payment_succeeded', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'stripe' });
    expect((await handleStripeEvent(session('checkout.session.completed', { payment_status: 'unpaid' }), s)).outcome).toBe('pending');
    expect(s.bal()).toBe(0);
    expect((await handleStripeEvent(session('checkout.session.async_payment_succeeded'), s)).outcome).toBe('credited');
    expect(s.bal()).toBe(550);
  });
  it('refuses to credit when the amount or currency differs', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'stripe' });
    expect((await handleStripeEvent(session('checkout.session.completed', { amount_total: 1 }), s)).outcome).toBe('amount_mismatch');
    expect((await handleStripeEvent(session('checkout.session.completed', { currency: 'eur' }), s)).outcome).toBe('amount_mismatch');
    expect(s.bal()).toBe(0);
    expect(s.rows.get(PID)!.provider_status).toBe('amount_mismatch');
  });
  it('marks expired and failed sessions without points', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'stripe' }); s.add({ id: PID2, provider: 'stripe' });
    expect((await handleStripeEvent(session('checkout.session.expired'), s)).outcome).toBe('expired');
    const failed: StripeLikeEvent = { id: 'e', type: 'checkout.session.async_payment_failed', data: { object: { metadata: { payment_id: PID2 } } } };
    expect((await handleStripeEvent(failed, s)).outcome).toBe('failed');
    expect([s.rows.get(PID)!.status, s.rows.get(PID2)!.status]).toEqual(['expired', 'failed']);
    expect(s.bal()).toBe(0);
  });
  it('removes points once on a full refund or dispute; ignores partial refunds', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'stripe' });
    await handleStripeEvent(session('checkout.session.completed'), s);
    const partial: StripeLikeEvent = { id: 'r0', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount: 499, amount_refunded: 100, refunded: false } } };
    expect((await handleStripeEvent(partial, s)).outcome).toBe('ignored');
    const full: StripeLikeEvent = { id: 'r1', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount: 499, amount_refunded: 499, refunded: true } } };
    expect((await handleStripeEvent(full, s)).outcome).toBe('refunded');
    const dispute: StripeLikeEvent = { id: 'd1', type: 'charge.dispute.created', data: { object: { payment_intent: { id: 'pi_1' } } } };
    expect((await handleStripeEvent(dispute, s)).outcome).toBe('already_processed');
    expect(s.bal()).toBe(0);
    expect(s.rows.get(PID)!.status).toBe('refunded');
  });
  it('ignores unknown payments, bad ids, other providers and other event types', async () => {
    const s = new FakeStore(); s.add({ id: PID2, provider: 'nowpayments' });
    expect((await handleStripeEvent(session('checkout.session.completed'), s)).outcome).toBe('unknown_payment');
    expect((await handleStripeEvent(session('checkout.session.completed', { metadata: { payment_id: 'x' }, client_reference_id: "1' or 1=1" }), s)).outcome).toBe('unknown_payment');
    expect((await handleStripeEvent(session('checkout.session.completed', { metadata: { payment_id: PID2 } }), s)).outcome).toBe('unknown_payment');
    expect((await handleStripeEvent({ id: 'x', type: 'customer.created', data: { object: {} } }, s)).outcome).toBe('ignored');
  });
});

describe('NOWPayments IPN handling (T-P10…T-P14)', () => {
  const ipn = (status: string, extra: Record<string, unknown> = {}) => ({ payment_id: 5077125051, invoice_id: 1, order_id: PID, payment_status: status, price_amount: 4.99, price_currency: 'usd', ...extra });
  const opt = { creditOnConfirmed: false };

  it('credits on finished exactly once', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'nowpayments' });
    expect((await handleNowPaymentsIpn(ipn('finished'), s, opt)).outcome).toBe('credited');
    expect((await handleNowPaymentsIpn(ipn('finished'), s, opt)).outcome).toBe('already_processed');
    expect(s.bal()).toBe(550);
    expect(s.rows.get(PID)!.provider_payment_intent).toBe('np_5077125051');
  });
  it('keeps confirming / partially_paid pending; confirmed credits only when enabled', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'nowpayments' });
    for (const st of ['waiting', 'confirming', 'confirmed', 'partially_paid']) {
      expect((await handleNowPaymentsIpn(ipn(st), s, opt)).outcome).toBe('pending');
    }
    expect(s.bal()).toBe(0);
    expect(s.rows.get(PID)!.provider_status).toBe('np:partially_paid');
    expect((await handleNowPaymentsIpn(ipn('confirmed'), s, { creditOnConfirmed: true })).outcome).toBe('credited');
  });
  it('rejects a wrong price or currency', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'nowpayments' });
    expect((await handleNowPaymentsIpn(ipn('finished', { price_amount: 0.5 }), s, opt)).outcome).toBe('amount_mismatch');
    expect((await handleNowPaymentsIpn(ipn('finished', { price_currency: 'eur' }), s, opt)).outcome).toBe('amount_mismatch');
    expect(s.bal()).toBe(0);
  });
  it('credits a later successful attempt after an expired one, and an expired IPN never undoes a payment', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'nowpayments' });
    expect((await handleNowPaymentsIpn(ipn('expired'), s, opt)).outcome).toBe('expired');
    expect((await handleNowPaymentsIpn(ipn('finished'), s, opt)).outcome).toBe('credited');
    await handleNowPaymentsIpn(ipn('expired'), s, opt);
    expect(s.rows.get(PID)!.status).toBe('paid');
    expect(s.bal()).toBe(550);
  });
  it('refunds once and ignores unknown orders', async () => {
    const s = new FakeStore(); s.add({ id: PID, provider: 'nowpayments' });
    await handleNowPaymentsIpn(ipn('finished'), s, opt);
    expect((await handleNowPaymentsIpn(ipn('refunded'), s, opt)).outcome).toBe('refunded');
    expect((await handleNowPaymentsIpn(ipn('refunded'), s, opt)).outcome).toBe('already_processed');
    expect(s.bal()).toBe(0);
    expect((await handleNowPaymentsIpn(ipn('finished', { order_id: PID2 }), s, opt)).outcome).toBe('unknown_payment');
    expect((await handleNowPaymentsIpn(ipn('finished', { order_id: 'abc' }), s, opt)).outcome).toBe('unknown_payment');
  });
});
