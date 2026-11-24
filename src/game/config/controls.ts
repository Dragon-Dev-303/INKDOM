/**
 * Key bindings (plan §4.2). Values are `KeyboardEvent.code` strings.
 * Primary and alternative keys are active together so laptops without a numpad work.
 * A future remapping screen only needs to edit these objects.
 */
export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'punch' | 'kick' | 'weapon' | 'block' | 'command';

export type Bindings = Record<Action, string[]>;

export const P1_BINDINGS: Bindings = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  punch: ['KeyF'],
  kick: ['KeyG'],
  weapon: ['KeyH'],
  block: ['KeyR'],
  command: ['KeyQ'],
};

export const P2_BINDINGS: Bindings = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  punch: ['Numpad1', 'KeyK'],
  kick: ['Numpad2', 'KeyL'],
  weapon: ['Numpad3', 'Semicolon'],
  block: ['Numpad0', 'KeyI'],
  command: ['NumpadEnter', 'KeyP'],
};

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

/** Human-readable labels for the How to Play screen and HUD hints. */
export const CONTROL_LABELS = {
  p1: { move: 'A / D', jumpClimb: 'W', down: 'S', punch: 'F', kick: 'G', weapon: 'H', block: 'R', command: 'Q' },
  p2: {
    move: '← / →', jumpClimb: '↑', down: '↓', punch: 'Num1 / K', kick: 'Num2 / L',
    weapon: 'Num3 / ;', block: 'Num0 / I', command: 'Num Enter / P',
  },
};

export function allGameKeyCodes(): Set<string> {
  const set = new Set<string>();
  for (const b of [P1_BINDINGS, P2_BINDINGS]) for (const codes of Object.values(b)) codes.forEach((c) => set.add(c));
  for (const codes of Object.values(GLOBAL_KEYS)) codes.forEach((c) => set.add(c));
  set.add('Space');
  return set;
}
