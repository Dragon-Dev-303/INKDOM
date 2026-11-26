# INKDOM v2: Accounts, Online 1v1, Real-Motion Combat & Combos, Full UI Template (spec v1.0)

Date: 2026-11-26 · Target build: 0.11.0-alpha
Sources: owner request (2026-11-26), `Stick_Empire_Complete_Game_Design_Brief.docx` (GDD v1.0), `INKDOM_Payments_Plan.md`, beta plan.

## 0. Requests → decisions

| # | Owner request | Decision |
|---|---|---|
| R1 | "I need sign up function" | Full account system: **Create account** (username + email + password + terms/age checks), **Sign in** (password, Google, magic link), **Forgot / reset password**, email confirmation, unique usernames (§5) |
| R2 | "Two internet users" | **Node.js authoritative WebSocket game server** in `/server` (owner choice). Runs the *same* pure simulation as the browser. Private rooms (code + invite link), quick match, reconnection, AI takeover on disconnect (§4) |
| R3 | "Template of UI for the future… consider all" | **App shell + every screen from GDD §16** as routes, driven by a **feature registry** (live / preview / planned) and a **service layer** with mock implementations that are swapped for real APIs later (§6) |
| R4 | "Human fighting action data… already published fighting game" | **CMU Graphics Lab Motion Capture Database** (free for any use) supplies the motion: karate (subject 135), boxing (13/14), punch/kick sequences (143/144), knees (86) and a jump kick (75). An offline pipeline converts 3D mocap into 2D rig keyframes. **Frame data** (startup/active/recovery, hitstun, damage scaling, counter-hit, juggle limits) follows conventions published for commercial fighting games (generic mechanics, no copied characters or moves) (§2) |
| R5 | "J+J+J+J, J+K, J+I, J+U, J+O, J+J+K, K+K, D+J… different actions" | **Data-driven move database + combo graph** with an input buffer: chains (sequences), directional moves (forward/back/down + button), air moves, chords (two buttons together). Unarmed fighting is the default; weapons add their own chains (§2–§3) |
| R6 | "Each character can fight without any weapon" | New weapon option **FISTS** (default for bosses); bots mix fists, sword and bar |
| R7 | "All functions modular for future expansion" | Every subsystem is a module behind a typed contract: input schemes, move data, animation clips, resources, network protocol/codec, room/match runners, services, feature registry (§1) |

Out of scope for this build (templates only): territory persistence, factions, helicopters, magic classes, 10-boss battles, matchmaking by rating, client-side prediction (seam provided).

## 1. Architecture and module map

```
src/game/
  config/          tuning.ts (numbers) · controls.ts (actions, schemes, presets, remap store) · shop.ts
  combat/          ← NEW, pure (architecture rule applies)
    buttons.ts     Button (P K H W S), Dir (N F B D U), InputLog ring buffer, chord detection
    moves.ts       MOVES: MoveDef database (frame data, hit data, motion, costs, clip ids, sources)
    chains.ts      combo graph: from-move + input → to-move, cancel windows
    resolver.ts    pick next move from context (ground/air/crouch, weapon, dir, chain, chord)
    hit.ts         hit/block/height rules, counter-hit, damage scaling, juggle, guard crush
    resources.ts   stamina + energy (regen, costs)
    movelist.ts    human-readable move list (UI, How to Play, Boss editor) generated from data
  anim/            ← NEW (render side)
    clips.ts       Clip format + sampling · authored.ts (hand-made clips, fallback) ·
    data/mocap.generated.ts (from tools/mocap) · library.ts (mocap first, authored fallback)
  sim/             physics, match rules (uses combat/)
  ai/              brain uses combat routines (ai/routines.ts)
  net/             ← NEW, pure: protocol.ts (messages, versions), codec.ts (input bitmask,
                   snapshot encode/decode), snapshot.ts
  render/          renderer (+ stamina/energy/combo HUD), rig, cosmetics
src/services/      ← NEW: typed service interfaces + mock implementations (world, team, boss, bots,
                   leaderboard, events, inbox) + registry
src/features/      ← NEW: registry.ts (every screen: route, nav group, status, GDD section)
src/app/(hub)/     ← NEW: shell layout + all hub screens · (game)/play, online battle are full-screen
server/            ← NEW: Node WebSocket game server (rooms, matchmaking, match runner, auth)
tools/mocap/       ← NEW: CMU download → ASF/AMC parse → FK → 2D projection → segmentation → clips
```

Rules: `sim`, `ai`, `level`, `config`, `combat`, `net` stay pure (ESLint enforces it) so the server runs them unchanged. Presentation never feeds back into simulation; cosmetics and animation are render-only.

