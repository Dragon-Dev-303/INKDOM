import { createServer, type IncomingMessage, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { BUILD_VERSION } from '../src/game/config/tuning';
import { MAX_MESSAGE_BYTES, parseClientMsg, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '../src/game/net/protocol';
import type { Authenticator, Identity } from './auth';
import type { MatchStore } from './persistence';
import { RoomManager } from './RoomManager';
import type { Conn, RoomOptions } from './Room';

export interface GameServerOptions extends RoomOptions {
  port: number;
  auth: Authenticator;
  store: MatchStore;
  /** Allowed browser origins (empty = allow all, development). */
  origins?: string[];
  maxConnections?: number;
  log?: (msg: string) => void;
}

export interface GameServer { http: Server; wss: WebSocketServer; rooms: RoomManager; port: number; close(): Promise<void> }

const RATE_WINDOW_MS = 1000;
const RATE_LIMIT = 120;

/**
 * Node game server (INKDOM_v2_Plan.md §4): HTTP health endpoint + WebSocket endpoint `/ws`.
 * Each socket must `hello` (protocol version + Supabase token) before anything else.
 */
export function startGameServer(opts: GameServerOptions): Promise<GameServer> {
  const log = opts.log ?? ((m: string) => console.log(`[game] ${m}`));
  const rooms = new RoomManager(opts.store, opts);
  const sockets = new Map<string, { ws: WebSocket; conn: Conn }>();

  const http = createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, version: BUILD_VERSION, protocol: PROTOCOL_VERSION, ...rooms.stats(), connections: sockets.size }));
      return;
    }
    res.writeHead(404).end();
  });

  const originOk = (req: IncomingMessage) => {
    const list = opts.origins ?? [];
    return list.length === 0 || list.includes(req.headers.origin ?? '');
  };

  const wss = new WebSocketServer({
    server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (info, cb) => cb(originOk(info.req) && sockets.size < (opts.maxConnections ?? 2000), 403),
  });

  wss.on('connection', (ws) => {
    let identity: Identity | null = null;
    let conn: Conn | null = null;
    let hits: number[] = [];
    let alive = true;
    const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
    const fail = (code: Extract<ServerMsg, { t: 'error' }>['code'], message: string) => send({ t: 'error', code, message });
    const helloTimer = setTimeout(() => { if (!identity) ws.close(4001, 'hello timeout'); }, 10_000);

    ws.on('pong', () => { alive = true; });
    const ping = setInterval(() => {
      if (!alive) { ws.terminate(); return; }
      alive = false;
      ws.ping();
    }, 15_000);

    ws.on('message', async (data) => {
      const now = Date.now();
      hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
      hits.push(now);
      if (hits.length > RATE_LIMIT) { fail('rate_limited', 'Too many messages'); return; }
      const msg = parseClientMsg(data.toString());
      if (!msg) { fail('bad_message', 'Malformed message'); return; }

      if (!identity) {
        if (msg.t !== 'hello') { fail('unauthorized', 'Send hello first'); return; }
        if (msg.v !== PROTOCOL_VERSION) { fail('bad_version', `Server speaks protocol ${PROTOCOL_VERSION}. Please reload the page.`); ws.close(4002); return; }
        const id = await opts.auth.verify(msg.token);
        if (!id) { fail('unauthorized', 'Please sign in to play online.'); ws.close(4003); return; }
        identity = id;
        clearTimeout(helloTimer);
        // One live socket per user: the newest wins.
        const old = sockets.get(id.userId);
        if (old) { old.conn.send({ t: 'error', code: 'replaced', message: 'Connected from another tab.' }); old.ws.close(4004); }
        conn = { identity: id, send };
        sockets.set(id.userId, { ws, conn });
        send({ t: 'welcome', userId: id.userId, name: id.name, guest: id.guest });
        rooms.resume(conn);
        return;
      }
      handle(conn!, msg);
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      clearInterval(ping);
      if (identity && sockets.get(identity.userId)?.ws === ws) {
        sockets.delete(identity.userId);
        rooms.disconnect(identity.userId);
      }
    });
    ws.on('error', () => ws.terminate());
  });

  function handle(conn: Conn, msg: ClientMsg) {
    const uid = conn.identity.userId;
    switch (msg.t) {
      case 'ping': conn.send({ t: 'pong', c: msg.c, s: Date.now() }); return;
      case 'room.create': {
        const r = rooms.create(conn);
        if (r === 'server_full') conn.send({ t: 'error', code: 'server_full', message: 'Server is full, try again soon.' });
        return;
      }
      case 'room.join': {
        const r = rooms.join(conn, msg.code);
        if (r === 'room_not_found') conn.send({ t: 'error', code: 'room_not_found', message: `No room with code ${msg.code}.` });
        else if (r === 'room_full') conn.send({ t: 'error', code: 'room_full', message: 'That room is full or already playing.' });
        return;
      }
      case 'queue.join': rooms.enqueue(conn); return;
      case 'queue.leave': rooms.dequeue(uid); return;
      case 'room.leave': rooms.leave(uid); conn.send({ t: 'room.closed', reason: 'left' }); return;
      case 'room.update': rooms.roomOf(uid)?.update(uid, msg); return;
      case 'rematch': rooms.roomOf(uid)?.rematch(uid); return;
      case 'input': rooms.roomOf(uid)?.input(uid, msg.bits); return;
      case 'hello': return;
    }
  }

  const sweeper = setInterval(() => rooms.sweep(), 5_000);

  return new Promise((resolve) => {
    http.listen(opts.port, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      log(`listening on :${port} (protocol v${PROTOCOL_VERSION}, build ${BUILD_VERSION})`);
      resolve({
        http, wss, rooms, port,
        close: () => new Promise<void>((done) => {
          clearInterval(sweeper);
          rooms.shutdown();
          for (const { ws } of sockets.values()) ws.close(1001, 'server shutdown');
          wss.close(() => http.close(() => done()));
        }),
      });
    });
  });
}
