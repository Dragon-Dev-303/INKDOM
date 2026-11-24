import { BUILD_VERSION } from '../config/tuning';
import type { MatchResults } from '../sim/match';
import type { GameEvent, MatchState } from '../sim/types';

/**
 * Anonymous match event log (plan §5.7, brief §5/§11). No personal data.
 * Produces the metrics the playtest needs: time to first move / first hit, match length, KOs, stuck events.
 */
export interface LogEntry { t: number; type: string; data?: Record<string, unknown> }

export interface MatchLogPayload {
  sessionId: string;
  buildVersion: string;
  seed: number;
  p1Team: 'ATTACKER' | 'DEFENDER';
  p2Controller: 'HUMAN' | 'CPU';
  winner: 'ATTACKER' | 'DEFENDER';
  endReason: 'CAPTURE' | 'TIMEOUT';
  durationSeconds: number;
  attackerKos: number;
  defenderKos: number;
  peakCapture: number;
  stuckEvents: number;
  firstMoveSeconds: (number | null)[];
  firstHitSeconds: (number | null)[];
  events: LogEntry[];
}

const MAX_EVENTS = 1500;

export class MatchLogger {
  private entries: LogEntry[] = [];
  private firstMove: (number | null)[] = [null, null];
  private firstHit: (number | null)[] = [null, null];

  constructor(private sessionId: string, private state: MatchState) {
    this.push(0, 'match_start', { seed: state.seed, p1Team: state.config.p1Team, weapons: state.config.weapons, controllers: state.config.controllers });
  }

  private push(t: number, type: string, data?: Record<string, unknown>) {
    if (this.entries.length < MAX_EVENTS) this.entries.push({ t: Math.round(t * 100) / 100, type, data });
  }

  private seconds(): number {
    return this.state.playTicks / 60;
  }

  /** Called once per tick with that tick's inputs (for first-move detection) and events. */
  record(state: MatchState, events: GameEvent[], movedPlayers: [boolean, boolean]): void {
    this.state = state;
    const t = this.seconds();
    if (state.phase === 'PLAYING') {
      for (const p of [0, 1] as const) {
        if (movedPlayers[p] && this.firstMove[p] === null) {
          this.firstMove[p] = t;
          this.push(t, 'first_move', { player: p });
        }
      }
    }
    for (const e of events) {
      switch (e.type) {
        case 'HIT': {
          const a = state.fighters[e.attacker];
          if (a.isBoss && a.playerIndex >= 0 && this.firstHit[a.playerIndex] === null && !e.blocked) {
            this.firstHit[a.playerIndex] = t;
            this.push(t, 'first_hit', { player: a.playerIndex });
          }
          break;
        }
        case 'KO': this.push(t, 'ko', { victim: e.victim, killer: e.killer, x: round(e.x), y: round(e.y) }); break;
        case 'COMMAND': this.push(t, 'command', { team: e.team, command: e.command }); break;
        case 'CAPTURE_MILESTONE': this.push(t, 'capture_milestone', { pct: e.pct }); break;
        case 'CAPTURE_STATE': if (e.state === 'CONTESTED') this.push(t, 'contested_start'); break;
        case 'STUCK': this.push(t, 'stuck', { bot: e.bot, level: e.level, x: round(e.x), y: round(e.y), seed: state.seed }); break;
        case 'MATCH_END': this.push(t, 'match_end', { winner: e.winner, reason: e.reason, duration: round(t) }); break;
        default: break;
      }
    }
  }

  build(results: MatchResults): MatchLogPayload {
    return {
      sessionId: this.sessionId,
      buildVersion: BUILD_VERSION,
      seed: results.seed,
      p1Team: this.state.config.p1Team,
      p2Controller: this.state.config.controllers[1],
      winner: results.winner,
      endReason: results.reason,
      durationSeconds: round(results.durationSeconds),
      attackerKos: results.kos.ATTACKER,
      defenderKos: results.kos.DEFENDER,
      peakCapture: Math.round(results.peakCapture * 1000) / 1000,
      stuckEvents: results.stuckEvents,
      firstMoveSeconds: this.firstMove,
      firstHitSeconds: this.firstHit,
      events: this.entries,
    };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
