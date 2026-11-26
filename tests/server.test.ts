import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { tokenIsIdentity } from '../server/auth';
import { startGameServer, type GameServer } from '../server/gameServer';
import { memoryMatchStore } from '../server/persistence';
import { applySnapshot, decodeInput, encodeInput, encodeState } from '@/game/net/codec';
import { parseClientMsg, PROTOCOL_VERSION, type ServerMsg } from '@/game/net/protocol';
import { createMatch, stepMatch } from '@/game/sim/match';
import { EMPTY_INPUT, type InputFrame } from '@/game/sim/types';

/** A scripted protocol client that records every server message. */
class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  private opened: Promise<void>;
  private waiters: { pred: (m: ServerMsg) => boolean; done: (m: ServerMsg) => void }[] = [];
  constructor(port: number, readonly token: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.opened = new Promise<void>((r) => this.ws.once('open', () => r()));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.done(m), false) : true));
    });
  }
  open() { return this.opened; }
  send(m: unknown) { this.ws.send(JSON.stringify(m)); }
  wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 8000): Promise<Extract<ServerMsg, { t: T }>> {
    const found = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
    if (found) return Promise.resolve(found as Extract<ServerMsg, { t: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), ms);
      this.waiters.push({ pred: (m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>), done: (m) => { clearTimeout(timer); resolve(m as Extract<ServerMsg, { t: T }>); } });
    });
  }
  async hello() {
    await this.open();
    this.send({ t: 'hello', v: PROTOCOL_VERSION, token: this.token });
    return this.wait('welcome');
  }
  close() { this.ws.close(); }
}

describe('protocol codec (T-N01)', () => {
  it('input bitmask round-trips every field', () => {
    const keys = Object.keys(EMPTY_INPUT) as (keyof InputFrame)[];
    for (const k of keys) {
      const f = { ...EMPTY_INPUT, [k]: true };
      expect(decodeInput(encodeInput(f))).toEqual(f);
    }
    const all = Object.fromEntries(keys.map((k) => [k, true])) as unknown as InputFrame;
    expect(decodeInput(encodeInput(all))).toEqual(all);
  });

  it('snapshots carry everything the renderer needs', () => {
    const a = createMatch({ p1Team: 'ATTACKER', weapons: ['FISTS', 'SHORT_SWORD'], controllers: ['CPU', 'CPU'] }, 9);
    for (let t = 0; t < 1500; t++) stepMatch(a, [EMPTY_INPUT, EMPTY_INPUT], []);
    const b = createMatch({ p1Team: 'ATTACKER', weapons: ['FISTS', 'SHORT_SWORD'], controllers: ['HUMAN', 'HUMAN'] }, 9);
    applySnapshot(b, JSON.parse(JSON.stringify(encodeState(a))));
    expect(b.tick).toBe(a.tick);
    expect(b.config.controllers).toEqual(['CPU', 'CPU']);
    expect(b.capture.state).toBe(a.capture.state);
    a.fighters.forEach((f, i) => {
      const g = b.fighters[i];
      expect(g.pos.x).toBeCloseTo(f.pos.x, 2);
      expect(g.pos.y).toBeCloseTo(f.pos.y, 2);
      expect([g.action, g.moveId, g.mode, g.facing, g.crouching]).toEqual([f.action, f.moveId, f.mode, f.facing, f.crouching]);
      expect(g.hp).toBeCloseTo(f.hp, 0);
    });
    expect(JSON.stringify(encodeState(a)).length).toBeLessThan(2500);
  });

  it('rejects malformed client messages', () => {
    expect(parseClientMsg('nope')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'room.join', code: 'abc' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'room.update', side: 'KING' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'input', seq: 1, bits: -1 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'room.join', code: 'abcdef' }))).toEqual({ t: 'room.join', code: 'ABCDEF' });
    expect(parseClientMsg('x'.repeat(5000))).toBeNull();
  });
});

