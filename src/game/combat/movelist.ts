/**
 * Human-readable move list generated from the move database (INKDOM_v2_Plan.md §2.2).
 * Used by How to Play, /moves, the tutorial and the boss editor.
 * CONTRACT for UI code: only `MoveDoc`, `listMoveDocs` and `formatInputs` are public.
 */
import { keyName, type Action, type Bindings } from '../config/controls';
import { MOVE_BY_ID, MOVES } from './moves';
import type { MoveDef } from './types';

export type MoveCategory = 'punch' | 'kick' | 'heavy' | 'weapon' | 'special' | 'air' | 'crouch' | 'directional' | 'chord' | 'defense';
export type HitHeight = 'high' | 'mid' | 'low' | 'overhead';

/** One input step. `dir` is relative to facing (F = forward, B = back, D = down). `with` = pressed together. */
export interface InputStep { button: 'P' | 'K' | 'H' | 'W' | 'S' | 'BLOCK' | 'DODGE'; dir?: 'F' | 'B' | 'D' | 'U'; with?: 'P' | 'K' | 'H' | 'W' | 'S'; air?: boolean }

export interface MoveDoc {
  id: string;
  name: string;
  category: MoveCategory;
  /** Sequence of steps, e.g. [P, P, K] for jab → cross → low kick. */
  inputs: InputStep[];
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  height: HitHeight | null;
  properties: string[];
  /** e.g. 'Fists only', 'Sword', '25 energy'. */
  requires: string | null;
  description: string;
  /** Where the motion comes from (mocap clip or authored). */
  source: string;
}

const BUTTON_ACTION: Record<InputStep['button'], Action> = {
  P: 'punch', K: 'kick', H: 'heavy', W: 'weapon', S: 'special', BLOCK: 'block', DODGE: 'dodge',
};
const DIR_LABEL = { F: 'Fwd', B: 'Back', D: 'Down', U: 'Up' } as const;

/** "J → J → K", "Fwd + J", "U + K" for the given bindings. */
export function formatInputs(steps: InputStep[], b: Bindings): string {
  const key = (btn: InputStep['button']) => keyName(b[BUTTON_ACTION[btn]][0] ?? btn);
  return steps
    .map((s) => {
      let t = key(s.button);
      if (s.with) t = `${t} + ${key(s.with)}`;
      if (s.dir) t = `${DIR_LABEL[s.dir]} + ${t}`;
      if (s.air) t = `(air) ${t}`;
      return t;
    })
    .join(' → ');
}

/** Shortest input path to every move: neutral triggers, then breadth-first along chain edges. */
function inputPaths(): Map<string, InputStep[]> {
  const paths = new Map<string, InputStep[]>();
  const queue: string[] = [];
  for (const m of MOVES) {
    if (!m.trigger) continue;
    const t = m.trigger;
    const step: InputStep = { button: t.button };
    if (t.dir && t.dir !== 'N') step.dir = t.dir;
    if (t.chord) step.with = t.chord;
    if (t.air === 'air') step.air = true;
    paths.set(m.id, [step]);
    queue.push(m.id);
  }
  while (queue.length) {
    const id = queue.shift()!;
    const m = MOVE_BY_ID[id];
    for (const [b, targets] of Object.entries(m.chains ?? {})) {
      for (const to of targets ?? []) {
        if (paths.has(to)) continue;
        paths.set(to, [...paths.get(id)!, { button: b as InputStep['button'] }]);
        queue.push(to);
      }
    }
  }
  return paths;
}

function properties(m: MoveDef): string[] {
  const p: string[] = [];
  const h = m.hit;
  if (h.launch) p.push('Launcher');
  if (h.knockdown === true) p.push('Knockdown');
  if (h.knockdown === 'counter') p.push('Knockdown on counter-hit');
  if (h.guardBreak) p.push('Breaks guard');
  if (h.guardCrush) p.push('Guard crush');
  if (m.dash && m.dash > 0.5) p.push('Advancing');
  if (h.knockback >= 6) p.push('Big pushback');
  if (m.chains) p.push('Combo starter');
  return p;
}

function requiresText(m: MoveDef): string | null {
  const parts: string[] = [];
  const w = m.requires?.weapons;
  if (w) parts.push(w.map((x) => (x === 'FISTS' ? 'Unarmed' : x === 'SHORT_SWORD' ? 'Sword' : 'Iron bar')).join(' / '));
  if (m.cost?.energy) parts.push(m.cost.energy + ' energy');
  if (m.cost?.stamina) parts.push(m.cost.stamina + ' stamina');
  return parts.length ? parts.join(' · ') : null;
}

let docs: MoveDoc[] | null = null;

/** Every move with its input path, frame data and properties (stable order: database order). */
export function listMoveDocs(): MoveDoc[] {
  if (docs) return docs;
  const paths = inputPaths();
  docs = MOVES.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    inputs: paths.get(m.id) ?? [],
    damage: m.hit.damage,
    startup: m.frames.startup,
    active: m.frames.active,
    recovery: m.frames.recovery,
    height: m.hit.height,
    properties: properties(m),
    requires: requiresText(m),
    description: m.description,
    source: m.source,
  }));
  return docs;
}
