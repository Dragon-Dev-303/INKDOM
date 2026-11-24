/**
 * Every gameplay number lives here (plan §4). Values are starting points for balancing.
 * Time values ending in `Ticks` are simulation ticks at 60 Hz; `Seconds` are seconds.
 */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const BUILD_VERSION = '0.9.0-beta';

export type AttackId = 'PUNCH' | 'KICK' | 'IRON_BAR' | 'SHORT_SWORD';

export interface AttackDef {
  id: AttackId;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  reach: number;
  /** Vertical band of the hitbox, in units above the feet (before boss scaling). */
  yBand: [number, number];
  knockback: number;
  hitstun: number;
  hitstop: number;
  staggerPoints: number;
  guardBreak: boolean;
}

export const ATTACKS: Record<AttackId, AttackDef> = {
  PUNCH: {
    id: 'PUNCH', startup: 5, active: 3, recovery: 9, damage: 6, reach: 0.8,
    yBand: [1.15, 1.55], knockback: 2.5, hitstun: 14, hitstop: 3, staggerPoints: 1, guardBreak: false,
  },
  KICK: {
    id: 'KICK', startup: 9, active: 4, recovery: 14, damage: 9, reach: 1.1,
    yBand: [0.45, 1.2], knockback: 4, hitstun: 18, hitstop: 4, staggerPoints: 1, guardBreak: false,
  },
  IRON_BAR: {
    id: 'IRON_BAR', startup: 14, active: 5, recovery: 18, damage: 16, reach: 1.5,
    yBand: [0.6, 1.9], knockback: 7, hitstun: 22, hitstop: 5, staggerPoints: 2, guardBreak: true,
  },
  SHORT_SWORD: {
    id: 'SHORT_SWORD', startup: 10, active: 4, recovery: 14, damage: 12, reach: 1.6,
    yBand: [0.8, 1.55], knockback: 4, hitstun: 18, hitstop: 4, staggerPoints: 1, guardBreak: false,
  },
};

export const TUNING = {
  match: {
    timerSeconds: 300,
    countdownSeconds: 3,
    /** Simulation seconds; the end runs at 0.5x speed, so ~3 s real time. */
    endBannerSeconds: 1.5,
    captureSeconds: 8,
    decaySeconds: 16,
    captureRequiresBoss: false,
    timerWarnings: [30, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  },
  movement: {
    bossRunSpeed: 5.0,
    botRunSpeed: 4.6,
    groundAccel: 40,
    groundDecel: 50,
    airAccel: 20,
    gravity: 30,
    jumpVelocity: 10,
    maxFallSpeed: 18,
    coyoteTicks: 6,
    bufferTicks: 6,
    /** Speed along the 45° stair slope. */
    stairSpeed: 3.5,
    ladderSpeed: 3.0,
    stairEntryRange: 0.4,
    ladderEntryRange: 0.5,
    ladderGrabFromTopRange: 1.2,
    bodyHalfWidth: 0.3,
    bodyHeight: 1.8,
    separationMaxPerTick: 0.05,
    attackRootFriction: 0.8,
  },
  combat: {
    block: { activationTicks: 3, chip: 0.2, stunFactor: 0.6, knockbackFactor: 0.5, guardBreakTicks: 24 },
    stagger: { threshold: 4, resetTicks: 90, knockdownTicks: 40, getupTicks: 20, getupInvulnTicks: 30 },
    botDamageMultiplier: 0.8,
    hopVelocity: 2,
    koCreditTicks: 300,
    bodyFadeTicks: 120,
  },
  fighters: {
    bossHp: 150,
    botHp: 70,
    bossRespawnSeconds: 5,
    botRespawnSeconds: 8,
    spawnProtectionSeconds: 2,
    bossScale: 1.15,
  },
  ai: {
    decisionInterval: 6,
    reactionMinTicks: 9,
    reactionMaxTicks: 15,
    visionRange: 14,
    engageRange: 4,
    followEngageRange: 5,
    followLeash: 8,
    followBreak: 10,
    holdRadius: 3,
    holdEngage: 6,
    holdLeash: 8,
    retreatHpFraction: 0.25,
    retreatTicks: 120,
    retreatCooldownTicks: 360,
    blockChance: 0.25,
    attackChancePerDecision: 0.6,
    attackWeights: { PUNCH: 0.4, KICK: 0.3, WEAPON: 0.3 },
    barWeaponWeight: 0.4,
    maxAttackersPerTarget: 2,
    circleDistance: 2.5,
    nodeReach: 0.35,
    stuck: { repathTicks: 120, teleportTicks: 300, respawnTicks: 600, progressEpsilon: 0.5 },
  },
  fx: { shakeAmount: 0.08, shakeTicks: 6, maxParticles: 200, hitFlashTicks: 5 },
} as const;

export const secondsToTicks = (s: number): number => Math.round(s * TICK_RATE);
