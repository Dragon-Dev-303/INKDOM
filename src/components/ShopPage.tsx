'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account/AccountContext';
import { fetchAccount } from '@/lib/account/api';
import { ShopScreen, type CheckoutNotice } from './ShopScreen';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 3 * 60_000;

/** /shop route: account-aware shop with the return-from-checkout polling (INKDOM_Payments_Plan.md §6.1 step 5). */
export default function ShopPage() {
  const router = useRouter();
  const { account, setAccount, refresh } = useAccount();
  const [notice, setNotice] = useState<CheckoutNotice | null>(null);
  const [watch, setWatch] = useState<{ paymentId: string; since: number } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const checkout = q.get('checkout');
    const paymentId = q.get('payment');
    /* eslint-disable react-hooks/set-state-in-effect -- reads the return URL once after mount */
    if (checkout === 'success' && paymentId) {
      setNotice({ kind: 'info', text: 'Payment submitted. Waiting for confirmation… your points appear automatically.' });
      setWatch({ paymentId, since: Date.now() });
    } else if (checkout === 'cancelled') {
      setNotice({ kind: 'info', text: 'Checkout cancelled. You were not charged.' });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    if (checkout) window.history.replaceState(null, '', window.location.pathname);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!watch) return;
    const id = window.setInterval(async () => {
      const a = await fetchAccount();
      setAccount(a);
      const pay = a.payments?.find((p) => p.id === watch.paymentId);
      if (pay?.status === 'paid') {
        setNotice({ kind: 'success', text: `Payment received: +${pay.points.toLocaleString('en-US')} points!` });
        setWatch(null);
      } else if (pay && (pay.status === 'failed' || pay.status === 'expired')) {
        setNotice({ kind: 'error', text: 'The payment did not complete. You were not charged for points.' });
        setWatch(null);
      } else if (Date.now() - watch.since > POLL_LIMIT_MS) {
        setNotice({ kind: 'info', text: 'Still processing. Crypto can take up to an hour; your points will appear automatically (see History).' });
        setWatch(null);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [watch, setAccount]);

  return <ShopScreen account={account} notice={notice} onAccountChange={setAccount} onRefresh={refresh} onBack={() => router.push('/')} />;
}
