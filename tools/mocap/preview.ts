/**
 * SVG flipbook previews of built clips (sanity check). Uses the same FK as the game rig
 * (src/game/render/rig.ts), re-implemented here so the tool has no game imports.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Tracks } from './retarget';

const B = { thigh: 0.42, shin: 0.42, torso: 0.55, neck: 0.08, headR: 0.18, upperArm: 0.3, forearm: 0.28 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
interface P { x: number; y: number }
const limb = (f: P, l: number, a: number): P => ({ x: f.x + l * Math.sin(a), y: f.y - l * Math.cos(a) });

export function poseJoints(t: Tracks, i: number) {
  const g = (k: keyof Tracks) => t[k][i];
  const eF = clamp(g('eF'), 0, 2.62), eB = clamp(g('eB'), 0, 2.62), kF = clamp(g('kF'), 0, 2.62), kB = clamp(g('kB'), 0, 2.62);
  const hip = { x: g('rootDx'), y: B.thigh + B.shin - g('drop') + g('rootDy') };
  const sh = { x: hip.x + B.torso * Math.sin(g('torso')), y: hip.y + B.torso * Math.cos(g('torso')) };
  const na = g('torso') + g('neck');
  const nt = { x: sh.x + B.neck * Math.sin(na), y: sh.y + B.neck * Math.cos(na) };
  const head = { x: nt.x + B.headR * Math.sin(na), y: nt.y + B.headR * Math.cos(na) };
  const elF = limb(sh, B.upperArm, g('aF')), haF = limb(elF, B.forearm, g('aF') + eF);
  const elB = limb(sh, B.upperArm, g('aB')), haB = limb(elB, B.forearm, g('aB') + eB);
  const knF = limb(hip, B.thigh, g('hF')), ftF = limb(knF, B.shin, g('hF') - kF);
  const knB = limb(hip, B.thigh, g('hB')), ftB = limb(knB, B.shin, g('hB') - kB);
  return { hip, sh, nt, head, elF, haF, elB, haB, knF, ftF, knB, ftB };
}

export function writePreview(dir: string, c: { id: string; length: number; contact: number; tracks: Tracks }): void {
  mkdirSync(dir, { recursive: true });
  const step = 3;
  const idx: number[] = [];
  for (let i = 0; i < c.length; i += step) idx.push(i);
  if (!idx.includes(c.contact)) idx.push(c.contact);
  idx.sort((a, b) => a - b);
  const cols = 8, cell = 200, s = 90;
  const rows = Math.ceil(idx.length / cols);
  const parts: string[] = [];
  idx.forEach((fi, n) => {
    const j = poseJoints(c.tracks, fi);
    const ox = (n % cols) * cell + cell / 2 - c.tracks.rootDx[fi] * s * 0.0, oy = Math.floor(n / cols) * cell + cell - 20;
    const X = (p: P) => (ox + (p.x - c.tracks.rootDx[fi]) * s).toFixed(1);
    const Y = (p: P) => (oy - p.y * s).toFixed(1);
    const line = (a: P, b: P, col: string, w = 3) => `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
    const hit = fi === c.contact;
    parts.push(`<rect x="${(n % cols) * cell}" y="${Math.floor(n / cols) * cell}" width="${cell}" height="${cell}" fill="${hit ? '#fff3d6' : '#fafafa'}" stroke="#ddd"/>`);
    parts.push(`<line x1="${(n % cols) * cell}" y1="${oy}" x2="${(n % cols) * cell + cell}" y2="${oy}" stroke="#bbb"/>`);
    parts.push(line(j.hip, j.knB, '#99a'), line(j.knB, j.ftB, '#99a'), line(j.sh, j.elB, '#99a'), line(j.elB, j.haB, '#99a'));
    parts.push(line(j.hip, j.sh, '#222', 4), line(j.sh, j.nt, '#222'));
    parts.push(`<circle cx="${X(j.head)}" cy="${Y(j.head)}" r="${(0.18 * s * 0.9).toFixed(1)}" fill="none" stroke="#222" stroke-width="3"/>`);
    parts.push(line(j.hip, j.knF, '#c33'), line(j.knF, j.ftF, '#c33'), line(j.sh, j.elF, '#c33'), line(j.elF, j.haF, '#c33'));
    parts.push(`<text x="${(n % cols) * cell + 6}" y="${Math.floor(n / cols) * cell + 16}" font-size="13" font-family="monospace">${fi}${hit ? ' CONTACT' : ''}</text>`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}">${parts.join('')}</svg>`;
  writeFileSync(path.join(dir, `${c.id}.svg`), svg);
}

/** Tiny ASCII rendering of one frame (for terminal sanity checks). F limbs = '#', B limbs = '+', torso/head = 'o'. */
export function asciiPose(t: Tracks, i: number, w = 44, h = 22): string {
  const j = poseJoints(t, i);
  const grid = Array.from({ length: h }, () => Array(w).fill(' '));
  const s = 16; // chars per unit (x), rows per unit = s/2
  const ox = Math.round(w / 2 - 2), oy = h - 2;
  const put = (x: number, y: number, ch: string) => {
    const cx = Math.round(ox + (x - t.rootDx[i]) * s), cy = Math.round(oy - y * s * 0.5);
    if (cx >= 0 && cx < w && cy >= 0 && cy < h) grid[cy][cx] = ch;
  };
  const seg = (a: P, b: P, ch: string) => { for (let k = 0; k <= 12; k++) put(a.x + ((b.x - a.x) * k) / 12, a.y + ((b.y - a.y) * k) / 12, ch); };
  for (let x = 0; x < w; x++) grid[oy][x] = '_';
  seg(j.hip, j.knB, '+'); seg(j.knB, j.ftB, '+'); seg(j.sh, j.elB, '+'); seg(j.elB, j.haB, '+');
  seg(j.hip, j.sh, 'o'); seg(j.sh, j.head, 'o'); put(j.head.x, j.head.y, '@');
  seg(j.hip, j.knF, '#'); seg(j.knF, j.ftF, '#'); seg(j.sh, j.elF, '#'); seg(j.elF, j.haF, '#');
  return grid.map((r) => r.join('')).join('\n');
}
