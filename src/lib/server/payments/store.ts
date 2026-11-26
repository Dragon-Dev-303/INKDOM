import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentRow, PaymentStore, Provider } from './core';

const COLUMNS = 'id,user_id,provider,provider_ref,provider_payment_intent,pack_id,points,amount_cents,currency,status,provider_status,created_at,paid_at';

/** PaymentStore backed by Supabase (service-role client + SQL functions in the migration). */
export class SupabasePaymentStore implements PaymentStore {
  constructor(private db: SupabaseClient) {}

  async createPending(p: { userId: string; provider: Provider; packId: string; points: number; amountCents: number; currency: string }): Promise<PaymentRow> {
    const { data, error } = await this.db
      .from('payments')
      .insert({ user_id: p.userId, provider: p.provider, pack_id: p.packId, points: p.points, amount_cents: p.amountCents, currency: p.currency })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`createPending: ${error.message}`);
    return data as PaymentRow;
  }

  async setProviderRef(id: string, ref: string): Promise<void> {
    const { error } = await this.db.from('payments').update({ provider_ref: ref, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(`setProviderRef: ${error.message}`);
  }

  async get(id: string): Promise<PaymentRow | null> {
    const { data, error } = await this.db.from('payments').select(COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(`get: ${error.message}`);
    return (data as PaymentRow | null) ?? null;
  }

  async findByPaymentIntent(intent: string): Promise<PaymentRow | null> {
    const { data, error } = await this.db.from('payments').select(COLUMNS).eq('provider_payment_intent', intent).limit(1).maybeSingle();
    if (error) throw new Error(`findByPaymentIntent: ${error.message}`);
    return (data as PaymentRow | null) ?? null;
  }

  async credit(id: string, providerStatus: string, paymentIntent?: string | null) {
    const { data, error } = await this.db.rpc('credit_payment', { p_payment_id: id, p_provider_status: providerStatus, p_payment_intent: paymentIntent ?? null });
    if (error) throw new Error(`credit_payment: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { credited: boolean; balance: number | null } | undefined;
    return { credited: Boolean(row?.credited), balance: row?.balance ?? null };
  }

  async refund(id: string, providerStatus: string) {
    const { data, error } = await this.db.rpc('refund_payment', { p_payment_id: id, p_provider_status: providerStatus });
    if (error) throw new Error(`refund_payment: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { refunded: boolean } | undefined;
    return { refunded: Boolean(row?.refunded) };
  }

  async mark(id: string, status: 'pending' | 'failed' | 'expired', providerStatus: string) {
    const { data, error } = await this.db.rpc('mark_payment', { p_payment_id: id, p_status: status, p_provider_status: providerStatus });
    if (error) throw new Error(`mark_payment: ${error.message}`);
    return Boolean(data);
  }
}
