/**
 * Forward kinematics for CMU ASF/AMC.
 * Standard math: C = rotation from the bone's `axis` Euler angles,
 * local L = C · R(dofs) · C⁻¹, world M = M_parent · L,
 * child position = parent position + length · M · direction.
 * Output positions are in ASF length units, CMU world frame (Y up).
 */
import type { Asf } from './asf';
import type { Amc } from './amc';

export type V3 = [number, number, number];
type M3 = number[]; // row-major 3x3

const DEG = Math.PI / 180;

function rot(axis: string, a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function mul(a: M3, b: M3): M3 {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
const transpose = (a: M3): M3 => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/**
 * Euler rotation for angles given per axis {x,y,z} applied in `order`
 * (e.g. 'XYZ' = rotate about X first, then Y, then Z → M = Rz·Ry·Rx).
 */
function euler(angles: Record<string, number>, order: string): M3 {
  let m: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (const ax of order) m = mul(rot(ax, angles[ax] ?? 0), m);
  return m;
}

export interface Skeleton {
  asf: Asf;
  C: Record<string, M3>;
  Cinv: Record<string, M3>;
}

export function prepare(asf: Asf): Skeleton {
  const toRad = asf.units.angle === 'deg' ? DEG : 1;
  const C: Record<string, M3> = {}, Cinv: Record<string, M3> = {};
  for (const name of asf.order) {
    const b = asf.bones[name];
    const ax = name === 'root' ? asf.root.orientation : b.axis;
    const order = name === 'root' ? asf.root.axisOrder : b.axisOrder;
    C[name] = euler({ X: ax[0] * toRad, Y: ax[1] * toRad, Z: ax[2] * toRad }, order);
    Cinv[name] = transpose(C[name]);
  }
  return { asf, C, Cinv };
}

/**
 * World position of every bone's END point (root: root position) for one AMC frame.
 */
export function solveFrame(sk: Skeleton, frame: Record<string, number[]>): Record<string, V3> {
  const { asf, C, Cinv } = sk;
  const toRad = asf.units.angle === 'deg' ? DEG : 1;
  const pos: Record<string, V3> = {};
  const mat: Record<string, M3> = {};
  for (const name of asf.order) {
    const b = asf.bones[name];
    if (name === 'root') {
      const vals = frame.root ?? [0, 0, 0, 0, 0, 0];
      const t: V3 = [...asf.root.position] as V3;
      const r: Record<string, number> = {};
      asf.root.order.forEach((ch, i) => {
        const v = vals[i] ?? 0;
        if (ch[0] === 'T') t['XYZ'.indexOf(ch[1])] = v;
        else r[ch[1]] = v * toRad;
      });
      // root rotation order: the root `order` line lists RX RY RZ → apply as the axis order
      const rOrder = asf.root.order.filter((c) => c[0] === 'R').map((c) => c[1]).join('') || 'XYZ';
      mat.root = mul(mul(C.root, euler(r, rOrder)), Cinv.root);
      pos.root = t;
      continue;
    }
    const vals = frame[name] ?? [];
    const r: Record<string, number> = {};
    b.dof.forEach((d, i) => { r[d.toUpperCase()] = (vals[i] ?? 0) * toRad; });
    const L = mul(mul(C[name], euler(r, b.axisOrder)), Cinv[name]);
    mat[name] = mul(mat[b.parent!], L);
    const d = apply(mat[name], b.direction);
    const pp = pos[b.parent!];
    pos[name] = [pp[0] + b.length * d[0], pp[1] + b.length * d[1], pp[2] + b.length * d[2]];
  }
  return pos;
}

export function solveMotion(asf: Asf, amc: Amc): Record<string, V3>[] {
  const sk = prepare(asf);
  return amc.frames.map((f) => solveFrame(sk, f));
}
