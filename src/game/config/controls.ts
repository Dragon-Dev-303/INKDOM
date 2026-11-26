/**
 * Input actions, control schemes and default key bindings (INKDOM_v2_Plan.md §2.1).
 * Values are `KeyboardEvent.code` strings. Pure data: persistence of remapped keys lives in
 * `src/game/controlsStore.ts` (browser only). Gamepad/touch schemes can be added as new
 * `SchemeId`s without touching the simulation, which only sees `InputFrame`s.
 */
export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'punch' | 'kick' | 'heavy' | 'weapon' | 'special'
  | 'block' | 'dodge' | 'command';

export const ACTIONS: readonly Action[] = [
  'left', 'right', 'up', 'down', 'punch', 'kick', 'heavy', 'weapon', 'special', 'block', 'dodge', 'command',
];

export type Bindings = Record<Action, string[]>;

/** solo = one player per keyboard (single player and online). localP1/localP2 share one keyboard. */
export type SchemeId = 'solo' | 'localP1' | 'localP2';

export const ACTION_LABELS: Record<Action, { name: string; hint: string }> = {
  left: { name: 'Move left', hint: '' },
  right: { name: 'Move right', hint: '' },
  up: { name: 'Jump / climb', hint: 'Tap to jump, hold at a stair foot or ladder to climb' },
  down: { name: 'Crouch / descend', hint: 'Hold to crouch; at a stair top or ladder to go down' },
  punch: { name: 'Punch', hint: 'Chains: P,P,P,P' },
  kick: { name: 'Kick', hint: 'Chains: K,K,K' },
  heavy: { name: 'Heavy', hint: 'Slow, crushes guard, costs stamina' },
  weapon: { name: 'Weapon / elbow', hint: 'Elbow when unarmed' },
  special: { name: 'Special', hint: 'Uses energy' },
  block: { name: 'Block (hold)', hint: 'Add down to block low' },
  dodge: { name: 'Dodge', hint: 'Invulnerable backstep, costs stamina' },
  command: { name: 'Squad command', hint: 'Cycles FOLLOW → HOLD → ATTACK' },
};

export const DEFAULT_BINDINGS: Record<SchemeId, Bindings> = {
  solo: {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    punch: ['KeyJ'],
    kick: ['KeyK'],
    heavy: ['KeyU'],
    weapon: ['KeyI'],
    special: ['KeyO'],
    block: ['KeyL'],
    dodge: ['Space'],
    command: ['KeyQ'],
  },
  localP1: {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    punch: ['KeyF'],
    kick: ['KeyG'],
    heavy: ['KeyT'],
    weapon: ['KeyH'],
    special: ['KeyY'],
    block: ['KeyR'],
    dodge: ['ShiftLeft'],
    command: ['KeyQ'],
  },
  localP2: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    punch: ['Numpad1', 'KeyK'],
    kick: ['Numpad2', 'KeyL'],
    heavy: ['Numpad4', 'KeyO'],
    weapon: ['Numpad3', 'Semicolon'],
    special: ['Numpad6', 'KeyP'],
    block: ['Numpad0', 'KeyI'],
    dodge: ['Numpad5', 'KeyU'],
    command: ['NumpadEnter', 'Enter'],
  },
};

export const SCHEME_LABELS: Record<SchemeId, string> = {
  solo: 'Single player & online (one keyboard per player)',
  localP1: 'Local 2-player: Player 1 (left side)',
  localP2: 'Local 2-player: Player 2 (right side)',
};

/** Kept for older imports: the local two-player layouts. */
export const P1_BINDINGS: Bindings = DEFAULT_BINDINGS.localP1;
export const P2_BINDINGS: Bindings = DEFAULT_BINDINGS.localP2;

export const GLOBAL_KEYS = {
  pause: ['Escape', 'Backspace'],
  mute: ['KeyM'],
  debug: ['F3'],
  slowMo: ['F4'],
  frameStep: ['F5'],
  killBots: ['F6'],
  capture90: ['F7'],
  timer10: ['F8'],
} as const;

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Enter: 'Enter', NumpadEnter: 'Num Enter',
  ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Tab: 'Tab',
};

/** "KeyJ" → "J", "Numpad1" → "Num1", "ArrowLeft" → "←". */
export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return code;
}

export const bindingLabel = (b: Bindings, a: Action): string => b[a].map(keyName).join(' / ');

/** Human-readable labels for How to Play and HUD hints (local layouts). */
export function controlLabels(b: Bindings) {
  return {
    move: `${bindingLabel(b, 'left')} / ${bindingLabel(b, 'right')}`,
    jumpClimb: bindingLabel(b, 'up'),
    down: bindingLabel(b, 'down'),
    punch: bindingLabel(b, 'punch'),
    kick: bindingLabel(b, 'kick'),
    heavy: bindingLabel(b, 'heavy'),
    weapon: bindingLabel(b, 'weapon'),
    special: bindingLabel(b, 'special'),
    block: bindingLabel(b, 'block'),
    dodge: bindingLabel(b, 'dodge'),
    command: bindingLabel(b, 'command'),
  };
}

export const CONTROL_LABELS = { p1: controlLabels(P1_BINDINGS), p2: controlLabels(P2_BINDINGS) };

export function allGameKeyCodes(extra: Bindings[] = []): Set<string> {
  const set = new Set<string>();
  for (const b of [...Object.values(DEFAULT_BINDINGS), ...extra]) for (const codes of Object.values(b)) codes.forEach((c) => set.add(c));
  for (const codes of Object.values(GLOBAL_KEYS)) codes.forEach((c) => set.add(c));
  return set;
}

/** Keys that are never allowed as bindings (browser/OS shortcuts, pause). */
export const RESERVED_KEYS = new Set(['Escape', 'Backspace', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'KeyM', 'Tab', 'MetaLeft', 'MetaRight', 'F11', 'F12']);
