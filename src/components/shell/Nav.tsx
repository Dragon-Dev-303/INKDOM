'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { featureHref, featuresByGroup, navFeatureForPath, STATUS_LABELS } from '@/features/registry';

const GROUPS = featuresByGroup();

/** Grouped navigation generated from the feature registry. */
export function NavList({ activeId, onNavigate }: { activeId: string | null; onNavigate?: () => void }) {
  return (
    <div className="hub-nav">
      {GROUPS.map((g) => (
        <div key={g.group} className="hub-nav-group">
          <h2 className="hub-nav-heading" id={`nav-${g.group}`}>{g.label}</h2>
          <ul aria-labelledby={`nav-${g.group}`}>
            {g.features.map((f) => {
              const active = f.id === activeId;
              return (
                <li key={f.id}>
                  <Link
                    href={featureHref(f)}
                    className={`hub-nav-link${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <span className="hub-nav-icon" aria-hidden="true">{f.icon}</span>
                    <span className="hub-nav-title">{f.title}</span>
                    {f.status !== 'live' && (
                      <span className={`hub-badge hub-badge-${f.status}`}>{STATUS_LABELS[f.status]}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** NavList with the current route highlighted (reads the pathname, so it sits under Suspense). */
export function ActiveNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavList activeId={navFeatureForPath(pathname ?? '/')?.id ?? null} onNavigate={onNavigate} />;
}
