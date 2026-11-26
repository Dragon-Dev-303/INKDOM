# Deployment guide

The app is a standard Next.js project: static game page plus three small Node.js API routes. Any Next.js host works. Vercel is the simplest; Netlify and Render also work.

## 1. Database (Supabase): one-time

A project named **stick-empire-beta** (region eu-west-2; created before the game was renamed to Inkdom) holds the data. Its URL is `https://yuoumdofbcivewdcuovv.supabase.co`.

Apply the schema once:
1. Open the Supabase dashboard → project **stick-empire-beta** → **SQL Editor**.
2. Paste the contents of `supabase/migrations/20261124000000_playtest_tables.sql` and run it.
3. Check: **Table Editor** shows `match_logs` and `feedback`, both with RLS enabled.

Or with the Supabase CLI: `supabase link --project-ref yuoumdofbcivewdcuovv` then `supabase db push`.

The schema creates:
- `match_logs`: one row per finished match (anonymous summary plus event log).
- `feedback`: one row per playtest form.
- RLS policies that allow **insert only** for the anon/publishable key. Nothing can be read through the public API.
- `playtest_summary`: a view for the owner (`select * from playtest_summary;` in the SQL editor).

## 2. Environment variables

| Name | Value | Where to find it |
|---|---|---|
| `SUPABASE_URL` | `https://yuoumdofbcivewdcuovv.supabase.co` | Dashboard → Project Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Dashboard → Project Settings → API keys |

Both are server-side only (no `NEXT_PUBLIC_` prefix), so they never reach the browser bundle. Locally they live in `.env.local`, which git ignores.

> **Shop and payments** need more variables (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`, `SITE_URL`, Stripe and NOWPayments keys), the second migration, and webhook endpoints. See [PAYMENTS.md](PAYMENTS.md).

## 3. Deploy to Vercel (recommended)

1. Push the repository to GitHub (`INKDOM`).
2. In Vercel: **Add New → Project →** import the repository. Framework preset: Next.js (auto-detected).
3. Add the two environment variables above (Production and Preview).
4. Deploy. Vercel runs `npm install` and `npm run build`.
5. Check `https://<your-app>/api/health`. It should return `{"ok":true,…,"storage":"configured"}`, plus `auth`, `wallet` and `payments` flags.
6. Play one match with "Share anonymous match stats" on, then confirm a row appears in `match_logs`.

## 4. Other hosts

- **Netlify**: import the repo; Netlify's Next.js runtime is picked up automatically; add the env vars.
- **Any Node server**: `npm ci && npm run build && npm start` (port 3000; set `PORT` to change). Put it behind HTTPS.

## 5. Updating and rolling back

- Every push to the main branch redeploys. Vercel keeps previous deployments; use **Promote to Production** on an older one to roll back instantly.
- Bump `BUILD_VERSION` in `src/game/config/tuning.ts` for each playtest build. It is stored with every match log and feedback row, so results can be compared per build.

## 6. Pre-release checks

```bash
npm run typecheck && npm run lint && npm test && npm run soak -- 500 && npm run build
npm start &            # then, in another terminal:
node scripts/smoke.mjs http://127.0.0.1:3000
```
Then run the manual checklist in `docs/TEST_CHECKLIST.md`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Results screen says "Match stats not saved" | Env vars missing, or the migration has not been applied (`/api/health` shows `not-configured` for the former) |
| `next build` fails with "Turbopack is not supported … native bindings" on Windows | The native SWC download was corrupted: delete `node_modules/@next/swc-win32-x64-msvc` and run `npm install` again, or build with `npx next build --webpack` |
| Arrow keys scroll the page | Click the game once so it has keyboard focus |
