'use client';

import Link from 'next/link';
import { useAccount } from '@/lib/account/AccountContext';
import { services } from '@/services';
import { fmtDate, fmtDuration, fmtNum, fmtRelative, nowFor } from './format';
import { useFactions, useServiceData } from './hooks';
import { StickFigure } from './StickFigure';
import { Chip, ErrorNote, FactionBadge, HubPage, Loading, Meter, Panel, RarityChip, Stat } from './ui';

export default function ProfileScreen() {
  const { account } = useAccount();
  const factions = useFactions();
  const res = useServiceData('profile', () => services.profile.getMyProfile());

  if (res.status === 'loading') return <HubPage featureId="profile"><Loading /></HubPage>;
  if (res.status === 'error') return <HubPage featureId="profile"><ErrorNote error={res.error} /></HubPage>;
  const p = res.data;
  const name = account.signedIn ? ((account as { username?: string }).username ?? account.email ?? p.name) : p.name;
  const now = nowFor(p.isSample);
  const winRate = Math.round((p.stats.wins / Math.max(1, p.stats.matches)) * 100);

  return (
    <HubPage featureId="profile" actions={<Link href="/settings" className="btn small">⚙ Settings</Link>}>
      <div className="hub-banner" style={{ ['--fc' as string]: factions.get(p.factionId ?? '')?.color ?? 'var(--attacker)' }}>
        <div className="hub-avatar"><StickFigure className="hub-boss-figure" pose="cheer" accent="var(--accent)" label="Avatar" /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2>{name}</h2>
          <div className="hub-row" style={{ gap: 8, margin: '4px 0 10px' }}>
            <Chip tone="accent">{p.title}</Chip>
            <FactionBadge faction={p.factionId ? factions.get(p.factionId) : null} full />
            <span className="muted small">Joined {fmtDate(p.joinedAt)}</span>
          </div>
          <Meter label={`Level ${p.level}`} value={p.xp} max={p.xpToNext} showValue={`${fmtNum(p.xp)} / ${fmtNum(p.xpToNext)} XP`} />
        </div>
      </div>

      <div className="hub-stats hub-mt">
        <Stat label="Matches" value={p.stats.matches} />
        <Stat label="Win rate" value={`${winRate}%`} sub={`${p.stats.wins}W · ${p.stats.losses}L`} />
        <Stat label="Captures" value={p.stats.captures} />
        <Stat label="Defences" value={p.stats.defences} />
        <Stat label="KOs" value={fmtNum(p.stats.kos)} />
        <Stat label="Best streak" value={p.stats.bestStreak} />
        <Stat label="Playtime" value={`${p.stats.playtimeHours} h`} />
      </div>

      <div className="hub-grid hub-grid-main hub-mt">
        <Panel title="Recent matches" icon="🕹" actions={<Chip>Online history goes live later</Chip>}>
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead><tr><th>Result</th><th>Mode</th><th className="hub-hide-sm">Building</th><th className="hub-hide-sm">Opponent</th><th className="num">Time</th><th className="num">When</th></tr></thead>
              <tbody>
                {p.recentMatches.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Chip tone={m.result === 'win' ? 'good' : 'bad'}>{m.result === 'win' ? 'Win' : 'Loss'}</Chip>{' '}
                      <span className="muted small">{m.side} · {m.reason}</span>
                    </td>
                    <td>{m.mode}</td>
                    <td className="hub-hide-sm">{m.building}</td>
                    <td className="hub-hide-sm">{m.opponent}</td>
                    <td className="num">{fmtDuration(m.durationSec)}</td>
                    <td className="num">{fmtRelative(m.at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="hub-stack">
          <Panel title="Badges" icon="🎖">
            <div className="hub-chips">{p.badges.map((b) => <Chip key={b.id}><span aria-hidden="true">{b.icon}</span> {b.name}</Chip>)}</div>
          </Panel>
          <Panel title="Cosmetics" icon="🎨" actions={<Link href="/shop" className="btn small">Shop</Link>}>
            <div className="hub-stack" style={{ gap: 6 }}>
              {p.cosmetics.map((c) => (
                <div key={c.id} className="hub-slot">
                  <span className="hub-slot-label">{c.slot}</span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <RarityChip rarity={c.rarity} />
                  {c.equipped && <Chip tone="good">On</Chip>}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </HubPage>
  );
}
