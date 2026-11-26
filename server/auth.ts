import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Who is connecting: verified from the Supabase access token sent in `hello`. */
export interface Identity { userId: string; name: string; guest: boolean }

export interface Authenticator { verify(token: string | null): Promise<Identity | null> }

let admin: SupabaseClient | null | undefined;
function getAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}

/**
 * Production authenticator: Supabase checks the JWT (`auth.getUser`), the username comes
 * from `profiles`. With `allowGuests` (local development only) a missing/invalid token gets
 * a temporary guest identity so two browser tabs can test without accounts.
 */
export function supabaseAuthenticator(opts: { allowGuests: boolean }): Authenticator {
  let guestN = 0;
  const guest = (): Identity => {
    guestN++;
    const id = `guest-${Date.now().toString(36)}-${guestN}`;
    return { userId: id, name: `Guest${(1000 + Math.floor(Math.random() * 9000))}`, guest: true };
  };
  return {
    async verify(token) {
      const db = getAdmin();
      if (token && db) {
        const { data, error } = await db.auth.getUser(token);
        if (!error && data.user) {
          const { data: p } = await db.from('profiles').select('username,display_name').eq('user_id', data.user.id).maybeSingle();
          const name = (p?.display_name as string | null) || (p?.username as string | null) || data.user.email?.split('@')[0] || 'Player';
          return { userId: data.user.id, name: name.slice(0, 20), guest: false };
        }
      }
      return opts.allowGuests ? guest() : null;
    },
  };
}

/** Test authenticator: the token is the identity ("id:name"). */
export function tokenIsIdentity(): Authenticator {
  return {
    async verify(token) {
      if (!token) return null;
      const [userId, name] = token.split(':');
      return userId ? { userId, name: name || userId, guest: false } : null;
    },
  };
}

export { getAdmin };
