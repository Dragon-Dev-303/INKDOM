/**
 * Every gameplay number lives here (plan §4). Values are starting points for balancing.
 * Time values ending in `Ticks` are simulation ticks at 60 Hz; `Seconds` are seconds.
 */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const BUILD_VERSION = '0.11.0-alpha';

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
    /** Combo engine (INKDOM_v2_Plan.md §2.3–§2.4). */
    pressBufferTicks: 8,
    chordTicks: 3,
    /** A chain can be entered from the first active frame until this many frames before the end. */
    chainCloseBeforeEnd: 4,
    /** A chord partner pressed this early in the startup upgrades the move. */
    chordUpgradeTicks: 3,
    counterDamage: 1.2,
    counterHitstun: 4,
    scalingStep: 0.1,
    scalingMin: 0.3,
    hitstunDecayAfter: 3,
    juggleLimit: 3,
    crouchHeightFactor: 0.65,
    stamina: { max: 100, regenPerSecond: 30, regenDelayTicks: 30, blockCostFactor: 1.5 },
    energy: { max: 100, onHit: 6, onHurt: 4 },
    dodge: { ticks: 14, distance: 1.4, invulnFrom: 2, invulnTo: 10, cooldownTicks: 30, stamina: 25 },
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
    dodgeChance: 0.12,
    maxAttackersPerTarget: 2,
    circleDistance: 2.5,
    nodeReach: 0.35,
    stuck: { repathTicks: 120, teleportTicks: 300, respawnTicks: 600, progressEpsilon: 0.5 },
  },
  fx: { shakeAmount: 0.08, shakeTicks: 6, maxParticles: 200, hitFlashTicks: 5 },
} as const;

export const secondsToTicks = (s: number): number => Math.round(s * TICK_RATE);
