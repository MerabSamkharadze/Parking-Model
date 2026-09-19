// config → 3D coordinates. SPEC §9/§11: the ONLY place slot coordinates are
// computed; the engine (distances, times) and the scene (positions) both use
// these functions. Pure TypeScript, no three.js.
//
// Axes: X = corridor (shuttle) axis, Y = height (0 = surface, negative below),
// Z = depth across the corridor. 1 unit = 1 m. Layout rules: DECISIONS E2/S3.

import type { FacilityConfig, SlotId } from './sim/types.ts';

/** Shaft length along the corridor axis (car + clearance). */
export const SHAFT_LENGTH = 5.8;
/** Level slab thickness. SPEC §2's `levelHeight` is the clear height under the
 *  slab ("nobody goes inside"), so the floor-to-floor pitch is `levelHeight + SLAB_THICKNESS`
 *  (DECISIONS S39; supersedes S3's reading of it as the pitch). */
export const SLAB_THICKNESS = 0.22;
/** Gap between a parked car's rear and the slot's back edge (DECISIONS S40). */
export const PARK_BACK_MARGIN = 0.15;
/** Shuttle length along the corridor and the clearance it keeps from a shaft's edge. */
export const SHUTTLE_LENGTH = 4.6;
const DOCK_GAP = 0.25;
const BAY_PITCH_Z = 3.4;
const BAY_PITCH_X = 6;
const BAYS_PER_ROW = 5;
const QUEUE_PITCH = 5.6;

export interface Shaft {
  id: string; // 'W' | 'E' | 'M1' | 'M2' …
  index: number; // lift index in the engine
  x: number; // shaft centre; also the shuttle exchange position
  zone: number; // the corridor zone that can reach it
}

export interface Layout {
  zones: number;
  colsPerZone: number[]; // columns in each zone (last zone takes the remainder)
  zoneStartCol: number[];
  zoneStartX: number[]; // x of the west edge of each zone's slot field
  gapShafts: number[]; // shafts placed in the gap after each zone (last entry unused)
  shafts: Shaft[];
  fieldMinX: number; // west edge of the westernmost zone
  fieldMaxX: number;
  minX: number; // includes end shafts
  maxX: number;
  warnings: string[];
}

export function slotKey(id: SlotId): string {
  return `L${id.level + 1}-R${id.row + 1}-${String(id.col + 1).padStart(2, '0')}`;
}

export function parseSlotKey(key: string): SlotId {
  const m = /^L(\d+)-R([12])-(\d+)$/.exec(key);
  if (!m) throw new Error(`bad slot key ${key}`);
  return { level: Number(m[1]) - 1, row: (Number(m[2]) - 1) as 0 | 1, col: Number(m[3]) - 1 };
}

export function slotIndex(cfg: FacilityConfig, id: SlotId): number {
  return (id.level * 2 + id.row) * cfg.cols + id.col;
}

export function slotCount(cfg: FacilityConfig): number {
  return cfg.levels * 2 * cfg.cols;
}

export function hotLevels(cfg: FacilityConfig): number {
  return Math.max(1, Math.ceil(cfg.levels / 3));
}

const layoutCache = new WeakMap<FacilityConfig, Layout>();

