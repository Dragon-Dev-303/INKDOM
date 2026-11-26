'use client';

import { useEffect, useRef } from 'react';
import { resolveLoadout, type Loadout } from '@/game/config/shop';
import { drawHat } from '@/game/render/cosmetics';

/** Small canvas preview of a stickman wearing a loadout (uses the in-game hat drawing). */
export default function CosmeticPreview({ loadout, team = 'ATTACKER', size = 96 }: { loadout: Loadout; team?: 'ATTACKER' | 'DEFENDER'; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(loadout);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * 1.2 * dpr;
    ctx.setTransform((dpr * size) / 100, 0, 0, (dpr * size) / 100, 0, 0);
    ctx.clearRect(0, 0, 100, 120);
    const look = resolveLoadout(JSON.parse(key) as Loadout);
    const body = team === 'ATTACKER' ? '#E4572E' : '#2E86DE';
    const dark = team === 'ATTACKER' ? '#9E3A1E' : '#1D5C9C';
    const line = (x1: number, y1: number, x2: number, y2: number, color: string, w: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    // Trail dots behind the blade arc.
    if (look?.trail) {
      const cols = look.trail.colors;
      for (let i = 0; i < 14; i++) {
        const a = -1.9 + i * 0.12;
        ctx.fillStyle = cols[i % cols.length];
        ctx.globalAlpha = 0.25 + (i / 14) * 0.7;
        ctx.beginPath();
        ctx.arc(62 + Math.cos(a) * 32, 56 + Math.sin(a) * 32, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Back limbs, torso, legs.
    line(50, 48, 39, 62, dark, 5); line(39, 62, 37, 74, dark, 5);
    line(50, 76, 40, 92, dark, 5); line(40, 92, 36, 108, dark, 5);
    line(50, 76, 50, 46, body, 6);
    line(50, 76, 59, 92, body, 5); line(59, 92, 64, 108, body, 5);
    // Head.
    ctx.fillStyle = '#1f2330';
    ctx.strokeStyle = body;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(50, 32, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (look?.hat) drawHat(ctx, 50, 32, 10, 1, look.hat);
    // Sword.
    const w = look?.weapon;
    ctx.save();
    if (w?.glow) { ctx.shadowColor = w.glow; ctx.shadowBlur = 8; }
    line(70, 52, 74, 47, w?.hilt ?? '#7a5230', 4);
    line(74, 47, 92, 24, w?.blade ?? '#e5e7eb', 3.5);
    line(70, 44, 78, 50, w?.guard ?? '#c9a227', 3);
    ctx.restore();
    // Front arm over the handle.
    line(50, 48, 61, 58, body, 5); line(61, 58, 71, 51, body, 5);
  }, [key, size, team]);

  return <canvas ref={ref} className="cosmetic-preview" style={{ width: size, height: size * 1.2 }} aria-hidden />;
}
