// Where every moving thing is at render time — SPEC §9 "animation reads
// job.stage + job.progress and only interpolates". Pure functions over the
// engine snapshot: no three.js, no React, unit-tested in tests/motion.test.ts.
//
// Sources of truth: resource `move` descriptors (lib/sim/kinematics.ts ›
// positionAt) for lifts and shuttles; job stage timing for vehicles. The
// render clock `t` may run a fraction of a tick ahead of the snapshot, so
// everything is clamped to the stage/move it knows about.

import { bayPosition, layout, levelY, liftY, parseSlotKey, queuePosition, rowZ, slotPosition, slotX } from '@/lib/geometry';
import { positionAt } from '@/lib/sim/kinematics';
import type { FacilityConfig, Job, Resource, SimSnapshot, SlotClass } from '@/lib/sim/types';

export const SHUTTLE_HEIGHT = 0.3;
/** Cars drawn waiting on the street, at most (the panel shows the real number). */
export const QUEUE_DRAWN = 6;
export const POOL_SIZE = 40;

export interface Placement {
  vehicleId: string;
  jobId: string;
  cls: SlotClass;
  x: number;
  y: number; // underside of the car
  z: number;
  yaw: number; // radians about Y; 0 = long axis along X (corridor / bays)
}

const SLOT_YAW = Math.PI / 2;

export function progressAt(job: Job, t: number): number {
  const span = job.stageEndsAt - job.stageStartedAt;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.min(1, Math.max(0, (t - job.stageStartedAt) / span));
}

export function liftLevelAt(r: Resource, t: number): number {
  return positionAt(r.move, r.pos, t);
}

export function shuttleXAt(r: Resource, t: number): number {
  return positionAt(r.move, r.pos, t);
}

/** Shaft x for a lift resource id ("lift-W" → shaft W). */
export function shaftXOf(cfg: FacilityConfig, liftId: string): number {
  const id = liftId.startsWith('lift-') ? liftId.slice(5) : liftId;
  const shaft = layout(cfg).shafts.find((s) => s.id === id);
  return shaft ? shaft.x : 0;
}

