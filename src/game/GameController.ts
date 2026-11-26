import { Sfx } from './audio/sfx';
import type { ResolvedCosmetics } from './config/shop';
import { controlLabels, GLOBAL_KEYS, type Bindings, type SchemeId } from './config/controls';
import { DT } from './config/tuning';
import { loadBindings } from './controlsStore';
import { MatchPresenter } from './presentation/MatchPresenter';
import { KeyboardInput } from './core/input';
import { newSeed } from './core/rng';
import { BUILDING } from './level/building';
import { Fx } from './render/fx';
import { PALETTES, Renderer } from './render/renderer';
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
  private presenter: MatchPresenter;
  private bindings: [Bindings, Bindings] = [loadBindings('localP1'), loadBindings('localP2')];
  private hints: [ReturnType<typeof controlLabels>, ReturnType<typeof controlLabels>] = [controlLabels(this.bindings[0]), controlLabels(this.bindings[1])];
  private fpsSmooth = 60;
  private stepMs = 0;
  private resizeObs: ResizeObserver | null = null;
  private cosmetics: readonly (ResolvedCosmetics | null)[] = [];

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
    this.presenter = new MatchPresenter(this.fx, sfx);
    this.debug = false;
    this.debugAllowed = debugAllowed;
    this.applySettings(settings);
    this.newMatch(config);
  }

  private debugAllowed: boolean;

  /** Render-only cosmetic loadouts, indexed by player (0 = P1, 1 = P2). */
  setCosmetics(c: readonly (ResolvedCosmetics | null)[]): void {
    this.cosmetics = c;
  }

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

  /**
   * Control schemes: vs CPU (one human) uses the one-keyboard 'solo' layout (J K U I O L);
   * two humans share the keyboard with the local P1/P2 layouts. Remapped keys come from Settings.
   */
  private loadControls(config: MatchConfig): void {
    const solo = config.controllers[1] === 'CPU';
    const schemes: [SchemeId, SchemeId] = solo ? ['solo', 'localP2'] : ['localP1', 'localP2'];
    this.bindings = [loadBindings(schemes[0]), loadBindings(schemes[1])];
    this.hints = [controlLabels(this.bindings[0]), controlLabels(this.bindings[1])];
    this.input.setExtraBindings(this.bindings);
  }

  newMatch(config: MatchConfig): void {
    this.config = config;
    this.loadControls(config);
    this.state = createMatch(config, newSeed());
    this.logger = new MatchLogger(this.sessionId, this.state);
    this.finished = false;
    this.acc = 0;
    this.presenter.reset();
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
    this.presenter.handle(this.state, events, PALETTES[this.settings.colorScheme]);
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
      banners: this.presenter.banners,
      toasts: this.presenter.toasts,
      smallWindow: window.innerWidth < 1280 || window.innerHeight < 680,
      cosmetics: this.cosmetics,
      controlHints: this.hints,
    });
    this.presenter.prune(nowMs);

    if (!this.finished && isMatchOverForUi(this.state)) {
      this.finished = true;
      const results = computeResults(this.state);
      this.cb.onMatchOver(results, this.logger.build(results));
    }
  };

  private tick() {
    const p1: InputFrame = this.input.sample(this.bindings[0]);
    const p2: InputFrame = this.input.sample(this.bindings[1]);
    this.input.endTick();
    const events: GameEvent[] = [];
    stepMatch(this.state, [p1, p2], events);
    const moved = (i: InputFrame) => i.left || i.right || i.up || i.down;
    this.logger.record(this.state, events, [moved(p1), moved(p2)]);
    this.presenter.handle(this.state, events, PALETTES[this.settings.colorScheme]);
    this.presenter.tickSounds(this.state);
  }

}
