'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBrowserSupabase } from '../supabase/browser';
import { fetchAccount, OFFLINE_ACCOUNT, signOut as apiSignOut, type AccountState } from './api';

/**
 * App-wide account state (signed-in user, points, owned items, loadout). Mounted once in the
 * root layout; screens read it with `useAccount()`. Refreshes on Supabase auth changes.
 */
interface AccountCtx {
  account: AccountState;
  loading: boolean;
  refresh: () => Promise<void>;
  setAccount: (a: AccountState) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AccountCtx>({
  account: OFFLINE_ACCOUNT, loading: true, refresh: async () => {}, setAccount: () => {}, signOut: async () => {},
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountState>(OFFLINE_ACCOUNT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const a = await fetchAccount();
    setAccount(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh(); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch of the external account state
    const sb = getBrowserSupabase();
    const sub = sb?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void refresh();
    });
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ account, loading, refresh, setAccount, signOut }), [account, loading, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAccount = () => useContext(Ctx);
