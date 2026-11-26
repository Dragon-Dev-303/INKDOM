import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublishableKey, supabaseUrl } from './supabaseAdmin';

export interface SessionUser { id: string; email: string | null }

/** Supabase client bound to the request cookies (acts as the signed-in user). */
export async function getServerSupabase() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* called from a context that cannot set cookies; proxy.ts refreshes them */
        }
      },
    },
  });
}

/** The verified user of this request, or null. Uses getUser(), which checks the token with Supabase Auth. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export const authConfigured = () => Boolean(supabaseUrl() && supabasePublishableKey());
