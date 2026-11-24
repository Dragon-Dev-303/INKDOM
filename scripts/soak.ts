/**
 * Long soak run: `npm run soak -- 500` (default 200 matches).
 * Exits with code 1 if any invariant fails or a bot needed a forced respawn.
 */
import { runSoak } from './soakCore';

const n = Number(process.argv[2] ?? 200);
const seed = Number(process.argv[3] ?? 1);
const r = runSoak(n, seed);
console.log(`Matches: ${r.matches}`);
console.log(`Wins: attacker ${r.wins.ATTACKER}, defender ${r.wins.DEFENDER} (captures ${r.captures})`);
console.log(`Average match: ${r.avgMinutes.toFixed(2)} min`);
console.log(`Stuck recoveries: teleport ${r.level2Stuck}, forced respawn ${r.level3Stuck}`);
console.log(`Speed: ${r.msPerMatch.toFixed(0)} ms per match`);
if (r.failures.length) {
  console.error('FAILURES:');
  for (const f of r.failures) console.error('  ' + f);
}
process.exit(r.failures.length || r.level3Stuck ? 1 : 0);
