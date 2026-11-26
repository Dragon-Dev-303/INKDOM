/** Deterministic (UTC, en-GB) formatting so server and client output match. */
import { MOCK_NOW } from '@/services/mock';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtShortDate = (iso: string) => shortFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => `${shortFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))} UTC`;
export const fmtNum = (n: number) => n.toLocaleString('en-US');
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Reference "now": sample data is anchored to a fixed date, real data to the clock. */
export const nowFor = (isSample: boolean) => (isSample ? MOCK_NOW : Date.now());

/** "5 min ago", "in 3 h", "2 d ago". */
export function fmtRelative(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const text = m < 1 ? 'now' : m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  if (text === 'now') return 'just now';
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${pad2(s)}`;
}
