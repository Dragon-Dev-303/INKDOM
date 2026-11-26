'use client';

import { useEffect, useState } from 'react';
import { services } from '@/services';
import type { OrderId, SquadOrder, SupportAction, SupportId, TacticalSnapshot, TacticalSquad } from '@/services/support';
import { useServiceData } from './hooks';
import { Chip, ErrorNote, HubPage, Loading, Meter, Panel } from './ui';

/** Preview cooldowns run faster than real ones so the demo is watchable. */
const PREVIEW_SPEED = 10;

export default function CommanderScreen() {
  const res = useServiceData('commander', () =>
    Promise.all([services.support.getTacticalPreview(), services.support.listOrders(), services.support.listSupportActions()]),
  );
  return (
    <HubPage featureId="commander">
      {res.status === 'loading' && <Loading />}
      {res.status === 'error' && <ErrorNote error={res.error} />}
      {res.status === 'ready' && <Commander snap={res.data[0]} orders={res.data[1]} support={res.data[2]} />}
    </HubPage>
  );
}

const FLOOR_H = 96;
const LEFT = 96;
const W = 1000;
const px = (x: number) => LEFT + (x / 100) * (W - LEFT - 12);

function Commander({ snap, orders, support }: { snap: TacticalSnapshot; orders: SquadOrder[]; support: SupportAction[] }) {
  const [squads, setSquads] = useState<TacticalSquad[]>(snap.squads);
  const [selected, setSelected] = useState(snap.squads[0]?.id ?? '');
  const [cooldowns, setCooldowns] = useState<Partial<Record<SupportId, number>>>({});
  const [charges, setCharges] = useState<Record<string, number>>(() => Object.fromEntries(support.map((s) => [s.id, s.charges])));
  const [now, setNow] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const ticking = Object.values(cooldowns).some((end) => (end ?? 0) > now);

  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(t);
  }, [ticking]);

  const floors = snap.floors.length;
  const yOf = (level: number) => 16 + (floors - level) * FLOOR_H;
  const sel = squads.find((s) => s.id === selected);
  const orderName = (id: OrderId) => orders.find((o) => o.id === id)?.name ?? id;

  const giveOrder = (id: OrderId) => {
    if (!sel) return;
    setSquads((all) => all.map((s) => (s.id === sel.id ? { ...s, order: id } : s)));
    setLog((l) => [`${sel.name}: ${orderName(id)}`, ...l].slice(0, 6));
  };
  /** `t` is the click's event.timeStamp (same clock as performance.now()). */
  const call = (a: SupportAction, t: number) => {
    setCharges((c) => ({ ...c, [a.id]: (c[a.id] ?? 0) - 1 }));
    setCooldowns((c) => ({ ...c, [a.id]: t + (a.cooldownSec * 1000) / PREVIEW_SPEED }));
    setNow(t);
    setLog((l) => [`Support: ${a.name} requested`, ...l].slice(0, 6));
  };

  return (
    <div className="hub-stack">
      <div className="hub-tactical">
        <Panel title={snap.buildingName} icon="🗺" actions={<Chip tone="attacker">Attacking</Chip>}>
          <svg className="hub-floorplan" viewBox={`0 0 ${W} ${floors * FLOOR_H + 32}`} role="group" aria-label="Building floor plan">
            {snap.floors.map((f) => (
              <g key={f.level}>
                <text className="floor-label" x={10} y={yOf(f.level) + FLOOR_H / 2 + 4}>{f.name}</text>
                {f.rooms.map((r) => (
                  <g key={r.id}>
                    <rect className={`room ${r.kind}`} x={px(r.x)} y={yOf(f.level) + 6} width={(r.w / 100) * (W - LEFT - 12) - 4} height={FLOOR_H - 12} rx={6} />
                    <text className="room-label" x={px(r.x) + 8} y={yOf(f.level) + 22}>{r.name}</text>
                  </g>
                ))}
              </g>
            ))}
            {/* flag */}
            <g aria-label={`Flag on ${snap.floors.find((f) => f.level === snap.flag.floor)?.name}`} role="img">
              <line x1={px(snap.flag.x)} y1={yOf(snap.flag.floor) + 20} x2={px(snap.flag.x)} y2={yOf(snap.flag.floor) + FLOOR_H - 10} stroke="#e5e7eb" strokeWidth={3} />
              <path d={`M${px(snap.flag.x)} ${yOf(snap.flag.floor) + 20} l30 10 l-30 10 z`} fill="var(--defender)" />
            </g>
            {snap.rallyMarkers.map((m) => (
              <g key={m.id} role="img" aria-label={`Rally marker: ${m.label}`}>
                <path d={`M${px(m.x)} ${yOf(m.floor) + FLOOR_H - 12} l-9 -18 h18 z`} fill="var(--accent)" />
                <text x={px(m.x)} y={yOf(m.floor) + FLOOR_H - 34} textAnchor="middle" fill="var(--accent)" fontSize={11} fontWeight={800}>{m.label}</text>
              </g>
            ))}
            {snap.enemySightings.map((e) => (
              <g key={e.id} role="img" aria-label={`${e.count} enemies seen ${e.seenSecAgo} s ago`} opacity={Math.max(0.4, 1 - e.seenSecAgo / 20)}>
                <path d={`M${px(e.x)} ${yOf(e.floor) + 40} l12 22 h-24 z`} fill="var(--danger)" />
                <text x={px(e.x)} y={yOf(e.floor) + 76} textAnchor="middle" fill="#fca5a5" fontSize={12} fontWeight={800}>×{e.count}</text>
              </g>
            ))}
            {squads.map((s) => (
              <g
                key={s.id}
                className={`squad${s.id === selected ? ' selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={s.id === selected}
                aria-label={`Squad ${s.name}, order ${orderName(s.order)}, ${s.units.length} units`}
                onClick={() => setSelected(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(s.id);
                  }
                }}
              >
                <circle cx={px(s.x)} cy={yOf(s.floor) + 54} r={17} fill="var(--attacker)" stroke="#0e1320" strokeWidth={2} />
                <text x={px(s.x)} y={yOf(s.floor) + 59} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={900}>{s.name[0]}</text>
                <text x={px(s.x)} y={yOf(s.floor) + 88} textAnchor="middle" fill="#e5e7eb" fontSize={11} fontWeight={700}>{orderName(s.order)}</text>
              </g>
            ))}
          </svg>
          <div className="hub-legend">
            <span><span aria-hidden="true" style={{ color: 'var(--attacker)' }}>●</span> Your squads (select)</span>
            <span><span aria-hidden="true" style={{ color: 'var(--danger)' }}>▲</span> Enemy sighting (fades)</span>
            <span><span aria-hidden="true" style={{ color: 'var(--accent)' }}>▼</span> Rally marker</span>
            <span><span aria-hidden="true" style={{ color: 'var(--defender)' }}>⚑</span> Flag</span>
          </div>
        </Panel>

        <div className="hub-stack">
          <Panel title="Squads" icon="🪖">
            <div className="hub-stack" style={{ gap: 8 }}>
              {squads.map((s) => (
                <button key={s.id} className={`hub-card${s.id === selected ? ' selected' : ''}`} onClick={() => setSelected(s.id)} aria-pressed={s.id === selected}>
                  <span className="hub-card-title">
                    <span>{s.name}</span>
                    <Chip>{orderName(s.order)}</Chip>
                  </span>
                  <span className="muted small">
                    {snap.floors.find((f) => f.level === s.floor)?.name} · {s.units.length} units · avg HP{' '}
                    {Math.round(s.units.reduce((a, u) => a + u.hp, 0) / s.units.length)}%
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={`Orders${sel ? ` · ${sel.name}` : ''}`} icon="📣">
            <div className="hub-orders">
              {orders.map((o) => (
                <button key={o.id} className={`btn${sel?.order === o.id ? ' active' : ''}`} onClick={() => giveOrder(o.id)} aria-pressed={sel?.order === o.id}>
                  <span><span aria-hidden="true">{o.icon}</span> {o.name}</span>
                  <small>{o.behaviour}</small>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="hub-grid hub-grid-main">
        <Panel
          title="Support calls"
          icon="🚁"
          actions={<Chip>Reinforcements {snap.reinforcementBudget.used}/{snap.reinforcementBudget.max} · max {snap.reinforcementBudget.maxConcurrentBosses} bosses</Chip>}
        >
          <div className="hub-support">
            {support.map((a) => {
              const end = cooldowns[a.id] ?? 0;
              const remaining = Math.max(0, end - now);
              const total = (a.cooldownSec * 1000) / PREVIEW_SPEED;
              const left = charges[a.id] ?? 0;
              const ready = a.unlocked && remaining === 0 && left > 0;
              return (
                <div key={a.id} className="hub-support-row">
                  <span style={{ fontSize: 22 }} aria-hidden="true">{a.icon}</span>
                  <div className="grow">
                    <div className="hub-row" style={{ gap: 6 }}>
                      <strong>{a.name}</strong>
                      {a.optional && <Chip>Optional</Chip>}
                      <span className="muted small">{left} left · {a.cooldownSec}s cooldown</span>
                    </div>
                    <div className="muted small">{a.effect}. {a.limitation}.</div>
                    {remaining > 0 && (
                      <div className="hub-cooldown" role="progressbar" aria-label={`${a.name} cooldown`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - remaining / total) * 100)}>
                        <span style={{ width: `${(1 - remaining / total) * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <button className="btn small" disabled={!ready} onClick={(e) => call(a, e.timeStamp)}>
                    {!a.unlocked ? '🔒' : remaining > 0 ? `${Math.ceil((remaining * PREVIEW_SPEED) / 1000)}s` : left <= 0 ? 'Empty' : 'Call'}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="muted small hub-mt">Preview: cooldowns run {PREVIEW_SPEED}× faster. Roof control, weather and anti-air limit air support in real matches.</p>
        </Panel>
        <Panel title="Command log" icon="📝">
          <Meter label="Flag capture" value={snap.flag.captureProgress} tone="info" />
          <ul className="hub-notes hub-mt" aria-live="polite">
            {log.length === 0 && <li className="muted small">Select a squad and give an order, or call support.</li>}
            {log.map((l, i) => <li key={`${i}-${l}`} className="hub-note-item"><span className="small">{l}</span></li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
