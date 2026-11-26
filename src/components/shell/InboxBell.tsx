'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useServiceData } from '@/components/hub/hooks';
import { services } from '@/services';

/** Inbox link with the unread count. */
export function InboxBell() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener('inkdom:inbox-changed', bump);
    return () => window.removeEventListener('inkdom:inbox-changed', bump);
  }, []);
  const unread = useServiceData(`inbox-unread:${version}`, () => services.inbox.unreadCount());
  const n = unread.status === 'ready' ? unread.data : 0;
  return (
    <Link href="/inbox" className="hub-icon-btn" aria-label={n ? `Inbox, ${n} unread` : 'Inbox'}>
      <span aria-hidden="true">📬</span>
      {n > 0 && <span className="hub-dot-count" aria-hidden="true">{n}</span>}
    </Link>
  );
}
