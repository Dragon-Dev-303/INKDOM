import { TUNING } from '../config/tuning';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; active: boolean }
interface Marker { x: number; y: number; text: string; color: string; life: number; max: number }

/** Pooled particles, floating markers and screen shake (plan §4.9, §5.8). Render-side only. */
export class Fx {
  private pool: Particle[] = Array.from({ length: TUNING.fx.maxParticles }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 0.05, active: false,
  }));
  markers: Marker[] = [];
  shakeTime = 0;
  shakeEnabled = true;

  private spawn(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number) {
    const p = this.pool.find((q) => !q.active);
    if (!p) return;
    Object.assign(p, { x, y, vx, vy, life, max: life, color, size, active: true });
  }

  hit(x: number, y: number, heavy: boolean, blocked: boolean) {
    const n = heavy ? 14 : 8;
    const color = blocked ? '#BFD7FF' : '#FFE08A';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * (heavy ? 6 : 4);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.2, color, heavy ? 0.07 : 0.05);
    }
    if (heavy && this.shakeEnabled) this.shakeTime = TUNING.fx.shakeTicks / 60;
  }

  puff(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x, y + 0.9, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.5, 'rgba(220,220,230,0.8)', 0.12);
    }
  }

  ko(x: number, y: number) {
    this.markers.push({ x, y: y + 2.2, text: 'KO', color: '#FFFFFF', life: 1.4, max: 1.4 });
    if (this.shakeEnabled) this.shakeTime = TUNING.fx.shakeTicks / 60;
  }

  text(x: number, y: number, text: string, color: string) {
    this.markers.push({ x, y, text, color, life: 1, max: 1 });
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const m of this.markers) { m.life -= dt; m.y += 0.6 * dt; }
    this.markers = this.markers.filter((m) => m.life > 0);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const a = TUNING.fx.shakeAmount;
    return { x: (Math.random() * 2 - 1) * a, y: (Math.random() * 2 - 1) * a };
  }

  particles(): Particle[] {
    return this.pool.filter((p) => p.active);
  }

  activeCount(): number {
    return this.pool.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }

  clear() {
    for (const p of this.pool) p.active = false;
    this.markers = [];
    this.shakeTime = 0;
  }
}
