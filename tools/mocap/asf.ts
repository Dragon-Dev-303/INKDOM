/** Parser for Acclaim ASF skeleton files (CMU mocap flavour). */

export type Axis = 'x' | 'y' | 'z';
export interface AsfBone {
  name: string;
  /** unit direction in world (global) coordinates at the rest pose */
  direction: [number, number, number];
  /** bone length in ASF length units (already multiplied out of `:units length`? no — raw) */
  length: number;
  /** Euler axis angles in degrees */
  axis: [number, number, number];
  /** Euler order of the axis line, e.g. 'XYZ' */
  axisOrder: string;
  /** degrees of freedom, in the order the AMC file lists them */
  dof: Axis[];
  children: string[];
  parent: string | null;
}

export interface Asf {
  units: { mass: number; length: number; angle: 'deg' | 'rad' };
  root: { order: string[]; axisOrder: string; position: [number, number, number]; orientation: [number, number, number] };
  bones: Record<string, AsfBone>;
  /** names in a parent-before-child order, starting with 'root' */
  order: string[];
}

const nums = (parts: string[]) => parts.map(Number) as [number, number, number];

export function parseAsf(text: string): Asf {
  const lines = text.split(/\r?\n/);
  const asf: Asf = {
    units: { mass: 1, length: 1, angle: 'deg' },
    root: { order: [], axisOrder: 'XYZ', position: [0, 0, 0], orientation: [0, 0, 0] },
    bones: {},
    order: [],
  };
  asf.bones.root = { name: 'root', direction: [0, 0, 0], length: 0, axis: [0, 0, 0], axisOrder: 'XYZ', dof: [], children: [], parent: null };
  let section = '';
  let cur: AsfBone | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith(':')) {
      const [key, ...rest] = line.split(/\s+/);
      section = key.slice(1);
      if (section === 'name' || section === 'version') section = '';
      void rest;
      continue;
    }
    const p = line.split(/\s+/);
    if (section === 'units') {
      if (p[0] === 'mass') asf.units.mass = Number(p[1]);
      else if (p[0] === 'length') asf.units.length = Number(p[1]);
      else if (p[0] === 'angle') asf.units.angle = p[1].startsWith('rad') ? 'rad' : 'deg';
    } else if (section === 'root') {
      if (p[0] === 'order') asf.root.order = p.slice(1).map((s) => s.toUpperCase());
      else if (p[0] === 'axis') asf.root.axisOrder = p[1].toUpperCase();
      else if (p[0] === 'position') asf.root.position = nums(p.slice(1, 4));
      else if (p[0] === 'orientation') asf.root.orientation = nums(p.slice(1, 4));
    } else if (section === 'bonedata') {
      if (p[0] === 'begin') {
        cur = { name: '', direction: [0, 0, 0], length: 0, axis: [0, 0, 0], axisOrder: 'XYZ', dof: [], children: [], parent: null };
      } else if (p[0] === 'end' && cur) {
        asf.bones[cur.name] = cur;
        cur = null;
      } else if (cur) {
        if (p[0] === 'name') cur.name = p[1];
        else if (p[0] === 'direction') cur.direction = nums(p.slice(1, 4));
        else if (p[0] === 'length') cur.length = Number(p[1]);
        else if (p[0] === 'axis') { cur.axis = nums(p.slice(1, 4)); cur.axisOrder = (p[4] ?? 'XYZ').toUpperCase(); }
        else if (p[0] === 'dof') cur.dof = p.slice(1).map((s) => s.toLowerCase().slice(1) as Axis);
      }
    } else if (section === 'hierarchy') {
      if (p[0] === 'begin' || p[0] === 'end') continue;
      const parent = asf.bones[p[0]];
      if (!parent) throw new Error(`ASF hierarchy: unknown bone ${p[0]}`);
      for (const c of p.slice(1)) {
        const child = asf.bones[c];
        if (!child) throw new Error(`ASF hierarchy: unknown bone ${c}`);
        parent.children.push(c);
        child.parent = p[0];
      }
    }
  }
  // breadth-first order from root
  const q = ['root'];
  while (q.length) {
    const n = q.shift()!;
    asf.order.push(n);
    q.push(...asf.bones[n].children);
  }
  return asf;
}
