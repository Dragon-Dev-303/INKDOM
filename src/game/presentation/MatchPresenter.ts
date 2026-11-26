import type { Sfx } from '../audio/sfx';
import { getMove } from '../combat/moves';
import { TUNING } from '../config/tuning';
import type { Fx } from '../render/fx';
import type { Banner, Palette, Toast } from '../render/renderer';
import type { GameEvent, MatchState } from '../sim/types';

/**
 * Turns simulation events into sound, effects, banners and toasts. Shared by the local
 * controller (events from its own simulation) and the online controller (events from the
 * server), so both look and sound identical.
 */
export class MatchPresenter {
  banners: Banner[] = [];
  toasts: Toast[] = [];
  private lastCaptureTick = 0;

  constructor(private fx: Fx, private sfx: Sfx, private names: () => readonly (string | null)[] = () => []) {}

  reset(): void {
    this.banners = [];
    this.toasts = [];
    this.lastCaptureTick = 0;
  }

  banner(text: string, color: string, ms: number, sub?: string): void {
    const now = performance.now();
    this.banners = [{ text, sub, color, start: now, until: now + ms }];
  }

  toast(text: string, color: string): void {
    const now = performance.now();
    this.toasts = [...this.toasts.slice(-2), { text, color, until: now + 1800 }];
  }

  /** Drop expired banners/toasts (call once per rendered frame). */
  prune(nowMs: number): void {
    this.banners = this.banners.filter((b) => b.until > nowMs);
    this.toasts = this.toasts.filter((t) => t.until > nowMs);
  }

  /** Capture ticking sound; call once per simulation tick (or snapshot). */
  tickSounds(state: MatchState): void {
    if (state.capture.state === 'CAPTURING' && state.tick - this.lastCaptureTick >= 30) {
      this.lastCaptureTick = state.tick;
      this.sfx.play('captureTick', state.capture.progress);
    }
  }

  private playerLabel(state: MatchState, player: number): string {
    if (state.config.controllers[player as 0 | 1] === 'CPU') return 'CPU';
    return this.names()[player] ?? `P${player + 1}`;
  }

  handle(state: MatchState, events: readonly GameEvent[], pal: Palette): void {
    for (const e of events) {
      switch (e.type) {
        case 'COUNTDOWN': this.banner(String(e.value), '#F3F4F6', 900); this.sfx.play('countdown'); break;
        case 'MATCH_START': this.banner('FIGHT!', '#F4D35E', 900); this.sfx.play('horn'); break;
        case 'ATTACK_START': {
          const m = getMove(e.attack);
          const heavy = !!m && (m.category === 'weapon' || m.category === 'heavy' || m.category === 'special' || m.hit.damage >= 11);
          this.sfx.play(heavy ? 'swingHeavy' : 'swingLight');
          break;
        }
        case 'DODGE': this.sfx.play('jump'); break;
        case 'HIT': {
          this.fx.hit(e.x, e.y, e.heavy || e.guardBreak, e.blocked);
          this.sfx.play(e.guardBreak ? 'guardBreak' : e.blocked ? 'block' : e.heavy ? 'hitHeavy' : 'hitLight');
          if (e.counter) this.fx.text(e.x, e.y + 0.9, 'COUNTER', '#F97316');
          else if (e.guardBreak) this.fx.text(e.x, e.y + 0.9, 'GUARD BREAK', '#FDE047');
          break;
        }
        case 'KO': this.fx.ko(e.x, e.y); this.sfx.play('ko'); break;
        case 'RESPAWN': {
          const f = state.fighters[e.fighter];
          this.fx.puff(f.pos.x, f.pos.y);
          if (f.isBoss) this.sfx.play('respawn');
          break;
        }
        case 'JUMP': if (state.fighters[e.fighter]?.isBoss) this.sfx.play('jump'); break;
        case 'COMMAND': {
          const boss = state.fighters.find((f) => f.isBoss && f.team === e.team)!;
          this.toast(`${this.playerLabel(state, boss.playerIndex)} squad → ${e.command}`, e.team === 'ATTACKER' ? pal.attacker : pal.defender);
          this.sfx.play('command');
          break;
        }
        case 'CAPTURE_STATE':
          if (e.state === 'CONTESTED') { this.toast('FLAG CONTESTED!', '#ff5577'); this.sfx.play('contested'); }
          else if (e.state === 'CAPTURING') this.toast('Attackers capturing the flag!', pal.attacker);
          break;
        case 'TIMER_WARNING':
          if (e.secondsLeft === 30) this.banner('0:30 REMAINING', '#ef4444', 1500);
          this.sfx.play('warning');
          break;
        case 'STUCK': if (e.level >= 2) this.fx.puff(e.x, e.y); break;
        case 'MATCH_END': {
          const atk = e.winner === 'ATTACKER';
          this.banner(atk ? 'ATTACKERS WIN' : 'DEFENDERS WIN', atk ? pal.attacker : pal.defender,
            TUNING.match.endBannerSeconds * 1000 / 0.5, atk ? 'FLAG CAPTURED' : 'BUILDING HELD');
          this.sfx.play(atk ? 'captured' : 'held');
          break;
        }
        default: break;
      }
    }
  }
}
