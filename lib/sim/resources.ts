// Resource manager — SPEC §4.2. Collision safety by construction: every
// movement needs the resource, one job per resource, all-or-nothing grants in
// priority/FIFO order. Deadlock freedom comes from the lock ordering in
// DECISIONS E4 (bay_in < shuttle < lift < bay_out), enforced by how jobs.ts
// sequences its requests.

import { layout, zoneRange } from '../geometry.ts';
import { liftTravelTime, positionAt, shuttleTravelTime } from './kinematics.ts';
import type { FacilityConfig, Resource, ResourceKind, ResourceMove } from './types.ts';

const WINDOW_MINUTES = 15;

export interface ResourceState extends Resource {
  busySince: number | null;
  busySeconds: number; // cumulative
  buckets: number[]; // per-minute busy seconds, rolling window
  bucketIdx: number;
  /** Lifts: hold durations of completed movements (for the lift-cycle metric). */
  cycles: number[];
}

export interface Want {
  kind: ResourceKind;
  level?: number; // shuttles
  zone?: number; // shuttles: exact zone; lifts: any shaft facing this zone
  /** Lower is better; picks among free candidates. */
  score?: (r: ResourceState) => number;
}

export interface Request {
  jobId: string;
  wants: Want[];
  priority: number; // 0 = highest
  createdAt: number;
  /** Grant only if this many resources of the last want's kind stay free (pre-fetch bays). */
  minFreeAfter?: number;
  seq?: number;
}

export interface Grant {
  jobId: string;
  resources: ResourceState[];
  waited: number;
}

export class ResourceManager {
  readonly resources: ResourceState[] = [];
  private readonly byId = new Map<string, ResourceState>();
  private pending: Request[] = [];
  private seq = 0;
  private lastBucketMinute = 0;
  dirty = false;

  constructor(private readonly cfg: FacilityConfig) {
    const lay = layout(cfg);
    for (let i = 0; i < cfg.baysIn; i++) this.add({ id: `in-${i + 1}`, kind: 'bay_in' }, 0);
    for (let i = 0; i < cfg.baysOut; i++) this.add({ id: `out-${i + 1}`, kind: 'bay_out' }, 0);
    for (const s of lay.shafts) this.add({ id: `lift-${s.id}`, kind: 'lift', zone: s.zone }, 0);
    for (let level = 0; level < cfg.levels; level++) {
      for (let z = 0; z < lay.zones; z++) {
        // Shuttles rest at the west end of their zone.
        const id = lay.zones === 1 ? `shuttle-L${level + 1}` : `shuttle-L${level + 1}-${z + 1}`;
        this.add({ id, kind: 'shuttle', level, zone: z }, zoneRange(cfg, z)[0] + 1);
      }
    }
  }

  private add(base: { id: string; kind: ResourceKind; level?: number; zone?: number }, pos: number): void {
    const r: ResourceState = {
      ...base,
      busyWith: null,
      pos,
      move: null,
      down: false,
      busySince: null,
      busySeconds: 0,
      buckets: new Array<number>(WINDOW_MINUTES).fill(0),
      bucketIdx: 0,
      cycles: [],
    };
    this.resources.push(r);
    this.byId.set(r.id, r);
  }

  get(id: string): ResourceState {
    const r = this.byId.get(id);
    if (!r) throw new Error(`unknown resource ${id}`);
    return r;
  }

  ofKind(kind: ResourceKind): ResourceState[] {
    return this.resources.filter((r) => r.kind === kind);
  }

  shuttleFor(level: number, zone: number): ResourceState {
    const r = this.resources.find((x) => x.kind === 'shuttle' && x.level === level && x.zone === zone);
    if (!r) throw new Error(`no shuttle for L${level + 1} zone ${zone}`);
    return r;
  }

  liftIndexOf(r: ResourceState): number {
    return layout(this.cfg).shafts.findIndex((s) => `lift-${s.id}` === r.id);
  }

  // ---- requests -----------------------------------------------------------

  request(req: Request): void {
    req.seq = this.seq++;
    // keep sorted by (priority, seq)
    let i = this.pending.length;
    while (i > 0) {
      const p = this.pending[i - 1];
      if (p.priority < req.priority || (p.priority === req.priority && (p.seq ?? 0) < (req.seq ?? 0))) break;
      i--;
    }
    this.pending.splice(i, 0, req);
    this.dirty = true;
  }

  cancel(jobId: string): void {
    this.pending = this.pending.filter((p) => p.jobId !== jobId);
  }

  hasPending(jobId: string): boolean {
    return this.pending.some((p) => p.jobId === jobId);
  }

  pendingCount(kind?: ResourceKind): number {
    if (!kind) return this.pending.length;
    return this.pending.filter((p) => p.wants.some((w) => w.kind === kind)).length;
  }

  /** Pending requests that need a given shuttle (for the balanced allocator). */
  pendingForShuttle(level: number, zone: number): number {
    let n = 0;
    for (const p of this.pending) {
      if (p.wants.some((w) => w.kind === 'shuttle' && w.level === level && w.zone === zone)) n++;
    }
    return n;
  }

