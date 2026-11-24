import type { LevelDef, NavEdge, NavNode } from '../level/building';
import type { FloorId, Fighter } from '../sim/types';

/**
 * Waypoint navigation (plan §4.7.3). Dijkstra over the hand-placed graph plus two
 * virtual nodes: START (the fighter's current location) and GOAL (a floor + x).
 * A fighter on a floor connects to every node on that floor (floors are contiguous).
 */

export interface NavGoal { floor: FloorId; x: number }

export type NavStep =
  | { kind: 'arrived' }
  | { kind: 'walk'; x: number }
  | { kind: 'stairUp' }
  | { kind: 'stairDown' }
  | { kind: 'ladderUp' }
  | { kind: 'ladderDown' }
  | { kind: 'drop'; dir: 1 | -1 }
  | { kind: 'none' };

export interface NavResult { cost: number; step: NavStep; firstNode: NavNode | null }

interface Graph {
  nodes: NavNode[];
  index: Map<string, number>;
  adj: { to: number; cost: number; edge: NavEdge }[][];
}

const STAIR_LEN = 4 * Math.SQRT2;
const COST = { walk: 1, stair: 1.2, ladder: 1.5, drop: 0.8 };
const graphCache = new WeakMap<LevelDef, Graph>();

function edgeCost(level: LevelDef, e: NavEdge, a: NavNode, b: NavNode): number {
  switch (e.type) {
    case 'walk': return Math.abs(a.x - b.x) * COST.walk;
    case 'stair': return STAIR_LEN * COST.stair;
    case 'ladder': {
      const l = level.ladders[e.ref ?? 0];
      return (l.y1 - l.y0) * COST.ladder;
    }
    case 'drop': return 2 * COST.drop;
  }
}

export function getGraph(level: LevelDef): Graph {
  let g = graphCache.get(level);
  if (g) return g;
  const nodes = level.nav.nodes;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const adj: Graph['adj'] = nodes.map(() => []);
  for (const e of level.nav.edges) {
    const ai = index.get(e.a)!;
    const bi = index.get(e.b)!;
    const c = edgeCost(level, e, nodes[ai], nodes[bi]);
    adj[ai].push({ to: bi, cost: c, edge: e });
    if (!e.oneWay) adj[bi].push({ to: ai, cost: c, edge: e });
  }
  g = { nodes, index, adj };
  graphCache.set(level, g);
  return g;
}

function stairNodeIndices(level: LevelDef, g: Graph, stairIdx: number): { foot: number; top: number } {
  const e = level.nav.edges.find((ed) => ed.type === 'stair' && ed.ref === stairIdx)!;
  return { foot: g.index.get(e.a)!, top: g.index.get(e.b)! };
}

function ladderNodeIndices(level: LevelDef, g: Graph, ladderIdx: number): { bottom: number; top: number } {
  const e = level.nav.edges.find((ed) => ed.type === 'ladder' && ed.ref === ladderIdx)!;
  return { bottom: g.index.get(e.a)!, top: g.index.get(e.b)! };
}

export function clampToFloor(level: LevelDef, goal: NavGoal): NavGoal {
  const f = level.floors[goal.floor];
  return { floor: goal.floor, x: Math.max(f.x0, Math.min(f.x1, goal.x)) };
}

/**
 * Compute the path cost to `goal` and the immediate step the fighter should take.
 * `allowDrops` controls use of one-way drop edges (attackers never drop).
 */
