import { newSeed } from '../src/game/core/rng';
import type { RoomView, SeatView, ServerMsg } from '../src/game/net/protocol';
import type { MatchResults } from '../src/game/sim/match';
import type { Team, WeaponId } from '../src/game/sim/types';
import type { Identity } from './auth';
import { MatchRunner } from './MatchRunner';
import type { MatchStore } from './persistence';

export interface Conn { send(m: ServerMsg): void; identity: Identity }

interface Seat {
  identity: Identity;
  conn: Conn | null;
  side: Team;
  weapon: WeaponId;
  ready: boolean;
  wantsRematch: boolean;
  disconnectedAt: number;
}

export interface RoomOptions { timerSeconds?: number; speed?: number; forfeitAfterMs?: number }

/**
 * One private or quick-match room: lobby (sides, weapons, ready) → match → results → rematch.
 * Seat index = player slot (P1/P2); P1's side decides MatchConfig.p1Team.
 */
export class Room {
  phase: RoomView['phase'] = 'LOBBY';
  seats: (Seat | null)[] = [null, null];
  hostId: string;
  runner: MatchRunner | null = null;
  lastActive = Date.now();
  private disconnects = 0;

  constructor(readonly code: string, host: Identity, readonly quick: boolean, private store: MatchStore, private opts: RoomOptions = {}) {
    this.hostId = host.userId;
  }

  isEmpty(): boolean {
    return this.seats.every((s) => !s || !s.conn);
  }

  seatOf(userId: string): number {
    return this.seats.findIndex((s) => s?.identity.userId === userId);
  }

