/**
 * Combo resolver (INKDOM_v2_Plan.md §2.3): records presses into the fighter's input log and
 * decides which move (if any) starts this tick. Deterministic and pure.
 *
 * Order: chord upgrade → chain follow-up → chord starter → directional → air → neutral.
 */
import { TUNING } from '../config/tuning';
import type { Fighter, InputFrame } from '../sim/types';
import { getMove, MOVES, moveTotal } from './moves';
import type { Button, MoveDef, RelDir } from './types';

const C = TUNING.combat;
const LOG_SIZE = 10;

const PRESS_FIELDS: readonly [Button, keyof InputFrame][] = [
  ['P', 'punchPressed'], ['K', 'kickPressed'], ['H', 'heavyPressed'], ['W', 'weaponPressed'], ['S', 'specialPressed'],
];

/** Direction relative to facing. Down wins (crouch moves), then forward/back, then up. */
export function relDir(input: InputFrame, facing: 1 | -1): RelDir {
  if (input.down) return 'D';
  if (input.left !== input.right) {
    const dx = input.right ? 1 : -1;
    return dx === facing ? 'F' : 'B';
  }
  if (input.up) return 'U';
  return 'N';
}

/** Append this tick's presses to the log (oldest entries are dropped). */
export function recordPresses(f: Fighter, input: InputFrame, tick: number): void {
  const dir = relDir(input, f.facing);
  const air = f.mode === 'AIR';
  for (const [b, field] of PRESS_FIELDS) {
    if (input[field]) f.inputLog.push({ b, dir, air, tick, used: false });
  }
  if (f.inputLog.length > LOG_SIZE) f.inputLog.splice(0, f.inputLog.length - LOG_SIZE);
}

/** Unused presses still inside the buffer window, oldest first. */
function pending(f: Fighter, tick: number) {
  return f.inputLog.filter((p) => !p.used && tick - p.tick <= C.pressBufferTicks);
}

/** Requirements that depend on the fighter (weapon, resources). */
export function canUse(f: Fighter, m: MoveDef): boolean {
  const r = m.requires;
  if (r?.weapons && !r.weapons.includes(f.weapon)) return false;
  if (r?.energy && f.energy < r.energy) return false;
  const stamina = Math.max(r?.stamina ?? 0, m.cost?.stamina ?? 0);
  if (stamina && f.stamina < stamina * 0.5) return false; // tired fighters can still throw a weak heavy
  return true;
}

function firstUsable(f: Fighter, ids: readonly string[] | undefined): MoveDef | null {
  if (!ids) return null;
  for (const id of ids) {
    const m = getMove(id);
    if (m && canUse(f, m)) return m;
  }
  return null;
}

/**
 * Is the current move inside its chain window? On hit the window opens right after contact
 * (hit-confirm); on whiff only once the active frames are over, so every strike in a string
 * always gets its hit check. It closes TUNING.combat.chainCloseBeforeEnd frames before the end.
 */
export function inChainWindow(f: Fighter): boolean {
  const m = getMove(f.moveId);
  if (!m || f.action !== 'ATTACK') return false;
  const opens = f.attackHitIds.length > 0 ? m.frames.startup + 1 : m.frames.startup + m.frames.active;
  return f.actionTick >= opens && f.actionTick <= moveTotal(m) - C.chainCloseBeforeEnd;
}

const starterAir = (m: MoveDef, air: boolean) => {
  const where = m.trigger?.air ?? 'ground';
  return where === 'any' || (where === 'air') === air;
};

/** Best neutral starter for a press (directional first, then plain). */
function starterFor(f: Fighter, b: Button, dir: RelDir, air: boolean): MoveDef | null {
  const candidates = MOVES.filter((m) => m.trigger && !m.trigger.chord && m.trigger.button === b && starterAir(m, air) && canUse(f, m));
  const exact = candidates.find((m) => m.trigger!.dir === dir);
  if (exact) return exact;
  return candidates.find((m) => !m.trigger!.dir) ?? null;
}

function chordFor(f: Fighter, a: Button, b: Button, air: boolean): MoveDef | null {
  return MOVES.find((m) => m.trigger?.chord && starterAir(m, air) && canUse(f, m) &&
    ((m.trigger.button === a && m.trigger.chord === b) || (m.trigger.button === b && m.trigger.chord === a))) ?? null;
}

export interface Decision { move: MoveDef; via: 'chain' | 'chord' | 'starter' }

/**
 * Decide the move to start this tick, marking the presses it consumes.
 * `free` = the fighter could start a move from neutral (no action, not on a ladder).
 */
export function resolveMove(f: Fighter, tick: number, free: boolean): Decision | null {
  const queue = pending(f, tick);
  if (queue.length === 0) return null;
  const air = f.mode === 'AIR';

  // 1. Chord upgrade: a partner button pressed right after a move started turns it into the chord move.
  if (f.action === 'ATTACK' && f.actionTick <= C.chordUpgradeTicks) {
    const started = f.inputLog.filter((p) => p.used && tick - p.tick <= C.chordUpgradeTicks + 1).pop();
    if (started) {
      for (const p of queue) {
        if (Math.abs(p.tick - started.tick) > C.chordTicks) continue;
        const chord = chordFor(f, started.b, p.b, air);
        if (chord && chord.id !== f.moveId) {
          p.used = true;
          return { move: chord, via: 'chord' };
        }
      }
    }
  }

  // 2. Chain follow-up from the current move.
  if (f.action === 'ATTACK') {
    const cur = getMove(f.moveId);
    if (!cur?.chains) return null;
    if (!inChainWindow(f)) return null; // keep presses buffered until the window opens
    for (const p of queue) {
      const next = firstUsable(f, cur.chains[p.b]);
      if (next) {
        p.used = true;
        return { move: next, via: 'chain' };
      }
    }
    return null;
  }

  if (!free) return null;

  // 3. Chord starter: two different buttons within chordTicks.
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];
      if (a.b === b.b || Math.abs(a.tick - b.tick) > C.chordTicks) continue;
      const chord = chordFor(f, a.b, b.b, air);
      if (chord) {
        a.used = true;
        b.used = true;
        return { move: chord, via: 'chord' };
      }
    }
  }

  // 4–6. Directional / air / neutral starter from the oldest usable press.
  for (const p of queue) {
    const m = starterFor(f, p.b, p.dir, air);
    if (m) {
      p.used = true;
      return { move: m, via: 'starter' };
    }
    p.used = true; // a press with no possible move (e.g. special without energy) is dropped
  }
  return null;
}

/** The move a button would start from neutral on the ground (AI range estimates, move list). */
export function neutralStarter(f: Fighter, b: Button): MoveDef | null {
  return starterFor(f, b, 'N', f.mode === 'AIR');
}
