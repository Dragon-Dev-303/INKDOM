# Known issues and limitations (v0.11.0-alpha)

| # | Severity | Issue | Workaround / plan |
|---|---|---|---|
| 1 | Action needed | The Supabase schema has **not** been applied to project `stick-empire-beta` yet. Until it is, match stats and feedback return "not saved". | Run `supabase/migrations/20261124000000_playtest_tables.sql` in the Supabase SQL editor (see DEPLOY.md §1). |
| 2 | Balance (S3) | In CPU-vs-CPU soak runs attackers win ~87% of matches, averaging ~2.6 min. Once the roof defenders are wiped, the 8 s capture finishes before they can respawn (5/8 s) and walk back. Human balance is unknown until playtests. | Levers in `tuning.ts`: `match.captureSeconds`, `match.decaySeconds`, `fighters.*RespawnSeconds`, defender spawn points in `building.ts`. Measure with `npm run balance`. Decide after playtests. |
| 3 | Minor (S3) | The CPU opponent (practice mode) is simple: it rushes the flag as attacker and guards the roof as defender. | Practice only; not part of the brief's scope. |
| 4 | Minor (S4) | Up (W/↑) means jump, except at a stair foot or the ladder, where it climbs. Jumping off a staircase isn't possible. | By design (avoids extra keys). Revisit after playtest feedback. |
| 5 | Minor (S4) | Fighters knocked down or KO'd on a staircase fall to the floor below instead of lying on the steps. | Cosmetic. |
| 6 | Info | Firefox and Safari aren't acceptance targets (brief: Chrome/Edge). Mobile/touch isn't supported; Home shows a notice. | |
| 7 | Info | Rate limiting on the API routes is in-memory per server instance, enough for a playtest but not abuse-proof. | Use a shared store (e.g. Upstash) if the URL is shared publicly. |
| 8 | Info | Manual browser checks T-01 to T-18 haven't been run yet (the development session had no browser). The renderer is exercised by an automated test with a recording canvas. | Run docs/TEST_CHECKLIST.md before the first playtest. |
| 9 | Action needed | Shop/payments are built but switched off until configured: apply `20261124010000_points_payments.sql`, add `SUPABASE_SECRET_KEY`, Stripe and NOWPayments keys, enable Google in Supabase Auth. | Follow docs/PAYMENTS.md. `/api/health` shows what is still missing. |
| 10 | Info | Payment flows are covered by unit tests with a fake store and signed test payloads, but haven't been run end-to-end against live Stripe/NOWPayments test accounts (no keys during development). The SQL functions haven't been executed against the database yet. | Run plan §11 manual tests M-1…M-8 in test mode before real money. |
| 11 | Info | Cosmetics show on one boss (the signed-in player chooses P1 or P2 in Setup). The second local player can't sign in at the same time. | Fine for local play; online play would give each player their own account. |
| 12 | Info | Refunded points can make the balance negative; items already bought stay owned. | By design (plan §5). |
| 13 | Action needed | Migration `20261126000000_accounts_online.sql` (usernames, online match history) is not applied yet. Sign-up works without it, but usernames are not unique-checked and online results are not stored. | Apply after the two earlier migrations (docs/PAYMENTS.md §1). |
| 14 | Action needed | The game server must be hosted separately (Vercel can't host WebSockets). | docs/ONLINE.md → Render blueprint `render.yaml`. |
| 15 | Minor | Online play has no client-side prediction: your own boss responds after one round trip plus about 33 ms of interpolation. Fine below ~120 ms ping. | Prediction seam documented in docs/ONLINE.md. |
| 16 | Minor | Three mocap clips are weaker (lead_hook reads as a short bent-arm punch, overhand is a committed straight, block_high is slow). Block poses use the authored stance in play. | Swap clips in tools/mocap/build.ts or prefer authored clips per move. |
| 17 | Info | The UI template screens (world, team, boss editor, hangar, commander, leaderboard, events, inbox, profile, help) show sample data from mock services. | Replace services in src/services/ when the backend features exist. |
| 18 | Info | No browser playtest of the new combat feel or online play was possible in the development session; automated tests cover combo timing, hit rules, the server (full match, reconnect, quick match) and a live two-client run. | Play-test locally with `npm run dev:all` and two browser windows. |
