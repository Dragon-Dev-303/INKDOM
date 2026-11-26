import { decodeInput, encodeState, heldOnly, PRESS_KEYS } from '../src/game/net/codec';
import { SIM_HZ, SNAPSHOT_EVERY_TICKS, type ServerMsg } from '../src/game/net/protocol';
import { computeResults, createMatch, isMatchOverForUi, stepMatch, type MatchResults } from '../src/game/sim/match';
import { EMPTY_INPUT, type GameEvent, type InputFrame, type MatchConfig, type MatchState } from '../src/game/sim/types';

const MAX_QUEUE = 6;

/**
 * Authoritative match loop (INKDOM_v2_Plan.md §4.3): 60 Hz fixed-step simulation, one queued
 * input frame per seat per tick (jitter buffer, press edges never lost), 30 Hz snapshots with
 * the events since the previous snapshot. Disconnected seats are played by the AI.
 */
export class MatchRunner {
  readonly state: MatchState;
  private queues: [InputFrame[], InputFrame[]] = [[], []];
  private last: [InputFrame, InputFrame] = [EMPTY_INPUT, EMPTY_INPUT];
  private pending: GameEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private prev = 0;
  private finished = false;

  constructor(
    config: MatchConfig,
    seed: number,
    private broadcast: (m: ServerMsg) => void,
    private onEnd: (r: MatchResults) => void,
    opts: { timerSeconds?: number; speed?: number } = {},
  ) {
    this.state = createMatch(config, seed);
    if (opts.timerSeconds) this.state.timeLeftTicks = Math.round(opts.timerSeconds * SIM_HZ);
    this.speed = opts.speed ?? 1;
  }

  private speed: number;

  start(): void {
    this.prev = performance.now();
    // 4 ms polling + accumulator keeps the 60 Hz average accurate despite timer jitter.
    this.timer = setInterval(() => this.pump(), 4);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Queue an input frame for a seat; merges presses when the queue overflows. */
  pushInput(seat: 0 | 1, bits: number): void {
    const q = this.queues[seat];
    const frame = decodeInput(bits);
    if (q.length >= MAX_QUEUE) {
      const dropped = q.shift()!;
      for (const k of PRESS_KEYS) if (dropped[k]) (q[0] as unknown as Record<string, boolean>)[k] = true;
    }
    q.push(frame);
  }

  setControlled(seat: 0 | 1, human: boolean): void {
    this.state.config.controllers[seat] = human ? 'HUMAN' : 'CPU';
    if (!human) this.queues[seat] = [];
  }

  private pump() {
    const now = performance.now();
    this.acc += Math.min(250, now - this.prev) * this.speed;
    this.prev = now;
    const step = 1000 / SIM_HZ;
    let n = 0;
    while (this.acc >= step && n < 20 && !this.finished) {
      this.acc -= step;
      this.tick();
      n++;
    }
  }

  private nextInput(seat: 0 | 1): InputFrame {
    const f = this.queues[seat].shift();
    if (f) {
      this.last[seat] = f;
      return f;
    }
    return heldOnly(this.last[seat]);
  }

  tick(): void {
    const inputs: [InputFrame, InputFrame] = [this.nextInput(0), this.nextInput(1)];
    const events: GameEvent[] = [];
    stepMatch(this.state, inputs, events);
    this.pending.push(...events);
    if (this.state.tick % SNAPSHOT_EVERY_TICKS === 0 || events.some((e) => e.type === 'MATCH_END')) this.flush();
    if (!this.finished && isMatchOverForUi(this.state)) {
      this.finished = true;
      this.flush();
      this.stop();
      this.onEnd(computeResults(this.state));
    }
  }

  private flush() {
    this.broadcast({ t: 'snap', tick: this.state.tick, s: encodeState(this.state), ev: this.pending });
    this.pending = [];
  }
}
