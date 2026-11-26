/**
 * Presentational building blocks for hub screens. No hooks here, so these work in both server
 * and client components.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { getFeature, STATUS_LABELS, type FeatureStatus } from '@/features/registry';
import type { Faction } from '@/services';
import type { Rarity } from '@/services/boss';

export function StatusBadge({ status, className = '' }: { status: FeatureStatus; className?: string }) {
  return <span className={`hub-badge hub-badge-${status} ${className}`}>{STATUS_LABELS[status]}</span>;
}

/** Shown on widgets whose data is sample data (inside live screens such as the hub). */
export function SampleTag() {
  return <span className="hub-badge hub-badge-preview" title="Sample data until this feature ships">Sample</span>;
}

export function PreviewRibbon({ gdd, status }: { gdd: string; status: FeatureStatus }) {
  return (
    <div className="hub-ribbon" role="note">
      <strong>{status === 'planned' ? 'Coming soon' : 'Preview · sample data'}</strong>
      <span>
        This screen is real UI on sample data. Numbers, names and buttons marked “coming soon” are placeholders until the
        feature ships ({gdd}).
      </span>
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function HubPage(props: {
  featureId: string;
  title?: string;
  lead?: ReactNode;
  icon?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const f = getFeature(props.featureId);
  const status = f?.status ?? 'planned';
  return (
    <div className="hub-page">
      {props.crumbs && (
        <nav aria-label="Breadcrumb" className="hub-crumbs">
          <ol>
            {props.crumbs.map((c, i) => (
              <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
            ))}
          </ol>
        </nav>
      )}
      <header className="hub-page-head">
        <div className="hub-page-icon" aria-hidden="true">{props.icon ?? f?.icon}</div>
        <div className="hub-page-titles">
          <h1>
            {props.title ?? f?.title} <StatusBadge status={status} />
          </h1>
          <p className="hub-lead">{props.lead ?? f?.description}</p>
        </div>
        {props.actions && <div className="hub-page-actions">{props.actions}</div>}
      </header>
      {status !== 'live' && <PreviewRibbon gdd={f?.gdd ?? ''} status={status} />}
      {props.children}
    </div>
  );
}

export function Panel(props: {
  title?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  sample?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section className={`hub-panel ${props.className ?? ''}`} style={props.style}>
      {(props.title || props.actions) && (
        <div className="hub-panel-head">
          {props.title && (
            <h2>
              {props.icon && <span aria-hidden="true">{props.icon} </span>}
              {props.title}
              {props.sample && <> <SampleTag /></>}
            </h2>
          )}
          {props.actions && <div className="hub-panel-actions">{props.actions}</div>}
        </div>
      )}
      {props.children}
    </section>
  );
}

export type ChipTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent' | 'attacker' | 'defender';

export function Chip({ tone = 'neutral', children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return <span className={`hub-chip hub-chip-${tone}`} title={title}>{children}</span>;
}

export function RarityChip({ rarity }: { rarity: Rarity }) {
  return <span className={`hub-rarity hub-rarity-${rarity}`}>{rarity}</span>;
}

/** Faction emblem + tag in its colour. Never colour alone: the tag and emblem are always shown. */
export function FactionBadge({ faction, full = false }: { faction: Faction | null | undefined; full?: boolean }) {
  if (!faction) return <span className="hub-faction hub-faction-none">◌ {full ? 'Unclaimed' : '—'}</span>;
  return (
    <span className="hub-faction" style={{ '--fc': faction.color } as CSSProperties} title={faction.name}>
      <span aria-hidden="true">{faction.emblem}</span> {full ? faction.name : `[${faction.tag}]`}
    </span>
  );
}

export function Meter(props: { value: number; max?: number; label: string; tone?: 'accent' | 'good' | 'bad' | 'info'; showValue?: string }) {
  const max = props.max ?? 100;
  const pct = Math.max(0, Math.min(100, (props.value / max) * 100));
  return (
    <div className="hub-meter">
      <div className="hub-meter-label">
        <span>{props.label}</span>
        <span>{props.showValue ?? `${Math.round(props.value)}${max === 100 ? '%' : ` / ${max}`}`}</span>
      </div>
      <div className={`hub-meter-track hub-meter-${props.tone ?? 'accent'}`} role="meter" aria-label={props.label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={props.value}>
        <div className="hub-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 1–5 pip rating. */
export function Pips({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  return (
    <span className="hub-pips" role="img" aria-label={`${label}: ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="hub-stat">
      <div className="hub-stat-value">{value}</div>
      <div className="hub-stat-label">{label}</div>
      {sub && <div className="hub-stat-sub">{sub}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="hub-loading" role="status" aria-live="polite">
      <span className="hub-spinner" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return <div className="notice error" role="alert">Could not load: {error}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hub-empty">
      <strong>{title}</strong>
      {children && <div className="muted small">{children}</div>}
    </div>
  );
}

/** Disabled action with a visible reason. */
export function ComingSoonButton({ children, note = 'Coming soon' }: { children: ReactNode; note?: string }) {
  return (
    <span className="hub-soon-btn">
      <button className="btn" disabled>{children}</button>
      <span className="hub-soon-note">{note}</span>
    </span>
  );
}
