'use client';

import { useMemo, useState } from 'react';
import { formatInputs, listMoveDocs, type MoveCategory, type MoveDoc } from '@/game/combat/movelist';
import { useBindings } from './hooks';
import { Chip, Empty, HubPage, Panel } from './ui';

const CATEGORY_LABELS: Record<MoveCategory, string> = {
  punch: 'Punches', kick: 'Kicks', heavy: 'Heavy', weapon: 'Weapon', special: 'Specials', air: 'Air',
  crouch: 'Crouching', directional: 'Directional', chord: 'Chords', defense: 'Defence',
};
const ORDER = Object.keys(CATEGORY_LABELS) as MoveCategory[];

/** Live move list generated from the move database (INKDOM_v2_Plan.md §2.2). */
export default function MovesScreen() {
  const bindings = useBindings('solo');
  const moves = useMemo<MoveDoc[]>(() => {
    try {
      return listMoveDocs();
    } catch {
      return [];
    }
  }, []);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<MoveCategory | 'all'>('all');

  const q = query.trim().toLowerCase();
  const filtered = moves.filter(
    (m) =>
      (cat === 'all' || m.category === cat) &&
      (!q || `${m.name} ${m.description} ${m.properties.join(' ')} ${m.requires ?? ''}`.toLowerCase().includes(q)),
  );
  const present = ORDER.filter((c) => moves.some((m) => m.category === c));

  return (
    <HubPage featureId="moves" lead="Every move with its inputs (your current key bindings) and frame data at 60 fps.">
      {moves.length === 0 ? (
        <Empty title="The move list is empty right now">The move database is still being filled. Check back soon.</Empty>
      ) : (
        <>
          <div className="hub-row" style={{ marginBottom: 14 }}>
            <input
              type="search"
              className="hub-input"
              style={{ maxWidth: 320 }}
              placeholder="Search moves, properties…"
              aria-label="Search moves"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="segmented" role="group" aria-label="Category">
              <button className={`btn small${cat === 'all' ? ' active' : ''}`} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All ({moves.length})</button>
              {present.map((c) => (
                <button key={c} className={`btn small${cat === c ? ' active' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small" aria-live="polite">{filtered.length} of {moves.length} moves · keys follow Settings → Controls (single-player scheme).</p>
          {filtered.length === 0 && <Empty title="No moves match">Try another search or category.</Empty>}
          <div className="hub-stack">
            {ORDER.filter((c) => filtered.some((m) => m.category === c)).map((c) => (
              <Panel key={c} title={CATEGORY_LABELS[c]}>
                <div className="hub-stack" style={{ gap: 8 }}>
                  {filtered.filter((m) => m.category === c).map((m) => (
                    <div key={m.id} className="hub-card hub-move">
                      <div style={{ minWidth: 0 }}>
                        <strong>{m.name}</strong>
                        <div className="muted small">{m.description}</div>
                        <div className="hub-chips" style={{ marginTop: 6 }}>
                          {m.height && <Chip tone={m.height === 'low' ? 'info' : m.height === 'overhead' ? 'warn' : 'neutral'}>{m.height}</Chip>}
                          {m.properties.map((p) => <Chip key={p}>{p}</Chip>)}
                          {m.requires && <Chip tone="warn">Requires: {m.requires}</Chip>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="hub-move-inputs">{formatInputs(m.inputs, bindings)}</div>
                        <div className="hub-frames" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
                          <span>Dmg <b>{m.damage}</b></span>
                          <span>Startup <b>{m.startup}f</b></span>
                          <span>Active <b>{m.active}f</b></span>
                          <span>Recovery <b>{m.recovery}f</b></span>
                        </div>
                        <div className="muted small">Motion: {m.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}
    </HubPage>
  );
}
