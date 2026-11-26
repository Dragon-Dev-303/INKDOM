import { allGameKeyCodes, type Bindings } from '../config/controls';
import { EMPTY_INPUT, type InputFrame } from '../sim/types';

/**
 * Keyboard sampling (plan §4.2.2). Held state comes from the live key set; presses are
 * queued on keydown so a tap shorter than one frame is never lost. Call `endTick()` after
 * both players have been sampled for a simulation tick.
 */
export class KeyboardInput {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private gameKeys = allGameKeyCodes();

  /** Also swallow (preventDefault) custom-bound keys. */
  setExtraBindings(list: import('../config/controls').Bindings[]): void {
    this.gameKeys = allGameKeyCodes(list);
  }
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  onGlobalKey: ((code: string) => void) | null = null;

  attach(target: Window): void {
    const onDown = (e: Event) => {
      const ev = e as KeyboardEvent;
      if (this.gameKeys.has(ev.code)) ev.preventDefault();
      if (ev.repeat) return;
      this.down.add(ev.code);
      this.pressed.add(ev.code);
      this.onGlobalKey?.(ev.code);
    };
    const onUp = (e: Event) => {
      const ev = e as KeyboardEvent;
      if (this.gameKeys.has(ev.code)) ev.preventDefault();
      this.down.delete(ev.code);
    };
    const clear = () => this.clear();
    this.add(target, 'keydown', onDown);
    this.add(target, 'keyup', onUp);
    this.add(target, 'blur', clear);
    this.add(target.document, 'visibilitychange', clear);
  }

  private add(t: EventTarget, type: string, fn: EventListener) {
    t.addEventListener(type, fn);
    this.listeners.push([t, type, fn]);
  }

  detach(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners = [];
    this.clear();
  }

  /** Release every key (focus loss, pause) so nothing stays stuck. */
  clear(): void {
    this.down.clear();
    this.pressed.clear();
  }

  private held(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  private tapped(codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  sample(b: Bindings): InputFrame {
    return {
      ...EMPTY_INPUT,
      left: this.held(b.left),
      right: this.held(b.right),
      up: this.held(b.up) || this.tapped(b.up),
      down: this.held(b.down) || this.tapped(b.down),
      jumpPressed: this.tapped(b.up),
      punchPressed: this.tapped(b.punch),
      kickPressed: this.tapped(b.kick),
      heavyPressed: this.tapped(b.heavy),
      weaponPressed: this.tapped(b.weapon),
      specialPressed: this.tapped(b.special),
      block: this.held(b.block),
      dodgePressed: this.tapped(b.dodge),
      commandPressed: this.tapped(b.command),
    };
  }

  endTick(): void {
    this.pressed.clear();
  }
}
