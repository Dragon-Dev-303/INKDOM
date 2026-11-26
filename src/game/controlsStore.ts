import { ACTIONS, DEFAULT_BINDINGS, RESERVED_KEYS, type Action, type Bindings, type SchemeId } from './config/controls';

/**
 * Browser persistence for remapped controls (Settings → Controls). Every storage access is
 * wrapped: private windows may throw. Listeners let open screens react to changes.
 */
const KEY = 'inkdom.controls.v2';

type Stored = Partial<Record<SchemeId, Partial<Bindings>>>;
const listeners = new Set<() => void>();

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function write(s: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: bindings last for this visit only */
  }
  listeners.forEach((l) => l());
}

const isCodeList = (v: unknown): v is string[] => Array.isArray(v) && v.every((c) => typeof c === 'string' && c.length < 32);

/** Effective bindings for a scheme: defaults overlaid with the player's saved changes. */
export function loadBindings(scheme: SchemeId): Bindings {
  const saved = read()[scheme] ?? {};
  const out = { ...DEFAULT_BINDINGS[scheme] };
  for (const a of ACTIONS) {
    const v = saved[a];
    if (isCodeList(v) && v.length > 0) out[a] = v;
  }
  return out;
}

export type BindResult = { ok: true } | { ok: false; error: string };

/** Bind `code` as the only key for `action`; a key already used by another action in this scheme is swapped. */
export function setBinding(scheme: SchemeId, action: Action, code: string): BindResult {
  if (RESERVED_KEYS.has(code)) return { ok: false, error: 'That key is reserved (pause, mute, debug or browser).' };
  const current = loadBindings(scheme);
  const prev = current[action];
  for (const a of ACTIONS) {
    if (a !== action && current[a].includes(code)) current[a] = current[a].filter((c) => c !== code).concat(current[a].length === 1 ? prev : []);
  }
  current[action] = [code];
  const all = read();
  all[scheme] = current;
  write(all);
  return { ok: true };
}

export function resetBindings(scheme?: SchemeId): void {
  if (!scheme) return write({});
  const all = read();
  delete all[scheme];
  write(all);
}

export function onBindingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
