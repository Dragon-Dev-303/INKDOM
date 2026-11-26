'use client';

import Link from 'next/link';
import { useAccount } from '@/lib/account/AccountContext';

/** Signed out → "Sign in" (/account). Signed in → name + ◆ points (/shop). */
export function AccountChip() {
  const { account, loading } = useAccount();
  if (loading) return <span className="hub-account-chip hub-account-loading" aria-hidden="true" />;
  if (!account.signedIn) {
    return (
      <Link href="/account" className="hub-account-chip">
        <span aria-hidden="true">👤</span> <span>Sign in</span>
      </Link>
    );
  }
  const name = (account as { username?: string }).username ?? account.email ?? 'Player';
  return (
    <Link href="/shop" className="hub-account-chip" title={`${name}: open the shop`}>
      <span className="hub-points">◆ {(account.balance ?? 0).toLocaleString('en-US')}</span>
      <span className="hub-account-name">{name}</span>
    </Link>
  );
}
