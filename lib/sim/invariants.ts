// Invariants — SPEC §4.2. Checked every tick in dev mode; throw on violation
// so a broken rule never survives silently.

import { zoneRange } from '../geometry.ts';
import type { ResourceManager } from './resources.ts';
import type { FacilityConfig, Job, JobKind, JobStage, Slot, Vehicle } from './types.ts';

/** Stages in which the car is on a carrier (bay transfer, lift or shuttle), per job kind. */
const ON_CARRIER: Record<JobKind, ReadonlySet<JobStage>> = {
  store: new Set<JobStage>(['to_lift', 'lift_move', 'shuttle_wait', 'handover', 'corridor', 'insert']),
  retrieve: new Set<JobStage>(['corridor_out', 'handover', 'lift_up', 'bay_wait', 'bay_out']),
  shuffle: new Set<JobStage>(['corridor_out', 'handover', 'lift_move', 'corridor', 'insert']),
};

export class InvariantError extends Error {}

function fail(msg: string): never {
  throw new InvariantError(msg);
}

export function assertInvariants(
  cfg: FacilityConfig,
  t: number,
  slots: readonly Slot[],
  vehicles: ReadonlyMap<string, Vehicle>,
  jobs: ReadonlyMap<string, Job>,
  rm: ResourceManager,
): void {
  // (1) one resource ↔ one job, and the job must list it
  const held = new Map<string, string>();
  for (const r of rm.resources) {
    if (!r.busyWith) continue;
    const j = jobs.get(r.busyWith);
    if (!j) fail(`t=${t}: ${r.id} held by unknown job ${r.busyWith}`);
    const listed = Object.values(j.resources).includes(r.id);
    if (!listed) fail(`t=${t}: ${r.id} held by ${j.id} but not listed on the job`);
    held.set(r.id, j.id);
  }
  for (const j of jobs.values()) {
    for (const id of Object.values(j.resources)) {
      if (id && held.get(id) !== j.id) fail(`t=${t}: job ${j.id} lists ${id} but does not hold it`);
    }
  }

  // (2) one slot ↔ one vehicle
  const seen = new Set<string>();
  for (const s of slots) {
    if (s.state === 'occupied') {
      if (!s.vehicleId) fail(`t=${t}: ${s.key} occupied without vehicle`);
      if (seen.has(s.vehicleId)) fail(`t=${t}: vehicle ${s.vehicleId} in two slots`);
      seen.add(s.vehicleId);
      const v = vehicles.get(s.vehicleId);
      if (!v || v.slotKey !== s.key) fail(`t=${t}: ${s.key} ↔ ${s.vehicleId} mismatch`);
    } else if (s.vehicleId && s.state === 'free') {
      fail(`t=${t}: free slot ${s.key} still references ${s.vehicleId}`);
    }
  }

  // (3) a moving vehicle is not in a slot
  for (const j of jobs.values()) {
    if (ON_CARRIER[j.kind].has(j.stage) || (j.kind === 'retrieve' && j.stage === 'lift_wait' && j.resources.lift)) {
      const v = vehicles.get(j.vehicleId);
      if (v && v.slotKey) fail(`t=${t}: ${v.id} moving (${j.kind}/${j.stage}) while in ${v.slotKey}`);
    }
  }

  // (4) jobs holding resources ≤ resources × 3
  let holders = 0;
  for (const j of jobs.values()) if (Object.values(j.resources).some(Boolean)) holders++;
  if (holders > rm.resources.length * 3) fail(`t=${t}: ${holders} jobs hold resources, limit ${rm.resources.length * 3}`);

  // (5) a shuttle never leaves its zone (no two shuttles can meet)
  for (const r of rm.resources) {
    if (r.kind !== 'shuttle' || r.zone === undefined) continue;
    const [lo, hi] = zoneRange(cfg, r.zone);
    const x = rm.positionOf(r, t);
    if (x < lo - 1e-6 || x > hi + 1e-6) fail(`t=${t}: ${r.id} at x=${x.toFixed(2)} outside zone [${lo.toFixed(2)}, ${hi.toFixed(2)}]`);
  }
}