export function navigate(level: LevelDef, f: Fighter, rawGoal: NavGoal, allowDrops: boolean, reach: number): NavResult {
  const g = getGraph(level);
  const goal = clampToFloor(level, rawGoal);
  const N = g.nodes.length;
  const START = N;
  const GOAL = N + 1;
  const dist = new Array<number>(N + 2).fill(Infinity);
  const prev = new Array<number>(N + 2).fill(-1);
  const prevEdge = new Array<NavEdge | null>(N + 2).fill(null);
  const done = new Array<boolean>(N + 2).fill(false);

  // START connections.
  const startLinks: { to: number; cost: number }[] = [];
  if (f.mode === 'STAIR') {
    const { foot, top } = stairNodeIndices(level, g, f.stairId);
    startLinks.push({ to: foot, cost: f.stairS * STAIR_LEN * COST.stair });
    startLinks.push({ to: top, cost: (1 - f.stairS) * STAIR_LEN * COST.stair });
  } else if (f.mode === 'LADDER') {
    const l = level.ladders[f.ladderId];
    const { bottom, top } = ladderNodeIndices(level, g, f.ladderId);
    startLinks.push({ to: bottom, cost: (f.pos.y - l.y0) * COST.ladder });
    startLinks.push({ to: top, cost: (l.y1 - f.pos.y) * COST.ladder + 0.01 });
  } else {
    for (let i = 0; i < N; i++) {
      if (g.nodes[i].floor === f.floor) startLinks.push({ to: i, cost: Math.abs(g.nodes[i].x - f.pos.x) });
    }
    if (goal.floor === f.floor) startLinks.push({ to: GOAL, cost: Math.abs(goal.x - f.pos.x) });
  }

  dist[START] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < N + 2; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1 || u === GOAL) break;
    done[u] = true;
    if (u === START) {
      for (const l of startLinks) relax(u, l.to, l.cost, null);
      continue;
    }
    for (const a of g.adj[u]) {
      if (a.edge.type === 'drop' && !allowDrops) continue;
      // While on a stair/ladder, START already links to both ends: re-using the same
      // edge would let "step off, then climb back" tie with continuing, causing dithering.
      if (f.mode === 'STAIR' && a.edge.type === 'stair' && a.edge.ref === f.stairId) continue;
      if (f.mode === 'LADDER' && a.edge.type === 'ladder' && a.edge.ref === f.ladderId) continue;
      relax(u, a.to, a.cost, a.edge);
    }
    if (g.nodes[u].floor === goal.floor) relax(u, GOAL, Math.abs(g.nodes[u].x - goal.x), null);
  }

  function relax(u: number, v: number, c: number, e: NavEdge | null) {
    const nd = dist[u] + c;
    if (nd < dist[v]) { dist[v] = nd; prev[v] = u; prevEdge[v] = e; }
  }

  if (dist[GOAL] === Infinity) return { cost: Infinity, step: { kind: 'none' }, firstNode: null };

  // Reconstruct path START -> ... -> GOAL.
  const path: number[] = [];
  for (let v = GOAL; v !== -1; v = prev[v]) path.push(v);
  path.reverse();
  const cost = dist[GOAL];
  const first = path[1];

  if (first === GOAL) {
    const dx = goal.x - f.pos.x;
    if (Math.abs(dx) <= reach) return { cost, step: { kind: 'arrived' }, firstNode: null };
    return { cost, step: { kind: 'walk', x: goal.x }, firstNode: null };
  }

  const node = g.nodes[first];
  if (f.mode === 'STAIR') {
    const { top } = stairNodeIndices(level, g, f.stairId);
    return { cost, step: { kind: first === top ? 'stairUp' : 'stairDown' }, firstNode: node };
  }
  if (f.mode === 'LADDER') {
    const { top } = ladderNodeIndices(level, g, f.ladderId);
    return { cost, step: { kind: first === top ? 'ladderUp' : 'ladderDown' }, firstNode: node };
  }

  // On a floor: walk to the first node, then take the edge leaving it.
  if (Math.abs(node.x - f.pos.x) > reach) return { cost, step: { kind: 'walk', x: node.x }, firstNode: node };
  const second = path[2];
  const edge = prevEdge[second];
  if (second === GOAL || !edge) {
    return { cost, step: second === GOAL ? { kind: 'walk', x: goal.x } : { kind: 'arrived' }, firstNode: node };
  }
  switch (edge.type) {
    case 'walk': return { cost, step: { kind: 'walk', x: g.nodes[second].x }, firstNode: node };
    case 'stair': {
      const st = level.stairs[edge.ref ?? 0];
      const atFoot = Math.abs(st.foot.x - node.x) < 1e-6 && Math.abs(st.foot.y - node.y) < 1e-6;
      return { cost, step: { kind: atFoot ? 'stairUp' : 'stairDown' }, firstNode: node };
    }
    case 'ladder': {
      const l = level.ladders[edge.ref ?? 0];
      const atBottom = Math.abs(l.x - node.x) < 1e-6 && Math.abs(l.y0 - node.y) < 1e-6;
      return { cost, step: { kind: atBottom ? 'ladderUp' : 'ladderDown' }, firstNode: node };
    }
    case 'drop': return { cost, step: { kind: 'drop', dir: edge.dir ?? 1 }, firstNode: node };
  }
}
