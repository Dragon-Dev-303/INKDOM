'use client';

import { useState } from 'react';
import { services } from '@/services';
import { fmtDate, fmtNum, fmtRelative, nowFor } from './format';
import { useFactions, useServiceData } from './hooks';
import { Tabs } from './Tabs';
import { Chip, ErrorNote, FactionBadge, HubPage, Loading, Panel } from './ui';

type Tab = 'players' | 'factions' | 'seasons';

const Change = ({ n }: { n: number }) =>
  n === 0 ? <span className="muted">—</span> : <span className={n > 0 ? 'hub-up' : 'hub-down'}>{n > 0 ? `▲${n}` : `▼${-n}`}</span>;

export default function LeaderboardScreen() {
  const factions = useFactions();
  const [tab, setTab] = useState<Tab>('players');
  const res = useServiceData('leaderboard', async () => {
    const season = await services.events.getCurrentSeason();
    return Promise.all([
      season,
      services.leaderboard.getPlayerRankings(season.id),
      services.leaderboard.getFactionRankings(season.id),
      services.events.listSeasons(),
    ]);
  });

  if (res.status === 'loading') return <HubPage featureId="leaderboard"><Loading /></HubPage>;
  if (res.status === 'error') return <HubPage featureId="leaderboard"><ErrorNote error={res.error} /></HubPage>;
  const [season, players, factionRanks, seasons] = res.data;

  return (
    <HubPage featureId="leaderboard">
      <div className="hub-season" style={{ marginBottom: 16 }}>
        <div>
          <strong>🏆 Season {season.number}: {season.name}</strong>
          <div className="muted small">{fmtDate(season.startsAt)} – {fmtDate(season.endsAt)} · ends {fmtRelative(season.endsAt, nowFor(season.isSample))}</div>
        </div>
        <div className="hub-chips">{season.rewards.map((r) => <Chip key={r}>{r}</Chip>)}</div>
      </div>
      <Tabs<Tab>
        label="Rankings"
        value={tab}
        onChange={setTab}
        tabs={[{ id: 'players', label: 'Players' }, { id: 'factions', label: 'Factions' }, { id: 'seasons', label: 'Seasons' }]}
      >
        {tab === 'players' && (
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr><th className="num">#</th><th>Player</th><th className="hub-hide-sm">Faction</th><th className="num">Rating</th><th className="num hub-hide-sm">W–L</th><th className="num hub-hide-sm">Captures</th><th className="num">24 h</th></tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.playerId} className={p.isYou ? 'you' : ''}>
                    <td className="num">{p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : p.rank}</td>
                    <td><strong>{p.name}</strong></td>
                    <td className="hub-hide-sm"><FactionBadge faction={p.factionId ? factions.get(p.factionId) : null} /></td>
                    <td className="num">{fmtNum(p.rating)}</td>
                    <td className="num hub-hide-sm">{p.wins}–{p.losses}</td>
                    <td className="num hub-hide-sm">{p.captures}</td>
                    <td className="num"><Change n={p.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'factions' && (
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr><th className="num">#</th><th>Faction</th><th className="num">Buildings</th><th className="num">Cities</th><th className="num hub-hide-sm">Points</th><th className="num hub-hide-sm">Members</th><th className="num">24 h</th></tr>
              </thead>
              <tbody>
                {factionRanks.map((f) => (
                  <tr key={f.factionId} className={f.isYou ? 'you' : ''}>
                    <td className="num">{f.rank}</td>
                    <td><FactionBadge faction={factions.get(f.factionId)} full /></td>
                    <td className="num">{f.buildings}</td>
                    <td className="num">{f.cities}</td>
                    <td className="num hub-hide-sm">{fmtNum(f.seasonPoints)}</td>
                    <td className="num hub-hide-sm">{f.members}/10</td>
                    <td className="num"><Change n={f.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'seasons' && (
          <div className="hub-auto-grid">
            {seasons.map((s) => (
              <Panel key={s.id} title={`Season ${s.number}: ${s.name}`} actions={<Chip tone={s.status === 'current' ? 'good' : s.status === 'upcoming' ? 'info' : 'neutral'}>{s.status}</Chip>}>
                <p className="muted small">{s.theme} · {fmtDate(s.startsAt)} – {fmtDate(s.endsAt)}</p>
                <h3>Rewards</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{s.rewards.map((r) => <li key={r}>{r}</li>)}</ul>
                <h3>Reset rules</h3>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{s.resetRules.map((r) => <li key={r}>{r}</li>)}</ul>
              </Panel>
            ))}
          </div>
        )}
      </Tabs>
    </HubPage>
  );
}
