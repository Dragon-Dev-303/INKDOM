# Test checklist

## Automated (run before every playtest build)

| Command | Covers | Last result |
|---|---|---|
| `npm run typecheck` | TypeScript | ✅ clean |
| `npm run lint` | ESLint + architecture rule | ✅ clean |
| `npm test` | 45 tests: level validation, collision, stairs/ladder/drops, combat timing, block/guard break, stagger, KO/respawn, friendly fire, capture/contest/decay, timer, determinism, rematch reset, nav graph, bots reach every node, attack tokens, follow, rig bone lengths, renderer, 30-match soak | ✅ 45/45 |
| `npm run soak -- 200` | 200 CPU-vs-CPU matches, invariants every tick | ✅ 0 failures, 0 stuck-bot respawns |
| `npm run build` | Production build | ✅ (Turbopack and `--webpack` both build) |
| `node scripts/smoke.mjs <url>` | Page and API responses and validation | ✅ 6/6 |

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

## Release criteria (plan §8.6)
0 open crash/blocker bugs, 0 open major bugs (wrong winner, broken rule, permanently stuck bot), at most 5 minor bugs listed in KNOWN_ISSUES.md, all automated checks green.
