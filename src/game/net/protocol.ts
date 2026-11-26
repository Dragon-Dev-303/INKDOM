/**
 * Online protocol v1 (INKDOM_v2_Plan.md §4.2). JSON messages over one WebSocket, shared by the
 * browser client and the Node game server. Pure types + validators: no browser or Node APIs.
 * Clients send intentions only (inputs, lobby choices); the server owns the simulation.
 */
import type { MatchResults } from '../sim/match';
import type { GameEvent, MatchConfig, Team, WeaponId } from '../sim/types';
import { WEAPON_IDS } from '../sim/types';

export const PROTOCOL_VERSION = 1;
/** Server simulation rate and snapshot rate. */
export const SIM_HZ = 60;
export const SNAPSHOT_EVERY_TICKS = 2; // 30 Hz
export const MAX_MESSAGE_BYTES = 4096;

export type RoomPhase = 'LOBBY' | 'PLAYING' | 'ENDED';

export interface SeatView {
  userId: string;
  name: string;
  side: Team;
  weapon: WeaponId;
  ready: boolean;
  connected: boolean;
  wantsRematch: boolean;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string;
  quick: boolean;
  /** Index = player slot (0 = P1, 1 = P2). */
  seats: (SeatView | null)[];
}

// ---------------- client → server ----------------
export type ClientMsg =
  | { t: 'hello'; v: number; token: string | null }
  | { t: 'room.create' }
  | { t: 'room.join'; code: string }
  | { t: 'queue.join' }
  | { t: 'queue.leave' }
  | { t: 'room.update'; side?: Team; weapon?: WeaponId; ready?: boolean }
  | { t: 'room.leave' }
  | { t: 'input'; seq: number; bits: number }
  | { t: 'rematch' }
  | { t: 'ping'; c: number };

// ---------------- server → client ----------------
export type ServerErrorCode =
  | 'bad_version' | 'unauthorized' | 'bad_message' | 'room_not_found' | 'room_full' | 'not_in_room'
  | 'already_in_room' | 'rate_limited' | 'server_full' | 'replaced';

export type ServerMsg =
  | { t: 'welcome'; userId: string; name: string; guest: boolean }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'room'; room: RoomView }
  | { t: 'room.closed'; reason: string }
  | { t: 'queue'; waiting: number }
  | { t: 'start'; seed: number; config: MatchConfig; you: 0 | 1; names: [string, string]; timeLeftTicks: number }
  | { t: 'snap'; tick: number; s: EncodedState; ev: GameEvent[] }
  | { t: 'end'; results: MatchResults }
  | { t: 'pong'; c: number; s: number };

/** Compact snapshot (see codec.ts). */
export interface EncodedState {
  /** [tick, phaseCode, phaseTick, playTicks, timeLeftTicks, capProgress, capStateCode, capPeak, atkCmdCode, defCmdCode, winnerCode, reasonCode, ctrlBits] */
  m: number[];
  /** One numeric array per fighter, see FIGHTER_FIELDS in codec.ts. */
  f: number[][];
}

// ---------------- validation (server side) ----------------
const TEAMS: readonly Team[] = ['ATTACKER', 'DEFENDER'];
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Parse and validate an incoming client message; null if malformed. */
export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;
  const m = d as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return typeof m.v === 'number' && (m.token === null || (typeof m.token === 'string' && m.token.length < 4000)) ? { t: 'hello', v: m.v, token: m.token as string | null } : null;
    case 'room.create': case 'queue.join': case 'queue.leave': case 'room.leave': case 'rematch':
      return { t: m.t };
    case 'room.join':
      return typeof m.code === 'string' && CODE_RE.test(m.code.toUpperCase()) ? { t: 'room.join', code: m.code.toUpperCase() } : null;
    case 'room.update': {
      const out: Extract<ClientMsg, { t: 'room.update' }> = { t: 'room.update' };
      if (m.side !== undefined) { if (!TEAMS.includes(m.side as Team)) return null; out.side = m.side as Team; }
      if (m.weapon !== undefined) { if (!WEAPON_IDS.includes(m.weapon as WeaponId)) return null; out.weapon = m.weapon as WeaponId; }
      if (m.ready !== undefined) { if (typeof m.ready !== 'boolean') return null; out.ready = m.ready; }
      return out;
    }
    case 'input':
      return Number.isInteger(m.seq) && Number.isInteger(m.bits) && (m.bits as number) >= 0 && (m.bits as number) < 1 << 14
        ? { t: 'input', seq: m.seq as number, bits: m.bits as number } : null;
    case 'ping':
      return typeof m.c === 'number' && Number.isFinite(m.c) ? { t: 'ping', c: m.c } : null;
    default:
      return null;
  }
}

/** Room codes: 6 characters without look-alikes (no I, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const isRoomCode = (c: string) => CODE_RE.test(c);
