/**
 * Original procedural sound effects (plan §4.12) — synthesised with the Web Audio API,
 * so there are no asset files and no licensing questions. Unlocks on the first user gesture.
 */
export type SfxName =
  | 'swingLight' | 'swingHeavy' | 'hitLight' | 'hitHeavy' | 'block' | 'guardBreak' | 'ko' | 'respawn'
  | 'captureTick' | 'contested' | 'captured' | 'held' | 'warning' | 'countdown' | 'horn' | 'click' | 'back' | 'jump' | 'command';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;
  private sfxVolume = 0.9;
  private muted = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyGain();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, sfx: number, muted: boolean): void {
    this.volume = master;
    this.sfxVolume = sfx;
    this.muted = muted;
    this.applyGain();
  }

  private applyGain() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * this.sfxVolume * 0.5;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, endFreq?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, q: number, gain: number, endFreq?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, param = 0): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'swingLight': this.burst(0.12, 1800, 2, 0.25, 600); break;
      case 'swingHeavy': this.burst(0.22, 900, 1.5, 0.35, 250); break;
      case 'hitLight': this.tone(180, 0.1, 'triangle', 0.5, 80); this.burst(0.06, 2500, 1, 0.3); break;
      case 'hitHeavy': this.tone(120, 0.18, 'triangle', 0.7, 50); this.burst(0.1, 1500, 1, 0.45); break;
      case 'block': this.tone(1400, 0.12, 'square', 0.12, 900); this.tone(2100, 0.08, 'triangle', 0.1); break;
      case 'guardBreak': this.tone(700, 0.3, 'square', 0.18, 200); this.burst(0.15, 3000, 2, 0.3); break;
      case 'ko': this.tone(90, 0.35, 'sine', 0.8, 40); this.tone(440, 0.4, 'triangle', 0.2, 110); break;
      case 'respawn': this.tone(520, 0.12, 'sine', 0.2); this.tone(780, 0.16, 'sine', 0.2, undefined, 0.08); break;
      case 'captureTick': this.tone(400 + param * 600, 0.06, 'square', 0.08); break;
      case 'contested': this.tone(660, 0.12, 'square', 0.12); this.tone(520, 0.12, 'square', 0.12, undefined, 0.13); break;
      case 'captured': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.25, undefined, i * 0.11)); break;
      case 'held': [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.25, undefined, i * 0.14)); break;
      case 'warning': this.tone(880, 0.09, 'square', 0.12); break;
      case 'countdown': this.tone(600, 0.12, 'square', 0.15); break;
      case 'horn': this.tone(220, 0.5, 'sawtooth', 0.18); this.tone(330, 0.5, 'sawtooth', 0.12); break;
      case 'click': this.tone(900, 0.04, 'square', 0.08); break;
      case 'back': this.tone(500, 0.05, 'square', 0.08, 300); break;
      case 'jump': this.tone(300, 0.08, 'sine', 0.08, 500); break;
      case 'command': this.tone(700, 0.06, 'triangle', 0.15); this.tone(1050, 0.08, 'triangle', 0.15, undefined, 0.06); break;
    }
  }
}
