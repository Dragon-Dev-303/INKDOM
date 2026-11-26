/** Parser for Acclaim AMC motion files. Values are kept raw (degrees / ASF length units). */

export interface Amc {
  /** frames[i][bone] = channel values in the order of the ASF dof (root: TX TY TZ RX RY RZ per ASF root order) */
  frames: Record<string, number[]>[];
  /** 1-based frame numbers as written in the file */
  frameNumbers: number[];
}

export function parseAmc(text: string): Amc {
  const frames: Record<string, number[]>[] = [];
  const frameNumbers: number[] = [];
  let cur: Record<string, number[]> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(':')) continue;
    if (/^\d+$/.test(line)) {
      cur = {};
      frames.push(cur);
      frameNumbers.push(Number(line));
      continue;
    }
    if (!cur) continue;
    const p = line.split(/\s+/);
    cur[p[0]] = p.slice(1).map(Number);
  }
  return { frames, frameNumbers };
}
