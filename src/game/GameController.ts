import { Sfx } from './audio/sfx';
import { GLOBAL_KEYS, P1_BINDINGS, P2_BINDINGS } from './config/controls';
import { DT, TUNING } from './config/tuning';
import { KeyboardInput } from './core/input';
import { newSeed } from './core/rng';
import { BUILDING } from './level/building';
import { Fx } from './render/fx';
import { PALETTES, Renderer, type Banner, type Toast } from './render/renderer';
import type { Settings } from './settings';
import {
  computeResults, createMatch, debugKillBots, debugSetCapture, debugSetTimer, isMatchOverForUi, stepMatch,
  type MatchResults,
} from './sim/match';
import type { GameEvent, InputFrame, MatchConfig, MatchState } from './sim/types';
import { MatchLogger, type MatchLogPayload } from './telemetry/matchLog';

export interface ControllerCallbacks {
  onPauseChange: (paused: boolean) => void;
  onMatchOver: (results: MatchResults, log: MatchLogPayload) => void;
  onMuteToggle: () => void;
}

const MAX_STEPS_PER_FRAME = 5;

/**
 * Owns the canvas, the fixed-timestep loop (plan §5.6.1), input, audio, FX and logging.
 * React only mounts it and reacts to pause / match-over callbacks.
 */
