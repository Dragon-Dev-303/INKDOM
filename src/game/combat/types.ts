/**
 * Combat data types (INKDOM_v2_Plan.md §2). Pure: no browser or framework code.
 * A move is data; the engine (resolver + sim/combat) never needs code changes to add one.
 */
import type { WeaponId } from '../sim/types';
import type { HitHeight, MoveCategory } from './movelist';

/** Abstract attack buttons: P punch, K kick, H heavy, W weapon/elbow, S special. */
export type Button = 'P' | 'K' | 'H' | 'W' | 'S';
export const BUTTONS: readonly Button[] = ['P', 'K', 'H', 'W', 'S'];

/** Direction relative to facing at the moment of the press. N = neutral. */
export type RelDir = 'N' | 'F' | 'B' | 'D' | 'U';

export interface Trigger {
  button: Button;
  /** Required direction; omitted = any direction falls back to this move. */
  dir?: RelDir;
  /** Where the move can start. */
  air?: 'ground' | 'air' | 'any';
  /** Second button for a chord (both pressed within TUNING.combat.chordTicks). */
  chord?: Button;
}

export interface MoveHit {
  damage: number;
  height: HitHeight;
  /** Hitbox in units before boss scaling: from the body front forwards `reach`, vertical band above the feet. */
  reach: number;
  yBand: [number, number];
  /** Horizontal knockback speed (units/s) applied to the victim, away from the attacker. */
  knockback: number;
  /** Vertical launch speed for launchers (units/s); 0 = none. */
  launch?: number;
  hitstun: number;
  hitstop: number;
  /** Stagger points (towards the stagger-knockdown threshold). */
  stagger: number;
  /** Always knock down on hit, or only on counter-hit. */
  knockdown?: boolean | 'counter';
  /** Breaks a block outright (iron bar smash). */
  guardBreak?: boolean;
  /** Extra stamina removed from a blocking victim (guard crush). */
  guardCrush?: number;
}

export interface MoveDef {
  id: string;
  name: string;
  category: MoveCategory;
  description: string;
  /** How the move starts from neutral; null = only reachable through a chain. */
  trigger: Trigger | null;
  requires?: { weapons?: readonly WeaponId[]; energy?: number; stamina?: number };
  cost?: { energy?: number; stamina?: number };
  frames: { startup: number; active: number; recovery: number };
  hit: MoveHit;
  /** Forward travel in units spread over the startup frames (lunges). Negative = backwards. */
  dash?: number;
  /** Turn around before striking (back kick). */
  turn?: boolean;
  /** Follow-ups: button → candidate move ids, first whose requirements pass wins. */
  chains?: Partial<Record<Button, readonly string[]>>;
  /** Animation clip id (mocap clip when available, otherwise the authored fallback). */
  clip: string;
  /** Provenance of the motion, shown in the move list. */
  source: string;
}