## 2. Combat system

### 2.1 Controls (abstract buttons, remappable)

| Button | Meaning | Solo / online (default) | Local P1 | Local P2 |
|---|---|---|---|---|
| ← → | move | A / D | A / D | ← / → |
| ↑ | jump · climb (hold at stair foot / ladder) | W | W | ↑ |
| ↓ | crouch · descend stairs/ladder | S | S | ↓ |
| **P** | punch | **J** | F | Num1 / K |
| **K** | kick | **K** | G | Num2 / L |
| **H** | heavy | **U** | T | Num4 / O |
| **W** | weapon (elbow when unarmed) | **I** | H | Num3 / ; |
| **S** | special (uses energy) | **O** | Y | Num6 / P |
| Block | hold | **L** | R | Num0 / I |
| Dodge | backstep, invulnerable | **Space** | LeftShift | Num5 / U |
| Command | squad order cycle | **Q** | Q | NumEnter / Enter |

Directions are **relative to facing**: F = towards facing, B = away. Example: "D+J" on the owner's keyboard = forward + punch when facing right. Bindings live in a store (`config/controls.ts`) with presets, saved per browser, and are editable on **Settings → Controls**.

### 2.2 Move database (unarmed core; frames at 60 Hz)

Notation: `J` = P button etc. in the default scheme. Heights: H = high (crouch ducks it), M = mid, L = low (must crouch-block), O = overhead (must stand-block).

| ID | Input | Startup/Active/Recovery | Dmg | Ht | Reach | Properties | Motion source |
|---|---|---|---|---|---|---|---|
| jab | J | 4/2/8 | 4 | H | 0.75 | fastest; chain starter | CMU 144 Punch_Sequence / 143_23 |
| cross | J,J | 5/3/10 | 6 | H | 0.85 | | CMU 144 / 14_01 boxing |
| lead_hook | J,J,J | 6/3/12 | 7 | H | 0.70 | | CMU 13_17 boxing |
| rear_uppercut | J,J,J,J | 7/4/18 | 10 | M | 0.70 | **launcher**, knockdown, finisher | CMU 14_02 boxing |
| round_kick | J,K | 9/4/16 | 9 | M | 1.15 | | CMU 135_07 Mawashi-geri |
| power_straight | J,U (or U) | 9/3/16 (U alone 12/3/18) | 12 | H | 0.95 | guard crush (stamina), lunge 0.3 | CMU 14_03 boxing |
| elbow | J,I (unarmed) | 6/3/12 | 8 | H | 0.55 | guard crush | authored (Muay Thai sok) |
| spin_backfist | J,O | 8/3/16 | 11 | H | 0.85 | costs 25 energy | authored |
| low_kick | J,J,K | 8/3/14 | 8 | L | 1.00 | knockdown on counter-hit | CMU 135_07 (low variant) |
| front_kick | K | 8/3/13 | 7 | M | 1.10 | pushback 5 | CMU 135_04 Mae-geri |
| roundhouse | K,K | 9/4/16 | 9 | M | 1.15 | | CMU 135_07 |
| side_kick | K,K,K | 10/4/18 | 10 | M | 1.25 | big pushback, finisher | CMU 135_11 Yoko-geri |
| lunge_punch | F+J | 10/3/16 | 10 | H | 0.90 | dashes 1.2 forward | CMU 135_09 Oi-zuki |
| knee | F+K | 7/3/14 | 9 | M | 0.60 | small launch | CMU 86_06 knee kicking |
| back_kick | B+K | 11/4/18 | 12 | M | 1.20 | knockdown, turns around | authored (from 135_11) |
| crouch_uppercut | D+J | 6/4/16 | 8 | M | 0.65 | **anti-air launcher** | authored |
| sweep | D+K | 8/4/18 | 6 | L | 1.15 | knockdown | authored |
| overhand | U | 12/3/18 | 12 | H | 0.95 | guard crush | CMU 14_03 |
| axe_kick | U+K together | 13/4/18 | 13 | O | 1.00 | overhead | authored (kakato-otoshi) |
| tornado_kick | O | 11/4/20 | 14 | M | 1.20 | costs 50 energy, knockdown | authored |
| dive_punch | J in air | 6/4/10 | 7 | O | 0.80 | | authored |
| flying_kick | K in air | 7/6/10 | 10 | O | 1.10 | | CMU 75_16 jump kick |

