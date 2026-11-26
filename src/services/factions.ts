/** Factions referenced across world, team and leaderboard services (GDD §4, §11). */

export interface Faction {
  id: string;
  name: string;
  /** Short tag shown next to names, e.g. [CRQ]. */
  tag: string;
  /** Glyph used as the emblem (never rely on colour alone: GDD §6 accessibility). */
  emblem: string;
  color: string;
  secondary: string;
  motto: string;
  isSample: boolean;
}

/** The sample player's own faction. */
export const MY_FACTION_ID = 'crimson-quill';

export const SAMPLE_FACTIONS: readonly Faction[] = [
  { id: 'crimson-quill', name: 'Crimson Quill', tag: 'CRQ', emblem: '✒', color: '#e4572e', secondary: '#f4d35e', motto: 'Every line ends in our favour.', isSample: true },
  { id: 'azure-ledger', name: 'Azure Ledger', tag: 'AZL', emblem: '◈', color: '#2e86de', secondary: '#bfdbfe', motto: 'Hold the roof, keep the books.', isSample: true },
  { id: 'gold-nib', name: 'Gold Nib', tag: 'GNB', emblem: '✦', color: '#eab308', secondary: '#1f2937', motto: 'Sharp, bright, unbroken.', isSample: true },
  { id: 'verdant-ink', name: 'Verdant Ink', tag: 'VRD', emblem: '❦', color: '#22c55e', secondary: '#052e16', motto: 'We grow on every wall.', isSample: true },
  { id: 'violet-script', name: 'Violet Script', tag: 'VSC', emblem: '✧', color: '#a855f7', secondary: '#f5d0fe', motto: 'Written in shadow.', isSample: true },
  { id: 'ash-brigade', name: 'Ash Brigade', tag: 'ASH', emblem: '▲', color: '#94a3b8', secondary: '#0f172a', motto: 'Burn the draft, keep the city.', isSample: true },
];

export function factionById(id: string | null | undefined): Faction | null {
  return SAMPLE_FACTIONS.find((f) => f.id === id) ?? null;
}
