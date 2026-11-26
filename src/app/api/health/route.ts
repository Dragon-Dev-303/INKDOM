import { connection, NextResponse } from 'next/server';
import { BUILD_VERSION } from '@/game/config/tuning';
import { authConfigured } from '@/lib/server/auth';
import { nowPaymentsConfigured } from '@/lib/server/payments/nowpayments';
import { stripeConfigured } from '@/lib/server/payments/stripe';
import { getSupabase } from '@/lib/server/supabase';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

/** GET /api/health — deployment check. Reports which features are configured, never the values. */
export async function GET() {
  await connection();
  const flag = (b: boolean) => (b ? 'configured' : 'not-configured');
  return NextResponse.json({
    ok: true,
    version: BUILD_VERSION,
    storage: flag(Boolean(getSupabase())),
    auth: flag(authConfigured()),
    wallet: flag(Boolean(getSupabaseAdmin())),
    payments: { stripe: flag(stripeConfigured()), crypto: flag(nowPaymentsConfigured()) },
  });
}
