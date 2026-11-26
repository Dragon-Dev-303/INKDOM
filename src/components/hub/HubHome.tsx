'use client';

import Link from 'next/link';
import { featureHref, featuresByGroup } from '@/features/registry';
import { useAccount } from '@/lib/account/AccountContext';
import { services } from '@/services';
import { MESSAGE_KINDS } from '@/services/inbox';
import { fmtRelative, nowFor } from './format';
import { useServiceData } from './hooks';
import { StickFigure } from './StickFigure';
import { Chip, Loading, Meter, Panel, SampleTag, StatusBadge } from './ui';

/** Main hub (GDD §16): boss card, quick play, daily rewards, notifications, season, every feature. */
export default function HubHome() {
  const { account } = useAccount();
  const name = account.signedIn ? ((account as { username?: string }).username ?? account.email ?? 'Player') : null;
  const data = useServiceData('hub-home', () =>
    Promise.all([
      services.boss.getMyBoss(),
      services.events.getCurrentSeason(),
      services.events.getDailyRewards(),
      services.inbox.list(),
      services.boss.listArchetypes(),
    ]),
  );
  const boss = data.status === 'ready' ? data.data[0] : null;
  const arch = data.status === 'ready' && boss ? data.data[4].find((a) => a.id === boss.archetypeId) : null;
  const season = data.status === 'ready' ? data.data[1] : null;
  const rewards = data.status === 'ready' ? data.data[2] : null;
  const notes = data.status === 'ready' ? data.data[3].slice(0, 4) : null;

  return (
    <div className="hub-page">
      <section className="hub-hero" aria-label="Quick play">
        <div>
          <p className="hub-badge hub-badge-live" style={{ margin: 0 }}>Beta · {name ? `Welcome back, ${name}` : 'Playing as guest'}</p>
          <h1 style={{ marginTop: 10 }}>
            Take the <span style={{ color: 'var(--attacker)' }}>roof</span>. Hold the <span style={{ color: 'var(--defender)' }}>flag</span>.
          </h1>
          <p>Fight as a boss, command your squad and capture the rooftop flag. Solo vs bots, two players on one keyboard, or online.</p>
          <div className="hub-hero-actions">
            <Link href="/play" className="btn primary">⚔ Play local</Link>
            <Link href="/online" className="btn">🌐 Play online</Link>
            <Link href="/tutorial" className="btn">🎓 Training</Link>
          </div>
        </div>
        <div className="hub-boss-card">
          <StickFigure className="hub-boss-figure" color="#f3f4f6" accent="var(--attacker)" pose="fight" label="Your boss" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="hub-row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 18 }}>{boss?.name ?? 'Your boss'}</strong>
              {boss && <SampleTag />}
            </div>
            {boss && arch ? (
              <>
                <div className="muted small" style={{ marginBottom: 8 }}>
                  {arch.icon} {arch.name} · Level {boss.level}
                </div>
                <Meter label="Strength" value={boss.allocation.strength} max={12} />
                <div style={{ height: 6 }} />
                <Meter label="Agility" value={boss.allocation.agility} max={12} tone="info" />
                <div className="hub-row" style={{ marginTop: 10 }}>
                  <Link href="/boss" className="btn small">Edit boss</Link>
                  <Link href="/hangar" className="btn small">Squad</Link>
                </div>
              </>
            ) : (
              <Loading />
            )}
          </div>
        </div>
      </section>

      {season && (
        <div className="hub-season hub-mt" role="region" aria-label="Season">
          <div>
            <div className="hub-row" style={{ gap: 8 }}>
              <strong>🏆 Season {season.number}: {season.name}</strong>
              <SampleTag />
            </div>
            <div className="muted small">
              {season.theme} · ends {fmtRelative(season.endsAt, nowFor(season.isSample))}
            </div>
          </div>
          <div className="hub-row">
            <Link href="/events" className="btn small">Events</Link>
            <Link href="/leaderboard" className="btn small">Rankings</Link>
          </div>
        </div>
      )}

      <div className="hub-grid hub-grid-main hub-mt">
        <Panel title="Daily rewards" icon="🎁" sample actions={<button className="btn small" disabled title="Coming soon">Claim day 4</button>}>
          {rewards ? (
            <div className="hub-rewards">
              {rewards.map((r) => (
                <div key={r.day} className={`hub-reward ${r.state}`}>
                  <span className="muted">Day {r.day}</span>
                  <b>{r.points}</b>
                  <span aria-label={r.state}>{r.state === 'claimed' ? '✓' : r.state === 'today' ? '★' : '🔒'}</span>
                </div>
              ))}
            </div>
          ) : (
            <Loading />
          )}
          <p className="muted small" style={{ marginTop: 10 }}>Rewards are claimed once per day; claiming arrives with online accounts.</p>
        </Panel>
        <Panel title="Notifications" icon="📬" sample actions={<Link href="/inbox" className="btn small">Inbox</Link>}>
          {notes ? (
            <ul className="hub-notes">
              {notes.map((m) => (
                <li key={m.id} className={`hub-note-item${m.read ? '' : ' unread'}`}>
                  <span className="hub-note-icon" aria-hidden="true">{MESSAGE_KINDS[m.kind].icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{m.subject}</strong>
                    <p>{fmtRelative(m.at, nowFor(m.isSample))} · {m.from}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Loading />
          )}
        </Panel>
      </div>

      {featuresByGroup().map((g) => (
        <section key={g.group} aria-labelledby={`tiles-${g.group}`}>
          <div className="hub-section-title">
            <h2 id={`tiles-${g.group}`}>{g.label}</h2>
          </div>
          <div className="hub-auto-grid">
            {g.features
              .filter((f) => f.id !== 'hub')
              .map((f) => (
                <Link key={f.id} href={featureHref(f)} className="hub-card hub-tile">
                  <StatusBadge status={f.status} />
                  <span className="hub-card-icon" aria-hidden="true">{f.icon}</span>
                  <span className="hub-tile-title">{f.title}</span>
                  <span className="muted">{f.description}</span>
                </Link>
              ))}
          </div>
        </section>
      ))}
      <p className="muted small hub-mt">
        <Chip tone="good">Live</Chip> works now · <Chip tone="warn">Preview</Chip> real screen on sample data · <Chip>Soon</Chip> planned.
      </p>
    </div>
  );
}
