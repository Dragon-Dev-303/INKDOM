'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { services } from '@/services';
import { BUILDING_ARCHETYPES } from '@/services/world';
import { WindowChip } from './CityScreen';
import { fmtDateTime, fmtDuration, fmtRelative, nowFor, pad2, WEEKDAYS } from './format';
import { useFactions, useServiceData } from './hooks';
import { Chip, ComingSoonButton, Empty, ErrorNote, FactionBadge, HubPage, Loading, Meter, Panel, Stat } from './ui';

export default function BuildingScreen({ id }: { id: string }) {
  const factions = useFactions();
  const res = useServiceData(`building:${id}`, () => services.world.getBuilding(id));

  if (res.status === 'loading') return <HubPage featureId="building" crumbs={[{ label: 'World', href: '/world' }, { label: '…' }]}><Loading /></HubPage>;
  if (res.status === 'error') return <HubPage featureId="building"><ErrorNote error={res.error} /></HubPage>;
  if (!res.data) {
    return (
      <HubPage featureId="building" title="Building not found" crumbs={[{ label: 'World', href: '/world' }, { label: id }]}>
        <Empty title={`No building “${id}”.`}><Link href="/world">Back to the world map</Link></Empty>
      </HubPage>
    );
  }
  const { building: b, city } = res.data;
  const owner = b.ownerFactionId ? factions.get(b.ownerFactionId) : null;
  const arch = BUILDING_ARCHETYPES[b.archetype];
  const now = nowFor(b.isSample);
  const fc = { '--fc': owner?.color ?? '#475569' } as CSSProperties;

  return (
    <HubPage
      featureId="building"
      title={b.name}
      icon={arch.icon}
      lead={`${arch.label} in ${city.name} · ${b.floors} floors · rooftop flag`}
      crumbs={[{ label: 'World', href: '/world' }, { label: city.name, href: `/world/city/${city.id}` }, { label: b.name }]}
      actions={<ComingSoonButton note="Sieges arrive with the territory war">⚔ Plan siege</ComingSoonButton>}
    >
      <div className="hub-grid hub-grid-main">
        <div className="hub-stack">
          <Panel title="Ownership" icon="⚑">
            <div className="hub-row spread">
              <div>
                <FactionBadge faction={owner} full />
                <div className="muted small">
                  {b.ownerBoss ? <>Title held by boss <strong>{b.ownerBoss}</strong></> : 'Nobody holds this building'}
                  {b.capturedAt && <> · captured {fmtRelative(b.capturedAt, now)}</>}
                </div>
              </div>
              <WindowChip b={b} />
            </div>
            <div className="hub-stats hub-mt">
              <Stat label="Defence level" value={`${b.defenceLevel}/10`} />
              <Stat label="Garrison" value={`${b.garrison} bots`} />
              <Stat label="Income" value={`◆ ${b.pointsPerDay}/day`} sub="illustrative" />
              <Stat label="Floors" value={b.floors} />
            </div>
            <div className="hub-grid hub-grid-2 hub-mt">
              <Meter label="Defence rating" value={b.defenceRating} tone={b.defenceRating > 70 ? 'good' : 'accent'} />
              <Meter label="Repair state" value={b.repairState} tone={b.repairState < 50 ? 'bad' : 'info'} />
            </div>
          </Panel>

          <Panel title="Vulnerability window" icon="🕒">
            <p>
              Attackers may only start a siege during this weekly window, so owners don’t have to defend around the clock
              (GDD §9, proposed).
            </p>
            <div className="hub-row">
              <Chip tone="info">{WEEKDAYS[b.window.weekday]}s</Chip>
              <Chip>{pad2(b.window.startHourUtc)}:00–{pad2((b.window.startHourUtc + b.window.durationHours) % 24)}:00 UTC</Chip>
              <Chip>{b.window.status === 'open' ? 'Open now' : b.window.status === 'shielded' ? 'Shield after capture' : `Next: ${fmtDateTime(b.window.nextChangeAt)}`}</Chip>
            </div>
          </Panel>

          <Panel title="Capture history" icon="📜">
            {b.history.length === 0 ? (
              <Empty title="No battles yet" />
            ) : (
              <ul className="hub-timeline">
                {b.history.map((h) => {
                  const atk = factions.get(h.attackerFactionId);
                  const def = h.defenderFactionId ? factions.get(h.defenderFactionId) : null;
                  return (
                    <li key={h.id} style={{ '--dot': h.winner === 'attacker' ? 'var(--attacker)' : 'var(--defender)' } as CSSProperties}>
                      <div className="hub-row" style={{ gap: 6 }}>
                        <FactionBadge faction={atk} /> <span className="muted">attacked</span> <FactionBadge faction={def} />
                        <Chip tone={h.winner === 'attacker' ? 'attacker' : 'defender'}>{h.winner === 'attacker' ? 'Captured' : 'Defended'}</Chip>
                      </div>
                      <div className="muted small">
                        {fmtDateTime(h.at)} · {fmtDuration(h.durationSec)} · {h.attackerBoss} vs {h.defenderBoss}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="hub-stack">
          <Panel title="Cross-section" icon="🏢">
            <div className="hub-tower" style={fc}>
              <div className="hub-tower-roof" aria-label="Rooftop flag">🚩</div>
              {Array.from({ length: b.floors }, (_, i) => b.floors - i).map((lvl) => (
                <div key={lvl} className="hub-tower-floor" style={fc}>
                  <span>{lvl === 1 ? 'Ground' : `Floor ${lvl}`}</span>
                  <span className="muted small">{lvl === 1 ? 'Entrances' : lvl === b.floors ? 'Roof access' : 'Stairs'}</span>
                </div>
              ))}
              <div className="hub-tower-ground" />
            </div>
            <p className="muted small hub-mt">{arch.trait}</p>
          </Panel>
          <Panel title="Siege" icon="⚔">
            <p className="muted small">Pick a squad, request allied support and choose an entrance. Launching sieges arrives with the territory war.</p>
            <div className="hub-row">
              <ComingSoonButton>Plan siege</ComingSoonButton>
              <Link href="/play" className="btn small">Practice locally</Link>
            </div>
          </Panel>
        </div>
      </div>
    </HubPage>
  );
}
