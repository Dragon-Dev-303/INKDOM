import { CONTROL_LABELS, type controlLabels } from '../config/controls';
import { getMove } from '../combat/moves';
import { TUNING } from '../config/tuning';
import type { LevelDef } from '../level/building';
import type { ResolvedCosmetics, WeaponStyle } from '../config/shop';
import { attackPhase, hitbox, hurtbox, isAlive } from '../sim/combat';
import type { Fighter, MatchState, Team } from '../sim/types';
import type { Fx } from './fx';
import { drawHat } from './cosmetics';
import { mixPose, poseFor, solveRig, WEAPON_LENGTH, type Joints, type Pose, type Vec } from './rig';

/** Frames used to crossfade between animation states (mocap clips start from varied stances). */
const BLEND_TICKS = 4;

export interface Palette { attacker: string; defender: string; attackerDark: string; defenderDark: string; outline: number }

export const PALETTES: Record<'standard' | 'highContrast', Palette> = {
  standard: { attacker: '#E4572E', defender: '#2E86DE', attackerDark: '#9E3A1E', defenderDark: '#1D5C9C', outline: 0 },
  highContrast: { attacker: '#FFB000', defender: '#00B3FF', attackerDark: '#B37B00', defenderDark: '#007DB3', outline: 1 },
};

export interface Banner { text: string; sub?: string; color: string; until: number; start: number }
export interface Toast { text: string; color: string; until: number }

export interface RenderOptions {
  palette: Palette;
  showHints: boolean;
  debug: boolean;
  showFps: boolean;
  fps: number;
  stepMs: number;
  now: number;
  banners: Banner[];
  toasts: Toast[];
  smallWindow: boolean;
  /** Cosmetic loadout per player index (0 = P1, 1 = P2); applied to that player's boss only. */
  cosmetics?: readonly (ResolvedCosmetics | null)[];
  /** Key hints per player (defaults to the local two-player layouts). */
  controlHints?: readonly (ReturnType<typeof controlLabels> | null)[];
  /** Player names shown in the HUD (online). */
  playerNames?: readonly (string | null)[];
}

const COLORS = {
  letterbox: '#0d0f15',
  skyTop: '#1B1F2A',
  skyBottom: '#262c3d',
  skyline: '#20263a',
  interior: '#343a46',
  wall: '#6B7280',
  slab: '#4B5563',
  pocket: '#3F4652',
  pocketLine: '#545c69',
  stair: '#9CA3AF',
  ladder: '#a08a5a',
  door: '#c9a227',
  street: '#2a2f3a',
  flag: '#F4D35E',
  text: '#F3F4F6',
  muted: '#9CA3AF',
};

