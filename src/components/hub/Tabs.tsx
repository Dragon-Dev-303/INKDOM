'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

/** Accessible tab list (WAI-ARIA tabs pattern, arrow-key navigation). Controlled. */
export function Tabs<T extends string>(props: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = props.tabs.findIndex((t) => t.id === props.value);

  const onKey = (e: KeyboardEvent) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % props.tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + props.tabs.length) % props.tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = props.tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    props.onChange(props.tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="hub-tabs">
      <div role="tablist" aria-label={props.label} className="hub-tablist" onKeyDown={onKey}>
        {props.tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === props.value}
            aria-controls={`${base}-panel`}
            tabIndex={t.id === props.value ? 0 : -1}
            className="hub-tab"
            onClick={() => props.onChange(t.id)}
          >
            {t.label}
            {t.badge !== undefined && <span className="hub-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${props.value}`} className="hub-tabpanel">
        {props.children}
      </div>
    </div>
  );
}
