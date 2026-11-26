'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { services } from '@/services';
import { BUILDING_ARCHETYPES, WONDERS, type Building } from '@/services/world';
import { fmtRelative, nowFor, WEEKDAYS, pad2 } from './format';
import { useFactions, useServiceData } from './hooks';
import { Chip, Empty, ErrorNote, FactionBadge, HubPage, Loading, Meter, Panel, Stat } from './ui';
import { ControlBar, ControlChip } from './WorldScreen';

export function WindowChip({ b }: { b: Building }) {
  const w = b.window;
  const now = nowFor(b.isSample);
  if (w.status === 'open') return <Chip tone="bad">⚠ Siege window open · closes {fmtRelative(w.nextChangeAt, now)}</Chip>;
  if (w.status === 'shielded') return <Chip tone="info">🛡 Shielded · {fmtRelative(w.nextChangeAt, now)}</Chip>;
  return <Chip>🕒 {WEEKDAYS[w.weekday]} {pad2(w.startHourUtc)}:00 UTC · {w.durationHours} h</Chip>;
}

export default function CityScreen({ id }: { id: string }) {
  const factions = useFactions();
  const res = useServiceData(`city:${id}`, () => services.world.getCity(id));

  if (res.status === 'loading') return <HubPage featureId="city" crumbs={[{ label: 'World', href: '/world' }, { label: '…' }]}><Loading /></HubPage>;
  if (res.status === 'error') return <HubPage featureId="city"><ErrorNote error={res.error} /></HubPage>;
  if (!res.data) {
    return (
      <HubPage featureId="city" title="City not found" crumbs={[{ label: 'World', href: '/world' }, { label: id }]}>
        <Empty title={`No city called “${id}”.`}><Link href="/world">Back to the world map</Link></Empty>
      </HubPage>
    );
  }
  const { city, region, buildings } = res.data;
  const controller = city.control.controllerId ? factions.get(city.control.controllerId) : null;
  const income = buildings.reduce((s, b) => s + b.pointsPerDay, 0);

  return (
    <HubPage
      featureId="city"
      title={city.name}
      icon={city.isCapital ? '🏛' : '🏙'}
      lead={`${region.name} · ${city.isCapital ? 'Regional capital · ' : ''}10 buildings`}
      crumbs={[{ label: 'World', href: '/world' }, { label: region.name, href: '/world' }, { label: city.name }]}
      actions={<ControlChip control={city.control} />}
    >
      <div className="hub-grid hub-grid-main">
        <Panel title="Control" icon="⚑">
          <div className="hub-row spread" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted small">Controller</div>
              <FactionBadge faction={controller} full />
            </div>
            <div className="hub-stats" style={{ flex: 1, maxWidth: 420 }}>
              <Stat label="Owned" value={`${10 - (city.control.counts[''] ?? 0)}/10`} />
              <Stat label="Factions" value={Object.keys(city.control.counts).filter(Boolean).length} />
              <Stat label="Income/day" value={`◆ ${income}`} sub="illustrative" />
            </div>
          </div>
          <ControlBar control={city.control} factions={factions} />
          <div className="hub-chips hub-mt">
            {Object.entries(city.control.counts)
              .filter(([fid]) => fid)
              .map(([fid, n]) => (
                <Chip key={fid}><FactionBadge faction={factions.get(fid)} /> {n}</Chip>
              ))}
            {city.control.counts[''] ? <Chip>◌ Unclaimed {city.control.counts['']}</Chip> : null}
          </div>
        </Panel>
        <Panel title="City bonuses" icon="✨">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {city.bonuses.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="muted small" style={{ marginTop: 8 }}>Thresholds (6/10 governance, 10/10 full control) and payouts are proposals, not final balance.</p>
        </Panel>
      </div>

      <div className="hub-section-title"><h2>Buildings</h2><span className="muted small">Each city holds exactly ten</span></div>
      <div className="hub-buildings">
        {buildings.map((b, i) => {
          const f = b.ownerFactionId ? factions.get(b.ownerFactionId) : null;
          const arch = BUILDING_ARCHETYPES[b.archetype];
          return (
            <Link key={b.id} href={`/world/building/${b.id}`} className="hub-card hub-building" style={{ '--fc': f?.color ?? '#475569' } as CSSProperties}>
              <span className="hub-row spread">
                <span className="hub-card-icon" aria-hidden="true">{arch.icon}</span>
                <span className="hub-building-floors" aria-label={`${b.floors} floors`}>
                  {Array.from({ length: b.floors }, (_, k) => <span key={k} />)}
                </span>
              </span>
              <strong style={{ fontSize: 14 }}>#{i + 1} {b.name}</strong>
              <FactionBadge faction={f} full />
              <Meter label="Defence" value={b.defenceRating} tone={b.defenceRating > 70 ? 'good' : 'accent'} />
              <WindowChip b={b} />
            </Link>
          );
        })}
      </div>

      <div className="hub-section-title"><h2>Wonders</h2><span className="muted small">Capital projects (GDD §12)</span></div>
      <div className="hub-auto-grid">
        {city.wonders.map((w) => {
          const def = WONDERS[w.type];
          return (
            <div key={w.type} className={`hub-card hub-wonder ${w.status === 'locked' ? 'locked' : ''}`}>
              <span className="hub-card-title">
                <span><span aria-hidden="true">{def.icon}</span> {def.name}</span>
                {w.status === 'built' ? <Chip tone="good">Built</Chip> : w.status === 'locked' ? <Chip>🔒 Locked</Chip> : <Chip tone="warn">Building</Chip>}
              </span>
              <span className="muted">{def.effect}</span>
              {w.status === 'under-construction' && <Meter label="Construction" value={w.progress} tone="info" />}
              {w.status === 'locked' && <span className="muted small">{city.isCapital ? 'Requires full control' : 'Capitals only'}</span>}
            </div>
          );
        })}
      </div>
    </HubPage>
  );
}
