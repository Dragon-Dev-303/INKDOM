'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { services, type Faction } from '@/services';
import { type City, type CityControl, GOVERNANCE_THRESHOLD } from '@/services/world';
import { useFactions, useServiceData } from './hooks';
import { Chip, ErrorNote, FactionBadge, HubPage, Loading, Panel } from './ui';

export function ControlChip({ control }: { control: CityControl }) {
  if (control.level === 'full') return <Chip tone="good" title="10 of 10 buildings held by one faction">★ Full control 10/10</Chip>;
  if (control.level === 'governed') {
    const n = control.counts[control.controllerId ?? ''] ?? 0;
    return <Chip tone="info" title={`At least ${GOVERNANCE_THRESHOLD} of 10 buildings`}>◆ Governed {n}/10</Chip>;
  }
  return <Chip tone="warn" title="No faction holds 6 or more buildings">⚑ Contested</Chip>;
}

/** Stacked bar of building ownership with the 6/10 and 10/10 thresholds marked. */
export function ControlBar({ control, factions }: { control: CityControl; factions: Map<string, Faction> }) {
  const entries = Object.entries(control.counts).sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[1] - a[1]));
  const label = entries.map(([id, n]) => `${id ? factions.get(id)?.name ?? id : 'Unclaimed'} ${n}`).join(', ');
  return (
    <div>
      <div className="hub-control-bar" role="img" aria-label={`Building ownership: ${label}`}>
        {entries.map(([id, n]) => (
          <span key={id || 'none'} style={{ width: `${n * 10}%`, background: id ? factions.get(id)?.color ?? '#64748b' : '#334155' }} />
        ))}
      </div>
      <div className="hub-control-marks" aria-hidden="true">
        <span style={{ left: '60%' }}>6 govern</span>
        <span style={{ left: 'calc(100% - 22px)' }}>10 full</span>
      </div>
    </div>
  );
}

function CityNode({ city, factions, onOpen }: { city: City; factions: Map<string, Faction>; onOpen: (id: string) => void }) {
  const f = city.control.controllerId ? factions.get(city.control.controllerId) : null;
  const color = f?.color ?? '#64748b';
  const r = city.isCapital ? 20 : 15;
  return (
    <g
      className="city"
      role="link"
      tabIndex={0}
      aria-label={`${city.name}${city.isCapital ? ', capital' : ''}: ${f ? `${city.control.level} by ${f.name}` : 'contested'}`}
      onClick={() => onOpen(city.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(city.id);
        }
      }}
    >
      {city.control.level === 'full' && <circle cx={city.pos.x} cy={city.pos.y} r={r + 9} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />}
      {city.control.level === 'contested' && <circle cx={city.pos.x} cy={city.pos.y} r={r + 7} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />}
      <circle className="city-node" cx={city.pos.x} cy={city.pos.y} r={r} fill={color} stroke="#0e1320" strokeWidth={3} />
      <text x={city.pos.x} y={city.pos.y + 5} textAnchor="middle" fontSize={city.isCapital ? 16 : 13} fill="#0e1320" fontWeight={900}>
        {city.control.level === 'full' ? '★' : city.control.level === 'governed' ? f?.emblem ?? '◆' : '?'}
      </text>
      <text className="city-name" x={city.pos.x} y={city.pos.y + r + 18} textAnchor="middle">
        {city.name}
      </text>
      <text className="city-sub" x={city.pos.x} y={city.pos.y + r + 32} textAnchor="middle">
        {f ? `[${f.tag}] ${city.control.counts[f.id]}/10` : 'contested'}
      </text>
    </g>
  );
}

export default function WorldScreen() {
  const router = useRouter();
  const factions = useFactions();
  const worlds = useServiceData('worlds', () => services.world.listWorlds());
  const [worldId, setWorldId] = useState('prime');
  const map = useServiceData(`world-map:${worldId}`, () => services.world.getWorldMap(worldId));
  const open = (id: string) => router.push(`/world/city/${id}`);

  return (
    <HubPage
      featureId="world"
      actions={
        worlds.status === 'ready' && (
          <div className="segmented" role="group" aria-label="World">
            {worlds.data.map((w) => (
              <button key={w.id} className={`btn small${w.id === worldId ? ' active' : ''}`} aria-pressed={w.id === worldId} onClick={() => setWorldId(w.id)}>
                {w.kind === 'global' ? '🌍' : '🔒'} {w.name}
              </button>
            ))}
          </div>
        )
      }
    >
      {map.status === 'loading' && <Loading />}
      {map.status === 'error' && <ErrorNote error={map.error} />}
      {map.status === 'ready' && map.data && (
        <div className="hub-stack">
          <Panel
            title={map.data.world.name}
            icon={map.data.world.kind === 'global' ? '🌍' : '🔒'}
            actions={<Chip tone="info">{map.data.world.playersOnline.toLocaleString('en-US')} online</Chip>}
          >
            <p className="muted small">{map.data.world.description}</p>
            <svg className="hub-map" viewBox="0 0 1000 620" role="group" aria-label={`Map of ${map.data.world.name}`}>
              {map.data.regions.map((r) => (
                <g key={r.id}>
                  <rect className="region-box" x={r.box.x} y={r.box.y} width={r.box.w} height={r.box.h} rx={18} />
                  <text className="region-label" x={r.box.x + 18} y={r.box.y + 30}>{r.name}</text>
                  {r.cities.slice(1).map((c, i) => (
                    <line key={c.id} className="route" x1={r.cities[i].pos.x} y1={r.cities[i].pos.y} x2={c.pos.x} y2={c.pos.y} />
                  ))}
                </g>
              ))}
              {map.data.regions.flatMap((r) => r.cities).map((c) => (
                <CityNode key={c.id} city={c} factions={factions} onOpen={open} />
              ))}
            </svg>
            <div className="hub-legend">
              <span><span aria-hidden="true">★</span> Full control (10/10)</span>
              <span><span aria-hidden="true">◆</span> Governed (≥ 6/10)</span>
              <span><span aria-hidden="true" style={{ color: 'var(--warn)' }}>◌</span> Contested</span>
              <span>Large node = regional capital</span>
            </div>
          </Panel>

          {map.data.regions.map((r) => (
            <section key={r.id} aria-labelledby={`region-${r.id}`}>
              <div className="hub-section-title">
                <h2 id={`region-${r.id}`}>{r.name}</h2>
                <span className="muted small">{r.cities.length} cities · {r.cities.length * 10} buildings</span>
              </div>
              <div className="hub-auto-grid">
                {r.cities.map((c) => {
                  const f = c.control.controllerId ? factions.get(c.control.controllerId) : null;
                  return (
                    <Link
                      key={c.id}
                      href={`/world/city/${c.id}`}
                      className="hub-card hub-building"
                      style={{ '--fc': f?.color ?? '#475569' } as CSSProperties}
                    >
                      <span className="hub-card-title">
                        <span>{c.isCapital ? '🏛 ' : '🏙 '}{c.name}</span>
                      </span>
                      <span className="hub-row" style={{ gap: 6 }}>
                        <FactionBadge faction={f} full />
                      </span>
                      <ControlChip control={c.control} />
                      <ControlBar control={c.control} factions={factions} />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </HubPage>
  );
}
