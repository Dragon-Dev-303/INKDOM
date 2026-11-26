/** Notifications and messages (GDD §11, §16). */
import { at, HOUR, resolve } from './mock';

export type MessageKind = 'system' | 'team' | 'siege' | 'reward' | 'diplomacy' | 'direct';

export const MESSAGE_KINDS: Record<MessageKind, { label: string; icon: string }> = {
  system: { label: 'System', icon: '⚙' },
  team: { label: 'Team', icon: '🛡' },
  siege: { label: 'Siege', icon: '⚔' },
  reward: { label: 'Reward', icon: '🎁' },
  diplomacy: { label: 'Diplomacy', icon: '🤝' },
  direct: { label: 'Direct', icon: '✉' },
};

export interface InboxMessage {
  id: string;
  kind: MessageKind;
  from: string;
  subject: string;
  body: string;
  at: string;
  read: boolean;
  action: { label: string; href: string } | null;
  isSample: boolean;
}

export interface InboxService {
  list(): Promise<InboxMessage[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
}

const MESSAGES: readonly Omit<InboxMessage, 'isSample'>[] = [
  { id: 'msg1', kind: 'siege', from: 'War room', subject: 'Serif St. Office is under attack', body: 'Azure Ledger declared a siege on Serif St. Office (Quillport). The vulnerability window closes in 1 h. Two members have answered the call.', at: at(-0.4 * HOUR), read: false, action: { label: 'View building', href: '/world/building/quillport-3' } },
  { id: 'msg2', kind: 'reward', from: 'Inkdom', subject: 'Daily reward ready', body: 'Day 4 of 7: claim 125 ◆. Day 7 includes a bot skin crate.', at: at(-2 * HOUR), read: false, action: { label: 'Open hub', href: '/' } },
  { id: 'msg3', kind: 'team', from: 'Quillmaster (Founder)', subject: 'Weekend plan', body: 'Saturday 18:00 UTC we push Nibhaven. Officers bring medics; everyone else fills Alpha squads. Treasury covers repairs.', at: at(-5 * HOUR), read: false, action: { label: 'Open team', href: '/team' } },
  { id: 'msg4', kind: 'diplomacy', from: 'Gold Nib', subject: 'Alliance renewal', body: 'Gold Nib proposes renewing the alliance for 30 days with shared attack plans on Iron Basin.', at: at(-9 * HOUR), read: true, action: { label: 'Alliances', href: '/team' } },
  { id: 'msg5', kind: 'system', from: 'Inkdom', subject: 'Season 2 ends in 18 days', body: 'City control resets to 50% at the end of the season. Purchased cosmetics and boss levels are kept.', at: at(-20 * HOUR), read: true, action: { label: 'Events', href: '/events' } },
  { id: 'msg6', kind: 'direct', from: 'Sketchfox', subject: 'GG', body: 'That stairwell defence was brutal. Rematch tomorrow?', at: at(-26 * HOUR), read: true, action: null },
  { id: 'msg7', kind: 'siege', from: 'War room', subject: 'Building captured', body: 'Crimson Quill captured Margin St. Factory in Inkwell. +120 ◆ to the treasury. Shield active for 24 h.', at: at(-30 * HOUR), read: true, action: { label: 'View city', href: '/world/city/inkwell' } },
  { id: 'msg8', kind: 'system', from: 'Inkdom', subject: 'New: remappable controls', body: 'You can now remap every action in Settings → Controls.', at: at(-50 * HOUR), read: true, action: { label: 'Settings', href: '/settings' } },
];

const readIds = new Set<string>();

export const mockInboxService: InboxService = {
  list: () => resolve(MESSAGES.map((m) => ({ ...m, read: m.read || readIds.has(m.id), isSample: true }))),
  unreadCount: () => resolve(MESSAGES.filter((m) => !m.read && !readIds.has(m.id)).length),
  markRead(id) {
    readIds.add(id);
    return Promise.resolve();
  },
};
