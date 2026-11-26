# Online play: the Node game server

Two players on different computers play through `server/`, a Node.js WebSocket server that runs the **same simulation** as the browser (`src/game/sim`). The server is authoritative: browsers send only key presses, and the server computes movement, hits, capture and results. Spec: [INKDOM_v2_Plan.md §4](../INKDOM_v2_Plan.md).

```
Browser A ─┐   wss://<game-server>/ws   (protocol v1, JSON)
Browser B ─┴→ gameServer.ts → RoomManager → Room (lobby) → MatchRunner (60 Hz sim, 30 Hz snapshots)
                  └ auth.ts (Supabase token) · persistence.ts (online_matches)
```

## Run locally

```bash
npm run dev:all          # Next.js on :3000 + game server on :3001 (guests allowed)
# or separately:
npm run dev              # web app
ALLOW_GUESTS=true npm run dev:server
```
Then open two browser windows at http://localhost:3000/online. Each window can use **Try as guest** or a real account. Create a room in one and join with the code in the other.

If port 3001 is busy, set `PORT=3002` for the server and `NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:3002/ws` for the app.

Health: `http://localhost:3001/healthz`. Online smoke test: `node scripts/online-smoke.mjs ws://localhost:3001/ws` (needs guests allowed).

## Deploy

Vercel cannot host WebSockets, so the game server runs separately (about $5–7 per month).

**Render (blueprint included: `render.yaml`)**
1. Render → New → Blueprint → pick the repository. It builds `server/Dockerfile`.
2. Set the env vars:
   - `ALLOWED_ORIGINS=https://<your-vercel-domain>`
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
3. Copy the service URL, e.g. `https://inkdom-game.onrender.com`.
4. In Vercel set `NEXT_PUBLIC_GAME_SERVER_URL=wss://inkdom-game.onrender.com/ws` and redeploy.

**Fly.io / Railway:** same Dockerfile (`docker build -f server/Dockerfile .`), expose port 3001, health check `/healthz`.

Choose a region near your players. The latency badge in a match shows round-trip time; under ~120 ms feels good.

## Server environment

| Variable | Meaning |
|---|---|
| `PORT` | Listen port (default 3001) |
| `ALLOWED_ORIGINS` | Comma list of web origins allowed to connect (empty = any; set it in production) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Verify players' sign-in tokens, read usernames, save `online_matches` |
| `ALLOW_GUESTS` | `true` lets players join without an account. **Development only** |

## How it behaves

- **Rooms:** 6-character codes plus an invite link (`/online?room=CODE`). Each player picks side and weapon and presses Ready; the match starts when both are ready. A rematch swaps sides.
- **Quick match:** a FIFO queue pairs the next two players with random sides.
- **Disconnects:** the boss is played by the AI at once. Reopening the page re-joins the same seat and returns control.
- **Anti-cheat:** inputs only, validated messages (4 KB max, 120 msgs/s), results computed on the server.
- **Bandwidth:** about 740 bytes per snapshot at 30 Hz (about 22 KB/s per player down) and 60 small input messages per second up.

## Extending

| To add… | Change |
|---|---|
| A message | `src/game/net/protocol.ts` (type + `parseClientMsg`), then handle it in `server/gameServer.ts` |
| Snapshot fields | `FIGHTER_FIELDS` / `encodeState` / `applySnapshot` in `src/game/net/codec.ts`, and bump `PROTOCOL_VERSION` |
| More players per match | `Room.seats` and `MatchConfig` (the sim needs N bosses first) |
| Client prediction | `OnlineGameController.frame()`: run `stepMatch` locally for your boss and reconcile on snapshots |
| Ranked matchmaking | Replace the FIFO in `RoomManager.enqueue` |
