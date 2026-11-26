/**
 * Dev helper: ASCII view of generated clips. Usage: npx tsx tools/mocap/ascii.ts <clipId> [frame ...]
 * Default frames: 0, contact, last. Facing right (+x); '#' = F (right) limbs, '+' = B (left) limbs.
 */
import { MOCAP_CLIPS } from '../../src/game/anim/data/mocap.generated';
import { asciiPose } from './preview';
import type { Tracks } from './retarget';

const [id, ...fr] = process.argv.slice(2);
const c = MOCAP_CLIPS[id];
if (!c) { console.error(`unknown clip ${id}; have ${Object.keys(MOCAP_CLIPS).join(', ')}`); process.exit(1); }
const frames = fr.length ? fr.map(Number) : [0, Math.round(c.contact / 2), c.contact, c.length - 1];
const pics = frames.map((f) => asciiPose(c.tracks as Tracks, f).split('\n'));
console.log(frames.map((f) => `frame ${f}${f === c.contact ? ' (contact)' : ''}`.padEnd(44)).join(' | '));
for (let r = 0; r < pics[0].length; r++) console.log(pics.map((p) => p[r]).join(' | '));
