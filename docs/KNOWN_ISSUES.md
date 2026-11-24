# Known issues and limitations (v0.9.0-beta)

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
