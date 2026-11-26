import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server/auth';
import { siteUrl } from '@/lib/server/http';

/** Only same-site relative paths are allowed as the post-login destination (no open redirects). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes(String.fromCharCode(92))) return '/account';
  return raw;
}

/**
 * GET /auth/callback?code=…&next=/path — finishes email confirmation, magic-link, Google and
 * password-reset flows (PKCE): exchanges the code for a session cookie, then redirects.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  const base = siteUrl(req);
  const sep = next.includes('?') ? '&' : '?';
  if (!code) return NextResponse.redirect(`${base}/account?auth=error`);
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.redirect(`${base}/account?auth=error`);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${base}/account?auth=error`);
  return NextResponse.redirect(`${base}${next}${sep}auth=signed-in`);
}
