import { connection, NextResponse } from 'next/server';
import { BUILD_VERSION } from '@/game/config/tuning';
import { getSupabase } from '@/lib/server/supabase';

/** GET /api/health — deployment check. Never exposes keys. Always evaluated at request time. */
export async function GET() {
  await connection();
  return NextResponse.json({ ok: true, version: BUILD_VERSION, storage: getSupabase() ? 'configured' : 'not-configured' });
}
