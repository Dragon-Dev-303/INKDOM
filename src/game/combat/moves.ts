/**
 * The move database (INKDOM_v2_Plan.md §2.2). Frame data at 60 Hz follows common fighting-game
 * conventions (jabs 4f, heavies 12f+, lows/overheads slower, launch/knockdown finishers).
 * Motion sources point at the CMU Motion Capture Database clips (see docs/MOCAP.md) or
 * hand-authored clips. Add a move by adding an entry here (and optional chain edges).
 */
import type { WeaponId } from '../sim/types';
import type { MoveDef } from './types';

const ARMED: readonly WeaponId[] = ['SHORT_SWORD', 'IRON_BAR'];
const SWORD: readonly WeaponId[] = ['SHORT_SWORD'];
const BAR: readonly WeaponId[] = ['IRON_BAR'];
const FISTS: readonly WeaponId[] = ['FISTS'];

const HIGH: [number, number] = [1.2, 1.7];
const MID: [number, number] = [0.65, 1.3];
const LOW: [number, number] = [0.0, 0.55];
const OVER: [number, number] = [0.9, 1.9];

const CMU = (s: string) => `CMU mocap ${s}`;
const AUTHORED = 'Authored (martial-arts reference)';

/** Weapon follow-ups shared by every move that chains into the weapon button. */
const WEAPON_OR_ELBOW = ['sword_slash', 'bar_smash', 'elbow'] as const;