  private candidates(w: Want, taken: Set<string>): ResourceState[] {
    const out: ResourceState[] = [];
    for (const r of this.resources) {
      if (r.kind !== w.kind || r.busyWith || r.down || taken.has(r.id)) continue;
      if (w.level !== undefined && r.level !== w.level) continue;
      if (w.zone !== undefined && r.zone !== w.zone) continue;
      out.push(r);
    }
    return out;
  }

  /** Try to satisfy pending requests in order; returns the grants made. */
  process(t: number): Grant[] {
    const grants: Grant[] = [];
    if (!this.dirty) return grants;
    this.dirty = false;
    const remaining: Request[] = [];
    for (const req of this.pending) {
      const taken = new Set<string>();
      const chosen: ResourceState[] = [];
      let ok = true;
      for (let i = 0; i < req.wants.length; i++) {
        const w = req.wants[i];
        const cands = this.candidates(w, taken);
        const minFree = i === req.wants.length - 1 ? (req.minFreeAfter ?? 0) : 0;
        if (cands.length === 0 || cands.length - 1 < minFree) {
          ok = false;
          break;
        }
        let best = cands[0];
        if (w.score) {
          let bestScore = w.score(best);
          for (let k = 1; k < cands.length; k++) {
            const s = w.score(cands[k]);
            if (s < bestScore) {
              bestScore = s;
              best = cands[k];
            }
          }
        }
        taken.add(best.id);
        chosen.push(best);
      }
      if (!ok) {
        remaining.push(req);
        continue;
      }
      for (const r of chosen) this.acquire(r, req.jobId, t);
      grants.push({ jobId: req.jobId, resources: chosen, waited: t - req.createdAt });
    }
    this.pending = remaining;
    return grants;
  }

  private acquire(r: ResourceState, jobId: string, t: number): void {
    if (r.busyWith) throw new Error(`${r.id} already held by ${r.busyWith}`);
    r.busyWith = jobId;
    r.busySince = t;
  }

  release(id: string, t: number): void {
    const r = this.get(id);
    if (!r.busyWith) throw new Error(`${id} released while free`);
    if (r.kind === 'lift' && r.busySince !== null) r.cycles.push(t - r.busySince);
    r.busyWith = null;
    r.busySince = null;
    this.dirty = true;
  }

  // ---- motion -------------------------------------------------------------

  positionOf(r: ResourceState, t: number): number {
    return positionAt(r.move, r.pos, t);
  }

  /** Command a move; returns the arrival time. Works from the current (interpolated) position. */
  moveTo(r: ResourceState, target: number, t: number): number {
    const from = this.positionOf(r, t);
    const dur =
      r.kind === 'lift'
        ? liftTravelTime(this.cfg.timings, from, target)
        : shuttleTravelTime(this.cfg.timings, target - from);
    if (dur <= 0) {
      r.move = null;
      r.pos = target;
      return t;
    }
    const move: ResourceMove = { from, to: target, start: t, end: t + dur };
    r.move = move;
    r.pos = target;
    return move.end;
  }

  arrivalTime(r: ResourceState, t: number): number {
    return r.move && r.move.end > t ? r.move.end : t;
  }

  isAt(r: ResourceState, pos: number, t: number): boolean {
    return Math.abs(this.positionOf(r, t) - pos) < 1e-6;
  }

  /** Idle lifts return to the surface (DECISIONS E4). */
  parkIdleLifts(t: number): void {
    for (const r of this.resources) {
      if (r.kind !== 'lift' || r.busyWith || r.down) continue;
      if (r.pos !== 0 && (!r.move || r.move.to !== 0)) this.moveTo(r, 0, t);
    }
  }

  /** Freeze the motion of frozen resources by one tick (failure / power loss). */
  shiftMove(r: ResourceState, dt: number, t: number): void {
    if (r.move && r.move.end > t - dt) {
      r.move.start += dt;
      r.move.end += dt;
    }
  }

  // ---- accounting ---------------------------------------------------------

  /** Per tick: accumulate busy time and rotate the per-minute window. */
  account(t: number, dt: number): void {
    const minute = Math.floor(t / 60);
    if (minute !== this.lastBucketMinute) {
      const steps = Math.min(WINDOW_MINUTES, minute - this.lastBucketMinute);
      for (const r of this.resources) {
        for (let s = 0; s < steps; s++) {
          r.bucketIdx = (r.bucketIdx + 1) % WINDOW_MINUTES;
          r.buckets[r.bucketIdx] = 0;
        }
      }
      this.lastBucketMinute = minute;
    }
    for (const r of this.resources) {
      if (r.busyWith) {
        r.busySeconds += dt;
        r.buckets[r.bucketIdx] += dt;
      }
    }
  }

  /** Rolling 15-minute utilisation, 0..1. */
  utilization(r: ResourceState, t: number): number {
    let sum = 0;
    for (const b of r.buckets) sum += b;
    const span = Math.min(t, WINDOW_MINUTES * 60);
    return span > 0 ? Math.min(1, sum / span) : 0;
  }

  snapshot(t: number): Resource[] {
    return this.resources.map((r) => ({
      id: r.id,
      kind: r.kind,
      busyWith: r.busyWith,
      level: r.level,
      zone: r.zone,
      pos: this.positionOf(r, t),
      move: r.move ? { ...r.move } : null,
      down: r.down,
    }));
  }
}