  /** Join or re-join (same user takes back their seat). Returns false when full. */
  join(conn: Conn): boolean {
    const id = conn.identity.userId;
    let i = this.seatOf(id);
    if (i >= 0) {
      const seat = this.seats[i]!;
      seat.conn = conn;
      seat.disconnectedAt = 0;
      if (this.runner) this.runner.setControlled(i as 0 | 1, true);
    } else {
      i = this.seats.findIndex((s) => s === null);
      if (i < 0) return false;
      if (this.phase !== 'LOBBY') return false;
      const other = this.seats[1 - i];
      const side: Team = other ? (other.side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER') : 'ATTACKER';
      this.seats[i] = { identity: conn.identity, conn, side, weapon: 'FISTS', ready: false, wantsRematch: false, disconnectedAt: 0 };
    }
    this.lastActive = Date.now();
    this.broadcastRoom();
    if (this.runner) this.sendStart(conn, i as 0 | 1);
    return true;
  }

  /** Explicit leave: frees the seat in the lobby, hands the boss to the AI during a match. */
  leave(userId: string): void {
    const i = this.seatOf(userId);
    if (i < 0) return;
    if (this.phase === 'PLAYING') {
      this.disconnect(userId);
      this.seats[i]!.disconnectedAt = 1; // leaving = immediate forfeit to the AI
      return;
    }
    this.seats[i] = null;
    if (this.hostId === userId) this.hostId = this.seats.find((s) => s)?.identity.userId ?? this.hostId;
    for (const s of this.seats) if (s) { s.ready = false; s.wantsRematch = false; }
    if (this.phase === 'ENDED') this.phase = 'LOBBY';
    this.broadcastRoom();
  }

  /** Socket closed without leaving: keep the seat for reconnection, AI takes over meanwhile. */
  disconnect(userId: string): void {
    const i = this.seatOf(userId);
    if (i < 0) return;
    const seat = this.seats[i]!;
    seat.conn = null;
    seat.disconnectedAt = Date.now();
    if (this.runner) {
      this.disconnects++;
      this.runner.setControlled(i as 0 | 1, false);
    } else if (this.phase === 'LOBBY') {
      this.seats[i] = null; // a lobby seat is not held
    }
    this.broadcastRoom();
  }

  update(userId: string, u: { side?: Team; weapon?: WeaponId; ready?: boolean }): void {
    const i = this.seatOf(userId);
    if (i < 0 || this.phase !== 'LOBBY') return;
    const seat = this.seats[i]!;
    const other = this.seats[1 - i];
    if (u.side && u.side !== seat.side) {
      seat.side = u.side;
      if (other) { other.side = u.side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER'; other.ready = false; }
      seat.ready = false;
    }
    if (u.weapon) seat.weapon = u.weapon;
    if (u.ready !== undefined) seat.ready = u.ready;
    this.lastActive = Date.now();
    this.broadcastRoom();
    if (this.seats.every((s) => s && s.ready && s.conn)) this.startMatch();
  }

  rematch(userId: string): void {
    const i = this.seatOf(userId);
    if (i < 0 || this.phase !== 'ENDED') return;
    this.seats[i]!.wantsRematch = true;
    this.broadcastRoom();
    if (this.seats.every((s) => s && s.wantsRematch && s.conn)) {
      // Swap sides for fairness, keep weapons.
      for (const s of this.seats) if (s) { s.side = s.side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER'; s.wantsRematch = false; }
      this.startMatch();
    }
  }

  input(userId: string, bits: number): void {
    const i = this.seatOf(userId);
    if (i < 0 || !this.runner || this.phase !== 'PLAYING') return;
    this.runner.pushInput(i as 0 | 1, bits);
  }

  private names(): [string, string] {
    return [this.seats[0]?.identity.name ?? 'P1', this.seats[1]?.identity.name ?? 'P2'];
  }

  private startMatch(): void {
    const [a, b] = this.seats as [Seat, Seat];
    const config = { p1Team: a.side, weapons: [a.weapon, b.weapon] as [WeaponId, WeaponId], controllers: ['HUMAN', 'HUMAN'] as ['HUMAN', 'HUMAN'] };
    this.runner?.stop();
    this.phase = 'PLAYING';
    this.disconnects = 0;
    this.runner = new MatchRunner(config, newSeed(), (m) => this.broadcast(m), (r) => this.finish(r), this.opts);
    for (const s of this.seats) if (s) s.ready = false;
    this.broadcastRoom();
    this.seats.forEach((s, i) => { if (s?.conn) this.sendStart(s.conn, i as 0 | 1); });
    this.runner.start();
  }

  private sendStart(conn: Conn, you: 0 | 1) {
    const r = this.runner!;
    conn.send({ t: 'start', seed: r.state.seed, config: { ...r.state.config, controllers: [...r.state.config.controllers] as typeof r.state.config.controllers }, you, names: this.names(), timeLeftTicks: r.state.timeLeftTicks });
  }

  private finish(results: MatchResults): void {
    this.phase = 'ENDED';
    this.broadcast({ t: 'end', results });
    const bySide = (side: Team) => this.seats.find((s) => s?.side === side)?.identity ?? null;
    void this.store.save({ roomCode: this.code, attacker: bySide('ATTACKER'), defender: bySide('DEFENDER'), results, disconnects: this.disconnects });
    // Seats whose players never came back are released.
    this.seats = this.seats.map((s) => (s && !s.conn ? null : s));
    this.runner = null;
    this.lastActive = Date.now();
    this.broadcastRoom();
  }

  /** Housekeeping: forfeit long disconnects (AI keeps playing; seat released at match end). */
  sweep(now: number): void {
    const limit = this.opts.forfeitAfterMs ?? 180_000;
    for (const s of this.seats) {
      if (s && !s.conn && s.disconnectedAt && now - s.disconnectedAt > limit && this.phase !== 'PLAYING') {
        this.seats[this.seats.indexOf(s)] = null;
        this.broadcastRoom();
      }
    }
  }

  view(): RoomView {
    const seat = (s: Seat | null): SeatView | null => s && {
      userId: s.identity.userId, name: s.identity.name, side: s.side, weapon: s.weapon, ready: s.ready, connected: !!s.conn, wantsRematch: s.wantsRematch,
    };
    return { code: this.code, phase: this.phase, hostId: this.hostId, quick: this.quick, seats: this.seats.map(seat) };
  }

  broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.view() });
  }

  broadcast(m: ServerMsg): void {
    for (const s of this.seats) s?.conn?.send(m);
  }

  close(reason: string): void {
    this.runner?.stop();
    this.broadcast({ t: 'room.closed', reason });
  }
}