/** Corridor zones, gaps and shaft placement for a config (memoised per object). */
export function layout(cfg: FacilityConfig): Layout {
  const cached = layoutCache.get(cfg);
  if (cached) return cached;

  const zones = Math.max(1, Math.floor(cfg.shuttlesPerLevel));
  const warnings: string[] = [];
  const base = Math.floor(cfg.cols / zones);
  const colsPerZone: number[] = [];
  const zoneStartCol: number[] = [];
  let c = 0;
  for (let z = 0; z < zones; z++) {
    const n = z === zones - 1 ? cfg.cols - c : base;
    colsPerZone.push(n);
    zoneStartCol.push(c);
    c += n;
  }

  // Shaft placement: W (zone 0 west end), E (last zone east end), then the
  // internal gaps, one shaft facing each neighbouring zone.
  const capacity = 2 + 2 * (zones - 1);
  const placed = Math.min(cfg.lifts, capacity);
  if (cfg.lifts > capacity) {
    warnings.push(`only ${capacity} of ${cfg.lifts} lifts can be placed with ${zones} shuttle zone(s)`);
  }
  const gapShafts = new Array<number>(zones).fill(0);
  const shaftSpecs: Array<{ id: string; zone: number; where: 'W' | 'E' | 'gapW' | 'gapE'; gap: number }> = [];
  if (placed >= 1) shaftSpecs.push({ id: 'W', zone: 0, where: 'W', gap: -1 });
  if (placed >= 2) shaftSpecs.push({ id: 'E', zone: zones - 1, where: 'E', gap: -1 });
  let m = 1;
  for (let g = 0; g < zones - 1 && shaftSpecs.length < placed; g++) {
    // faces zone g from its east end
    shaftSpecs.push({ id: `M${m++}`, zone: g, where: 'gapE', gap: g });
    gapShafts[g]++;
    if (shaftSpecs.length < placed) {
      shaftSpecs.push({ id: `M${m++}`, zone: g + 1, where: 'gapW', gap: g });
      gapShafts[g]++;
    }
  }

  // Total width, centred on x = 0.
  let width = cfg.cols * cfg.pitch;
  for (let g = 0; g < zones - 1; g++) width += gapShafts[g] * SHAFT_LENGTH;
  const fieldMinX = -width / 2;
  const zoneStartX: number[] = [];
  let x = fieldMinX;
  for (let z = 0; z < zones; z++) {
    zoneStartX.push(x);
    x += colsPerZone[z] * cfg.pitch;
    if (z < zones - 1) x += gapShafts[z] * SHAFT_LENGTH;
  }
  const fieldMaxX = fieldMinX + width;

  const shafts: Shaft[] = shaftSpecs.map((s, index) => {
    let sx: number;
    if (s.where === 'W') sx = fieldMinX - SHAFT_LENGTH / 2;
    else if (s.where === 'E') sx = fieldMaxX + SHAFT_LENGTH / 2;
    else {
      const gapStart = zoneStartX[s.gap] + colsPerZone[s.gap] * cfg.pitch;
      // first shaft in the gap sits west (faces zone g), second east (faces g+1)
      sx = s.where === 'gapE' ? gapStart + SHAFT_LENGTH / 2 : gapStart + gapShafts[s.gap] * SHAFT_LENGTH - SHAFT_LENGTH / 2;
    }
    return { id: s.id, index, x: sx, zone: s.zone };
  });

  const result: Layout = {
    zones,
    colsPerZone,
    zoneStartCol,
    zoneStartX,
    gapShafts,
    shafts,
    fieldMinX,
    fieldMaxX,
    minX: placed >= 1 ? fieldMinX - SHAFT_LENGTH : fieldMinX,
    maxX: placed >= 2 ? fieldMaxX + SHAFT_LENGTH : fieldMaxX,
    warnings,
  };
  layoutCache.set(cfg, result);
  return result;
}

export function zoneOfCol(cfg: FacilityConfig, col: number): number {
  const l = layout(cfg);
  for (let z = l.zones - 1; z >= 0; z--) if (col >= l.zoneStartCol[z]) return z;
  return 0;
}

/** Shafts reachable from a corridor zone. */
export function zoneShafts(cfg: FacilityConfig, zone: number): Shaft[] {
  return layout(cfg).shafts.filter((s) => s.zone === zone);
}

export function shaftByIndex(cfg: FacilityConfig, index: number): Shaft {
  const s = layout(cfg).shafts[index];
  if (!s) throw new Error(`no shaft ${index}`);
  return s;
}

/** X of a column centre. */
export function slotX(cfg: FacilityConfig, col: number): number {
  const l = layout(cfg);
  const z = zoneOfCol(cfg, col);
  return l.zoneStartX[z] + (col - l.zoneStartCol[z] + 0.5) * cfg.pitch;
}

/** Z of a row centre (row 0 is the negative side). */
export function rowZ(cfg: FacilityConfig, row: 0 | 1): number {
  const d = cfg.corridorWidth / 2 + cfg.slotDepth / 2;
  return row === 0 ? -d : d;
}

/** Floor-to-floor pitch: the clear level height plus the slab above it. */
export function levelPitch(cfg: FacilityConfig): number {
  return cfg.levelHeight + SLAB_THICKNESS;
}

/** Floor Y of a 0-based level: L1 (index 0) floor one pitch below the surface. */
export function levelY(cfg: FacilityConfig, level: number): number {
  return -(level + 1) * levelPitch(cfg);
}

/** Y of a lift platform at a level number (0 = surface, k = level k). */
export function liftY(cfg: FacilityConfig, levelNumber: number): number {
  return -levelNumber * levelPitch(cfg);
}

export function slotPosition(cfg: FacilityConfig, id: SlotId): { x: number; y: number; z: number } {
  return { x: slotX(cfg, id.col), y: levelY(cfg, id.level), z: rowZ(cfg, id.row) };
}

