import type { HatStyle } from '../config/shop';

/**
 * Draws a hat on a head (INKDOM_Payments_Plan.md §4). Screen space: (cx, cy) is the head
 * centre, r the head radius in pixels, facing ±1. Purely visual.
 */
export function drawHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, facing: number, style: HatStyle): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const f = facing >= 0 ? 1 : -1;
  switch (style.kind) {
    case 'headband': {
      ctx.strokeStyle = style.color;
      ctx.lineWidth = Math.max(2, r * 0.35);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.98, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      // Two tails behind the head.
      ctx.lineWidth = Math.max(1.5, r * 0.22);
      const bx = cx - f * r * 0.95;
      const by = cy - r * 0.45;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - f * r * 0.8, by - r * 0.1, bx - f * r * 1.5, by + r * 0.35);
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - f * r * 0.7, by + r * 0.3, bx - f * r * 1.2, by + r * 0.85);
      ctx.stroke();
      break;
    }
    case 'tophat': {
      const brimY = cy - r * 0.8;
      ctx.fillStyle = style.color;
      ctx.fillRect(cx - r * 1.25, brimY - r * 0.18, r * 2.5, r * 0.3);
      ctx.fillRect(cx - r * 0.75, brimY - r * 1.55, r * 1.5, r * 1.4);
      ctx.fillStyle = style.band;
      ctx.fillRect(cx - r * 0.75, brimY - r * 0.5, r * 1.5, r * 0.28);
      break;
    }
    case 'horns': {
      ctx.fillStyle = style.color;
      ctx.strokeStyle = '#3f3a2e';
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        const bx = cx + side * r * 0.55;
        const by = cy - r * 0.75;
        ctx.beginPath();
        ctx.moveTo(bx - side * r * 0.28, by + r * 0.1);
        ctx.quadraticCurveTo(bx + side * r * 0.75, by - r * 0.2, bx + side * r * 0.55, by - r * 1.2);
        ctx.quadraticCurveTo(bx + side * r * 0.25, by - r * 0.45, bx + side * r * 0.3, by + r * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'halo': {
      ctx.strokeStyle = style.color;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = r * 0.9;
      ctx.lineWidth = Math.max(2, r * 0.25);
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 1.55, r * 0.95, r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'crown': {
      const baseY = cy - r * 0.7;
      const w = r * 1.0;
      ctx.fillStyle = style.color;
      ctx.strokeStyle = '#7c5a00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - w, baseY);
      ctx.lineTo(cx - w, baseY - r * 0.9);
      ctx.lineTo(cx - w * 0.5, baseY - r * 0.45);
      ctx.lineTo(cx, baseY - r * 1.15);
      ctx.lineTo(cx + w * 0.5, baseY - r * 0.45);
      ctx.lineTo(cx + w, baseY - r * 0.9);
      ctx.lineTo(cx + w, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.gem;
      ctx.beginPath();
      ctx.arc(cx, baseY - r * 0.3, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
