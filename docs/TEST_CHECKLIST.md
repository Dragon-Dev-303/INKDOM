# Test checklist

## Automated (run before every playtest build)

| Command | Covers | Last result |
|---|---|---|
| `npm run typecheck` | TypeScript | ✅ clean |
| `npm run lint` | ESLint + architecture rule | ✅ clean |
| `npm test` | 165 tests: everything from the beta plus combos (strings, chains, directional, air, chords, buffering), hit rules (block heights, counter-hit, scaling, juggle, stamina, energy), move-database validity, AI combo use, mocap clip quality, protocol codec, game server (full match, rematch, reconnect + AI takeover, quick match, malformed input), UI registry/services | ✅ 165/165 |
| `npm run soak -- 200` | 200 CPU-vs-CPU matches, invariants every tick | ✅ 0 failures, 0 stuck-bot respawns |
| `npm run build` | Production build | ✅ (Turbopack and `--webpack` both build) |
| `node scripts/online-smoke.mjs ws://host:3001/ws` | Two guests play 5 s on a running game server | ✅ 30 snapshots/s, ~740 B each |
| `node scripts/smoke.mjs <url>` | Page, API validation, auth-required shop/checkout routes, webhook signature rejection | ✅ 15/15 |

## Manual acceptance (plan §8.4, brief §10). Run on Chrome **and** Edge.

| ID | Steps | Pass when | Chrome | Edge |
|---|---|---|---|---|
| T-01 | Two people play 3 matches in a row: Rematch, Swap Sides, Rematch | No crash, stuck player or missing limb | ☐ | ☐ |
| T-02 | Watch all 8 fighters during T-01, including knockdowns and KOs | All visible, collidable, correct colour and shape | ☐ | ☐ |
| T-03 | Each player walks the stairs route and the ladder route up and down; drops through openings | Every floor reachable both ways | ☐ | ☐ |
| T-04 | Defender boss blocks on a staircase for 10 s while attacker squad is on ATTACK | Bots get past or recover within 10 s | ☐ | ☐ |
| T-05 | Attacker stands alone in the flag zone | Wins after 8 s; "FLAG CAPTURED" | ☐ | ☐ |
| T-06 | Defender avoids capture until 0:00 (F8 sets timer to 10 s in debug) | Defender wins; "BUILDING HELD" | ☐ | ☐ |
| T-07 | Defender enters the zone at ~50% | Progress pauses; CONTESTED toast and alarm | ☐ | ☐ |
| T-08 | Everyone leaves the zone at ~50% | Bar shows DECAYING and empties in ~8 s | ☐ | ☐ |
| T-09 | KO a boss and a bot | Boss back after 5 s, bot after 8 s, blinking protection | ☐ | ☐ |
| T-10 | Rematch after a KO-heavy match | Full health, 5:00, 0% flag, everyone at spawn | ☐ | ☐ |
| T-11 | Open the deployed URL in current Chrome and Edge | Loads with no install or account; no console errors | ☐ | ☐ |
| T-12 | Review hand-off docs | README, CONTROLS, DEPLOY, KNOWN_ISSUES, this checklist present | ☐ | ☐ |
| T-13 | Esc pause, alt-tab away and back, M mute, reload | Auto-pause; no stuck keys; mute remembered | ☐ | ☐ |
| T-14 | Each player cycles squad commands | Toast and HUD update; bots change behaviour within ~1 s | ☐ | ☐ |
| T-15 | Window sizes 1280×720, 1920×1080, 2560×1440 | Whole building visible, HUD readable, no scrollbars | ☐ | ☐ |
| T-16 | Greyscale screenshot (or High-contrast setting) | Teams still tell apart by ▲/■ shape | ☐ | ☐ |
| T-17 | 3 matches on a mid-range laptop with "Show FPS" on | ~60 fps; no slowdown in match 3 | ☐ | ☐ |
| T-18 | Finish a match with "Share anonymous match stats" on; send a feedback form | Rows appear in Supabase `match_logs` and `feedback` | ☐ | ☐ |

## Payments (test mode, see INKDOM_Payments_Plan.md §11)

| ID | Steps | Pass when | Result |
|---|---|---|---|
| M-1 | Sign in with a magic link, then with Google | Chip shows the email and ◆ 0 | ☐ |
| M-2 | Buy the $4.99 pack with card 4242 4242 4242 4242 | Back in Shop, "+550 points" within seconds; History shows paid | ☐ |
| M-3 | Card 4000 0000 0000 9995 (declined) | No points | ☐ |
| M-4 | Crypto pack in NOWPayments sandbox | Points after the sandbox payment finishes | ☐ |
| M-5 | Buy and equip the Top Hat, start a match | Your boss wears it; balance −300 | ☐ |
| M-6 | Buy an item you can't afford | Buy button disabled / "Not enough points" | ☐ |
| M-7 | Refund M-2 in the Stripe Dashboard | Balance −550 | ☐ |
| M-8 | Sign out | Shop asks to sign in; the game still plays | ☐ |

## v2 manual checks

| ID | Steps | Pass when | Result |
|---|---|---|---|
| V-1 | Create an account (username, email, password), confirm email, sign in, sign out, reset password | Each step works; username shown in the top bar | ☐ |
| V-2 | Solo vs CPU with Fists: J,J,J,J; J,K; J,U; J,I; K,K,K; Fwd+J; Down+K; U+K; jump + K | Each combo plays the listed moves; "N HITS" counter shows | ☐ |
| V-3 | Block high vs low kick, crouch-block vs axe kick, dodge through a punch | Rules behave as in docs/CONTROLS.md | ☐ |
| V-4 | Two computers on different networks: private room by invite link, play to the end, rematch | No desync or stuck players; latency badge under ~150 ms | ☐ |
| V-5 | Close one tab mid-match, reopen /online | AI takes over, the player rejoins the same seat | ☐ |
| V-6 | Settings → Controls: remap punch, play a match | New key works; reset restores defaults | ☐ |
| V-7 | Click through every hub screen at 360 px and 1920 px wide | No broken layout; Preview ribbons on sample-data screens | ☐ |

## Release criteria (plan §8.6)
0 open crash/blocker bugs, 0 open major bugs (wrong winner, broken rule, permanently stuck bot), at most 5 minor bugs listed in KNOWN_ISSUES.md, all automated checks green.