const SKYLINE = [[-12, 6], [-9.5, 9], [-7, 5], [-5, 11], [-2.5, 7], [25, 8], [27, 12]] as const;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private fx: Fx | null = null;
  /** Render-side pose memory per fighter for crossfades (never read by the simulation). */
  private poseMemory = new Map<number, { key: string; from: Pose; since: number; last: Pose }>();

  constructor(private canvas: HTMLCanvasElement, private level: LevelDef) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    const cam = this.level.camera;
    const cw = cam.x1 - cam.x0;
    const ch = cam.y1 - cam.y0;
    // Leave room for the HUD bands at the top and bottom.
    const hudTop = 0.15 * this.h;
    const hudBottom = 0.07 * this.h;
    const availH = this.h - hudTop - hudBottom;
    this.scale = Math.min(this.w / cw, availH / ch);
    this.ox = (this.w - cw * this.scale) / 2 - cam.x0 * this.scale;
    this.oy = hudTop + (availH - ch * this.scale) / 2 + cam.y1 * this.scale;
  }

  private sx(x: number) { return this.ox + x * this.scale; }
  private sy(y: number) { return this.oy - y * this.scale; }

  private names: readonly (string | null)[] | undefined;

  render(state: MatchState, alpha: number, fx: Fx, opt: RenderOptions): void {
    const ctx = this.ctx;
    this.names = opt.playerNames;
    this.fx = fx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.letterbox;
    ctx.fillRect(0, 0, this.w, this.h);

    const shake = fx.shakeOffset();
    ctx.save();
    ctx.translate(shake.x * this.scale, shake.y * this.scale);
    this.drawWorld(state);
    this.drawFlag(state, opt);
    const order = [...state.fighters].sort((a, b) => Number(isAlive(a)) - Number(isAlive(b)) || Number(a.isBoss) - Number(b.isBoss));
    for (const f of order) this.drawFighter(state, f, alpha, opt);
    this.drawFx(fx);
    if (opt.debug) this.drawDebug(state);
    ctx.restore();

    this.drawHud(state, opt);
  }

  // ---------- World ----------
  private rect(x0: number, y0: number, x1: number, y1: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.sx(x0), this.sy(y1), (x1 - x0) * this.scale, (y1 - y0) * this.scale);
  }

  private line(a: Vec, b: Vec, width: number, color: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * this.scale);
    ctx.beginPath();
    ctx.moveTo(this.sx(a.x), this.sy(a.y));
    ctx.lineTo(this.sx(b.x), this.sy(b.y));
    ctx.stroke();
  }

  private drawWorld(state: MatchState) {
    const L = this.level;
    const ctx = this.ctx;
    const cam = L.camera;
    const g = ctx.createLinearGradient(0, this.sy(cam.y1), 0, this.sy(0));
    g.addColorStop(0, COLORS.skyTop);
    g.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(this.sx(cam.x0), this.sy(cam.y1), (cam.x1 - cam.x0) * this.scale, (cam.y1 - cam.y0) * this.scale);
    for (const [x, hgt] of SKYLINE) this.rect(x, 0, x + 2.2, hgt, COLORS.skyline);

    this.rect(cam.x0, cam.y0, cam.x1, 0, COLORS.street);
    this.rect(L.building.x0, 0, L.building.x1, L.building.y1, COLORS.interior);
    this.rect(L.housing.x0, L.housing.y0, L.housing.x1, L.housing.y1, COLORS.interior);

    // Solids (skip ground and invisible world walls).
    for (let i = 3; i < L.solids.length; i++) {
      const s = L.solids[i];
      const isSlab = s.y1 - s.y0 < 0.35;
      this.rect(s.x0, s.y0, s.x1, s.y1, isSlab ? COLORS.slab : COLORS.wall);
    }
    for (const p of L.pockets) {
      this.rect(p.x0, p.y0, p.x1, p.y1, COLORS.pocket);
      ctx.strokeStyle = COLORS.pocketLine;
      ctx.lineWidth = Math.max(1, 0.04 * this.scale);
      for (let x = p.x0; x < p.x1 - 0.1; x += 2) {
        ctx.strokeRect(this.sx(x + 0.1), this.sy(p.y0 + 1.6), 1.8 * this.scale, 1.5 * this.scale);
        ctx.beginPath();
        ctx.moveTo(this.sx(x + 0.1), this.sy(p.y0 + 1.6));
        ctx.lineTo(this.sx(x + 1.9), this.sy(p.y0 + 0.1));
        ctx.stroke();
      }
    }
    // Opening edge markers.
    for (const o of L.openings) {
      this.rect(o.x0 - 0.15, o.y1 - 0.06, o.x0, o.y1, COLORS.flag);
      this.rect(o.x1, o.y1 - 0.06, o.x1 + 0.15, o.y1, COLORS.flag);
    }
    // Stairs.
    for (const st of L.stairs) {
      this.line(st.foot, st.top, 0.12, COLORS.stair);
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const x0 = st.foot.x + (st.top.x - st.foot.x) * t0;
        const x1 = st.foot.x + (st.top.x - st.foot.x) * t1;
        const y0 = st.foot.y + (st.top.y - st.foot.y) * t0;
        const y1 = st.foot.y + (st.top.y - st.foot.y) * t1;
        this.line({ x: x0, y: y0 }, { x: x0, y: y1 }, 0.05, COLORS.stair);
        this.line({ x: x0, y: y1 }, { x: x1, y: y1 }, 0.05, COLORS.stair);
      }
    }
    // Ladder.
    for (const l of L.ladders) {
      this.line({ x: l.x - 0.25, y: l.y0 }, { x: l.x - 0.25, y: l.y1 + 0.8 }, 0.06, COLORS.ladder);
      this.line({ x: l.x + 0.25, y: l.y0 }, { x: l.x + 0.25, y: l.y1 + 0.8 }, 0.06, COLORS.ladder);
      for (let y = l.y0 + 0.3; y <= l.y1 + 0.6; y += 0.4) this.line({ x: l.x - 0.25, y }, { x: l.x + 0.25, y }, 0.05, COLORS.ladder);
    }
    // Doors and window frames.
    for (const d of L.doors) {
      const r = d.rect;
      this.line({ x: r.x0 - 0.05, y: r.y0 }, { x: r.x0 - 0.05, y: r.y1 }, 0.06, COLORS.door);
      this.line({ x: r.x1 + 0.05, y: r.y0 }, { x: r.x1 + 0.05, y: r.y1 }, 0.06, COLORS.door);
      this.line({ x: r.x0 - 0.05, y: r.y1 }, { x: r.x1 + 0.05, y: r.y1 }, 0.06, COLORS.door);
    }
    for (const wdw of L.windows) {
      this.line({ x: wdw.x0, y: wdw.y1 }, { x: wdw.x1, y: wdw.y1 }, 0.06, COLORS.door);
    }
    // Floor labels.
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 ${Math.max(10, 0.45 * this.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const f of L.floors) ctx.fillText(f.name, this.sx(24.7), this.sy(f.y + 0.8));
    void state;
  }

  private drawFlag(state: MatchState, opt: RenderOptions) {
    const L = this.level;
    const z = L.flagZone;
    const cap = state.capture;
    const pulse = cap.state === 'CAPTURING' ? 0.12 + 0.08 * Math.sin(opt.now / 120) : cap.state === 'CONTESTED' ? 0.18 : 0.08;
    this.ctx.globalAlpha = pulse + 0.1;
    this.rect(z.x0, z.y0, z.x1, z.y1, cap.state === 'CONTESTED' ? '#ff5577' : COLORS.flag);
    this.ctx.globalAlpha = 1;
    this.rect(z.x0, z.y0, z.x1, z.y0 + 0.08, COLORS.flag);

    const x = L.flagPoleX;
    this.line({ x, y: 16 }, { x, y: 19.4 }, 0.08, '#D1D5DB');
    const color = mixColor(opt.palette.defender, opt.palette.attacker, cap.progress);
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    const wave = Math.sin(opt.now / 200) * 0.08;
    ctx.moveTo(this.sx(x), this.sy(19.4));
    ctx.lineTo(this.sx(x + 1.6), this.sy(19.1 + wave));
    ctx.lineTo(this.sx(x), this.sy(18.6));
    ctx.closePath();
    ctx.fill();
  }

  // ---------- Fighters ----------
  private drawFighter(state: MatchState, f: Fighter, alpha: number, opt: RenderOptions) {
    const ctx = this.ctx;
    const x = f.prevPos.x + (f.pos.x - f.prevPos.x) * alpha;
    const y = f.prevPos.y + (f.pos.y - f.prevPos.y) * alpha;
    const pal = opt.palette;
    let a = 1;
    if (!isAlive(f)) {
      const since = state.tick - f.deathTick - TUNING.combat.bodyFadeTicks;
      a = since > 0 ? Math.max(0, 1 - since / 30) : 1;
      if (a <= 0) return;
    } else if (f.spawnProtected && Math.floor(state.tick / 6) % 2 === 0) a = 0.4;

    const flashing = state.tick < f.flashUntil;
    const base = f.team === 'ATTACKER' ? pal.attacker : pal.defender;
    const dark = f.team === 'ATTACKER' ? pal.attackerDark : pal.defenderDark;
    const front = flashing ? '#FFFFFF' : base;
    const back = flashing ? '#DDDDDD' : dark;
    const pose = this.blendedPose(f, poseFor(f, state.tick), state.tick);
    const grounded = f.mode === 'GROUND' || f.mode === 'STAIR';
    const j = solveRig(pose, f.scale, grounded, WEAPON_LENGTH[f.weapon]);
    const W = (p: Vec): Vec => ({ x: x + f.facing * p.x, y: y + p.y });
    const thick = f.isBoss ? 0.09 : 0.07;
    const cos = f.isBoss && f.playerIndex >= 0 ? opt.cosmetics?.[f.playerIndex] ?? null : null;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const seg = (p: Vec, q: Vec, color: string, wdt = thick) => {
      if (pal.outline) this.line(W(p), W(q), wdt + 0.04, '#000000');
      this.line(W(p), W(q), wdt, color);
    };
    // Back limbs.
    seg(j.shoulder, j.elbowB, back); seg(j.elbowB, j.handB, back);
    seg(j.hip, j.kneeB, back); seg(j.kneeB, j.footB, back);
    // Torso and front leg.
    seg(j.hip, j.shoulder, front, thick * 1.15);
    seg(j.shoulder, j.neckTop, front);
    seg(j.hip, j.kneeF, front); seg(j.kneeF, j.footF, front);
    // Head.
    const h = W(j.head);
    ctx.beginPath();
    ctx.arc(this.sx(h.x), this.sy(h.y), 0.18 * f.scale * this.scale, 0, Math.PI * 2);
    ctx.fillStyle = '#1f2330';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, thick * this.scale);
    ctx.strokeStyle = front;
    ctx.stroke();
    if (cos?.hat) drawHat(ctx, this.sx(h.x), this.sy(h.y), 0.18 * f.scale * this.scale, f.facing, cos.hat);
    // Weapon then front arm (hand over handle).
    const tip = W(j.weaponTip);
    if (f.weapon !== 'FISTS') this.drawWeapon(f, W(j.handF), tip, cos?.weapon ?? null);
    if (cos?.trail && this.fx && isAlive(f) && attackPhase(f) === 'active') {
      const m = getMove(f.moveId);
      const kick = m?.category === 'kick' || !!m?.id.includes('kick') || m?.id === 'knee' || m?.id === 'sweep';
      const end = f.weapon !== 'FISTS' && m?.category === 'weapon' ? tip : W(kick ? j.footF : j.handF);
      this.fx.trail(end.x, end.y, cos.trail.colors);
    }
    seg(j.shoulder, j.elbowF, front); seg(j.elbowF, j.handF, front);
    ctx.restore();

    if (isAlive(f)) this.drawMarkers(state, f, x, y, j, opt, a);
    if (f.comboHits >= 2 && isAlive(f)) {
      ctx.save();
      ctx.font = `900 ${Math.max(12, 0.42 * this.scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#F4D35E';
      const ty = this.sy(y + 2.75 * f.scale);
      ctx.strokeText(`${f.comboHits} HITS`, this.sx(x), ty);
      ctx.fillText(`${f.comboHits} HITS`, this.sx(x), ty);
      ctx.restore();
    }
  }

  private blendedPose(f: Fighter, target: Pose, tick: number): Pose {
    const key = `${f.action}:${f.moveId ?? ''}:${f.mode === 'AIR' ? 'air' : ''}${f.crouching ? 'c' : ''}`;
    let m = this.poseMemory.get(f.id);
    if (!m || tick < m.since) {
      m = { key, from: target, since: tick, last: target };
      this.poseMemory.set(f.id, m);
    } else if (m.key !== key) {
      m.key = key;
      m.from = m.last;
      m.since = tick;
    }
    const t = Math.min(1, (tick - m.since) / BLEND_TICKS);
    const out = t >= 1 || f.action === 'DEAD' ? target : mixPose(m.from, target, t * t * (3 - 2 * t));
    m.last = out;
    return out;
  }

  private drawWeapon(f: Fighter, hand: Vec, tip: Vec, skin: WeaponStyle | null = null) {
    const ctx = this.ctx;
    if (skin?.glow) {
      ctx.save();
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = 0.25 * this.scale;
    }
    if (f.weapon === 'IRON_BAR') {
      this.line(hand, tip, 0.07, skin?.bar ?? '#8b93a1');
      if (skin?.glow) ctx.restore();
      return;
    }
    // Sword: short hilt behind the hand, blade forward.
    const dx = tip.x - hand.x;
    const dy = tip.y - hand.y;
    const guard = { x: hand.x + dx * 0.18, y: hand.y + dy * 0.18 };
    this.line(hand, guard, 0.06, skin?.hilt ?? '#7a5230');
    this.line(guard, tip, 0.05, skin?.blade ?? '#e5e7eb');
    const nx = -dy * 0.12;
    const ny = dx * 0.12;
    this.line({ x: guard.x - nx, y: guard.y - ny }, { x: guard.x + nx, y: guard.y + ny }, 0.05, skin?.guard ?? '#c9a227');
    if (skin?.glow) ctx.restore();
  }

  private drawMarkers(state: MatchState, f: Fighter, x: number, y: number, j: Joints, opt: RenderOptions, a: number) {
    const ctx = this.ctx;
    const pal = opt.palette;
    const color = f.team === 'ATTACKER' ? pal.attacker : pal.defender;
    const topY = y + Math.max(j.head.y + 0.25, 0.6) + 0.15;
    const cx = this.sx(x);
    const cy = this.sy(topY + 0.25);
    const r = 0.16 * this.scale;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (f.team === 'ATTACKER') {
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath();
    } else {
      ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
    }
    ctx.fill();
    ctx.stroke();

    ctx.font = `700 ${Math.max(9, 0.34 * this.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (f.isBoss) {
      // Crown + player tag.
      const crY = cy - r * 2.1;
      ctx.fillStyle = '#F4D35E';
      ctx.beginPath();
      ctx.moveTo(cx - r, crY + r * 0.5); ctx.lineTo(cx - r, crY - r * 0.3); ctx.lineTo(cx - r * 0.5, crY + r * 0.1);
      ctx.lineTo(cx, crY - r * 0.5); ctx.lineTo(cx + r * 0.5, crY + r * 0.1); ctx.lineTo(cx + r, crY - r * 0.3);
      ctx.lineTo(cx + r, crY + r * 0.5); ctx.closePath(); ctx.fill();
      const tag = state.config.controllers[f.playerIndex as 0 | 1] === 'CPU' ? 'CPU' : `P${f.playerIndex + 1}`;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(tag, cx + r * 2.3, cy);
    } else {
      ctx.fillStyle = COLORS.text;
      const cmd = state.squads[f.team].command[0];
      ctx.fillText(`${f.botIndex}${cmd}`, cx + r * 2.6, cy);
    }
    // Health bar.
    const bw = 0.8 * this.scale;
    const bh = Math.max(3, 0.08 * this.scale);
    const by = cy + r * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - bw / 2, by, bw, bh);
    ctx.fillStyle = f.hp / f.maxHp < 0.25 ? '#ef4444' : color;
    ctx.fillRect(cx - bw / 2, by, bw * (f.hp / f.maxHp), bh);
    ctx.restore();
  }

  private drawFx(fx: Fx) {
    const ctx = this.ctx;
    for (const p of fx.particles()) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const s = p.size * this.scale;
      ctx.fillRect(this.sx(p.x) - s / 2, this.sy(p.y) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of fx.markers) {
      ctx.globalAlpha = Math.min(1, m.life / (m.max * 0.4));
      ctx.font = `900 ${Math.max(12, 0.6 * this.scale)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(m.text, this.sx(m.x), this.sy(m.y));
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, this.sx(m.x), this.sy(m.y));
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Debug overlay (F3) ----------
  private drawDebug(state: MatchState) {
    const ctx = this.ctx;
    const L = this.level;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (const s of L.solids) ctx.strokeRect(this.sx(s.x0), this.sy(s.y1), (s.x1 - s.x0) * this.scale, (s.y1 - s.y0) * this.scale);
    const nodes = new Map(L.nav.nodes.map((n) => [n.id, n]));
    ctx.strokeStyle = 'rgba(80,220,255,0.6)';
    for (const e of L.nav.edges) {
      const a = nodes.get(e.a)!;
      const b = nodes.get(e.b)!;
      ctx.setLineDash(e.type === 'drop' ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(this.sx(a.x), this.sy(a.y + 0.2));
      ctx.lineTo(this.sx(b.x), this.sy(b.y + 0.2));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(80,220,255,0.9)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (const n of L.nav.nodes) {
      ctx.fillRect(this.sx(n.x) - 3, this.sy(n.y + 0.2) - 3, 6, 6);
      ctx.fillText(n.id, this.sx(n.x), this.sy(n.y + 0.55));
    }
    for (const f of state.fighters) {
      if (!isAlive(f)) continue;
      const hb = hurtbox(f);
      ctx.strokeStyle = 'rgba(80,255,120,0.8)';
      ctx.strokeRect(this.sx(hb.x0), this.sy(hb.y1), (hb.x1 - hb.x0) * this.scale, (hb.y1 - hb.y0) * this.scale);
      const ab = hitbox(f);
      if (ab) {
        ctx.fillStyle = 'rgba(255,60,60,0.45)';
        ctx.fillRect(this.sx(ab.x0), this.sy(ab.y1), (ab.x1 - ab.x0) * this.scale, (ab.y1 - ab.y0) * this.scale);
      }
      const mem = state.bots[f.id];
      ctx.fillStyle = '#fff';
      ctx.fillText(`${f.action}${mem ? ' ' + mem.fsm : ''} ${f.mode}`, this.sx(f.pos.x), this.sy(f.pos.y - 0.35));
    }
  }

  // ---------- HUD ----------
  private drawHud(state: MatchState, opt: RenderOptions) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const fs = Math.max(11, Math.min(18, h / 48));
    const pal = opt.palette;
    ctx.textBaseline = 'middle';

    const panelW = Math.min(w * 0.36, 460);
    this.teamPanel(state, 'ATTACKER', 10, 8, panelW, fs, pal.attacker);
    this.teamPanel(state, 'DEFENDER', w - panelW - 10, 8, panelW, fs, pal.defender);

    // Timer.
    const secs = Math.ceil(state.timeLeftTicks / 60);
    const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const tw = fs * 5.2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, w / 2 - tw / 2, 8, tw, fs * 2.3, 8);
    ctx.fill();
    ctx.fillStyle = secs <= 30 ? '#ef4444' : COLORS.text;
    ctx.font = `800 ${fs * 1.6}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(timer, w / 2, 8 + fs * 1.15);

    // Capture bar.
    const cap = state.capture;
    const bw = Math.min(w * 0.24, 320);
    const by = 8 + fs * 2.6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, w / 2 - bw / 2 - 6, by, bw + 12, fs * 2.2, 6);
    ctx.fill();
    ctx.fillStyle = '#374151';
    ctx.fillRect(w / 2 - bw / 2, by + fs * 1.15, bw, fs * 0.75);
    ctx.fillStyle = cap.state === 'CONTESTED' ? '#ff5577' : COLORS.flag;
    ctx.fillRect(w / 2 - bw / 2, by + fs * 1.15, bw * cap.progress, fs * 0.75);
    ctx.font = `700 ${fs * 0.8}px system-ui, sans-serif`;
    ctx.fillStyle = COLORS.text;
    const label = cap.state === 'IDLE' ? 'FLAG' : cap.state;
    ctx.fillText(`${label}  ${Math.round(cap.progress * 100)}%`, w / 2, by + fs * 0.55);

    // Toasts.
    let ty = by + fs * 3;
    ctx.font = `700 ${fs * 0.9}px system-ui, sans-serif`;
    for (const t of opt.toasts) {
      if (t.until < opt.now) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const tw2 = ctx.measureText(t.text).width + fs * 1.4;
      roundRect(ctx, w / 2 - tw2 / 2, ty - fs * 0.7, tw2, fs * 1.4, 6);
      ctx.fill();
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, w / 2, ty);
      ty += fs * 1.6;
    }

    // Player footers.
    this.playerFooter(state, 0, fs, opt);
    this.playerFooter(state, 1, fs, opt);

    // Banners.
    for (const b of opt.banners) {
      if (b.until < opt.now) continue;
      const life = (opt.now - b.start) / (b.until - b.start);
      const alphaB = life < 0.1 ? life / 0.1 : life > 0.8 ? (1 - life) / 0.2 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, alphaB));
      ctx.font = `900 ${fs * 3.2}px system-ui, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(b.text, w / 2, h * 0.45);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, w / 2, h * 0.45);
      if (b.sub) {
        ctx.font = `700 ${fs * 1.3}px system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeText(b.sub, w / 2, h * 0.45 + fs * 2.6);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(b.sub, w / 2, h * 0.45 + fs * 2.6);
      }
      ctx.globalAlpha = 1;
    }

    if (opt.showFps || opt.debug) {
      ctx.font = `12px monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9ef';
      const extra = opt.debug ? `  step ${opt.stepMs.toFixed(2)}ms  seed ${state.seed}  tick ${state.tick}` : '';
      ctx.fillText(`${opt.fps.toFixed(0)} fps${extra}`, 12, h - fs * 3.2);
    }
    if (opt.smallWindow) {
      ctx.font = `600 ${fs * 0.8}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('Enlarge your window (1280×720 or more) for the best experience', w / 2, h - fs * 3.2);
    }
  }

  private teamPanel(state: MatchState, team: Team, x: number, y: number, pw: number, fs: number, color: string) {
    const ctx = this.ctx;
    const boss = state.fighters.find((f) => f.team === team && f.isBoss)!;
    const bots = state.fighters.filter((f) => f.team === team && !f.isBoss);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, y, pw, fs * 5.1, 8);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    const shape = team === 'ATTACKER' ? '▲' : '■';
    const ctrl = state.config.controllers[boss.playerIndex as 0 | 1];
    const name = this.names?.[boss.playerIndex as 0 | 1];
    const who = ctrl === 'CPU' ? 'CPU' : name ? name : `P${boss.playerIndex + 1}`;
    ctx.fillText(`${shape} ${team === 'ATTACKER' ? 'ATTACKERS' : 'DEFENDERS'} · ${who}`, x + 10, y + fs * 0.9);

    const barX = x + 10;
    const barW = pw - 20;
    const barY = y + fs * 1.7;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(barX, barY, barW, fs * 0.9);
    ctx.fillStyle = isAlive(boss) ? color : '#4b5563';
    ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), fs * 0.9);
    ctx.font = `700 ${fs * 0.75}px system-ui, sans-serif`;
    ctx.fillStyle = COLORS.text;
    const bossText = isAlive(boss) ? `${Math.ceil(boss.hp)}/${boss.maxHp}` : `KO — respawn ${Math.max(0, Math.ceil((boss.respawnAt - state.tick) / 60))}`;
    ctx.fillText(bossText, barX + 6, barY + fs * 0.47);

    // Stamina (green) and energy (violet) gauges.
    const gY = y + fs * 2.95;
    const gW = (barW - 8) / 2;
    const gauge = (gx: number, frac: number, col: string, label: string) => {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(gx, gY, gW, fs * 0.38);
      ctx.fillStyle = col;
      ctx.fillRect(gx, gY, gW * Math.max(0, Math.min(1, frac)), fs * 0.38);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 ${fs * 0.5}px system-ui, sans-serif`;
      ctx.fillText(label, gx, gY - fs * 0.25);
    };
    gauge(barX, boss.stamina / TUNING.combat.stamina.max, '#34d399', 'STAMINA');
    gauge(barX + gW + 8, boss.energy / TUNING.combat.energy.max, boss.energy >= 50 ? '#c084fc' : '#7c3aed', 'ENERGY');

    const pipW = (barW - 2 * 8) / 3;
    const pipY = y + fs * 3.95;
    bots.forEach((b, i) => {
      const px = barX + i * (pipW + 8);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(px, pipY, pipW, fs * 0.7);
      ctx.fillStyle = isAlive(b) ? color : '#4b5563';
      ctx.fillRect(px, pipY, pipW * (b.hp / b.maxHp), fs * 0.7);
      ctx.fillStyle = COLORS.text;
      ctx.font = `700 ${fs * 0.6}px system-ui, sans-serif`;
      const t = isAlive(b) ? `${b.botIndex}` : `${b.botIndex} · ${Math.max(0, Math.ceil((b.respawnAt - state.tick) / 60))}s`;
      ctx.fillText(t, px + 4, pipY + fs * 0.36);
    });
  }

  private playerFooter(state: MatchState, player: 0 | 1, fs: number, opt: RenderOptions) {
    const ctx = this.ctx;
    const boss = state.fighters.find((f) => f.isBoss && f.playerIndex === player)!;
    const ctrl = state.config.controllers[player];
    const color = boss.team === 'ATTACKER' ? opt.palette.attacker : opt.palette.defender;
    // Online: only the local player's hints are given (null = don't show).
    const L = opt.controlHints ? opt.controlHints[player] : (player === 0 ? CONTROL_LABELS.p1 : CONTROL_LABELS.p2);
    const cmd = state.squads[boss.team].command;
    const weapon = boss.weapon === 'IRON_BAR' ? 'IRON BAR' : boss.weapon === 'SHORT_SWORD' ? 'SWORD' : 'FISTS';
    const who = this.names?.[player] ?? `P${player + 1}`;
    const main = ctrl === 'CPU'
      ? `CPU · ${boss.team} · squad ${cmd} · ${weapon}`
      : `${who} · squad ${cmd}${L ? ` [${L.command}]` : ''} · ${weapon}`;
    const hint = !L ? '' : `${L.move} move · ${L.jumpClimb} jump · ${L.down} crouch · ${L.punch} punch · ${L.kick} kick · ${L.heavy} heavy · ${L.weapon} ${boss.weapon === 'FISTS' ? 'elbow' : 'weapon'} · ${L.special} special · ${L.block} block · ${L.dodge} dodge`;
    const x = player === 0 ? 12 : this.w - 12;
    ctx.textAlign = player === 0 ? 'left' : 'right';
    ctx.font = `800 ${fs * 0.85}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    const showHint = opt.showHints && ctrl === 'HUMAN' && !!hint;
    ctx.fillText(main, x, this.h - fs * (showHint ? 2.0 : 1.0));
    if (showHint) {
      ctx.font = `500 ${fs * 0.68}px system-ui, sans-serif`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(hint, x, this.h - fs * 0.85);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mixColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
