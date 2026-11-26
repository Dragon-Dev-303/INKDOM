/** Load + solve a cached trial (positions in ASF units, CMU world frame, Y up). */
import { readFileSync } from 'node:fs';
import { parseAsf, type Asf } from './asf';
import { parseAmc } from './amc';
import { solveMotion, type V3 } from './fk';
import { amcFile, cachePath, trialFps } from './download';

export interface Trial {
  subject: number;
  trial: number;
  fps: number;
  asf: Asf;
  frames: Record<string, V3>[];
}

const memo = new Map<string, Trial>();

export function loadTrial(subject: number, trial: number): Trial {
  const key = `${subject}_${trial}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const asf = parseAsf(readFileSync(cachePath(`${subject}.asf`), 'utf8'));
  const amc = parseAmc(readFileSync(cachePath(amcFile(subject, trial)), 'utf8'));
  const t: Trial = { subject, trial, fps: trialFps(subject, trial), asf, frames: solveMotion(asf, amc) };
  memo.set(key, t);
  return t;
}
