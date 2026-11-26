'use client';

import type { CosmeticSlot, Loadout } from '@/game/config/shop';
import { getBrowserSupabase } from '../supabase/browser';

/** Client wrapper for the wallet/shop API and Supabase sign-in (INKDOM_Payments_Plan.md §6, §8). */

export interface PaymentSummary {
  id: string;
  provider: 'stripe' | 'nowpayments';
  pack_id: string;
  points: number;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  provider_status: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface LedgerEntry {
  id: number;
  delta: number;
  reason: 'purchase' | 'spend' | 'refund' | 'adjust';
  item_id: string | null;
  payment_id: string | null;
  balance_after: number;
  created_at: string;
}

export interface AccountState {
  authEnabled: boolean;
  walletEnabled: boolean;
  providers: { stripe: boolean; crypto: boolean };
  signedIn: boolean;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  balance?: number;
  owned?: string[];
  loadout?: Loadout;
  payments?: PaymentSummary[];
  ledger?: LedgerEntry[];
}

export const OFFLINE_ACCOUNT: AccountState = {
  authEnabled: false, walletEnabled: false, providers: { stripe: false, crypto: false }, signedIn: false,
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; status: number };

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: String(data.error ?? `HTTP ${res.status}`), status: res.status };
    return { ok: true, ...(data as T) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error', status: 0 };
  }
}

const postJson = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function fetchAccount(): Promise<AccountState> {
  const r = await call<AccountState>('/api/account');
  if (!r.ok) return OFFLINE_ACCOUNT;
  const { ok: _ok, ...state } = r;
  void _ok;
  return state;
}

/** Creates a checkout and sends the browser to the provider's hosted page. */
export async function startCheckout(provider: 'stripe' | 'crypto', packId: string): Promise<{ ok: false; error: string } | { ok: true }> {
  const r = await postJson<{ url: string }>(`/api/checkout/${provider}`, { packId });
  if (!r.ok) return { ok: false, error: r.error };
  window.location.assign(r.url);
  return { ok: true };
}

export const buyItem = (itemId: string) => postJson<{ balance: number; itemId: string }>('/api/shop/buy', { itemId });
export const equipItem = (slot: CosmeticSlot, itemId: string | null) => postJson<{ loadout: Loadout }>('/api/shop/equip', { slot, itemId });

const callbackUrl = (next = '/account') => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export async function signInWithEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: 'Sign-in is not configured' };
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: 'Sign-in is not configured' };
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  await getBrowserSupabase()?.auth.signOut();
}

// ---------------- Email + password accounts (INKDOM_v2_Plan.md §5) ----------------

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

const friendly = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first (check your inbox).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password')) return msg;
  return msg;
};

export async function checkUsername(u: string): Promise<{ available: boolean; problem: string | null }> {
  try {
    const res = await fetch(`/api/account/username?u=${encodeURIComponent(u)}`, { cache: 'no-store' });
    const data = (await res.json()) as { available?: boolean; problem?: string | null };
    return { available: Boolean(data.available), problem: data.problem ?? null };
  } catch {
    return { available: true, problem: null };
  }
}

export async function signUp(p: { email: string; password: string; username: string }): Promise<AuthResult> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: 'Accounts are not configured on this server.' };
  const { data, error } = await sb.auth.signUp({
    email: p.email,
    password: p.password,
    options: { emailRedirectTo: callbackUrl('/account'), data: { username: p.username, display_name: p.username } },
  });
  if (error) return { ok: false, error: friendly(error.message) };
  // Supabase returns a user with no identities when the email is already registered (anti-enumeration).
  if (data.user && (data.user.identities ?? []).length === 0) return { ok: false, error: 'An account with this email already exists. Sign in instead.' };
  return { ok: true, needsConfirmation: !data.session };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: 'Accounts are not configured on this server.' };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: 'Accounts are not configured on this server.' };
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl('/account/reset') });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: 'Accounts are not configured on this server.' };
  const { error } = await sb.auth.updateUser({ password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** Current access token (sent to the game server to identify the player). */
export async function getAccessToken(): Promise<string | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
