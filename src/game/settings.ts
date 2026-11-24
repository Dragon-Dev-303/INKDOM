/** Local settings (plan §4.13). Every storage access is wrapped: private windows may throw. */
export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  muted: boolean;
  showHints: boolean;
  screenShake: boolean;
  colorScheme: 'standard' | 'highContrast';
  showFps: boolean;
  shareStats: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  muted: false,
  showHints: true,
  screenShake: true,
  colorScheme: 'standard',
  showFps: false,
  shareStats: true,
};

const KEY = 'inkdom.settings.v1';
const SESSION_KEY = 'inkdom.session.v1';

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

/** Anonymous random id grouping one browser's matches; no personal data. */
export function getSessionId(): string {
  const make = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = make();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return make();
  }
}
