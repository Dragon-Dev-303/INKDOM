'use client';

import Link from 'next/link';
import { useState } from 'react';
import { services } from '@/services';
import {
  allocationTotal, ATTRIBUTE_IDS, ATTRIBUTE_RULES, ATTRIBUTES, attributeEffect, EQUIPMENT_SLOTS, nextPointValue,
  type Ability, type Allocation, type Archetype, type ArchetypeId, type BossBuild, type EquipmentItem, type EquipmentSlot,
} from '@/services/boss';
import { useServiceData } from './hooks';
import { StickFigure } from './StickFigure';
import { Chip, ComingSoonButton, ErrorNote, HubPage, Loading, Meter, Panel, Pips, RarityChip } from './ui';

const EMPTY: Allocation = { strength: 0, agility: 0, magic: 0, stamina: 0, defense: 0, precision: 0 };

export default function BossScreen() {
  const res = useServiceData('boss-editor', () =>
    Promise.all([services.boss.getMyBoss(), services.boss.listArchetypes(), services.boss.listEquipment(), services.boss.listAbilities()]),
  );
  return (
    <HubPage featureId="boss">
      {res.status === 'loading' && <Loading />}
      {res.status === 'error' && <ErrorNote error={res.error} />}
      {res.status === 'ready' && <BossEditor build={res.data[0]} archetypes={res.data[1]} equipment={res.data[2]} abilities={res.data[3]} />}
    </HubPage>
  );
}

