import { ROOM_CODE_ALPHABET } from '../src/game/net/protocol';
import type { Identity } from './auth';
import type { MatchStore } from './persistence';
import { Room, type Conn, type RoomOptions } from './Room';

/** Rooms by code, user → room index, and the quick-match FIFO queue. */
export class RoomManager {
  rooms = new Map<string, Room>();
  private byUser = new Map<string, string>();
  private queue: Conn[] = [];

  constructor(private store: MatchStore, private opts: RoomOptions & { maxRooms?: number } = {}) {}

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  roomOf(userId: string): Room | null {
    const code = this.byUser.get(userId);
    return code ? this.rooms.get(code) ?? null : null;
  }

  create(conn: Conn, quick = false): Room | 'server_full' {
    if (this.rooms.size >= (this.opts.maxRooms ?? 500)) return 'server_full';
    const room = new Room(this.newCode(), conn.identity, quick, this.store, this.opts);
    this.rooms.set(room.code, room);
    this.bind(conn, room);
    return room;
  }

  join(conn: Conn, code: string): Room | 'room_not_found' | 'room_full' {
    const room = this.rooms.get(code);
    if (!room) return 'room_not_found';
    if (room.seatOf(conn.identity.userId) < 0 && (room.seats.every((s) => s) || room.phase !== 'LOBBY')) return 'room_full';
    this.bind(conn, room);
    return room;
  }

  private bind(conn: Conn, room: Room) {
    const prev = this.roomOf(conn.identity.userId);
    if (prev && prev !== room) this.leave(conn.identity.userId);
    this.byUser.set(conn.identity.userId, room.code);
    room.join(conn);
  }

  /** Reconnect: put a returning socket back into its room (if the seat still exists). */
  resume(conn: Conn): Room | null {
    const room = this.roomOf(conn.identity.userId);
    if (!room || room.seatOf(conn.identity.userId) < 0) return null;
    room.join(conn);
    return room;
  }

  leave(userId: string): void {
    this.dequeue(userId);
    const room = this.roomOf(userId);
    if (!room) return;
    room.leave(userId);
    if (room.seatOf(userId) < 0) this.byUser.delete(userId);
    this.cleanup(room);
  }

  disconnect(userId: string): void {
    this.dequeue(userId);
    const room = this.roomOf(userId);
    if (!room) return;
    room.disconnect(userId);
    if (room.seatOf(userId) < 0) this.byUser.delete(userId);
    this.cleanup(room);
  }

  // ---------------- quick match ----------------
  enqueue(conn: Conn): void {
    this.dequeue(conn.identity.userId);
    const partner = this.queue.find((c) => c.identity.userId !== conn.identity.userId);
    if (partner) {
      this.dequeue(partner.identity.userId);
      const room = this.create(partner, true);
      if (room === 'server_full') { partner.send({ t: 'error', code: 'server_full', message: 'Server is full, try again soon.' }); return; }
      // Random sides.
      if (Math.random() < 0.5) room.update(partner.identity.userId, { side: 'DEFENDER' });
      this.join(conn, room.code);
      return;
    }
    this.queue.push(conn);
    this.broadcastQueue();
  }

  dequeue(userId: string): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((c) => c.identity.userId !== userId);
    if (this.queue.length !== before) this.broadcastQueue();
  }

  private broadcastQueue() {
    for (const c of this.queue) c.send({ t: 'queue', waiting: this.queue.length });
  }

  private cleanup(room: Room) {
    if (room.seats.every((s) => s === null)) {
      room.close('empty');
      this.rooms.delete(room.code);
    }
  }

  /** Periodic housekeeping: forfeits, idle rooms (2 min with nobody connected). */
  sweep(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      room.sweep(now);
      if (room.isEmpty() && now - room.lastActive > 120_000 && room.phase !== 'PLAYING') {
        for (const s of room.seats) if (s) this.byUser.delete(s.identity.userId);
        room.close('idle');
        this.rooms.delete(room.code);
      }
    }
  }

  stats() {
    return { rooms: this.rooms.size, playing: [...this.rooms.values()].filter((r) => r.phase === 'PLAYING').length, queued: this.queue.length };
  }

  shutdown(): void {
    for (const room of this.rooms.values()) room.close('server_restart');
    this.rooms.clear();
  }
}

export type { Identity };
