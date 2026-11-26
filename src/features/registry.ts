/**
 * Feature registry: every screen in GDD §16 / INKDOM_v2_Plan.md §6. Navigation, hub tiles and
 * status badges are generated from this list, so adding a screen = one entry + one page file.
 *
 * Status: live = works for real · preview = real UI on sample data · planned = not built yet.
 */
export type FeatureGroup = 'play' | 'world' | 'army' | 'store' | 'community' | 'system';
export type FeatureStatus = 'live' | 'preview' | 'planned';

export interface FeatureDef {
  id: string;
  title: string;
  /** URL path. Dynamic segments use Next.js folder syntax, e.g. "/world/city/[id]". */
  route: string;
  group: FeatureGroup;
  status: FeatureStatus;
  /** Short emoji or glyph. */
  icon: string;
  description: string;
  /** Section of the game design brief (and/or plan) this screen implements. */
  gdd: string;
  /** Sub-screens (e.g. a city page) name their parent and stay out of nav and hub tiles. */
  parent?: string;
  /** Full-screen routes that render without the hub shell (battle screens). */
  fullScreen?: boolean;
}

export const FEATURE_GROUPS: Record<FeatureGroup, { label: string; order: number }> = {
  play: { label: 'Play', order: 0 },
  world: { label: 'World', order: 1 },
  army: { label: 'Army', order: 2 },
  store: { label: 'Store', order: 3 },
  community: { label: 'Community', order: 4 },
  system: { label: 'System', order: 5 },
};

export const STATUS_LABELS: Record<FeatureStatus, string> = { live: 'Live', preview: 'Preview', planned: 'Soon' };

export const FEATURES: readonly FeatureDef[] = [
  // Play
  { id: 'hub', title: 'Hub', route: '/', group: 'play', status: 'live', icon: '🏠', description: 'Your boss, quick play, daily rewards and news.', gdd: '§16 Main hub' },
  { id: 'play', title: 'Play local', route: '/play', group: 'play', status: 'live', icon: '⚔️', description: 'Local siege: solo vs bots or two players on one keyboard.', gdd: '§2, §13', fullScreen: true },
  { id: 'online', title: 'Play online', route: '/online', group: 'play', status: 'live', icon: '🌐', description: 'Quick match or a private room with a friend.', gdd: '§13, Plan §4', fullScreen: true },
  { id: 'tutorial', title: 'Training', route: '/tutorial', group: 'play', status: 'preview', icon: '🎓', description: 'Movement, combat, combos, squad orders and flag capture.', gdd: '§13 Tutorial' },
  { id: 'moves', title: 'Move list', route: '/moves', group: 'play', status: 'live', icon: '🥋', description: 'Every move with inputs and frame data, from the move database.', gdd: 'Plan §2.2' },
  // World
  { id: 'world', title: 'World map', route: '/world', group: 'world', status: 'preview', icon: '🗺️', description: 'Worlds, regions and cities; who controls what.', gdd: '§9 Territory' },
  { id: 'city', title: 'City', route: '/world/city/[id]', group: 'world', status: 'preview', icon: '🏙️', description: 'Ten buildings, controller, bonuses and wonders.', gdd: '§9, §12 Wonders', parent: 'world' },
  { id: 'building', title: 'Building', route: '/world/building/[id]', group: 'world', status: 'preview', icon: '🏢', description: 'Owner, floors, defence, vulnerability window and history.', gdd: '§7, §9, §16 Building detail', parent: 'world' },
  { id: 'events', title: 'Events', route: '/events', group: 'world', status: 'preview', icon: '📅', description: 'World events, seasons and the calendar.', gdd: '§12 Events & seasons' },
  // Army
  { id: 'boss', title: 'Boss editor', route: '/boss', group: 'army', status: 'preview', icon: '👑', description: 'Class, attributes, equipment and abilities.', gdd: '§4, §6 Boss editor' },
  { id: 'hangar', title: 'Bot hangar', route: '/hangar', group: 'army', status: 'preview', icon: '🤖', description: 'Bot types, personalities, weapons, skins and your squad.', gdd: '§5 Bots' },
  { id: 'commander', title: 'Commander', route: '/commander', group: 'army', status: 'preview', icon: '🎯', description: 'Tactical overlay: floor plan, orders and support calls.', gdd: '§3 Commander, §8 Support' },
  // Store
  { id: 'shop', title: 'Shop', route: '/shop', group: 'store', status: 'live', icon: '🛒', description: 'Points, cosmetics and purchase history.', gdd: '§10, Payments plan' },
  // Community
  { id: 'team', title: 'Team', route: '/team', group: 'community', status: 'preview', icon: '🛡️', description: 'Roster of up to 10 bosses, roles, treasury and alliances.', gdd: '§4, §11 Team' },
  { id: 'leaderboard', title: 'Leaderboard', route: '/leaderboard', group: 'community', status: 'preview', icon: '🏆', description: 'Season, player and faction rankings.', gdd: '§12, §16' },
  { id: 'inbox', title: 'Inbox', route: '/inbox', group: 'community', status: 'preview', icon: '📬', description: 'Notifications and messages.', gdd: '§16' },
  { id: 'profile', title: 'Profile', route: '/profile', group: 'community', status: 'preview', icon: '👤', description: 'Your stats, recent matches and cosmetics.', gdd: '§16' },
  // System
  { id: 'settings', title: 'Settings', route: '/settings', group: 'system', status: 'live', icon: '⚙️', description: 'Game, controls, audio, accessibility, account, privacy.', gdd: '§13 Accessibility' },
  { id: 'help', title: 'Help', route: '/help', group: 'system', status: 'preview', icon: '❔', description: 'FAQ, report a player and contact.', gdd: '§16 Reporting' },
  { id: 'account', title: 'Account', route: '/account', group: 'system', status: 'live', icon: '🔑', description: 'Sign in, create an account or reset your password.', gdd: 'Plan §5' },
];

export function getFeature(id: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.id === id);
}

/** Top-level features per group in display order (sub-screens excluded unless asked). */
export function featuresByGroup(opts: { includeChildren?: boolean } = {}): { group: FeatureGroup; label: string; features: FeatureDef[] }[] {
  return (Object.keys(FEATURE_GROUPS) as FeatureGroup[])
    .sort((a, b) => FEATURE_GROUPS[a].order - FEATURE_GROUPS[b].order)
    .map((group) => ({
      group,
      label: FEATURE_GROUPS[group].label,
      features: FEATURES.filter((f) => f.group === group && (opts.includeChildren || !f.parent)),
    }))
    .filter((g) => g.features.length > 0);
}

/** Concrete href for a feature (dynamic routes need params). */
export function featureHref(f: FeatureDef, params: Record<string, string> = {}): string {
  return f.route.replace(/\[(\w+)\]/g, (_, k: string) => encodeURIComponent(params[k] ?? ''));
}

/** The feature whose route best matches a pathname (for nav highlighting). */
export function featureForPath(pathname: string): FeatureDef | undefined {
  const toRe = (route: string) => new RegExp(`^${route.replace(/\[\w+\]/g, '[^/]+')}/?$`);
  const exact = FEATURES.find((f) => toRe(f.route).test(pathname));
  if (exact) return exact;
  return [...FEATURES]
    .filter((f) => f.route !== '/' && pathname.startsWith(`${f.route}/`))
    .sort((a, b) => b.route.length - a.route.length)[0];
}

/** Top-level nav entry for a pathname (sub-screens resolve to their parent). */
export function navFeatureForPath(pathname: string): FeatureDef | undefined {
  const f = featureForPath(pathname);
  return f?.parent ? getFeature(f.parent) : f;
}