describe('game server (T-N02)', () => {
  let server: GameServer;
  const store = memoryMatchStore();

  beforeAll(async () => {
    server = await startGameServer({ port: 0, auth: tokenIsIdentity(), store, timerSeconds: 4, speed: 8, log: () => {} });
  });
  afterAll(async () => { await server.close(); });

  it('refuses clients without a valid hello', async () => {
    const c = new Client(server.port, '');
    await c.open();
    c.send({ t: 'room.create' });
    expect((await c.wait('error')).code).toBe('unauthorized');
    c.send({ t: 'hello', v: 999, token: 'x:y' });
    expect((await c.wait('error', (e) => e.code === 'bad_version')).code).toBe('bad_version');
    c.close();
  });

  it('two players create/join a room, ready up, play a whole match and get results', async () => {
    const a = new Client(server.port, 'u-alice:Alice');
    const b = new Client(server.port, 'u-bob:Bob');
    expect((await a.hello()).name).toBe('Alice');
    await b.hello();

    a.send({ t: 'room.create' });
    const room = await a.wait('room');
    expect(room.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    b.send({ t: 'room.join', code: room.room.code.toLowerCase() });
    await a.wait('room', (m) => m.room.seats.every((s) => s));

    a.send({ t: 'room.update', side: 'DEFENDER', weapon: 'SHORT_SWORD' });
    await b.wait('room', (m) => m.room.seats[1]?.side === 'ATTACKER');
    a.send({ t: 'room.update', ready: true });
    b.send({ t: 'room.update', ready: true });

    const startA = await a.wait('start');
    const startB = await b.wait('start');
    expect(startA.you).toBe(0);
    expect(startB.you).toBe(1);
    expect(startA.config.p1Team).toBe('DEFENDER');
    expect(startA.config.weapons[0]).toBe('SHORT_SWORD');
    expect(startA.names).toEqual(['Alice', 'Bob']);

    // Player B walks right and punches; inputs reach the authoritative sim.
    let seq = 0;
    const pump = setInterval(() => {
      b.send({ t: 'input', seq: seq++, bits: encodeInput({ ...EMPTY_INPUT, right: true, punchPressed: seq % 20 === 0 }) });
      a.send({ t: 'input', seq, bits: 0 });
    }, 16);
    const firstSnap = await b.wait('snap');
    expect(firstSnap.s.f).toHaveLength(8);

    const end = await a.wait('end', () => true, 20000);
    clearInterval(pump);
    expect(['ATTACKER', 'DEFENDER']).toContain(end.results.winner);
    await b.wait('end');
    expect(b.msgs.filter((m) => m.t === 'snap').length).toBeGreaterThan(20);
    await new Promise((r) => setTimeout(r, 50));
    expect(store.records.at(-1)?.attacker?.name).toBe('Bob');
    expect(store.records.at(-1)?.defender?.name).toBe('Alice');

    // Rematch: both vote, sides swap.
    a.send({ t: 'rematch' });
    b.send({ t: 'rematch' });
    const re = await a.wait('start', (m) => m !== startA);
    expect(re.config.p1Team).toBe('ATTACKER');
    a.close();
    b.close();
  });

  it('a disconnect hands the boss to the AI and a reconnect restores control', async () => {
    const a = new Client(server.port, 'u-carol:Carol');
    const b = new Client(server.port, 'u-dave:Dave');
    await a.hello();
    await b.hello();
    a.send({ t: 'room.create' });
    const room = await a.wait('room');
    b.send({ t: 'room.join', code: room.room.code });
    await a.wait('room', (m) => m.room.seats.every((s) => s));
    a.send({ t: 'room.update', ready: true });
    b.send({ t: 'room.update', ready: true });
    await b.wait('start');
    await b.wait('snap');

    a.close();
    await b.wait('room', (m) => m.room.seats[0]?.connected === false);
    const cpu = await b.wait('snap', (m) => (m.s.m[12] & 1) === 1);
    expect(cpu).toBeDefined();

    const a2 = new Client(server.port, 'u-carol:Carol');
    await a2.hello();
    const back = await a2.wait('start');
    expect(back.you).toBe(0);
    await b.wait('snap', (m) => (m.s.m[12] & 1) === 0);
    a2.close();
    b.close();
  });

  it('quick match pairs two queued players', async () => {
    const a = new Client(server.port, 'u-erin:Erin');
    const b = new Client(server.port, 'u-finn:Finn');
    await a.hello();
    await b.hello();
    a.send({ t: 'queue.join' });
    await a.wait('queue');
    b.send({ t: 'queue.join' });
    const r = await b.wait('room', (m) => m.room.quick && m.room.seats.every((s) => s));
    const sides = r.room.seats.map((s) => s!.side).sort();
    expect(sides).toEqual(['ATTACKER', 'DEFENDER']);
    a.close();
    b.close();
  });

  it('ignores malformed and unknown-room messages without crashing', async () => {
    const c = new Client(server.port, 'u-gus:Gus');
    await c.hello();
    c.ws.send('garbage');
    expect((await c.wait('error', (e) => e.code === 'bad_message')).code).toBe('bad_message');
    c.send({ t: 'room.join', code: 'ZZZZZZ' });
    expect((await c.wait('error', (e) => e.code === 'room_not_found')).code).toBe('room_not_found');
    c.send({ t: 'ping', c: 5 });
    expect((await c.wait('pong')).c).toBe(5);
    c.close();
  });
});
