import type { AABB, FloorId, Team, Vec2 } from '../sim/types';

/**
 * Level data for the single beta building (plan §4.8).
 * Floors: F1 y=0 (ground + street), F2 y=4, F3 y=8, F4 y=12, ROOF y=16.
 * One switchback staircase (S1..S4), two doors (D1 front, D2 roof housing),
 * an outside ladder to the F2 window, and drop-through stairwell openings.
 */

export interface FloorDef {
  id: FloorId;
  name: string;
  y: number;
  /** Safe walkable x-range (used for goals and validation). */
  x0: number;
  x1: number;
}

export interface StairDef { id: string; foot: Vec2; top: Vec2; footFloor: FloorId; topFloor: FloorId }
export interface LadderDef { id: string; x: number; y0: number; y1: number; topExit: Vec2; bottomFloor: FloorId; topFloor: FloorId }

export type NavEdgeType = 'walk' | 'stair' | 'ladder' | 'drop';
export interface NavNode { id: string; name: string; x: number; y: number; floor: FloorId }
export interface NavEdge {
  a: string;
  b: string;
  type: NavEdgeType;
  oneWay?: boolean;
  /** Index of the stair/ladder this edge uses. */
  ref?: number;
  /** For drop edges: horizontal direction to walk off the edge. */
  dir?: 1 | -1;
}

export interface LevelDef {
  bounds: AABB;
  camera: AABB;
  solids: AABB[];
  floors: FloorDef[];
  stairs: StairDef[];
  ladders: LadderDef[];
  openings: AABB[];
  doors: { id: string; rect: AABB }[];
  windows: AABB[];
  pockets: AABB[];
  housing: AABB;
  nav: { nodes: NavNode[]; edges: NavEdge[] };
  spawns: Record<Team, Vec2[]>;
  flagZone: AABB;
  flagPoleX: number;
  /** Defender bots' match-start HOLD anchors, keyed by bot index 1..3. */
  homeAnchors: Record<number, { floor: FloorId; x: number }>;
  building: AABB;
}

const box = (x0: number, y0: number, x1: number, y1: number): AABB => ({ x0, y0, x1, y1 });

const pockets = [box(20, 3.7, 24, 8), box(0, 7.7, 4, 12), box(20, 11.7, 24, 16)];
const housingMass = box(0, 15.7, 4, 19.3);

