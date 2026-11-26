import { Sfx } from './audio/sfx';
import type { ResolvedCosmetics } from './config/shop';
import { controlLabels, GLOBAL_KEYS, type Bindings } from './config/controls';
import { DT } from './config/tuning';
import { loadBindings } from './controlsStore';
import { KeyboardInput } from './core/input';
import { BUILDING } from './level/building';
import { applySnapshot, encodeInput, settle } from './net/codec';
import type { OnlineClient } from './net/OnlineClient';
import { SNAPSHOT_EVERY_TICKS, type ServerMsg } from './net/protocol';
import { MatchPresenter } from './presentation/MatchPresenter';
import { Fx } from './render/fx';
import { PALETTES, Renderer } from './render/renderer';
import type { Settings } from './settings';
import { createMatch } from './sim/match';
import type { MatchState } from './sim/types';

/**
 * Online match view (INKDOM_v2_Plan.md §4.3): samples the local keyboard at 60 Hz and sends
 * input frames; renders the server's 30 Hz snapshots with interpolation; plays server events
 * through the shared presenter. No local simulation (the server is authoritative).
 * Client-side prediction can be added behind `predict()` later without changing the server.
 */
export class OnlineGameController {
  private renderer: Renderer;
  private input = new KeyboardInput();
  private fx = new Fx();
  private presenter: MatchPresenter;
  private state: MatchState;
  private bindings: Bindings = loadBindings('solo');
  private hints = controlLabels(this.bindings);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private seq = 0;
  private snapAt = 0;
  private snapInterval = (SNAPSHOT_EVERY_TICKS * 1000) / 60;
  private first = true;
  private unsub: () => void;
  private resizeObs: ResizeObserver | null = null;
  private fps = 60;

  constructor(
    private canvas: HTMLCanvasElement,
    private client: OnlineClient,
    start: Extract<ServerMsg, { t: 'start' }>,
    private settings: Settings,
    private sfx: Sfx,
    private cosmetics: readonly (ResolvedCosmetics | null)[],
    private onMenu: () => void,
  ) {
    this.renderer = new Renderer(canvas, BUILDING);
    this.state = createMatch(start.config, start.seed);
    this.state.timeLeftTicks = start.timeLeftTicks;
    this.names = start.names;
    this.you = start.you;
    this.presenter = new MatchPresenter(this.fx, sfx, () => this.names);
    this.input.setExtraBindings([this.bindings]);
    this.applySettings(settings);
    this.unsub = client.on((m) => this.onMessage(m));
  }

  private names: [string, string];
  readonly you: 0 | 1;

  applySettings(s: Settings): void {
    this.settings = s;
    this.fx.shakeEnabled = s.screenShake;
    this.sfx.setVolumes(s.masterVolume, s.sfxVolume, s.muted);
  }

  private onMessage(m: ServerMsg) {
    if (m.t !== 'snap') return;
    applySnapshot(this.state, m.s);
    if (this.first) { settle(this.state); this.first = false; }
    const now = performance.now();
    if (this.snapAt) this.snapInterval = this.snapInterval * 0.9 + Math.min(200, now - this.snapAt) * 0.1;
    this.snapAt = now;
    this.presenter.handle(this.state, m.ev, PALETTES[this.settings.colorScheme]);
    this.presenter.tickSounds(this.state);
  }

  start(): void {
    this.input.attach(window);
    this.input.onGlobalKey = (code) => {
      if ((GLOBAL_KEYS.pause as readonly string[]).includes(code)) this.onMenu();
    };
    this.resizeObs = new ResizeObserver(() => this.renderer.resize());
    this.resizeObs.observe(this.canvas);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.resizeObs?.disconnect();
    this.unsub();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    // Send one input frame per 60 Hz tick (taps between ticks are kept by KeyboardInput).
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 4) {
      const frame = this.input.sample(this.bindings);
      this.input.endTick();
      this.client.send({ t: 'input', seq: this.seq++, bits: encodeInput(frame) });
      this.acc -= DT;
      n++;
    }
    if (n === 4) this.acc = 0;
    this.fx.update(dt);

    const alpha = this.snapAt ? Math.min(1, (now - this.snapAt) / Math.max(16, this.snapInterval)) : 1;
    const hints: (ReturnType<typeof controlLabels> | null)[] = [null, null];
    hints[this.you] = this.hints;
    const nowMs = performance.now();
    this.renderer.render(this.state, alpha, this.fx, {
      palette: PALETTES[this.settings.colorScheme],
      showHints: this.settings.showHints,
      debug: false,
      showFps: this.settings.showFps,
      fps: this.fps,
      stepMs: this.client.rtt,
      now: nowMs,
      banners: this.presenter.banners,
      toasts: this.presenter.toasts,
      smallWindow: window.innerWidth < 1280 || window.innerHeight < 680,
      cosmetics: this.cosmetics,
      controlHints: hints,
      playerNames: this.names,
    });
    this.presenter.prune(nowMs);
  };
}
