import { createMatch, stepMatch } from '../src/game/sim/match';
import { EMPTY_INPUT, type GameEvent } from '../src/game/sim/types';
const tot = { atkKo: 0, defKo: 0, contested: 0, capturing: 0, firstRoof: 0, n: 0, defInZone: 0 };
for (let m = 0; m < 30; m++) {
  const s = createMatch({ p1Team: 'ATTACKER', weapons: ['SHORT_SWORD', 'IRON_BAR'], controllers: ['CPU', 'CPU'] }, 100 + m);
  let firstRoof = -1;
  while (s.phase !== 'ENDED' && s.tick < 20000) {
    const ev: GameEvent[] = [];
    stepMatch(s, [EMPTY_INPUT, EMPTY_INPUT], ev);
    if (s.phase !== 'PLAYING') continue;
    for (const e of ev) if (e.type === 'KO') { if (s.fighters[e.victim].team === 'ATTACKER') tot.defKo++; else tot.atkKo++; }
    if (s.capture.state === 'CONTESTED') tot.contested++;
    if (s.capture.state === 'CAPTURING') tot.capturing++;
    if (firstRoof < 0 && s.fighters.some(f => f.team === 'ATTACKER' && f.floor === 4)) firstRoof = s.playTicks;
  }
  tot.firstRoof += firstRoof; tot.n++;
}
console.log('KOs by attackers', tot.atkKo / 30, 'KOs by defenders', tot.defKo / 30, 'contested s', (tot.contested / 30 / 60).toFixed(1), 'capturing s', (tot.capturing / 30 / 60).toFixed(1), 'first roof s', (tot.firstRoof / 30 / 60).toFixed(1));
