'use client';

import Link from 'next/link';
import { useState } from 'react';
import { bindingLabel, type Action } from '@/game/config/controls';
import { useBindings } from './hooks';
import { Chip, HubPage, Meter, Panel } from './ui';

interface Step {
  id: string;
  title: string;
  goal: string;
  tips: string[];
  keys: Action[];
}

const STEPS: Step[] = [
  { id: 'move', title: 'Movement', goal: 'Run, jump, crouch and climb the stairs to floor 2.', tips: ['Hold up at the foot of a stair or ladder to climb.', 'Hold down at the top to go back down.'], keys: ['left', 'right', 'up', 'down'] },
  { id: 'combat', title: 'Combat basics', goal: 'Land punches and kicks, block a heavy and dodge through an attack.', tips: ['Hold block; add down to block lows.', 'Dodge is invulnerable but costs stamina.'], keys: ['punch', 'kick', 'heavy', 'block', 'dodge'] },
  { id: 'combos', title: 'Combos', goal: 'Chain three hits: punch, punch, kick.', tips: ['Press the next button during the hit to chain.', 'See the full list on the Move list screen.'], keys: ['punch', 'kick', 'special'] },
  { id: 'squad', title: 'Squad orders', goal: 'Order your squad to follow, hold and attack.', tips: ['The command key cycles FOLLOW → HOLD → ATTACK.', 'The Commander overlay previews all six orders.'], keys: ['command'] },
  { id: 'flag', title: 'Flag capture', goal: 'Reach the roof and hold the flag until the bar fills.', tips: ['Attackers win by capturing; defenders win if time runs out.', 'Clear the stairwell before you push up.'], keys: ['up', 'weapon'] },
];

export default function TutorialScreen() {
  const bindings = useBindings('solo');
  const [done, setDone] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <HubPage featureId="tutorial" actions={<Link href="/play" className="btn primary">▶ Start practice</Link>}>
      <Panel title="Progress" icon="🎯" actions={<Link href="/moves" className="btn small">Move list</Link>}>
        <Meter label={`${done.size} of ${STEPS.length} lessons`} value={done.size} max={STEPS.length} showValue={`${Math.round((done.size / STEPS.length) * 100)}%`} tone="good" />
        <p className="muted small hub-mt">Guided lessons inside the match are coming; for now practise each step in a local match and tick it off here.</p>
      </Panel>
      <ol className="hub-steps hub-mt">
        {STEPS.map((s, i) => {
          const isDone = done.has(s.id);
          return (
            <li key={s.id} className={`hub-panel hub-step${isDone ? ' done' : ''}`}>
              <span className="hub-step-num" aria-hidden="true">{isDone ? '✓' : i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <h2>{s.title}</h2>
                <p style={{ margin: '4px 0 8px' }}>{s.goal}</p>
                <div className="hub-chips">
                  {s.keys.map((k) => <Chip key={k}><kbd>{bindingLabel(bindings, k)}</kbd> {k}</Chip>)}
                </div>
                <ul className="muted small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {s.tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div className="hub-row">
                <button className="btn small" aria-pressed={isDone} onClick={() => toggle(s.id)}>{isDone ? 'Undo' : 'Mark done'}</button>
                <Link href="/play" className="btn small">Practice</Link>
              </div>
            </li>
          );
        })}
      </ol>
    </HubPage>
  );
}
