import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps the Supabase session cookie fresh on page and API requests (tokens are refreshed
 * here, where response cookies can be written). Authorization itself happens in the
 * route handlers via getSessionUser().
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  // Skip the network round-trip for visitors who never signed in.
  if (!request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Not for static assets, webhooks (no cookies) or the auth callback (sets its own cookies).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
