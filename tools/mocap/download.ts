/**
 * Download CMU mocap ASF skeletons + AMC motions into tools/mocap/.cache/.
 * Usage: npx tsx tools/mocap/download.ts
 * Files already present in the cache are skipped. The subject index page is
 * also cached so the per-trial frame rate can be read (some subjects are 60 fps).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CACHE_DIR = path.resolve(__dirname, '.cache');
const BASE = 'http://mocap.cs.cmu.edu';

/** subject → trials needed by build.ts */
export const TRIALS: Record<number, number[]> = {
  135: [4, 5, 7, 9, 10, 11],
  144: [5, 6, 7, 8, 13, 14, 20, 21, 26, 27],
  143: [23, 24],
  13: [17, 18],
  14: [1, 2, 3],
  86: [6],
  75: [16],
};

const pad = (n: number) => String(n).padStart(2, '0');

async function fetchText(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.text();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

async function cached(file: string, url: string): Promise<void> {
  const p = path.join(CACHE_DIR, file);
  if (existsSync(p)) return;
  process.stdout.write(`fetch ${url} ... `);
  const t = await fetchText(url);
  writeFileSync(p, t);
  console.log(`${(t.length / 1024).toFixed(0)} KB`);
}

/** Read the frame rate column from the cached subject page (defaults to 120). */
export function trialFps(subject: number, trial: number): number {
  const p = path.join(CACHE_DIR, `subject_${subject}.html`);
  if (!existsSync(p)) return 120;
  const html = readFileSync(p, 'utf8');
  const re = new RegExp(`${subject}_${pad(trial)}\\.amc[^]*?<TD>(\\d+)</TD>`, 'i');
  const m = html.match(re);
  return m ? Number(m[1]) : 120;
}

export async function downloadAll(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const [s, trials] of Object.entries(TRIALS)) {
    const subject = Number(s);
    await cached(`subject_${subject}.html`, `${BASE}/search.php?subjectnumber=${subject}`);
    await cached(`${subject}.asf`, `${BASE}/subjects/${subject}/${subject}.asf`);
    for (const t of trials) await cached(`${subject}_${pad(t)}.amc`, `${BASE}/subjects/${subject}/${subject}_${pad(t)}.amc`);
  }
}

export const cachePath = (file: string) => path.join(CACHE_DIR, file);
export const amcFile = (subject: number, trial: number) => `${subject}_${pad(trial)}.amc`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  downloadAll().then(() => {
    for (const [s, trials] of Object.entries(TRIALS)) for (const t of trials) console.log(`${s}_${pad(t)} fps=${trialFps(Number(s), t)}`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
