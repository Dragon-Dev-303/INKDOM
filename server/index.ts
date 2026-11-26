/**
 * Inkdom game server entry point.  Run: `npm run server` (dev: `npm run dev:server`).
 * Env: PORT (default 3001), ALLOWED_ORIGINS (comma list), ALLOW_GUESTS=true (dev only),
 * SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (verify players, save results).
 */
import { supabaseAuthenticator } from './auth';
import { startGameServer } from './gameServer';
import { supabaseMatchStore } from './persistence';

const port = Number(process.env.PORT ?? 3001);
const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const allowGuests = process.env.ALLOW_GUESTS === 'true';

if (!process.env.SUPABASE_SECRET_KEY) {
  console.warn('[game] SUPABASE_SECRET_KEY not set: accounts cannot be verified' + (allowGuests ? ' (guests allowed)' : ' and nobody can join. Set ALLOW_GUESTS=true for local testing.'));
}

async function main() {
  const server = await startGameServer({
    port, origins, auth: supabaseAuthenticator({ allowGuests }), store: supabaseMatchStore,
  });
  const shutdown = async () => {
    console.log('[game] shutting down');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