**Weapon chains** (button I when armed): sword `slash → backslash → thrust` (10/4/14 → 8/4/14 → 12/4/18, dmg 12/10/14); bar `smash (O, guard-break) → sweep (L, knockdown)` (14/5/18 → 12/5/20, dmg 16/12). `J,I` with a weapon goes into the first weapon strike.

### 2.3 Combo graph and input buffer

- Every press is recorded with its tick and direction in an **InputLog** (12-entry ring buffer, serializable, deterministic).
- **Chain window:** on hit, a move may cancel into its listed follow-ups right after contact (hit-confirm); on whiff, from the end of its active frames. Either way the window closes 4 frames before the move ends. A press is buffered for **8 ticks**, so pressing slightly early still chains.
- **Chains on hit or whiff:** strings work on whiff, so players can learn the rhythm. Damage scaling makes long strings fair.
- **Chord:** two buttons pressed within **3 ticks** (e.g. U+K) select a chord move before single-button moves.
- **Resolution order:** chord → chain follow-up → directional (F/B/D) → air → weapon/special → neutral. The first match whose requirements (weapon, grounded, energy, stamina) pass is used.
- Adding a move = one entry in `moves.ts` (+ optional edges in `chains.ts` + optional clip). No engine changes.

### 2.4 Hit rules (published FG conventions, generic)

- **Block** (hold): standing block stops H/M/O; **crouch block** (hold block + down) stops M/L. Lows beat standing block; overheads beat crouch block. Chip 20%. Blocking costs stamina (damage × 1.5); at 0 stamina the guard breaks.
- **Counter-hit** (hitting a fighter in their own startup): +20% damage, +4 hitstun, "COUNTER" marker.
- **Damage scaling** inside one combo: hit n deals `max(30%, 100% − 10%·(n−1))`. Hitstun decays by 1 tick per hit after the 3rd.
- **Juggle limit:** at most 3 hits while airborne; then the victim falls to knockdown.
- **Combo counter** resets when the victim recovers (leaves hitstun/knockdown). HUD shows "N HITS".
- **Stagger** (from beta) stays for bots; the knockdown threshold is unchanged.
- Bots deal 0.8× damage (unchanged).

### 2.5 Resources

| Resource | Max | Regen | Costs |
|---|---|---|---|
| Stamina | 100 | 30/s after 0.5 s without spending | dodge 25, heavy/U moves 12, blocked damage ×1.5 |
| Energy | 100 | none | +6 on hit, +4 when hit; specials (O) 25–50 |

### 2.6 Hurtboxes, crouch and dodge

- Crouch (hold ↓ on flat ground, away from a stair top): hurtbox height ×0.65, move speed 0, high attacks whiff.
- Dodge: backstep 1.4 units over 14 ticks, invulnerable ticks 2–10, 25 stamina, 30-tick cooldown.

## 3. Motion data pipeline (`tools/mocap`)

1. **Download** ASF skeletons and AMC motions from `mocap.cs.cmu.edu` (cache in `tools/mocap/.cache`, git-ignored).
2. **Parse** ASF (bones, axes, DOFs) and AMC (per-frame rotations). Run **forward kinematics** for world joint positions (120 fps).
3. **Sagittal projection:** the forward axis is the horizontal direction of the strike (largest displacement of the striking end-effector relative to the root), projected onto the forward/up plane. Positions are scaled so the leg length equals the game rig's (0.84).
4. **Retarget** to the rig's angles (all absolute from straight down, + = forward): torso, neck, aF/eF (right arm), aB/eB (left arm), hF/kF (right leg), hB/kB (left leg), drop (hip lowering), rootDx/rootDy (body travel).
5. **Segment** single techniques: detect extension peaks (wrist/ankle distance from shoulder/hip), take a window from rest → peak → rest, and resample to 60 fps. The **contact frame** is the peak.
6. **Emit** `src/game/anim/data/mocap.generated.ts`, with source metadata per clip (subject, trial, frame range) and an attribution header.
7. **Playback:** a move maps its frame data onto the clip piecewise. Startup ticks map to [start, contact), active ticks to the contact neighbourhood, and recovery to (contact, end]. Gameplay timing stays tunable while the human motion shape is preserved.
8. **Fallback:** any clip missing from the generated file uses an authored clip (`anim/authored.ts`), so the game never depends on the pipeline at runtime.

Attribution (required by etiquette, not by licence): "Motion data: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (NSF EIA-0196217)."

## 4. Online play (Node.js server)

### 4.1 Topology
```
Browser A ─┐  wss://game.inkdom.app  (JSON protocol v1)
Browser B ─┴→ server/index.ts → RoomManager → Room (lobby state machine) → MatchRunner (60 Hz sim, 30 Hz snapshots)
                 └ auth.ts verifies the Supabase access token · persistence.ts writes results to Supabase
```

