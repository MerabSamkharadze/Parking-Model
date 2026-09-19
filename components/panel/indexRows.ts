// The index table's rows (SPEC §8.8, DECISIONS S26) as pure data, so the
// Index and Demand blocks agree on what "parked" means and the logic is
// testable without React: a car whose slot has been called (retrieve or
// shuffle job) is on its way out — it shows the job stage, counts as moving
// and cannot be called again.

import { parseSlotKey } from '@/lib/geometry';
import type { Job, SimSnapshot, Vehicle } from '@/lib/sim/types';

export interface IndexRow {
  id: string;
  plate: string;
  /** Slot key while parked, else the job stage (or the vehicle state). */
  where: string;
  /** Not sitting in a slot, or sitting in one that has been called. */
  moving: boolean;
  /** Parked and called: the car is still in its slot but a job is pulling it out. */
  called: boolean;
  zone: string;
  dwell: number;
  /** The slot to fly to: only while parked and not called. */
  slotKey: string | null;
}

/** Vehicles the index lists: in the facility or on their way in. */
export function inSystem(v: Vehicle): boolean {
  return v.state === 'parked' || v.state === 'in_system' || v.state === 'arriving';
}

/** Parked in a slot that no job has claimed yet: what "− Retrieve" can act on. */
export function isCallable(snapshot: SimSnapshot, vehicleId: string | null | undefined): boolean {
  if (!vehicleId) return false;
  const v = snapshot.vehicles[vehicleId];
  if (!v || v.state !== 'parked' || !v.slotKey) return false;
  const slot = snapshot.slots.find((s) => s.key === v.slotKey);
  return slot !== undefined && slot.calledBy === null;
}

/** Whether any car could be called right now (the default "− Retrieve" target exists). */
export function anyCallable(snapshot: SimSnapshot): boolean {
  const called = new Set<string>();
  for (const s of snapshot.slots) if (s.calledBy !== null) called.add(s.key);
  for (const v of Object.values(snapshot.vehicles) as Vehicle[]) {
    if (v.state === 'parked' && v.slotKey && !called.has(v.slotKey)) return true;
  }
  return false;
}

export function rowsOf(snapshot: SimSnapshot, hot: number): IndexRow[] {
  const stageOf = new Map<string, Job['stage']>();
  for (const j of snapshot.jobs) stageOf.set(j.vehicleId, j.stage);
  const calledSlots = new Set<string>();
  for (const s of snapshot.slots) if (s.calledBy !== null) calledSlots.add(s.key);
  const out: IndexRow[] = [];
  for (const v of Object.values(snapshot.vehicles) as Vehicle[]) {
    if (!inSystem(v)) continue;
    const stage = stageOf.get(v.id);
    const inSlot = v.state === 'parked' && v.slotKey !== null;
    const called = inSlot && (calledSlots.has(v.slotKey!) || stage !== undefined);
    const parked = inSlot && !called;
    out.push({
      id: v.id,
      plate: v.plate,
      where: parked ? v.slotKey! : (stage ?? (called ? 'called' : v.state)),
      moving: !parked,
      called,
      zone: v.slotKey ? (parseSlotKey(v.slotKey).level < hot ? 'hot' : 'cold') : '—',
      dwell: Math.max(0, snapshot.t - v.arrivedAt),
      slotKey: parked ? v.slotKey : null,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return out;
}