export const MOVES: readonly MoveDef[] = [
  // ---------------- Punch strings (boxing) ----------------
  {
    id: 'jab', name: 'Jab', category: 'punch', clip: 'jab', source: CMU('144 Punch_Sequence / 143_23 Punching'),
    description: 'Fast lead-hand straight. Starts most combos.',
    trigger: { button: 'P', air: 'ground' },
    frames: { startup: 4, active: 2, recovery: 8 },
    hit: { damage: 4, height: 'high', reach: 0.75, yBand: HIGH, knockback: 0.8, hitstun: 12, hitstop: 2, stagger: 0.5 },
    chains: { P: ['cross'], K: ['roundhouse'], H: ['power_straight'], W: WEAPON_OR_ELBOW, S: ['spin_backfist'] },
  },
  {
    id: 'cross', name: 'Cross', category: 'punch', clip: 'cross', source: CMU('144 Punch_Sequence / 14 boxing'),
    description: 'Rear-hand straight with hip rotation (J → J).',
    trigger: null,
    frames: { startup: 5, active: 3, recovery: 10 },
    dash: 0.15,
    hit: { damage: 6, height: 'high', reach: 0.85, yBand: HIGH, knockback: 1, hitstun: 14, hitstop: 3, stagger: 0.75 },
    chains: { P: ['lead_hook'], K: ['low_kick'] },
  },
  {
    id: 'lead_hook', name: 'Lead hook', category: 'punch', clip: 'lead_hook', source: CMU('13 boxing'),
    description: 'Short arcing lead hook (J → J → J).',
    trigger: null,
    frames: { startup: 6, active: 3, recovery: 12 },
    dash: 0.25,
    hit: { damage: 7, height: 'high', reach: 0.75, yBand: HIGH, knockback: 1, hitstun: 15, hitstop: 3, stagger: 0.75 },
    chains: { P: ['rear_uppercut'] },
  },
  {
    id: 'rear_uppercut', name: 'Rear uppercut', category: 'punch', clip: 'rear_uppercut', source: CMU('14 boxing'),
    description: 'Finisher: rising uppercut that launches (J → J → J → J).',
    trigger: null,
    frames: { startup: 7, active: 4, recovery: 18 },
    dash: 0.2,
    hit: { damage: 10, height: 'mid', reach: 0.75, yBand: [0.9, 1.7], knockback: 2.5, launch: 8, hitstun: 24, hitstop: 5, stagger: 1.5, knockdown: true },
  },
  {
    id: 'power_straight', name: 'Power straight', category: 'heavy', clip: 'overhand', source: CMU('14 boxing'),
    description: 'Jab into a full-weight rear straight (J → U). Crushes guard.',
    trigger: null,
    cost: { stamina: 12 },
    frames: { startup: 9, active: 3, recovery: 16 },
    dash: 0.3,
    hit: { damage: 12, height: 'high', reach: 0.95, yBand: HIGH, knockback: 5, hitstun: 18, hitstop: 5, stagger: 1.5, guardCrush: 20 },
  },
  {
    id: 'overhand', name: 'Overhand', category: 'heavy', clip: 'overhand', source: CMU('14 boxing'),
    description: 'Slow looping power punch (U). Crushes guard.',
    trigger: { button: 'H', air: 'ground' },
    cost: { stamina: 12 },
    frames: { startup: 12, active: 3, recovery: 18 },
    dash: 0.25,
    hit: { damage: 12, height: 'high', reach: 0.95, yBand: HIGH, knockback: 5, hitstun: 18, hitstop: 5, stagger: 1.5, guardCrush: 20 },
    chains: { K: ['roundhouse'] },
  },
  {
    id: 'elbow', name: 'Elbow strike', category: 'weapon', clip: 'elbow', source: AUTHORED + ' (Muay Thai sok)',
    description: 'Unarmed weapon button: short elbow that crushes guard (I, or J → I).',
    trigger: { button: 'W', air: 'ground' },
    requires: { weapons: FISTS },
    frames: { startup: 6, active: 3, recovery: 12 },
    hit: { damage: 8, height: 'high', reach: 0.55, yBand: HIGH, knockback: 2.5, hitstun: 15, hitstop: 4, stagger: 1, guardCrush: 15 },
    chains: { K: ['knee'] },
  },
  {
    id: 'spin_backfist', name: 'Spinning backfist', category: 'special', clip: 'spin_backfist', source: AUTHORED,
    description: 'Jab into a spinning backfist (J → O). Costs 25 energy.',
    trigger: null,
    requires: { energy: 25 }, cost: { energy: 25 },
    frames: { startup: 8, active: 3, recovery: 16 },
    hit: { damage: 11, height: 'high', reach: 0.85, yBand: HIGH, knockback: 4.5, hitstun: 20, hitstop: 5, stagger: 1.5, knockdown: 'counter' },
  },
  // ---------------- Kicks (karate / kickboxing) ----------------
  {
    id: 'front_kick', name: 'Front kick', category: 'kick', clip: 'front_kick', source: CMU('135_04 Mae-geri'),
    description: 'Straight push kick that drives the opponent back (K).',
    trigger: { button: 'K', air: 'ground' },
    frames: { startup: 8, active: 3, recovery: 13 },
    hit: { damage: 7, height: 'mid', reach: 1.1, yBand: MID, knockback: 5, hitstun: 16, hitstop: 3, stagger: 1 },
    chains: { K: ['roundhouse'] },
  },
  {
    id: 'roundhouse', name: 'Roundhouse kick', category: 'kick', clip: 'roundhouse', source: CMU('135_07 Mawashi-geri'),
    description: 'Turning kick to the body (K → K, or J → K).',
    trigger: null,
    frames: { startup: 9, active: 4, recovery: 16 },
    hit: { damage: 9, height: 'mid', reach: 1.15, yBand: [0.7, 1.45], knockback: 4, hitstun: 18, hitstop: 4, stagger: 1 },
    chains: { K: ['side_kick'] },
  },
  {
    id: 'side_kick', name: 'Side kick', category: 'kick', clip: 'side_kick', source: CMU('135_11 Yoko-geri'),
    description: 'Finisher: piercing side kick with big pushback (K → K → K).',
    trigger: null,
    frames: { startup: 10, active: 4, recovery: 18 },
    hit: { damage: 10, height: 'mid', reach: 1.25, yBand: MID, knockback: 8, hitstun: 20, hitstop: 5, stagger: 1.5 },
  },
  {
    id: 'low_kick', name: 'Low kick', category: 'kick', clip: 'low_kick', source: AUTHORED + ' (Dutch kickboxing 1-2-low)',
    description: 'Rear-leg kick to the thigh (J → J → K). Must be blocked low.',
    trigger: null,
    frames: { startup: 8, active: 3, recovery: 14 },
    hit: { damage: 8, height: 'low', reach: 1.0, yBand: LOW, knockback: 2, hitstun: 16, hitstop: 4, stagger: 1, knockdown: 'counter' },
  },
  // ---------------- Directional moves ----------------
  {
    id: 'lunge_punch', name: 'Lunge punch', category: 'directional', clip: 'lunge_punch', source: CMU('135_09 Oi-zuki'),
    description: 'Stepping punch that covers distance (Forward + J).',
    trigger: { button: 'P', dir: 'F', air: 'ground' },
    frames: { startup: 10, active: 3, recovery: 16 },
    dash: 1.2,
    hit: { damage: 10, height: 'high', reach: 0.9, yBand: HIGH, knockback: 4, hitstun: 17, hitstop: 4, stagger: 1.25 },
    chains: { K: ['roundhouse'] },
  },
  {
    id: 'knee', name: 'Knee strike', category: 'directional', clip: 'knee', source: CMU('86_06 knee kicking'),
    description: 'Rising knee at close range (Forward + K). Small launch.',
    trigger: { button: 'K', dir: 'F', air: 'ground' },
    frames: { startup: 7, active: 3, recovery: 14 },
    dash: 0.3,
    hit: { damage: 9, height: 'mid', reach: 0.6, yBand: [0.7, 1.5], knockback: 2, launch: 5, hitstun: 18, hitstop: 4, stagger: 1.25 },
  },
  {
    id: 'back_kick', name: 'Back kick', category: 'directional', clip: 'back_kick', source: AUTHORED + ' (karate ushiro-geri)',
    description: 'Turn and kick an enemy behind you (tap Back + K). Knocks down.',
    trigger: { button: 'K', dir: 'B', air: 'ground' },
    frames: { startup: 11, active: 4, recovery: 18 },
    hit: { damage: 12, height: 'mid', reach: 1.2, yBand: MID, knockback: 6, hitstun: 22, hitstop: 5, stagger: 2, knockdown: true },
  },
  {
    id: 'crouch_uppercut', name: 'Crouching uppercut', category: 'crouch', clip: 'crouch_uppercut', source: AUTHORED,
    description: 'Anti-air launcher from a crouch (Down + J).',
    trigger: { button: 'P', dir: 'D', air: 'ground' },
    frames: { startup: 6, active: 4, recovery: 16 },
    hit: { damage: 8, height: 'mid', reach: 0.65, yBand: [0.6, 2.2], knockback: 1.5, launch: 9, hitstun: 22, hitstop: 4, stagger: 1 },
  },
  {
    id: 'sweep', name: 'Leg sweep', category: 'crouch', clip: 'sweep', source: AUTHORED,
    description: 'Low spinning sweep that knocks down (Down + K).',
    trigger: { button: 'K', dir: 'D', air: 'ground' },
    frames: { startup: 8, active: 4, recovery: 18 },
    hit: { damage: 6, height: 'low', reach: 1.15, yBand: LOW, knockback: 1.5, hitstun: 20, hitstop: 4, stagger: 1.5, knockdown: true },
  },
  // ---------------- Chord and special ----------------
  {
    id: 'axe_kick', name: 'Axe kick', category: 'chord', clip: 'axe_kick', source: AUTHORED + ' (kakato-otoshi)',
    description: 'Heel drops from above: an overhead (U + K together). Beats crouch block.',
    trigger: { button: 'H', chord: 'K', air: 'ground' },
    cost: { stamina: 15 },
    frames: { startup: 13, active: 4, recovery: 18 },
    hit: { damage: 13, height: 'overhead', reach: 1.0, yBand: OVER, knockback: 3, hitstun: 20, hitstop: 5, stagger: 1.5, knockdown: 'counter' },
  },
  {
    id: 'tornado_kick', name: 'Tornado kick', category: 'special', clip: 'tornado_kick', source: AUTHORED,
    description: 'Jumping spin kick (O). Costs 50 energy, knocks down.',
    trigger: { button: 'S', air: 'ground' },
    requires: { energy: 50 }, cost: { energy: 50 },
    frames: { startup: 11, active: 4, recovery: 20 },
    dash: 0.6,
    hit: { damage: 14, height: 'mid', reach: 1.2, yBand: [0.6, 1.6], knockback: 6, hitstun: 22, hitstop: 6, stagger: 2, knockdown: true },
  },
  // ---------------- Air ----------------
  {
    id: 'dive_punch', name: 'Diving punch', category: 'air', clip: 'dive_punch', source: AUTHORED,
    description: 'Punch while jumping (J in the air). Overhead.',
    trigger: { button: 'P', air: 'air' },
    frames: { startup: 6, active: 4, recovery: 10 },
    hit: { damage: 7, height: 'overhead', reach: 0.8, yBand: [0.6, 1.6], knockback: 2.5, hitstun: 15, hitstop: 3, stagger: 1 },
  },
  {
    id: 'flying_kick', name: 'Flying kick', category: 'air', clip: 'flying_kick', source: CMU('75_16 jump kick'),
    description: 'Jumping kick (K in the air). Overhead.',
    trigger: { button: 'K', air: 'air' },
    frames: { startup: 7, active: 6, recovery: 10 },
    hit: { damage: 10, height: 'overhead', reach: 1.1, yBand: [0.3, 1.4], knockback: 4.5, hitstun: 17, hitstop: 4, stagger: 1.25 },
  },
  // ---------------- Weapons ----------------
  {
    id: 'sword_slash', name: 'Sword slash', category: 'weapon', clip: 'sword_slash', source: AUTHORED,
    description: 'Forward slash (I). Chains into backslash and thrust.',
    trigger: { button: 'W', air: 'any' },
    requires: { weapons: SWORD },
    frames: { startup: 10, active: 4, recovery: 14 },
    hit: { damage: 12, height: 'mid', reach: 1.6, yBand: [0.8, 1.6], knockback: 4, hitstun: 18, hitstop: 4, stagger: 1 },
    chains: { W: ['sword_backslash'] },
  },
  {
    id: 'sword_backslash', name: 'Backslash', category: 'weapon', clip: 'sword_backslash', source: AUTHORED,
    description: 'Return cut (I → I).',
    trigger: null,
    requires: { weapons: SWORD },
    frames: { startup: 8, active: 4, recovery: 14 },
    hit: { damage: 10, height: 'mid', reach: 1.5, yBand: [0.7, 1.7], knockback: 3.5, hitstun: 17, hitstop: 4, stagger: 1 },
    chains: { W: ['sword_thrust'] },
  },
  {
    id: 'sword_thrust', name: 'Thrust', category: 'weapon', clip: 'sword_thrust', source: AUTHORED,
    description: 'Lunging thrust finisher (I → I → I).',
    trigger: null,
    requires: { weapons: SWORD },
    frames: { startup: 12, active: 4, recovery: 18 },
    dash: 0.5,
    hit: { damage: 14, height: 'mid', reach: 1.8, yBand: [0.9, 1.5], knockback: 6, hitstun: 20, hitstop: 5, stagger: 1.5 },
  },
  {
    id: 'bar_smash', name: 'Bar smash', category: 'weapon', clip: 'bar_smash', source: AUTHORED,
    description: 'Overhead smash that breaks any block (I).',
    trigger: { button: 'W', air: 'any' },
    requires: { weapons: BAR },
    frames: { startup: 14, active: 5, recovery: 18 },
    hit: { damage: 16, height: 'overhead', reach: 1.5, yBand: [0.6, 1.9], knockback: 7, hitstun: 22, hitstop: 5, stagger: 2, guardBreak: true },
    chains: { W: ['bar_sweep'] },
  },
  {
    id: 'bar_sweep', name: 'Bar sweep', category: 'weapon', clip: 'bar_sweep', source: AUTHORED,
    description: 'Low sweep at the ankles that knocks down (I → I).',
    trigger: null,
    requires: { weapons: BAR },
    frames: { startup: 12, active: 5, recovery: 20 },
    hit: { damage: 12, height: 'low', reach: 1.5, yBand: LOW, knockback: 3, hitstun: 20, hitstop: 5, stagger: 1.5, knockdown: true },
  },
];

export const MOVE_BY_ID: Readonly<Record<string, MoveDef>> = Object.fromEntries(MOVES.map((m) => [m.id, m]));

export function getMove(id: string | null | undefined): MoveDef | null {
  return id ? MOVE_BY_ID[id] ?? null : null;
}

export const moveTotal = (m: MoveDef) => m.frames.startup + m.frames.active + m.frames.recovery;
export { ARMED };
