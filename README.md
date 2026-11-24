# Inkdom (Beta MVP)

A local two-player stickman building siege that runs in the browser. Two human bosses, each leading 3 AI soldiers, fight floor by floor through a 4-floor building. The **attacker** wins by holding the rooftop flag zone uncontested for 8 seconds. The **defender** wins by stopping that until the 5:00 timer runs out.

Built to the brief `Stick_Empire_Low_Cost_Beta_MVP_Plan.docx` and the detailed plan `Stick_Empire_Beta_Completion_Plan.md` (the game was called Stick Empire then; both documents are kept outside this repository).

| Part | Technology |
|---|---|
| Game | TypeScript, HTML5 Canvas 2D, fixed 60 Hz simulation |
| Web app | Next.js (App Router) + React |
| Backend | Next.js API routes on Node.js |
| Storage | Supabase (Postgres) for anonymous match logs and playtest feedback |
| Tests | Vitest (unit, integration, headless soak) |

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # optional: add Supabase URL + publishable key
npm run dev                  # http://localhost:3000
```

The game works fully without Supabase. Only saving match stats and feedback needs it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with debug keys enabled |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | All unit and integration tests, plus a 30-match soak run |
| `npm run soak -- 500` | Long soak: 500 CPU-vs-CPU matches, checks invariants every tick |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint, including the architecture rule below |

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump (tap) / climb stairs and ladder (hold) | W | ↑ |
| Go down stairs / ladder | S | ↓ |
| Punch / Kick / Weapon | F / G / H | Num1 / Num2 / Num3 (or K / L / ;) |
| Block (hold) | R | Num0 (or I) |
| Squad command FOLLOW → HOLD → ATTACK | Q | Num Enter (or P) |
| Pause / Mute | Esc / M | Esc / M |

See [docs/CONTROLS.md](docs/CONTROLS.md) for a printable card. Player 2 can be set to **CPU (practice)** on the Match Setup screen to play alone.

## Project structure

```
src/
  app/                    Next.js pages and API routes
    api/match-log/        POST anonymous match summary + event log → Supabase
    api/feedback/         POST playtest feedback form → Supabase
    api/health/           GET deployment check
  components/             React screens (Home, How to Play, Settings, Setup, Pause, Results, Feedback)
  game/
    config/tuning.ts      ALL gameplay numbers (balance here)
    config/controls.ts    key bindings
    level/building.ts     the building: geometry, stairs, ladder, nav graph, spawns, flag zone
    sim/                  pure simulation: physics, combat, match rules (no browser code)
    ai/                   bot brain (state machine) and waypoint navigation
    render/               Canvas renderer, FK stickman rig, effects
    audio/                procedural Web Audio sound effects (no asset files)
    telemetry/            anonymous match log
    GameController.ts     loop + input + render + audio glue
  lib/                    API client and server helpers (Supabase, validation)
supabase/migrations/      database schema (tables, row-level security, metrics view)
tests/                    Vitest suites
scripts/                  soak runner
docs/                     controls, deployment, test checklist, playtest kit, known issues
```

**Architecture rule.** Code in `src/game/sim`, `ai`, `level` and `config` must not import React, Next.js, renderer or browser APIs. ESLint enforces this. As a result the whole match simulation runs headless in tests and soak runs, and can later run on an authoritative server for online play. Humans and bots both drive fighters through the same `InputFrame`.

## Tuning guide

Everything lives in `src/game/config/tuning.ts`. The most useful values:

| Value | Effect |
|---|---|
| `match.timerSeconds` (300) | Match length; the defender wins at 0 |
| `match.captureSeconds` (8) | Uncontested time needed to capture |
| `match.decaySeconds` (16) | How fast an empty zone loses progress |
| `match.captureRequiresBoss` (false) | Whether attacker bots can capture alone |
| `fighters.bossHp` / `botHp` (150 / 70) | Toughness |
| `fighters.bossRespawnSeconds` / `botRespawnSeconds` (5 / 8) | Respawn delays |
| `ATTACKS.*` | Startup / active / recovery frames, damage, reach, knockback, hit-stun per attack |
| `combat.block.chip` (0.2) | Damage taken through a block |
| `combat.stagger.threshold` (4) | Hits before a knockdown (prevents stun-locks) |
| `combat.botDamageMultiplier` (0.8) | Bot damage relative to bosses |
| `movement.bossRunSpeed` / `botRunSpeed` | Movement speed |
| `ai.blockChance` (0.25) | How often bots block an incoming attack |
| `ai.reactionMinTicks` / `reactionMaxTicks` | Bot reaction delay (difficulty) |
| `ai.maxAttackersPerTarget` (2) | How many bots may gang up on one target |
| `ai.attackChancePerDecision` (0.6) | Bot aggression |

To change the map, edit `src/game/level/building.ts`. `validateLevel()` (run by `npm test`) checks that every waypoint is reachable and every stair has an opening.

## Debug keys (development builds, or add `?debug=1` to the URL)

F3 overlay (colliders, hit/hurt boxes, nav graph, bot states, seed) · F4 slow motion · F5 single-step while paused · F6 KO all defender bots · F7 set capture to 90% · F8 set timer to 10 s.

## Backend and data

- The browser posts to `/api/match-log` (when "Share anonymous match stats" is on in Settings) and to `/api/feedback`.
- The API routes validate and bound every field, rate-limit by IP, and insert with the Supabase **publishable** key from server-side environment variables.
- Row-level security allows **insert only**. The public API can't read any row. View the data in the Supabase dashboard; `select * from playtest_summary;` gives the brief §11 metrics.
- No accounts, names or personal data are collected. `session_id` is a random id per browser tab session.

## Deployment

See [docs/DEPLOY.md](docs/DEPLOY.md).

## Status

See [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) and [docs/TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md).