### 4.2 Protocol v1 (`src/game/net/protocol.ts`)

Client → server:

| Message | Payload |
|---|---|
| `hello` | `{v:1, token}` |
| `room.create` | `{private:true}` |
| `room.join` | `{code}` |
| `queue.join` / `queue.leave` | |
| `room.update` | `{side?, weapon?, ready?}` |
| `room.leave` | |
| `input` | `{seq, bits}` (bitmask of InputFrame) |
| `rematch` | |
| `ping` | `{t}` |

Server → client:

| Message | Payload |
|---|---|
| `welcome` | `{userId, name}` |
| `error` | `{code, message}` |
| `room.state` | `{code, phase, seats[], host}` |
| `queue.state` | `{position}` |
| `match.start` | `{seed, config, you}` |
| `snap` | `{tick, s}` (encoded state, 30 Hz) |
| `events` | `{tick, list}` |
| `match.end` | `{results}` |
| `pong` | `{t}` |

### 4.3 Rules
- **Rooms:** 6-character codes (no ambiguous characters). Two seats (Attacker/Defender). Each player picks side and weapon and presses Ready. The match starts when both are ready, after a 3 s countdown inside the sim.
- **Quick match:** a FIFO queue pairs two players into a room with random sides.
- **Inputs:** each client sends its sampled frame every tick. The server consumes one queued frame per tick (jitter buffer of up to 6), merging press edges so taps are never lost. With no frame queued, it repeats held keys without presses.
- **Disconnects:** the seat's boss switches to CPU control at once. A reconnect within the match restores human control. After 3 minutes the seat is forfeited to the AI. An empty room closes after 2 minutes.
- **Anti-cheat:** the client sends intentions only. The server ignores malformed messages and limits rate (120 msgs/s, 4 KB per message). Damage, capture and results are computed on the server.
- **Client view:** renders interpolated snapshots (one snapshot of delay). Sound and effects come from server events. The prediction hook (`net/predictor.ts`) is a documented seam for later.
- **Persistence:** `online_matches` row per finished match (players, sides, winner, reason, duration, KOs).

## 5. Accounts

| Screen | Fields / behaviour |
|---|---|
| Create account | username (3–20, `a-z 0-9 _`, unique, live availability check), email, password (≥ 8, strength meter), confirm, "I am 13+", "I accept the Terms". `supabase.auth.signUp` with username in metadata. A "Check your email" step follows when confirmation is on |
| Sign in | email + password · Continue with Google · email me a link |
| Forgot password | email → reset link → `/account/reset` sets a new password |
| Account | username, email, sign out (profile editing is a template on /profile) |

DB (migration 3): `profiles.username` (unique, case-insensitive) and `display_name`. The trigger takes the username from sign-up metadata and adds a numeric suffix on a clash, so sign-up never fails. `GET /api/account/username?u=` checks availability. `online_matches` table (RLS: players read their own rows).

## 6. UI template (GDD §16 complete)

Feature registry statuses: **live** (works), **preview** (real UI, sample data via services), **planned** (placeholder card with scope).

| Route | Screen (GDD) | Status |
|---|---|---|
| `/` | Main hub: boss card, quick play, daily rewards, notifications, season banner | live + preview widgets |
| `/play` | Local match (setup → battle → results) | live |
| `/online` | Online: quick match, create/join private room, room lobby, battle, results | live |
| `/account` | Sign in / create account / reset password | live |
| `/shop` | Points, cosmetics, history | live |
| `/tutorial` | Training steps + move list | preview (move list live) |
| `/moves` | Move list / combo trainer reference | live (from move DB) |
| `/world` | World → regions → cities | preview |
| `/world/city/[id]` | City: 10 buildings, controller, wonders | preview |
| `/world/building/[id]` | Building detail: owner, floors, defence, window, history, siege CTA | preview |
| `/team` | Faction: roster (10 bosses), roles, treasury, alliances, create team | preview |
| `/boss` | Boss editor: class (10 archetypes), attributes, equipment, abilities, cosmetics | preview |
| `/hangar` | Bot hangar: 10 bot types, personalities, weapons, skins, squad slots | preview |
| `/commander` | Tactical overlay preview: floor plan, rally markers, 6 orders | preview |
| `/leaderboard` | Season, faction and player rankings | preview |
| `/events` | Events calendar, world events, seasons | preview |
| `/inbox` | Notifications and messages | preview |
| `/profile` | Player profile, stats, match history | preview (online history live later) |
| `/settings` | Game, Controls (remap), Audio, Accessibility, Account, Privacy | live (controls/game), preview (rest) |
| `/help` | Help centre, report a player, contact | preview |

