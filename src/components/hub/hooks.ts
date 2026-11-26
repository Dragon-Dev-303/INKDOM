'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DEFAULT_BINDINGS, type Bindings, type SchemeId } from '@/game/config/controls';
import { loadBindings, onBindingsChange } from '@/game/controlsStore';
import { services, type Faction } from '@/services';

export type Loadable<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };

/**
 * Load data from a service on the client. `key` identifies the request: when it changes the
 * loader runs again (the loader itself may be an inline closure).
 */
export function useServiceData<T>(key: string, load: () => Promise<T>): Loadable<T> {
  const [state, setState] = useState<{ key: string; value: Loadable<T> }>({ key: '', value: { status: 'loading' } });
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setState({ key, value: { status: 'ready', data } }),
      (e: unknown) => live && setState({ key, value: { status: 'error', error: e instanceof Error ? e.message : String(e) } }),
    );
    return () => {
      live = false;
    };
    // The loader is keyed by `key`; re-running on every new closure would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.value : { status: 'loading' };
}

/** Faction lookup (id → faction) loaded from the team service. */
export function useFactions(): Map<string, Faction> {
  const res = useServiceData('factions', () => services.team.listFactions());
  const list = res.status === 'ready' ? res.data : null;
  return useMemo(() => new Map((list ?? []).map((f) => [f.id, f])), [list]);
}

// ---- control bindings (live: Settings → Controls) ----

const bindingsCache = new Map<SchemeId, { json: string; value: Bindings }>();

function snapshotBindings(scheme: SchemeId): Bindings {
  const value = loadBindings(scheme);
  const json = JSON.stringify(value);
  const cached = bindingsCache.get(scheme);
  if (cached && cached.json === json) return cached.value;
  bindingsCache.set(scheme, { json, value });
  return value;
}

/** Current key bindings for a scheme; re-renders when the player remaps a key. */
export function useBindings(scheme: SchemeId): Bindings {
  return useSyncExternalStore(
    onBindingsChange,
    () => snapshotBindings(scheme),
    () => DEFAULT_BINDINGS[scheme],
  );
}

const noopSubscribe = () => () => {};

/** False during server render and hydration, true afterwards (for browser-only state). */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
