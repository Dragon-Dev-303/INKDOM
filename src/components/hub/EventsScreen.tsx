'use client';

import Link from 'next/link';
import { useState } from 'react';
import { services } from '@/services';
import { EVENT_KINDS } from '@/services/events';
import { MOCK_NOW } from '@/services/mock';
import { fmtDate, fmtDateTime, fmtRelative, nowFor } from './format';
import { useServiceData } from './hooks';
import { Chip, ErrorNote, HubPage, Loading, Panel } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function EventsScreen() {
  const start = new Date(MOCK_NOW);
  const [ym, setYm] = useState({ y: start.getUTCFullYear(), m: start.getUTCMonth() });
  const base = useServiceData('events', () => Promise.all([services.events.listWorldEvents(), services.events.listSeasons()]));
  const cal = useServiceData(`calendar:${ym.y}-${ym.m}`, () => services.events.getCalendar(ym.y, ym.m));
  const shift = (d: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + d) / 12), m: (((m + d) % 12) + 12) % 12 }));

  const first = new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const todayIso = new Date(MOCK_NOW).toISOString().slice(0, 10);

  return (
    <HubPage featureId="events">
      {base.status === 'loading' && <Loading />}
      {base.status === 'error' && <ErrorNote error={base.error} />}
      {base.status === 'ready' && (
        <div className="hub-stack">
          <section aria-labelledby="ev-live">
            <div className="hub-section-title" style={{ marginTop: 0 }}><h2 id="ev-live">World events</h2></div>
            <div className="hub-auto-grid">
              {base.data[0].map((e) => {
                const k = EVENT_KINDS[e.kind];
                const now = nowFor(e.isSample);
                return (
                  <div key={e.id} className={`hub-card${e.status === 'ended' ? ' locked' : ''}`}>
                    <span className="hub-card-title">
                      <span><span aria-hidden="true">{k.icon}</span> {e.title}</span>
                    </span>
                    <span className="hub-chips">
                      <Chip tone={e.status === 'live' ? 'bad' : e.status === 'upcoming' ? 'info' : 'neutral'}>
                        {e.status === 'live' ? `● Live · ends ${fmtRelative(e.endsAt, now)}` : e.status === 'upcoming' ? `Starts ${fmtRelative(e.startsAt, now)}` : 'Ended'}
                      </Chip>
                      <Chip>{k.label}</Chip>
                      {e.cooperative && <Chip tone="good">Co-op</Chip>}
                    </span>
                    <span className="muted">{e.description}</span>
                    <span className="small">🎁 {e.reward} · <Link href={`/world/city/${e.cityId}`}>{e.cityName}</Link></span>
                    <span className="muted small">{fmtDateTime(e.startsAt)}</span>
                  </div>
                );
              })}
            </div>
            <p className="muted small hub-mt">Event alerts are opt-in and schedules are bounded so nobody has to play around the clock (GDD §12).</p>
          </section>

          <Panel
            title={`${MONTHS[ym.m]} ${ym.y}`}
            icon="📅"
            actions={
              <div className="hub-row">
                <button className="btn small" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
                <button className="btn small" onClick={() => shift(1)} aria-label="Next month">›</button>
              </div>
            }
          >
            {cal.status !== 'ready' ? (
              <Loading />
            ) : (
              <>
                <div className="hub-calendar" role="grid" aria-label={`Calendar ${MONTHS[ym.m]} ${ym.y}`}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="hub-cal-head" role="columnheader">{d}</div>)}
                  {Array.from({ length: first }, (_, i) => <div key={`pad${i}`} className="hub-cal-day pad" aria-hidden="true" />)}
                  {Array.from({ length: days }, (_, i) => {
                    const iso = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                    const entries = cal.data.filter((e) => e.date === iso);
                    return (
                      <div key={iso} role="gridcell" className={`hub-cal-day${iso === todayIso ? ' today' : ''}`} aria-label={`${i + 1}: ${entries.map((e) => e.title).join(', ') || 'nothing scheduled'}`}>
                        <span className="hub-cal-num">{i + 1}</span>
                        {entries.map((e) => <span key={e.id} className={`hub-cal-entry ${e.kind}`} title={e.title}>{e.title}</span>)}
                      </div>
                    );
                  })}
                </div>
                <div className="hub-legend">
                  <span><span className="hub-cal-entry event">Event</span></span>
                  <span><span className="hub-cal-entry season">Season</span></span>
                  <span><span className="hub-cal-entry siege-window">Siege windows</span></span>
                  <span><span className="hub-cal-entry reward">Rewards</span></span>
                </div>
              </>
            )}
          </Panel>

          <Panel title="Seasons" icon="🏆" actions={<Link href="/leaderboard" className="btn small">Rankings</Link>}>
            <ul className="hub-timeline">
              {base.data[1].map((s) => (
                <li key={s.id} style={{ ['--dot' as string]: s.status === 'current' ? 'var(--accent)' : s.status === 'upcoming' ? 'var(--info)' : '#64748b' }}>
                  <div className="hub-row" style={{ gap: 8 }}>
                    <strong>Season {s.number}: {s.name}</strong>
                    <Chip tone={s.status === 'current' ? 'good' : s.status === 'upcoming' ? 'info' : 'neutral'}>{s.status}</Chip>
                  </div>
                  <div className="muted small">{s.theme} · {fmtDate(s.startsAt)} – {fmtDate(s.endsAt)}</div>
                  <div className="small">Resets: {s.resetRules.join(' · ')}</div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </HubPage>
  );
}