/** Z of a parked car's centre: pushed to the back of its slot (rear at the slot's
 *  outer edge minus PARK_BACK_MARGIN) so the slot mouth stays clear for the
 *  quarter turn of a neighbour (DECISIONS S40). `length` is the drawn car's length. */
export function parkedZ(cfg: FacilityConfig, row: 0 | 1, length: number): number {
  const outer = cfg.corridorWidth / 2 + cfg.slotDepth;
  const centre = Math.max(cfg.corridorWidth / 2 + length / 2, outer - PARK_BACK_MARGIN - length / 2);
  return row === 0 ? -centre : centre;
}

/** Where a zone's shuttle stops to exchange with a shaft: just outside the shaft
 *  footprint on the field side, so the platform never passes through it and the
 *  shuttle's telescopic comb reaches the car (DECISIONS S41). */
export function shuttleDockX(cfg: FacilityConfig, shaft: Shaft): number {
  const l = layout(cfg);
  const zoneCentre = l.zoneStartX[shaft.zone] + (l.colsPerZone[shaft.zone] * cfg.pitch) / 2;
  const side = zoneCentre >= shaft.x ? 1 : -1;
  return shaft.x + side * (SHAFT_LENGTH / 2 + SHUTTLE_LENGTH / 2 + DOCK_GAP);
}

/** The engine drives a shuttle to the shaft centre; the scene draws it at the
 *  dock instead (monotonic clamp, so motion stays continuous). */
export function drawnShuttleX(cfg: FacilityConfig, zone: number, x: number): number {
  for (const s of layout(cfg).shafts) {
    if (s.zone !== zone) continue;
    const dock = shuttleDockX(cfg, s);
    const side = dock >= s.x ? 1 : -1;
    if (side > 0 ? x < dock : x > dock) return dock;
  }
  return x;
}

/** Shuttle travel distance between a shaft's exchange position and a column. */
export function corridorDistance(cfg: FacilityConfig, shaftIndex: number, col: number): number {
  return Math.abs(slotX(cfg, col) - shaftByIndex(cfg, shaftIndex).x);
}

/** Corridor x-range a zone's shuttle may occupy (including its shaft exchanges). */
export function zoneRange(cfg: FacilityConfig, zone: number): [number, number] {
  const l = layout(cfg);
  let lo = l.zoneStartX[zone];
  let hi = lo + l.colsPerZone[zone] * cfg.pitch;
  for (const s of l.shafts) {
    if (s.zone !== zone) continue;
    lo = Math.min(lo, s.x - SHAFT_LENGTH / 2);
    hi = Math.max(hi, s.x + SHAFT_LENGTH / 2);
  }
  return [lo, hi];
}

/** Surface bay position: input bays west of the W shaft, output bays east of E. */
export function bayPosition(cfg: FacilityConfig, kind: 'bay_in' | 'bay_out', index: number): { x: number; y: number; z: number } {
  const l = layout(cfg);
  const rowIdx = Math.floor(index / BAYS_PER_ROW);
  const inRow = index % BAYS_PER_ROW;
  const count = kind === 'bay_in' ? cfg.baysIn : cfg.baysOut;
  const rowLen = Math.min(BAYS_PER_ROW, count - rowIdx * BAYS_PER_ROW);
  const z = (inRow - (rowLen - 1) / 2) * BAY_PITCH_Z;
  const offset = 4 + rowIdx * BAY_PITCH_X;
  const x = kind === 'bay_in' ? l.minX - offset : l.maxX + offset;
  return { x, y: 0, z };
}

/** Where the i-th car waiting for an input bay stands: a lane on the street,
 *  west of the input bays, heading away from the facility. */
export function queuePosition(cfg: FacilityConfig, index: number): { x: number; y: number; z: number } {
  const l = layout(cfg);
  const bayRows = Math.ceil(cfg.baysIn / BAYS_PER_ROW);
  const laneStart = l.minX - (4 + bayRows * BAY_PITCH_X) - 3;
  return { x: laneStart - index * QUEUE_PITCH, y: 0, z: 0 };
}

export function bounds(cfg: FacilityConfig): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  const l = layout(cfg);
  const depth = cfg.corridorWidth / 2 + cfg.slotDepth;
  const bayRows = Math.max(Math.ceil(cfg.baysIn / BAYS_PER_ROW), Math.ceil(cfg.baysOut / BAYS_PER_ROW));
  const bayReach = 4 + bayRows * BAY_PITCH_X;
  return {
    minX: l.minX - bayReach,
    maxX: l.maxX + bayReach,
    minY: -cfg.levels * levelPitch(cfg),
    maxY: 0,
    minZ: -depth,
    maxZ: depth,
  };
}