function bayOf(cfg: FacilityConfig, bayId: string): { x: number; y: number; z: number } {
  const m = /^(in|out)-(\d+)$/.exec(bayId);
  if (!m) return { x: 0, y: 0, z: 0 };
  return bayPosition(cfg, m[1] === 'in' ? 'bay_in' : 'bay_out', Number(m[2]) - 1);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

interface Ctx {
  cfg: FacilityConfig;
  resources: ReadonlyMap<string, Resource>;
  t: number;
}

function onLift(ctx: Ctx, job: Job, p: Placement): boolean {
  const lift = job.resources.lift ? ctx.resources.get(job.resources.lift) : undefined;
  if (!lift) return false;
  p.x = shaftXOf(ctx.cfg, lift.id);
  p.y = liftY(ctx.cfg, liftLevelAt(lift, ctx.t));
  p.z = 0;
  p.yaw = 0;
  return true;
}

function onShuttle(ctx: Ctx, job: Job, p: Placement): boolean {
  const sh = job.resources.shuttle ? ctx.resources.get(job.resources.shuttle) : undefined;
  if (!sh) return false;
  p.x = shuttleXAt(sh, ctx.t);
  p.y = levelY(ctx.cfg, sh.level ?? 0) + SHUTTLE_HEIGHT;
  p.z = 0;
  p.yaw = 0;
  return true;
}

function inBay(ctx: Ctx, job: Job, p: Placement): boolean {
  const bay = job.resources.bay ?? job.bay;
  if (!bay) return false;
  const b = bayOf(ctx.cfg, bay);
  p.x = b.x;
  p.y = 0;
  p.z = b.z;
  p.yaw = 0;
  return true;
}

/** Slot ↔ corridor slide with the quarter turn (SPEC §9 "rotate + push"). k = 0 in the corridor, 1 in the slot. */
function slideSlot(ctx: Ctx, job: Job, slotKeyName: string, k: number, p: Placement): boolean {
  const id = parseSlotKey(slotKeyName);
  const pos = slotPosition(ctx.cfg, id);
  const kk = smooth(k);
  p.x = slotX(ctx.cfg, id.col);
  p.y = lerp(pos.y + SHUTTLE_HEIGHT, pos.y, kk); // the shuttle's arms set it down on the slot floor
  p.z = lerp(0, rowZ(ctx.cfg, id.row), kk);
  p.yaw = SLOT_YAW * kk * (id.row === 0 ? 1 : -1);
  return true;
}

/** Lift ↔ shuttle exchange at the shaft: the car changes height only. up = true: shuttle → lift (car sinks). */
function exchange(ctx: Ctx, job: Job, toLift: boolean, k: number, p: Placement): boolean {
  const lift = job.resources.lift ? ctx.resources.get(job.resources.lift) : undefined;
  const sh = job.resources.shuttle ? ctx.resources.get(job.resources.shuttle) : undefined;
  const carrier = lift ?? sh;
  if (!carrier) return false;
  const level = lift ? liftLevelAt(lift, ctx.t) : (sh!.level ?? 0) + 1;
  const floor = liftY(ctx.cfg, level);
  const from = toLift ? floor + SHUTTLE_HEIGHT : floor;
  const to = toLift ? floor : floor + SHUTTLE_HEIGHT;
  p.x = lift ? shaftXOf(ctx.cfg, lift.id) : shuttleXAt(sh!, ctx.t);
  p.y = lerp(from, to, smooth(k));
  p.z = 0;
  p.yaw = 0;
  return true;
}

function bayToLift(ctx: Ctx, job: Job, toLift: boolean, k: number, p: Placement): boolean {
  const lift = job.resources.lift ? ctx.resources.get(job.resources.lift) : undefined;
  const bay = job.resources.bay ?? job.bay; // a store's bay is released before the transfer starts
  if (!lift || !bay) return false;
  const b = bayOf(ctx.cfg, bay);
  const lx = shaftXOf(ctx.cfg, lift.id);
  const kk = smooth(k);
  p.x = toLift ? lerp(b.x, lx, kk) : lerp(lx, b.x, kk);
  p.y = 0;
  p.z = toLift ? lerp(b.z, 0, kk) : lerp(0, b.z, kk);
  p.yaw = 0;
  return true;
}

/**
 * Fills `p` for a job whose car is physically somewhere the pool should draw
 * it. Returns false for jobs whose car is parked (slot colour) or not yet in
 * view. Store: the bay is held through `lift_wait` (the car leaves it in
 * `to_lift`); `bay_out` for a retrieve is the mirror image.
 */
export function placeJob(ctx: Ctx, job: Job, p: Placement): boolean {
  const k = progressAt(job, ctx.t);
  switch (job.kind) {
    case 'store':
      switch (job.stage) {
        case 'bay':
        case 'scan':
        case 'lift_wait':
          return inBay(ctx, job, p);
        case 'to_lift':
          return bayToLift(ctx, job, true, k, p);
        case 'lift_move':
        case 'shuttle_wait':
          return onLift(ctx, job, p);
        case 'handover':
          return exchange(ctx, job, false, k, p);
        case 'corridor':
          return onShuttle(ctx, job, p);
        case 'insert':
          return slideSlot(ctx, job, job.slotKey, k, p);
        default:
          return false;
      }
    case 'retrieve':
      switch (job.stage) {
        case 'extract':
          return slideSlot(ctx, job, job.slotKey, 1 - k, p);
        case 'lift_wait':
        case 'corridor_out':
          return onShuttle(ctx, job, p);
        case 'handover':
          return exchange(ctx, job, true, k, p);
        case 'lift_up':
        case 'bay_wait':
          return onLift(ctx, job, p);
        case 'bay_out':
          return bayToLift(ctx, job, false, k, p);
        case 'ready':
          return inBay(ctx, job, p);
        case 'pickup': {
          // the driver leaves during the last third of the pick-up dwell
          if (!inBay(ctx, job, p)) return false;
          const drive = Math.max(0, (k - 0.66) / 0.34);
          p.x += 14 * smooth(drive);
          return true;
        }
        default:
          return false;
      }
    case 'shuffle': {
      const phaseA = job.resources.shuttle2 !== undefined; // still on the source level's shuttle
      switch (job.stage) {
        case 'extract':
          return slideSlot(ctx, job, job.fromSlotKey ?? job.slotKey, 1 - k, p);
        case 'corridor_out':
        case 'lift_wait':
        case 'corridor':
          return onShuttle(ctx, job, p);
        case 'handover':
          return exchange(ctx, job, phaseA, k, p);
        case 'lift_move':
        case 'shuttle_wait':
          // phase a's shuttle_wait is the shuttle travelling to the source slot: the car is still parked
          return !phaseA && job.resources.lift ? onLift(ctx, job, p) : false;
        case 'insert':
          return slideSlot(ctx, job, job.slotKey, k, p);
        default:
          return false;
      }
    }
  }
}

/** Slot keys whose car is mid-slide (extract / insert): the field draws a pad, the pool draws the car. */
export function slidingSlots(snapshot: SimSnapshot): Set<string> {
  const out = new Set<string>();
  for (const job of snapshot.jobs) {
    if (job.stage === 'insert') out.add(job.slotKey);
    else if (job.stage === 'extract') out.add(job.kind === 'shuffle' && job.fromSlotKey ? job.fromSlotKey : job.slotKey);
  }
  return out;
}

/**
 * All cars to draw this frame, written into `out` (pre-allocated, POOL_SIZE
 * entries); returns how many are used. Nothing is allocated per frame.
 */
export function placeVehicles(cfg: FacilityConfig, snapshot: SimSnapshot, resources: ReadonlyMap<string, Resource>, t: number, out: Placement[]): number {
  const ctx: Ctx = { cfg, resources, t };
  let n = 0;
  let queued = 0;
  for (const job of snapshot.jobs) {
    if (n >= out.length) break;
    const p = out[n];
    let placed = false;
    if (job.kind === 'store' && job.stage === 'queued') {
      if (queued >= QUEUE_DRAWN) continue;
      const q = queuePosition(cfg, queued++);
      p.x = q.x;
      p.y = 0;
      p.z = q.z;
      p.yaw = 0;
      placed = true;
    } else {
      placed = placeJob(ctx, job, p);
    }
    if (!placed) continue;
    p.vehicleId = job.vehicleId;
    p.jobId = job.id;
    p.cls = snapshot.vehicles[job.vehicleId]?.cls ?? 'standard';
    n++;
  }
  return n;
}

export function newPlacements(count = POOL_SIZE): Placement[] {
  return Array.from({ length: count }, () => ({ vehicleId: '', jobId: '', cls: 'standard' as SlotClass, x: 0, y: 0, z: 0, yaw: 0 }));
}
