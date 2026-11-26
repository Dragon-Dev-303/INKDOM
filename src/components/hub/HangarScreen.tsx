'use client';

import Link from 'next/link';
import { useState } from 'react';
import { services } from '@/services';
import type { BotSkin, BotType, BotTypeId, BotWeapon, Personality, Squad, SquadSlot } from '@/services/bots';
import { useServiceData } from './hooks';
import { StickFigure } from './StickFigure';
import { Chip, ComingSoonButton, ErrorNote, HubPage, Loading, Panel, Pips, RarityChip } from './ui';

export default function HangarScreen() {
  const res = useServiceData('hangar', () =>
    Promise.all([
      services.bots.listBotTypes(),
      services.bots.listPersonalities(),
      services.bots.listWeapons(),
      services.bots.listSkins(),
      services.bots.getSquad(),
    ]),
  );
  return (
    <HubPage featureId="hangar">
      {res.status === 'loading' && <Loading />}
      {res.status === 'error' && <ErrorNote error={res.error} />}
      {res.status === 'ready' && (
        <Hangar types={res.data[0]} personalities={res.data[1]} weapons={res.data[2]} skins={res.data[3]} squad={res.data[4]} />
      )}
    </HubPage>
  );
}

function Hangar(props: { types: BotType[]; personalities: Personality[]; weapons: BotWeapon[]; skins: BotSkin[]; squad: Squad }) {
  const [slots, setSlots] = useState<SquadSlot[]>(props.squad.slots);
  const [active, setActive] = useState(0);
  const [inspect, setInspect] = useState<BotTypeId>(props.types[0].id);
  const typeById = new Map(props.types.map((t) => [t.id, t]));
  const cost = slots.reduce((s, sl) => s + (sl.botTypeId ? typeById.get(sl.botTypeId)?.squadCost ?? 0 : 0), 0);
  const over = cost > props.squad.budget;
  const insp = typeById.get(inspect)!;

  const update = (patch: Partial<SquadSlot>) => setSlots((all) => all.map((s, i) => (i === active ? { ...s, ...patch } : s)));
  const assign = (t: BotType) => {
    if (!t.unlocked) return;
    update({ botTypeId: t.id, weaponId: t.defaultWeaponId, personalityId: t.defaultPersonalityId });
  };
  const slot = slots[active];

  return (
    <div className="hub-stack">
      <Panel
        title={props.squad.name}
        icon="🪖"
        actions={
          <div className="hub-row">
            <Chip tone={over ? 'bad' : 'good'}>Squad cost {cost}/{props.squad.budget}</Chip>
            <button className="btn small" onClick={() => setSlots(props.squad.slots)}>Revert</button>
          </div>
        }
      >
        <p className="muted small">Four squad slots (GDD §5). Select a slot, then pick a bot type below. Personalities change behaviour, never raw power.</p>
        <div className="hub-squad" role="listbox" aria-label="Squad slots">
          {slots.map((s, i) => {
            const t = s.botTypeId ? typeById.get(s.botTypeId) : null;
            const skin = props.skins.find((k) => k.id === s.skinId);
            return (
              <button
                key={i}
                role="option"
                aria-selected={i === active}
                className={`hub-card hub-squad-slot${i === active ? ' selected' : ''}${t ? '' : ' empty'}`}
                onClick={() => setActive(i)}
              >
                {t ? (
                  <>
                    <span className="hub-row spread">
                      <strong>Slot {i + 1}</strong>
                      <span aria-hidden="true" style={{ fontSize: 22 }}>{t.icon}</span>
                    </span>
                    <StickFigure className="hub-boss-figure" color={skin?.color ?? '#e5e7eb'} pose="stand" />
                    <span>{t.name}</span>
                    <span className="muted small">
                      {props.personalities.find((p) => p.id === s.personalityId)?.name} · {props.weapons.find((w) => w.id === s.weaponId)?.name}
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" style={{ fontSize: 26 }}>＋</span>
                    <span>Empty slot {i + 1}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {slot.botTypeId && (
          <div className="hub-grid hub-grid-3 hub-mt">
            <div className="hub-field">
              <label htmlFor="slot-personality">Personality</label>
              <select id="slot-personality" className="hub-select" value={slot.personalityId} onChange={(e) => update({ personalityId: e.target.value })}>
                {props.personalities.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
              </select>
            </div>
            <div className="hub-field">
              <label htmlFor="slot-weapon">Weapon</label>
              <select id="slot-weapon" className="hub-select" value={slot.weaponId} onChange={(e) => update({ weaponId: e.target.value })}>
                {props.weapons.map((w) => (
                  <option key={w.id} value={w.id} disabled={!w.unlocked}>
                    {w.name} ({w.kind}, {w.range}){w.unlocked ? '' : ` 🔒 ${w.unlockCost} ◆`}
                  </option>
                ))}
              </select>
            </div>
            <div className="hub-field">
              <label htmlFor="slot-skin">Skin</label>
              <select id="slot-skin" className="hub-select" value={slot.skinId ?? ''} onChange={(e) => update({ skinId: e.target.value || null })}>
                <option value="">Default</option>
                {props.skins
                  .filter((k) => k.botTypeId === null || k.botTypeId === slot.botTypeId)
                  .map((k) => (
                    <option key={k.id} value={k.id} disabled={!k.owned}>
                      {k.name}{k.owned ? '' : ` 🔒 ${k.cost} ◆`}
                    </option>
                  ))}
              </select>
            </div>
            <div className="hub-row hub-span-all">
              <button className="btn small" onClick={() => update({ botTypeId: null, skinId: null })}>Empty this slot</button>
              <ComingSoonButton note="Squads save with online profiles">Save squad</ComingSoonButton>
            </div>
          </div>
        )}
      </Panel>

      <div className="hub-grid hub-grid-main">
        <Panel title="Bot types" icon="🤖" actions={<Chip>10 types</Chip>}>
          <div className="hub-auto-grid tight">
            {props.types.map((t) => (
              <button
                key={t.id}
                className={`hub-card${inspect === t.id ? ' selected' : ''}${t.unlocked ? '' : ' locked'}`}
                onClick={() => setInspect(t.id)}
                aria-pressed={inspect === t.id}
              >
                <span className="hub-row spread">
                  <span className="hub-card-icon" aria-hidden="true">{t.icon}</span>
                  {t.unlocked ? <Chip tone="good">Owned</Chip> : t.unlockRequirement ? <Chip tone="info">Territory</Chip> : <Chip tone="warn">◆ {t.unlockCost}</Chip>}
                </span>
                <strong>{t.name}</strong>
                <span className="muted">{t.role}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={insp.name} icon={insp.icon}>
          <p>{insp.description}</p>
          <div className="hub-bot-stats">
            <span>Health</span><Pips value={insp.stats.health} label="Health" />
            <span>Damage</span><Pips value={insp.stats.damage} label="Damage" />
            <span>Speed</span><Pips value={insp.stats.speed} label="Speed" />
            <span>Range</span><Pips value={insp.stats.range} label="Range" />
          </div>
          <div className="hub-chips hub-mt">
            <Chip>Squad cost {insp.squadCost}</Chip>
            <Chip>Default: {props.weapons.find((w) => w.id === insp.defaultWeaponId)?.name}</Chip>
          </div>
          {insp.unlockRequirement && <p className="muted small hub-mt">🔒 {insp.unlockRequirement}</p>}
          <div className="hub-row hub-mt">
            {insp.unlocked ? (
              <button className="btn primary small" onClick={() => assign(insp)}>Put in slot {active + 1}</button>
            ) : insp.unlockRequirement ? (
              <Link href="/world" className="btn small">Find territory</Link>
            ) : (
              <ComingSoonButton note="Unlocking with points arrives with the economy">Unlock ◆ {insp.unlockCost}</ComingSoonButton>
            )}
          </div>
        </Panel>
      </div>

      <div className="hub-grid hub-grid-2">
        <Panel title="Personalities" icon="🧠">
          <div className="hub-stack" style={{ gap: 8 }}>
            {props.personalities.map((p) => (
              <div key={p.id} className="hub-slot">
                <span style={{ fontSize: 20 }} aria-hidden="true">{p.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{p.name}</strong>
                  <div className="muted small">{p.description}</div>
                  <div className="hub-chips" style={{ marginTop: 4 }}>{p.behaviours.map((b) => <Chip key={b}>{b}</Chip>)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Skins" icon="🎨" actions={<Link href="/shop" className="btn small">Shop</Link>}>
          <div className="hub-auto-grid tight">
            {props.skins.map((k) => (
              <div key={k.id} className={`hub-card${k.owned ? '' : ' locked'}`} style={{ alignItems: 'center', textAlign: 'center' }}>
                <StickFigure className="hub-boss-figure" color={k.color} pose="cheer" />
                <strong style={{ fontSize: 13 }}>{k.name}</strong>
                <RarityChip rarity={k.rarity} />
                <span className="muted small">{k.owned ? 'Owned' : `◆ ${k.cost}`}{k.botTypeId ? ` · ${props.types.find((t) => t.id === k.botTypeId)?.name}` : ''}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
