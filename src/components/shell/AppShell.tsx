'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { AccountChip } from './AccountChip';
import { InboxBell } from './InboxBell';
import { ActiveNav, NavList } from './Nav';

/** INKDOM wordmark: INK in attacker red, DOM in defender blue. */
export function Logo() {
  return (
    <Link href="/" className="hub-logo" aria-label="Inkdom hub">
      <span className="hub-logo-atk">INK</span>
      <span className="hub-logo-def">DOM</span>
    </Link>
  );
}

/**
 * App shell for every hub screen: top bar, grouped navigation (sidebar on desktop, drawer on
 * narrow screens) and the scrollable main region. Battle screens live outside the (hub) group.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        document.getElementById('hub-menu-btn')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    document.querySelector<HTMLElement>('#hub-nav a')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="hub-app" data-drawer={open ? 'open' : 'closed'}>
      <a href="#hub-main" className="hub-skip">Skip to content</a>
      <header className="hub-topbar">
        <button
          id="hub-menu-btn"
          type="button"
          className="hub-menu-btn"
          aria-expanded={open}
          aria-controls="hub-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>
        <Logo />
        <span className="hub-topbar-tag">Beta</span>
        <div className="hub-topbar-spacer" />
        <Link href="/play" className="btn primary hub-top-play">
          Play
        </Link>
        <InboxBell />
        <AccountChip />
      </header>

      <nav id="hub-nav" className="hub-sidebar" aria-label="Main">
        <Suspense fallback={<NavList activeId={null} onNavigate={close} />}>
          <ActiveNav onNavigate={close} />
        </Suspense>
        <div className="hub-sidebar-foot">
          <span className="hub-badge hub-badge-live">Live</span> works now · <span className="hub-badge hub-badge-preview">Preview</span>{' '}
          sample data · <span className="hub-badge hub-badge-planned">Soon</span> planned
        </div>
      </nav>
      {open && <div className="hub-scrim" onClick={close} aria-hidden="true" />}

      <main id="hub-main" className="hub-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
