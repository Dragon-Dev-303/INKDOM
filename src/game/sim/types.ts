import type { AttackId } from '../config/tuning';

export type Team = 'ATTACKER' | 'DEFENDER';
export type WeaponId = 'IRON_BAR' | 'SHORT_SWORD';
export type SquadCommand = 'FOLLOW' | 'HOLD' | 'ATTACK';
export type FloorId = 0 | 1 | 2 | 3 | 4; // F1, F2, F3, F4, ROOF

export interface Vec2 { x: number; y: number }
export interface AABB { x0: number; y0: number; x1: number; y1: number }

/** Identical for humans and bots — the seam for future online play. */
export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  punchPressed: boolean;
  kickPressed: boolean;
  weaponPressed: boolean;
  block: boolean;
  commandPressed: boolean;
}

export const EMPTY_INPUT: Readonly<InputFrame> = Object.freeze({
  left: false, right: false, up: false, down: false, jumpPressed: false,
  punchPressed: false, kickPressed: false, weaponPressed: false, block: false, commandPressed: false,
});

/** Locomotion mode. */
export type Mode = 'GROUND' | 'AIR' | 'STAIR' | 'LADDER';

/** Action layer on top of locomotion. */
export type ActionState =
  | 'NONE' | 'ATTACK' | 'BLOCK' | 'BLOCKSTUN' | 'GUARDBREAK' | 'HITSTUN' | 'KNOCKDOWN' | 'GETUP' | 'DEAD';

export interface Fighter {
  id: number;
  team: Team;
  isBoss: boolean;
  /** 0 = P1, 1 = P2 (bosses only). */
  playerIndex: 0 | 1 | -1;
  /** 1..3 for bots, 0 for bosses. */
  botIndex: number;
  weapon: WeaponId;
  scale: number;

  pos: Vec2;
  prevPos: Vec2;
  vel: Vec2;
  facing: 1 | -1;
  grounded: boolean;
  lastGroundedTick: number;
  /** Floor last stood on (updated while grounded / on stairs / ladder). */
  floor: FloorId;

  mode: Mode;
  stairId: number;    // index into level.stairs while mode === 'STAIR'
  stairS: number;     // 0 = foot, 1 = top
  ladderId: number;

  action: ActionState;
  actionTick: number;
  actionDuration: number;
  attackId: AttackId | null;
  attackHitIds: number[];

  hp: number;
  maxHp: number;
  stagger: number;
  lastHitTick: number;
  lastHitterId: number;
  invulnUntil: number;
  spawnProtected: boolean;
  hitstop: number;
  flashUntil: number;
  deathTick: number;
  respawnAt: number;

  buffer: { jump: number; punch: number; kick: number; weapon: number };
  /** Distance travelled — drives run-cycle animation with no foot sliding. */
  stride: number;
  stats: { kos: number; deaths: number };
}

export interface SquadState {
  command: SquadCommand;
  /** Per-bot HOLD anchors keyed by fighter id. */
  anchors: Record<number, { floor: FloorId; x: number }>;
}

export type BotFsm = 'IDLE' | 'FOLLOW' | 'MOVE' | 'ATTACK' | 'RETREAT' | 'DEAD' | 'RESPAWN';

export interface BotMemory {
  fsm: BotFsm;
  targetId: number;
  reactionReadyTick: number;
  nextDecisionTick: number;
  blockUntil: number;
  wantAttack: AttackId | null;
  retreatUntil: number;
  retreatCooldownUntil: number;
  bestCost: number;
  lastProgressTick: number;
  stuckLevel: number;
  goalKey: string;
  prevUp: boolean;
}

export type CaptureState = 'IDLE' | 'CAPTURING' | 'CONTESTED' | 'DECAYING';
export type MatchPhase = 'COUNTDOWN' | 'PLAYING' | 'ENDED';
export type Controller = 'HUMAN' | 'CPU';

export interface MatchConfig {
  /** Which team player 1 controls. Player 2 controls the other. */
  p1Team: Team;
  /** Weapon per player [P1, P2]. */
  weapons: [WeaponId, WeaponId];
  /** Controller per player [P1, P2]; CPU = AI-driven boss (practice / soak). */
  controllers: [Controller, Controller];
}

export interface MatchState {
  version: 1;
  seed: number;
  rngState: number;
  tick: number;
  phase: MatchPhase;
  phaseTick: number;
  playTicks: number;
  timeLeftTicks: number;
  capture: { progress: number; state: CaptureState; peak: number; milestones: number };
  fighters: Fighter[];
  squads: Record<Team, SquadState>;
  bots: Record<number, BotMemory>;
  attackTokens: Record<number, number[]>;
  winner: Team | null;
  endReason: 'CAPTURE' | 'TIMEOUT' | null;
  config: MatchConfig;
  stuckEvents: number;
}

export type GameEvent =
  | { type: 'ATTACK_START'; fighter: number; attack: AttackId }
  | { type: 'HIT'; attacker: number; victim: number; attack: AttackId; blocked: boolean; guardBreak: boolean; damage: number; x: number; y: number; heavy: boolean }
  | { type: 'KO'; victim: number; killer: number; x: number; y: number }
  | { type: 'RESPAWN'; fighter: number }
  | { type: 'JUMP'; fighter: number }
  | { type: 'COMMAND'; team: Team; command: SquadCommand }
  | { type: 'CAPTURE_STATE'; state: CaptureState }
  | { type: 'CAPTURE_MILESTONE'; pct: 25 | 50 | 75 }
  | { type: 'TIMER_WARNING'; secondsLeft: number }
  | { type: 'STUCK'; bot: number; level: 1 | 2 | 3; x: number; y: number }
  | { type: 'COUNTDOWN'; value: number }
  | { type: 'MATCH_START' }
  | { type: 'MATCH_END'; winner: Team; reason: 'CAPTURE' | 'TIMEOUT' };

export const otherTeam = (t: Team): Team => (t === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER');
