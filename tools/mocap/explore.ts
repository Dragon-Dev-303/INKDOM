/**
 * Dev helper: list strike events per trial/limb with features (see events.ts).
 * Usage: npx tsx tools/mocap/explore.ts <subject> <trial> [punch|kick|knee|rise]
 */
import { loadTrial } from './load';
import { fmtEvent, strikeEvents } from './events';
import type { SignalKind } from './segment';

const [s, t, k] = process.argv.slice(2);
const tr = loadTrial(Number(s), Number(t));
console.log(`${s}_${t}: ${tr.frames.length} frames @ ${tr.fps} fps (${(tr.frames.length / tr.fps).toFixed(1)} s)`);
for (const kind of (k ? [k] : ['punch', 'kick']) as SignalKind[]) for (const side of ['R', 'L'] as const) {
  const ev = strikeEvents(tr, side, kind);
  console.log(`  ${kind} ${side}: ${ev.length} events`);
  for (const e of ev) console.log('    ' + fmtEvent(e, tr.fps));
}