export class GameController {
  private renderer: Renderer;
  private input = new KeyboardInput();
  private fx = new Fx();
  private state!: MatchState;
  private logger!: MatchLogger;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private finished = false;
  private debug: boolean;
  private slowMo = false;
  private stepOnce = false;
  private banners: Banner[] = [];
  private toasts: Toast[] = [];
  private fpsSmooth = 60;
  private stepMs = 0;
  private lastCaptureTick = 0;
  private resizeObs: ResizeObserver | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private config: MatchConfig,
    private settings: Settings,
    private sfx: Sfx,
    private sessionId: string,
    private cb: ControllerCallbacks,
    debugAllowed: boolean,
  ) {
    this.renderer = new Renderer(canvas, BUILDING);
    this.debug = false;
    this.debugAllowed = debugAllowed;
    this.applySettings(settings);
    this.newMatch(config);
  }

  private debugAllowed: boolean;

  start(): void {
    this.input.attach(window);
    this.input.onGlobalKey = (code) => this.onGlobalKey(code);
    this.resizeObs = new ResizeObserver(() => this.renderer.resize());
    this.resizeObs.observe(this.canvas);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.resizeObs?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.fx.shakeEnabled = s.screenShake;
    this.sfx.setVolumes(s.masterVolume, s.sfxVolume, s.muted);
  }

  newMatch(config: MatchConfig): void {
    this.config = config;
    this.state = createMatch(config, newSeed());
    this.logger = new MatchLogger(this.sessionId, this.state);
    this.finished = false;
    this.acc = 0;
    this.banners = [];
    this.toasts = [];
    this.fx.clear();
    this.input.clear();
  }

  restart(): void {
    this.newMatch(this.config);
    this.setPaused(false);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    this.input.clear();
    this.last = performance.now();
    this.cb.onPauseChange(p);
  }

  isPaused(): boolean {
    return this.paused;
  }

  private onVisibility = () => {
    if (document.hidden && !this.finished) this.setPaused(true);
  };

  private onBlur = () => {
    if (!this.finished) this.setPaused(true);
  };

  private onGlobalKey(code: string) {
    const is = (list: readonly string[]) => list.includes(code);
    if (is(GLOBAL_KEYS.pause) && !this.finished) { this.setPaused(!this.paused); return; }
    if (is(GLOBAL_KEYS.mute)) { this.cb.onMuteToggle(); return; }
    if (!this.debugAllowed) return;
    const events: GameEvent[] = [];
    if (is(GLOBAL_KEYS.debug)) this.debug = !this.debug;
    else if (is(GLOBAL_KEYS.slowMo)) this.slowMo = !this.slowMo;
    else if (is(GLOBAL_KEYS.frameStep)) this.stepOnce = true;
    else if (is(GLOBAL_KEYS.killBots)) debugKillBots(this.state, 'DEFENDER', events);
    else if (is(GLOBAL_KEYS.capture90)) debugSetCapture(this.state, 0.9);
    else if (is(GLOBAL_KEYS.timer10)) debugSetTimer(this.state, 10);
    this.handleEvents(events);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const frameDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (frameDt > 0) this.fpsSmooth = this.fpsSmooth * 0.95 + (1 / frameDt) * 0.05;

    const runSim = !this.paused || this.stepOnce;
    if (runSim) {
      let scale = this.slowMo ? 0.25 : 1;
      if (this.state.phase === 'ENDED') scale *= 0.5;
      this.acc += this.stepOnce && this.paused ? DT : frameDt * scale;
      this.stepOnce = false;
      let steps = 0;
      const t0 = performance.now();
      while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
        this.tick();
        this.acc -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      if (steps) this.stepMs = (performance.now() - t0) / steps;
      this.fx.update(frameDt * scale);
    }

    const nowMs = performance.now();
    this.renderer.render(this.state, this.paused ? 1 : Math.min(1, this.acc / DT), this.fx, {
      palette: PALETTES[this.settings.colorScheme],
      showHints: this.settings.showHints,
      debug: this.debug,
      showFps: this.settings.showFps,
      fps: this.fpsSmooth,
      stepMs: this.stepMs,
      now: nowMs,
      banners: this.banners,
      toasts: this.toasts,
      smallWindow: window.innerWidth < 1280 || window.innerHeight < 680,
    });
    this.banners = this.banners.filter((b) => b.until > nowMs);
    this.toasts = this.toasts.filter((t) => t.until > nowMs);

    if (!this.finished && isMatchOverForUi(this.state)) {
      this.finished = true;
      const results = computeResults(this.state);
      this.cb.onMatchOver(results, this.logger.build(results));
    }
  };

  private tick() {
    const p1: InputFrame = this.input.sample(P1_BINDINGS);
    const p2: InputFrame = this.input.sample(P2_BINDINGS);
    this.input.endTick();
    const events: GameEvent[] = [];
    stepMatch(this.state, [p1, p2], events);
    const moved = (i: InputFrame) => i.left || i.right || i.up || i.down;
    this.logger.record(this.state, events, [moved(p1), moved(p2)]);
    this.handleEvents(events);
    // Capture ticking sound.
    if (this.state.capture.state === 'CAPTURING' && this.state.tick - this.lastCaptureTick >= 30) {
      this.lastCaptureTick = this.state.tick;
      this.sfx.play('captureTick', this.state.capture.progress);
    }
  }

  private banner(text: string, color: string, ms: number, sub?: string) {
    const now = performance.now();
    this.banners = [{ text, sub, color, start: now, until: now + ms }];
  }

  private toast(text: string, color: string) {
    const now = performance.now();
    this.toasts = [...this.toasts.slice(-2), { text, color, until: now + 1800 }];
  }

  private handleEvents(events: GameEvent[]) {
    const pal = PALETTES[this.settings.colorScheme];
    for (const e of events) {
      switch (e.type) {
        case 'COUNTDOWN': this.banner(String(e.value), '#F3F4F6', 900); this.sfx.play('countdown'); break;
        case 'MATCH_START': this.banner('FIGHT!', '#F4D35E', 900); this.sfx.play('horn'); break;
        case 'ATTACK_START': {
          const heavy = e.attack === 'IRON_BAR' || e.attack === 'SHORT_SWORD';
          this.sfx.play(heavy ? 'swingHeavy' : 'swingLight');
          break;
        }
        case 'HIT':
          this.fx.hit(e.x, e.y, e.heavy || e.guardBreak, e.blocked);
          this.sfx.play(e.guardBreak ? 'guardBreak' : e.blocked ? 'block' : e.heavy ? 'hitHeavy' : 'hitLight');
          break;
        case 'KO': this.fx.ko(e.x, e.y); this.sfx.play('ko'); break;
        case 'RESPAWN': {
          const f = this.state.fighters[e.fighter];
          this.fx.puff(f.pos.x, f.pos.y);
          if (f.isBoss) this.sfx.play('respawn');
          break;
        }
        case 'JUMP': if (this.state.fighters[e.fighter].isBoss) this.sfx.play('jump'); break;
        case 'COMMAND': {
          const boss = this.state.fighters[e.team === 'ATTACKER' ? 0 : 4];
          const who = this.state.config.controllers[boss.playerIndex as 0 | 1] === 'CPU' ? 'CPU' : `P${boss.playerIndex + 1}`;
          this.toast(`${who} squad → ${e.command}`, e.team === 'ATTACKER' ? pal.attacker : pal.defender);
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
      }
    }
  }
}