Shell: top bar (logo, points, account chip), grouped navigation (Play · World · Army · Store · Community · System), "Preview" ribbons on sample-data screens, responsive down to 360 px. Battle screens are full-screen without the shell.

## 7. Work breakdown

| ID | Task | Owner | Accept |
|---|---|---|---|
| V1 | Controls schemes + remap store + new InputFrame (heavy, special, dodge) | core | Keys work in all 3 schemes; remap persists |
| V2 | combat/ module: buttons, InputLog, moves, chains, resolver, hit rules, resources | core | Unit tests §8 T-C01…T-C14 |
| V3 | Sim integration (Fighter fields, crouch, dodge, block heights, combo counter); AI routines | core | Soak 200 matches, 0 failures |
| V4 | anim/: clip format, authored clips, library, renderer playback, HUD (stamina, energy, combo) | core | Render test; rig bones constant on every clip |
| V5 | Mocap pipeline + generated clips + MOCAP.md | pipeline agent | ≥ 10 clips; tests on value ranges, contact extension |
| V6 | Accounts: sign up, sign in, reset, username check, migration 3 | core | Manual A-1…A-5 |
| V7 | net/: protocol, codec, snapshot; server: rooms, queue, runner, auth, persistence | core | Server integration test: 2 fake clients finish a match |
| V8 | Online client: lobby UI, connection, interpolation, events, results, rematch | core | Two browser tabs complete a match |
| V9 | Shell + feature registry + services + all template screens | UI agent | Every route renders; lint/typecheck clean |
| V10 | Move list (/moves), How to Play combos, docs, README | core | |

## 8. Tests

| ID | Test |
|---|---|
| T-C01 | J,J,J,J produces jab→cross→lead_hook→rear_uppercut (buffered presses within windows) |
| T-C02 | J,K → round_kick; J,U → power_straight; J,I → elbow (fists) / weapon strike (armed); J,O → spin_backfist (with energy) and jab-only without energy |
| T-C03 | J,J,K → low_kick; K,K → roundhouse; K,K,K → side_kick |
| T-C04 | Forward+J → lunge_punch moves forward; Back+K → back_kick; Down+J → crouch_uppercut; Down+K → sweep; air J/K → dive_punch/flying_kick |
| T-C05 | Chord U+K within 3 ticks → axe_kick; 5 ticks apart → overhand then chain |
| T-C06 | Press too late (after the window) → new starter, not a chain |
| T-C07 | Standing block stops high, loses to low; crouch block stops low, loses to overhead |
| T-C08 | Counter-hit adds damage and hitstun; damage scaling floors at 30% |
| T-C09 | Juggle limit ends air combos |
| T-C10 | Stamina: dodge cost, regen delay, guard break at 0 |
| T-C11 | Energy gain on hit; special refused without energy |
| T-C12 | Every MoveDef is valid (frames > 0, clips resolvable, chain targets exist, no unreachable required data) |
| T-C13 | Determinism with combos: same seed + inputs → identical state hash |
| T-C14 | AI routines produce chains in soak |
| T-N01 | Input bitmask round-trip; snapshot encode/decode preserves render state |
| T-N02 | Server: two clients create/join, ready, play to end, receive `match.end`; reconnect restores control; malformed messages ignored |
| T-M01 | Mocap clips: finite values, joint limits respected, punches extend the arm at contact, kicks extend the leg |
| T-U01 | Feature registry: every live/preview route has a page file |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Mocap projection looks wrong for some clips | Per-clip QA (numeric checks); authored fallback per move; clips are swappable data |
| Latency feels heavy without prediction | 30 Hz snapshots, one-snapshot interpolation; prediction seam documented; measure in playtests |
| Combos make local 2-player keyboards ghost | Remappable keys, alternative layouts, the solo scheme for online |
| Scope creep from the template | Template screens use mock services only; real features are gated by the registry |
| Server hosting | Dockerfile + Render/Fly config; health endpoint; graceful shutdown |

## 10. Owner actions

1. Apply migrations 2 and 3 in Supabase. In Auth, enable "Confirm email" (recommended) and Google.
2. Host the game server (Render, Fly.io or Railway; see `docs/ONLINE.md`) and set `NEXT_PUBLIC_GAME_SERVER_URL` in the web app.
3. Playtest online with two machines on different networks; report latency feel.