export const BUILDING: LevelDef = {
  bounds: box(-12, -1, 26, 21),
  camera: box(-12, -1, 26, 20.2),
  building: box(0, 0, 24, 16),
  solids: [
    box(-12.4, -1, 26.4, 0),          // ground / street
    box(-12.4, -1, -12, 30),          // world wall left
    box(26, -1, 26.4, 30),            // world wall right
    box(-0.4, 2.6, 0, 4),             // left wall between door D1 and F2 window
    box(-0.4, 6.4, 0, 17.2),          // left wall above F2 window (to parapet)
    box(24, 0, 24.4, 17.2),           // right wall (to parapet)
    box(0, 3.7, 16, 4),               // F2 slab (opening x16–20)
    box(8, 7.7, 24, 8),               // F3 slab (opening x4–8)
    box(0, 11.7, 16, 12),             // F4 slab (opening x16–20)
    box(8, 15.7, 24, 16),             // roof slab (opening x4–8)
    ...pockets,                       // solid storage pockets
    housingMass,                      // roof housing left mass
    box(0, 19, 9.8, 19.3),            // housing ceiling
    box(9.4, 18.6, 9.8, 19.0),        // housing wall above door D2
  ],
  floors: [
    { id: 0, name: 'F1', y: 0, x0: -11.6, x1: 23.6 },
    { id: 1, name: 'F2', y: 4, x0: 0.5, x1: 15.7 },
    { id: 2, name: 'F3', y: 8, x0: 8.3, x1: 23.6 },
    { id: 3, name: 'F4', y: 12, x0: 0.4, x1: 15.7 },
    { id: 4, name: 'ROOF', y: 16, x0: 8.3, x1: 23.6 },
  ],
  stairs: [
    { id: 'S1', foot: { x: 20, y: 0 }, top: { x: 16, y: 4 }, footFloor: 0, topFloor: 1 },
    { id: 'S2', foot: { x: 4, y: 4 }, top: { x: 8, y: 8 }, footFloor: 1, topFloor: 2 },
    { id: 'S3', foot: { x: 20, y: 8 }, top: { x: 16, y: 12 }, footFloor: 2, topFloor: 3 },
    { id: 'S4', foot: { x: 4, y: 12 }, top: { x: 8, y: 16 }, footFloor: 3, topFloor: 4 },
  ],
  ladders: [{ id: 'L1', x: -1, y0: 0, y1: 4, topExit: { x: 0.8, y: 4 }, bottomFloor: 0, topFloor: 1 }],
  openings: [box(16, 3.7, 20, 4), box(4, 7.7, 8, 8), box(16, 11.7, 20, 12), box(4, 15.7, 8, 16)],
  doors: [
    { id: 'D1', rect: box(-0.4, 0, 0, 2.6) },
    { id: 'D2', rect: box(9.4, 16, 9.8, 18.6) },
  ],
  windows: [box(-0.4, 4, 0, 6.4)],
  pockets,
  housing: box(0, 16, 9.8, 19.3),
  nav: {
    nodes: [
      { id: 'N01', name: 'Attacker spawn', x: -7, y: 0, floor: 0 },
      { id: 'N02', name: 'Ladder bottom', x: -1, y: 0, floor: 0 },
      { id: 'N03', name: 'Door D1', x: 0.6, y: 0, floor: 0 },
      { id: 'N04', name: 'F1 middle', x: 10, y: 0, floor: 0 },
      { id: 'N05', name: 'S1 foot', x: 20, y: 0, floor: 0 },
      { id: 'N06', name: 'F1 back', x: 22.5, y: 0, floor: 0 },
      { id: 'N07', name: 'S1 top', x: 16, y: 4, floor: 1 },
      { id: 'N08', name: 'F2 middle', x: 10, y: 4, floor: 1 },
      { id: 'N09', name: 'S2 foot', x: 4, y: 4, floor: 1 },
      { id: 'N10', name: 'Window / ladder top', x: 0.8, y: 4, floor: 1 },
      { id: 'N11', name: 'S2 top', x: 8, y: 8, floor: 2 },
      { id: 'N12', name: 'F3 middle', x: 14, y: 8, floor: 2 },
      { id: 'N13', name: 'S3 foot', x: 20, y: 8, floor: 2 },
      { id: 'N14', name: 'F3 back', x: 22.5, y: 8, floor: 2 },
      { id: 'N15', name: 'S3 top', x: 16, y: 12, floor: 3 },
      { id: 'N16', name: 'F4 middle / defender spawn', x: 11, y: 12, floor: 3 },
      { id: 'N17', name: 'S4 foot', x: 4, y: 12, floor: 3 },
      { id: 'N18', name: 'S4 top (housing)', x: 8, y: 16, floor: 4 },
      { id: 'N19', name: 'Door D2', x: 9.8, y: 16, floor: 4 },
      { id: 'N20', name: 'Flag centre', x: 17, y: 16, floor: 4 },
      { id: 'N21', name: 'Roof right', x: 22, y: 16, floor: 4 },
    ],
    edges: [
      { a: 'N01', b: 'N02', type: 'walk' },
      { a: 'N02', b: 'N03', type: 'walk' },
      { a: 'N03', b: 'N04', type: 'walk' },
      { a: 'N04', b: 'N05', type: 'walk' },
      { a: 'N05', b: 'N06', type: 'walk' },
      { a: 'N10', b: 'N09', type: 'walk' },
      { a: 'N09', b: 'N08', type: 'walk' },
      { a: 'N08', b: 'N07', type: 'walk' },
      { a: 'N11', b: 'N12', type: 'walk' },
      { a: 'N12', b: 'N13', type: 'walk' },
      { a: 'N13', b: 'N14', type: 'walk' },
      { a: 'N17', b: 'N16', type: 'walk' },
      { a: 'N16', b: 'N15', type: 'walk' },
      { a: 'N18', b: 'N19', type: 'walk' },
      { a: 'N19', b: 'N20', type: 'walk' },
      { a: 'N20', b: 'N21', type: 'walk' },
      { a: 'N05', b: 'N07', type: 'stair', ref: 0 },
      { a: 'N09', b: 'N11', type: 'stair', ref: 1 },
      { a: 'N13', b: 'N15', type: 'stair', ref: 2 },
      { a: 'N17', b: 'N18', type: 'stair', ref: 3 },
      { a: 'N02', b: 'N10', type: 'ladder', ref: 0 },
      { a: 'N07', b: 'N05', type: 'drop', oneWay: true, dir: 1 },
      { a: 'N11', b: 'N09', type: 'drop', oneWay: true, dir: -1 },
      { a: 'N15', b: 'N13', type: 'drop', oneWay: true, dir: 1 },
      { a: 'N18', b: 'N17', type: 'drop', oneWay: true, dir: -1 },
    ],
  },
  spawns: {
    ATTACKER: [{ x: -7, y: 0 }, { x: -8.5, y: 0 }, { x: -5.5, y: 0 }, { x: -10, y: 0 }],
    DEFENDER: [{ x: 11, y: 12 }, { x: 9, y: 12 }, { x: 13, y: 12 }, { x: 10, y: 12 }],
  },
  flagZone: box(14, 16, 20, 18),
  flagPoleX: 17,
  homeAnchors: {
    1: { floor: 1, x: 13 },
    2: { floor: 2, x: 12 },
    3: { floor: 4, x: 17 },
  },
};

export const floorY = (level: LevelDef, floor: FloorId): number => level.floors[floor].y;

/** Floor index for a grounded y position. */
export function floorFromY(y: number): FloorId {
  const f = Math.round(y / 4);
  return Math.max(0, Math.min(4, f)) as FloorId;
}