function BossEditor(props: { build: BossBuild; archetypes: Archetype[]; equipment: EquipmentItem[]; abilities: Ability[] }) {
  const [archId, setArchId] = useState<ArchetypeId>(props.build.archetypeId);
  const [alloc, setAlloc] = useState<Allocation>(props.build.allocation);
  const [equip, setEquip] = useState(props.build.equipment);
  const arch = props.archetypes.find((a) => a.id === archId)!;
  const spent = allocationTotal(alloc);
  const left = ATTRIBUTE_RULES.budget - spent;

  const change = (id: keyof Allocation, d: number) =>
    setAlloc((a) => {
      const v = a[id] + d;
      if (v < 0 || v > ATTRIBUTE_RULES.maxPerAttribute) return a;
      if (d > 0 && allocationTotal(a) >= ATTRIBUTE_RULES.budget) return a;
      return { ...a, [id]: v };
    });

  return (
    <div className="hub-stack">
      <Panel title="Class" icon="🎭" actions={<Chip>10 archetypes · GDD §4</Chip>}>
        <div className="hub-auto-grid tight" role="radiogroup" aria-label="Boss class">
          {props.archetypes.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={a.id === archId}
              className={`hub-card${a.id === archId ? ' selected' : ''}`}
              onClick={() => setArchId(a.id)}
            >
              <span className="hub-card-icon" aria-hidden="true">{a.icon}</span>
              <strong>{a.name}</strong>
              <span className="muted">{a.role}</span>
              <Pips value={a.difficulty} max={3} label="Difficulty" />
            </button>
          ))}
        </div>
      </Panel>

      <div className="hub-grid hub-grid-main">
        <Panel
          title="Attributes"
          icon="📊"
          actions={
            <div className="hub-row">
              <button className="btn small" onClick={() => setAlloc(EMPTY)}>Clear</button>
              <button className="btn small" onClick={() => setAlloc(props.build.allocation)}>Revert</button>
            </div>
          }
        >
          <div className="hub-row spread" style={{ marginBottom: 6 }}>
            <div>
              <div className={`hub-budget${left < 0 ? ' over' : ''}`} aria-live="polite">{left} pts left</div>
              <div className="muted small">Budget {ATTRIBUTE_RULES.budget} · max {ATTRIBUTE_RULES.maxPerAttribute} per attribute · {arch.name} base included</div>
            </div>
            <div className="muted small" style={{ maxWidth: 300 }}>
              Diminishing returns: each point gives +5% up to 4 points, +3% up to 8, then +1.5%. Ranked PvP may normalise builds.
            </div>
          </div>
          {ATTRIBUTE_IDS.map((id) => {
            const def = ATTRIBUTES[id];
            const base = arch.base[id];
            const total = base + alloc[id];
            const eff = attributeEffect(total);
            return (
              <div key={id} className="hub-attr">
                <div className="hub-attr-name">
                  <strong><span aria-hidden="true">{def.icon}</span> {def.label}</strong>
                  <span>{def.effect}</span>
                </div>
                <div className="hub-stepper">
                  <button className="btn" onClick={() => change(id, -1)} disabled={alloc[id] === 0} aria-label={`Remove a point from ${def.label}`}>−</button>
                  <output aria-label={`${def.label} points`}>{base}+{alloc[id]}</output>
                  <button className="btn" onClick={() => change(id, 1)} disabled={left <= 0 || alloc[id] >= ATTRIBUTE_RULES.maxPerAttribute} aria-label={`Add a point to ${def.label}`}>+</button>
                </div>
                <Meter label={`+${eff}% · next point +${nextPointValue(total)}%`} value={eff} max={attributeEffect(ATTRIBUTE_RULES.maxPerAttribute + 6)} showValue="" tone={nextPointValue(total) < 3 ? 'info' : 'accent'} />
              </div>
            );
          })}
        </Panel>

        <div className="hub-stack">
          <Panel title={arch.name} icon={arch.icon}>
            <div className="hub-row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
              <StickFigure className="hub-boss-figure" pose="fight" accent="var(--attacker)" label={`${arch.name} preview`} />
              <div>
                <p style={{ margin: 0 }}>{arch.description}</p>
                <p className="muted small" style={{ margin: '6px 0 0' }}>{props.build.name} · Level {props.build.level}</p>
              </div>
            </div>
            <div className="hub-row hub-mt">
              <ComingSoonButton note="Saving builds arrives with online profiles">Save build</ComingSoonButton>
              <Link href="/shop" className="btn small">🎨 Cosmetics</Link>
            </div>
          </Panel>
          <Panel title="Abilities" icon="✨">
            <div className="hub-stack" style={{ gap: 8 }}>
              {props.abilities
                .filter((a) => a.archetypeId === archId || a.archetypeId === null)
                .map((a) => (
                  <div key={a.id} className="hub-slot">
                    <span style={{ fontSize: 20 }} aria-hidden="true">{a.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{a.name}</strong> {a.archetypeId === null && <Chip tone="warn">Territory unlock</Chip>}
                      <div className="muted small">{a.description}</div>
                    </div>
                    <span className="muted small" style={{ textAlign: 'right' }}>{a.cooldownSec}s<br />{a.energy} en</span>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Equipment" icon="🎒">
        <div className="hub-auto-grid">
          {(Object.keys(EQUIPMENT_SLOTS) as EquipmentSlot[]).map((slot) => {
            const items = props.equipment.filter((e) => e.slot === slot);
            const current = items.find((e) => e.id === equip[slot]);
            return (
              <div key={slot} className="hub-card">
                <label className="hub-label" htmlFor={`eq-${slot}`}>{EQUIPMENT_SLOTS[slot]}</label>
                <select
                  id={`eq-${slot}`}
                  className="hub-select"
                  value={equip[slot] ?? ''}
                  onChange={(e) => setEquip((q) => ({ ...q, [slot]: e.target.value || undefined }))}
                >
                  <option value="">— Empty —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id} disabled={!it.unlocked}>
                      {it.name}{it.unlocked ? '' : it.unlockCost ? ` (🔒 ${it.unlockCost} ◆)` : ' (🔒 territory)'}
                    </option>
                  ))}
                </select>
                {current ? (
                  <span className="hub-row" style={{ gap: 6 }}><RarityChip rarity={current.rarity} /><span className="muted small">{current.stats}</span></span>
                ) : (
                  <span className="muted small">Nothing equipped</span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
