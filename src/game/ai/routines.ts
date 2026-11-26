/**
 * Combo routines for AI fighters (INKDOM_v2_Plan.md §2, T-C14). A routine is a button
 * sequence fed one press per chain window, so bots use exactly the same combo engine as
 * humans. Add personalities by adding weighted routine tables.
 */
import { neutralStarter, canUse } from '../combat/resolver';
import { getMove } from '../combat/moves';
import type { Button } from '../combat/types';
import type { Fighter, WeaponId } from '../sim/types';

export interface Routine { buttons: readonly Button[]; weight: number; weapons?: readonly WeaponId[]; energy?: number }

export const ROUTINES: readonly Routine[] = [
  { buttons: ['P'], weight: 2.5 },
  { buttons: ['P', 'P'], weight: 3 },
  { buttons: ['P', 'P', 'P', 'P'], weight: 1.4 },
  { buttons: ['P', 'K'], weight: 2 },
  { buttons: ['P', 'P', 'K'], weight: 1.5 },
  { buttons: ['P', 'H'], weight: 0.8 },
  { buttons: ['K'], weight: 1.6 },
  { buttons: ['K', 'K'], weight: 1.4 },
  { buttons: ['K', 'K', 'K'], weight: 0.9 },
  { buttons: ['H'], weight: 0.6 },
  { buttons: ['W'], weight: 2, weapons: ['SHORT_SWORD', 'IRON_BAR'] },
  { buttons: ['W', 'W'], weight: 1.6, weapons: ['SHORT_SWORD', 'IRON_BAR'] },
  { buttons: ['W', 'W', 'W'], weight: 1, weapons: ['SHORT_SWORD'] },
  { buttons: ['P', 'W'], weight: 0.8 },
  { buttons: ['P', 'S'], weight: 0.8, energy: 25 },
  { buttons: ['S'], weight: 0.5, energy: 50 },
];

/** Distance (centre to centre) at which the routine's first move connects. */
export function routineRange(f: Fighter, r: Routine): number {
  const m = neutralStarter(f, r.buttons[0]);
  if (!m) return 0;
  return 0.3 + m.hit.reach * f.scale + 0.3 + (m.dash ?? 0) * 0.8;
}

export function usableRoutines(f: Fighter, dist: number): Routine[] {
  return ROUTINES.filter((r) => {
    if (r.weapons && !r.weapons.includes(f.weapon)) return false;
    if (r.energy && f.energy < r.energy) return false;
    const first = neutralStarter(f, r.buttons[0]);
    if (!first || !canUse(f, first)) return false;
    return routineRange(f, r) - 0.1 >= dist;
  });
}

/** Typical engage distance for positioning: the fighter's main starter. */
export function preferredRange(f: Fighter): number {
  const main = neutralStarter(f, f.weapon === 'FISTS' ? 'P' : 'W') ?? getMove('jab');
  return 0.3 + 0.7 * (main?.hit.reach ?? 0.75) * f.scale;
}
