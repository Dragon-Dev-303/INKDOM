import type { LevelDef } from './building';

/**
 * Structural checks on level data (plan §4.8.3). Returns a list of problems; empty = valid.
 * Runs in unit tests and in development builds at startup.
 */
export function validateLevel(level: LevelDef): string[] {
  const errors: string[] = [];
  const nodes = new Map(level.nav.nodes.map((n) => [n.id, n]));

  for (const n of level.nav.nodes) {
    const floor = level.floors[n.floor];
    if (!floor) errors.push(`${n.id}: unknown floor ${n.floor}`);
    else {
      if (Math.abs(floor.y - n.y) > 1e-6) errors.push(`${n.id}: y ${n.y} does not match floor ${floor.name} y ${floor.y}`);
      if (n.x < floor.x0 - 0.5 || n.x > floor.x1 + 0.5) errors.push(`${n.id}: x ${n.x} outside floor ${floor.name}`);
    }
  }

  for (const e of level.nav.edges) {
    const a = nodes.get(e.a);
    const b = nodes.get(e.b);
    if (!a || !b) { errors.push(`edge ${e.a}-${e.b}: unknown node`); continue; }
    if (e.type === 'walk' && a.floor !== b.floor) errors.push(`walk edge ${e.a}-${e.b} crosses floors`);
    if (e.type === 'stair') {
      const s = level.stairs[e.ref ?? -1];
      if (!s) { errors.push(`stair edge ${e.a}-${e.b}: missing stair`); continue; }
      const footOk = Math.abs(s.foot.x - a.x) < 1e-6 && Math.abs(s.foot.y - a.y) < 1e-6;
      const topOk = Math.abs(s.top.x - b.x) < 1e-6 && Math.abs(s.top.y - b.y) < 1e-6;
      if (!footOk || !topOk) errors.push(`stair edge ${e.a}-${e.b}: endpoints do not match ${s.id}`);
    }
    if (e.type === 'ladder') {
      const l = level.ladders[e.ref ?? -1];
      if (!l) errors.push(`ladder edge ${e.a}-${e.b}: missing ladder`);
      else if (Math.abs(l.x - a.x) > 1e-6 || Math.abs(l.topExit.x - b.x) > 1e-6) errors.push(`ladder edge ${e.a}-${e.b}: endpoints mismatch`);
    }
    if (e.type === 'drop' && (!e.oneWay || !e.dir)) errors.push(`drop edge ${e.a}-${e.b}: must be oneWay with dir`);
    if (e.type === 'drop' && b.floor !== a.floor - 1) errors.push(`drop edge ${e.a}-${e.b}: must go down exactly one floor`);
  }

  // Every stair needs an opening above its span on the top floor's slab.
  for (const s of level.stairs) {
    const minX = Math.min(s.foot.x, s.top.x);
    const maxX = Math.max(s.foot.x, s.top.x);
    const has = level.openings.some((o) => o.x0 <= minX + 1e-6 && o.x1 >= maxX - 1e-6 && Math.abs(o.y1 - s.top.y) < 1e-6);
    if (!has) errors.push(`${s.id}: no opening above stair`);
  }

  // Reachability: every node reachable from both spawns using two-way edges only (no drops/ladders excluded).
  const adj = new Map<string, string[]>();
  for (const n of level.nav.nodes) adj.set(n.id, []);
  for (const e of level.nav.edges) {
    adj.get(e.a)?.push(e.b);
    if (!e.oneWay) adj.get(e.b)?.push(e.a);
  }
  const reach = (start: string) => {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const cur = q.shift()!;
      for (const nx of adj.get(cur) ?? []) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
    }
    return seen;
  };
  const nearestNodeOnFloor = (x: number, y: number) =>
    level.nav.nodes.filter((n) => Math.abs(n.y - y) < 1e-6).sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x))[0];
  for (const team of ['ATTACKER', 'DEFENDER'] as const) {
    const sp = level.spawns[team][0];
    const start = nearestNodeOnFloor(sp.x, sp.y);
    if (!start) { errors.push(`${team} spawn not on a nav floor`); continue; }
    const seen = reach(start.id);
    for (const n of level.nav.nodes) if (!seen.has(n.id)) errors.push(`${n.id} unreachable from ${team} spawn`);
  }

  // Spawns on floors; flag zone on roof.
  for (const team of ['ATTACKER', 'DEFENDER'] as const) {
    for (const sp of level.spawns[team]) {
      const f = level.floors.find((fl) => Math.abs(fl.y - sp.y) < 1e-6 && sp.x >= fl.x0 && sp.x <= fl.x1);
      if (!f) errors.push(`${team} spawn (${sp.x},${sp.y}) not on a floor`);
    }
  }
  if (Math.abs(level.flagZone.y0 - level.floors[4].y) > 1e-6) errors.push('flag zone not on roof');
  return errors;
}
