'use client';

import { useState, type CSSProperties } from 'react';
import { services } from '@/services';
import { PERMISSION_LABELS, type RelationKind, type TeamPermission } from '@/services/team';
import { fmtDateTime, fmtNum, fmtRelative, nowFor } from './format';
import { useFactions, useServiceData } from './hooks';
import { Tabs } from './Tabs';
import { Chip, type ChipTone, ComingSoonButton, ErrorNote, FactionBadge, HubPage, Loading, Panel, Stat } from './ui';

type Tab = 'roster' | 'alliances' | 'treasury' | 'log' | 'roles';

const RELATION: Record<RelationKind, { label: string; tone: ChipTone; icon: string }> = {
  alliance: { label: 'Alliance', tone: 'good', icon: '🤝' },
  ceasefire: { label: 'Ceasefire', tone: 'info', icon: '🕊' },
  war: { label: 'At war', tone: 'bad', icon: '⚔' },
  'betrayal-cooldown': { label: 'Betrayal cooldown', tone: 'warn', icon: '⏳' },
};

export default function TeamScreen() {
  const factions = useFactions();
  const res = useServiceData('team', () =>
    Promise.all([services.team.getMyTeam(), services.team.listRoles(), services.team.getCreationInfo(), services.boss.listArchetypes()]),
  );
  const [tab, setTab] = useState<Tab>('roster');

  if (res.status === 'loading') return <HubPage featureId="team"><Loading /></HubPage>;
  if (res.status === 'error') return <HubPage featureId="team"><ErrorNote error={res.error} /></HubPage>;
  const [team, roles, creation, archetypes] = res.data;
  const arch = new Map(archetypes.map((a) => [a.id, a]));

  const createCard = (
    <Panel title="Create a team" icon="✚">
      <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.6 }}>
        {creation.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <div className="hub-row">
        <Chip tone="warn">Cost: OPEN (not decided)</Chip>
        <ComingSoonButton>Create team</ComingSoonButton>
      </div>
    </Panel>
  );

  if (!team) {
    return <HubPage featureId="team">{createCard}</HubPage>;
  }
  const f = team.faction;
  const now = nowFor(team.isSample);
  const perms = Object.keys(PERMISSION_LABELS) as TeamPermission[];

  return (
    <HubPage featureId="team">
      <div className="hub-banner" style={{ '--fc': f.color, '--fc2': f.secondary } as CSSProperties}>
        <div className="hub-emblem" aria-hidden="true">{f.emblem}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2>{f.name} <span className="muted" style={{ fontSize: 16 }}>[{f.tag}]</span></h2>
          <p style={{ margin: '4px 0 8px', fontStyle: 'italic' }}>“{f.motto}”</p>
          <div className="hub-chips">
            <Chip>👥 {team.roster.length}/{team.maxRoster} bosses</Chip>
            <Chip>🏢 {team.buildingsHeld} buildings</Chip>
            <Chip>🏙 {team.citiesGoverned} cities governed</Chip>
            <Chip>Founded {fmtRelative(team.foundedAt, now)}</Chip>
          </div>
        </div>
        <div className="hub-stats" style={{ minWidth: 220 }}>
          <Stat label="Treasury" value={`◆ ${fmtNum(team.treasury.balance)}`} sub={`+${team.treasury.incomePerDay} / −${team.treasury.upkeepPerDay} per day`} />
        </div>
      </div>

      <div className="hub-mt">
        <Tabs<Tab>
          label="Team sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'roster', label: 'Roster', badge: `${team.roster.length}/10` },
            { id: 'alliances', label: 'Alliances', badge: team.relations.length },
            { id: 'treasury', label: 'Treasury' },
            { id: 'log', label: 'Battle log' },
            { id: 'roles', label: 'Roles' },
          ]}
        >
          {tab === 'roster' && (
            <div className="hub-roster">
              {Array.from({ length: team.maxRoster }, (_, i) => {
                const m = team.roster[i];
                if (!m) {
                  return (
                    <div key={`empty-${i}`} className="hub-card empty">
                      <span aria-hidden="true">＋</span>
                      <span>Open boss slot {i + 1}</span>
                      <button className="btn small" disabled title="Coming soon">Invite</button>
                    </div>
                  );
                }
                const a = arch.get(m.archetypeId);
                return (
                  <div key={m.id} className={`hub-card${m.isYou ? ' selected' : ''}`}>
                    <span className="hub-card-title">
                      <span className="hub-row" style={{ gap: 8 }}>
                        <span className={`hub-online${m.online ? ' on' : ''}`} aria-label={m.online ? 'Online' : 'Offline'} role="img" />
                        {m.name}
                      </span>
                      <Chip tone={m.role === 'founder' ? 'accent' : m.role === 'co-leader' || m.role === 'officer' ? 'info' : 'neutral'}>
                        {roles.find((r) => r.id === m.role)?.label}
                      </Chip>
                    </span>
                    <span className="muted">{a?.icon} {a?.name} · Lv {m.level} · Power {fmtNum(m.power)}</span>
                    <span className="muted">Contribution ◆ {fmtNum(m.contribution)} · {m.online ? 'online now' : `seen ${fmtRelative(m.lastActiveAt, now)}`}</span>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'alliances' && (
            <div className="hub-stack">
              <div className="hub-auto-grid">
                {team.relations.map((r) => {
                  const rel = RELATION[r.kind];
                  return (
                    <div key={r.factionId} className="hub-card">
                      <span className="hub-card-title">
                        <FactionBadge faction={factions.get(r.factionId)} full />
                        <Chip tone={rel.tone}>{rel.icon} {rel.label}</Chip>
                      </span>
                      <span className="muted">{r.note}</span>
                      <span className="muted small">
                        Since {fmtRelative(r.since, now)}
                        {r.expiresAt && <> · ends {fmtRelative(r.expiresAt, now)}</>} · reputation {r.reputation > 0 ? '+' : ''}{r.reputation}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="muted small">
                Alliances share attack plans and supplies; breaking one starts a cooldown and notifies everyone (GDD §11).
              </p>
              <div className="hub-row">
                <ComingSoonButton>Propose alliance</ComingSoonButton>
                <ComingSoonButton>Offer ceasefire</ComingSoonButton>
              </div>
            </div>
          )}

          {tab === 'treasury' && (
            <div className="hub-stack">
              <div className="hub-stats">
                <Stat label="Balance" value={`◆ ${fmtNum(team.treasury.balance)}`} />
                <Stat label="Income / day" value={`+${team.treasury.incomePerDay}`} />
                <Stat label="Upkeep / day" value={`−${team.treasury.upkeepPerDay}`} />
              </div>
              <div className="hub-table-wrap">
                <table className="hub-table">
                  <thead><tr><th>When</th><th>Reason</th><th className="hub-hide-sm">By</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {team.treasury.entries.map((e) => (
                      <tr key={e.id}>
                        <td>{fmtRelative(e.at, now)}</td>
                        <td>{e.reason}</td>
                        <td className="hub-hide-sm">{e.by}</td>
                        <td className={`num ${e.delta >= 0 ? 'hub-up' : 'hub-down'}`}>{e.delta >= 0 ? '+' : ''}{e.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'log' && (
            <ul className="hub-timeline">
              {team.battleLog.map((l) => (
                <li key={l.id} style={{ '--dot': l.pointsDelta > 0 ? 'var(--good)' : l.pointsDelta < 0 ? 'var(--danger)' : 'var(--info)' } as CSSProperties}>
                  <div className="hub-row" style={{ gap: 8 }}>
                    <strong>{l.summary}</strong>
                    {l.pointsDelta !== 0 && <Chip tone={l.pointsDelta > 0 ? 'good' : 'bad'}>{l.pointsDelta > 0 ? '+' : ''}{l.pointsDelta} ◆</Chip>}
                  </div>
                  <div className="muted small">{fmtDateTime(l.at)}</div>
                </li>
              ))}
            </ul>
          )}

          {tab === 'roles' && (
            <div className="hub-table-wrap">
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    {roles.map((r) => <th key={r.id} className="num">{r.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {perms.map((p) => (
                    <tr key={p}>
                      <td>{PERMISSION_LABELS[p]}</td>
                      {roles.map((r) => (
                        <td key={r.id} className="num">
                          {r.permissions.includes(p) ? <span className="hub-perm-yes" aria-label="yes">✓</span> : <span className="hub-perm-no" aria-label="no">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs>
      </div>

      <div className="hub-mt">{createCard}</div>
    </HubPage>
  );
}
