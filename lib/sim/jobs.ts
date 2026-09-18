// Job state machine — SPEC §3/§4.2 stages, sequencing per DECISIONS E4/E5.
// The machine only ever *asks* the resource manager for resources in the
// lock order bay_in < shuttle < lift < bay_out, which is what makes the
// system deadlock-free by construction.

import { parseSlotKey, shaftByIndex, slotX, zoneOfCol, zoneShafts, corridorDistance } from '../geometry.ts';
import { liftTravelTime, shuttleTravelTime } from './kinematics.ts';
import type { Grant, ResourceManager, ResourceState, Want } from './resources.ts';
import type { Rng } from './prng.ts';
import type { EventKind, FacilityConfig, Job, JobKind, JobStage, Slot, Vehicle } from './types.ts';

export const PRIORITY = { retrieve: 0, store: 1, prefetch: 2, shuffle: 3 } as const;

/** What the engine gives the state machine; everything else stays inside the engine. */
export interface JobHost {
  readonly cfg: FacilityConfig;
  readonly rm: ResourceManager;
  readonly rng: Rng;
  readonly t: number;
  slot(key: string): Slot;
  patchSlot(key: string, patch: Partial<Slot>): void;
  vehicle(id: string): Vehicle;
  log(kind: EventKind, text: string, extra?: { vehicleId?: string; slotKey?: string; seconds?: number }): void;
  onStoreDone(job: Job, storeSeconds: number): void;
  onRetrieveReady(job: Job, retrieveSeconds: number): void;
  onRetrieveDone(job: Job): void;
  onShuffleDone(job: Job): void;
}

const LOCK_WAIT_LOG_THRESHOLD = 2; // s

export class JobMachine {
  private seq = 0;
  /** Cross-level shuffles: which carrier currently has the car. */
  private readonly shufflePhase = new Map<string, 'a' | 'lift' | 'b'>();
  private readonly host: JobHost;
  /** Retrieve lift choice: any free reachable lift, or only the shaft nearest the column. */
  retrieveLiftPolicy: 'any' | 'nearest' = 'any';

  constructor(host: JobHost) {
    this.host = host;
  }

  private nearestShaftIndex(col: number): number {
    const zone = zoneOfCol(this.cfg, col);
    let best = -1;
    let bestD = Infinity;
    for (const s of zoneShafts(this.cfg, zone)) {
      const d = corridorDistance(this.cfg, s.index, col);
      if (d < bestD) {
        bestD = d;
        best = s.index;
      }
    }
    return best;
  }

  private retrieveLiftWant(level: number, col: number): Want {
    if (this.retrieveLiftPolicy === 'any') return this.liftWant(level, col);
    const idx = this.nearestShaftIndex(col);
    const id = `lift-${shaftByIndex(this.cfg, idx).id}`;
    const base = this.liftWant(level, col);
    return { ...base, score: (r) => (r.id === id ? 0 : Infinity), only: id };
  }

  private get cfg(): FacilityConfig {
    return this.host.cfg;
  }

  private timed(nominal: number): number {
    return this.host.rng.jitter(nominal, this.cfg.timings.jitter);
  }

  private setStage(job: Job, stage: JobStage, duration: number | null): void {
    job.stage = stage;
    job.stageStartedAt = this.host.t;
    job.stageEndsAt = duration === null ? Infinity : this.host.t + duration;
  }

  private setStageUntil(job: Job, stage: JobStage, endsAt: number): void {
    job.stage = stage;
    job.stageStartedAt = this.host.t;
    job.stageEndsAt = Math.max(endsAt, this.host.t);
  }

  private newJob(kind: JobKind, vehicleId: string, slotKey: string, priority: number): Job {
    this.seq++;
    return {
      id: `${kind[0]}${String(this.seq).padStart(5, '0')}`,
      kind,
      vehicleId,
      slotKey,
      fromSlotKey: null,
      stage: 'queued',
      stageStartedAt: this.host.t,
      stageEndsAt: Infinity,
      createdAt: this.host.t,
      callAt: this.host.t,
      finishedAt: null,
      resources: {},
      progress: 0,
      priority,
      prefetch: false,
      frozen: false,
    };
  }

  /** Lift ranking: repositioning time to `levelNumber` + corridor travel between that shaft and `col`. */
  private liftScore(levelNumber: number, col: number): (r: ResourceState) => number {
    const rm = this.host.rm;
    const cfg = this.cfg;
    return (r) => {
      const idx = rm.liftIndexOf(r);
      const pos = rm.positionOf(r, this.host.t);
      return liftTravelTime(cfg.timings, pos, levelNumber) + shuttleTravelTime(cfg.timings, corridorDistance(cfg, idx, col));
    };
  }

  private liftWant(level: number, col: number): Want {
    return { kind: 'lift', zone: zoneOfCol(this.cfg, col), score: this.liftScore(level + 1, col) };
  }

  private shaftOf(liftId: string): { x: number; index: number } {
    const r = this.host.rm.get(liftId);
    const idx = this.host.rm.liftIndexOf(r);
    return { x: shaftByIndex(this.cfg, idx).x, index: idx };
  }

  // ---- creation -----------------------------------------------------------

  createStore(v: Vehicle, slot: Slot): Job {
    const job = this.newJob('store', v.id, slot.key, PRIORITY.store);
    this.host.patchSlot(slot.key, { state: 'reserved', vehicleId: v.id });
    this.host.rm.request({ jobId: job.id, wants: [{ kind: 'bay_in' }], priority: job.priority, createdAt: this.host.t });
    return job;
  }

  createRetrieve(v: Vehicle, callAt: number, prefetch: boolean): Job {
    if (!v.slotKey) throw new Error(`${v.id} is not parked`);
    const job = this.newJob('retrieve', v.id, v.slotKey, prefetch ? PRIORITY.prefetch : PRIORITY.retrieve);
    job.callAt = callAt;
    job.prefetch = prefetch;
    const id = parseSlotKey(v.slotKey);
    this.host.patchSlot(v.slotKey, { calledBy: job.id });
    this.host.rm.request({
      jobId: job.id,
      wants: [{ kind: 'shuttle', level: id.level, zone: zoneOfCol(this.cfg, id.col) }],
      priority: job.priority,
      createdAt: this.host.t,
    });
    if (prefetch) this.host.log('PREFETCH', `PREFETCH ${v.id} ← ${v.slotKey}`, { vehicleId: v.id, slotKey: v.slotKey });
    return job;
  }

  createShuffle(v: Vehicle, target: Slot): Job {
    if (!v.slotKey) throw new Error(`${v.id} is not parked`);
    const job = this.newJob('shuffle', v.id, target.key, PRIORITY.shuffle);
    job.fromSlotKey = v.slotKey;
    const from = parseSlotKey(v.slotKey);
    const to = target.id;
    this.host.patchSlot(target.key, { state: 'reserved', vehicleId: v.id });
    this.host.patchSlot(v.slotKey, { calledBy: job.id });
    const wants: Want[] = [{ kind: 'shuttle', level: from.level, zone: zoneOfCol(this.cfg, from.col) }];
    const sameLevel = from.level === to.level && zoneOfCol(this.cfg, from.col) === zoneOfCol(this.cfg, to.col);
    if (!sameLevel) {
      wants.push({ kind: 'shuttle', level: to.level, zone: zoneOfCol(this.cfg, to.col) });
      wants.push(this.liftWant(from.level, from.col));
    }
    this.host.rm.request({ jobId: job.id, wants, priority: job.priority, createdAt: this.host.t });
    return job;
  }

  // ---- grants -------------------------------------------------------------

  onGrant(job: Job, grant: Grant): void {
    const { rm, t } = this.host;
    if (grant.waited >= LOCK_WAIT_LOG_THRESHOLD) {
      const names = grant.resources.map((r) => r.id).join(' + ');
      this.host.log('LOCK WAIT', `LOCK WAIT ${names} · ${grant.waited.toFixed(1)}s (${job.vehicleId})`, { vehicleId: job.vehicleId, seconds: grant.waited });
    }
    const slot = parseSlotKey(job.slotKey);
    switch (job.kind) {
      case 'store': {
        if (job.stage === 'queued') {
          job.resources.bay = grant.resources[0].id;
          this.host.vehicle(job.vehicleId).state = 'in_system';
          this.setStage(job, 'bay', this.timed(this.cfg.timings.dropOff));
        } else if (job.stage === 'lift_wait') {
          const lift = grant.resources.find((r) => r.kind === 'lift');
          const shuttle = grant.resources.find((r) => r.kind === 'shuttle') ?? rm.get(job.resources.shuttle!);
          if (!lift) throw new Error('store grant without a lift');
          job.resources.shuttle = shuttle.id;
          job.resources.lift = lift.id;
          const arrive = rm.moveTo(lift, 0, t);
          rm.moveTo(shuttle, this.shaftOf(lift.id).x, t);
          this.setStageUntil(job, 'lift_wait', arrive);
        }
        return;
      }
      case 'retrieve': {
        if (job.stage === 'queued') {
          const shuttle = grant.resources[0];
          job.resources.shuttle = shuttle.id;
          const arrive = rm.moveTo(shuttle, slotX(this.cfg, slot.col), t);
          this.setStageUntil(job, 'shuttle_wait', arrive);
        } else if (job.stage === 'lift_wait') {
          const lift = grant.resources[0];
          job.resources.lift = lift.id;
          rm.moveTo(lift, slot.level + 1, t);
          const shuttle = rm.get(job.resources.shuttle!);
          const arrive = rm.moveTo(shuttle, this.shaftOf(lift.id).x, t);
          this.setStageUntil(job, 'corridor_out', arrive);
        } else if (job.stage === 'bay_wait') {
          job.resources.bay = grant.resources[0].id;
          this.setStage(job, 'bay_out', this.timed(this.cfg.timings.bayToLift));
        }
        return;
      }
      case 'shuffle': {
        const from = parseSlotKey(job.fromSlotKey!);
        const shuttleA = grant.resources[0];
        job.resources.shuttle = shuttleA.id;
        const lift = grant.resources.find((r) => r.kind === 'lift');
        if (lift) {
          job.resources.lift = lift.id;
          const shuttleB = grant.resources.find((r) => r.kind === 'shuttle' && r.id !== shuttleA.id)!;
          job.resources.shuttle2 = shuttleB.id;
          rm.moveTo(lift, from.level + 1, t);
          rm.moveTo(shuttleB, this.shaftOf(lift.id).x, t);
        }
        const arrive = rm.moveTo(shuttleA, slotX(this.cfg, from.col), t);
        this.shufflePhase.set(job.id, 'a');
        this.setStageUntil(job, 'shuttle_wait', arrive);
        return;
      }
    }
  }

  // ---- stage ends ---------------------------------------------------------

  /** Called when t ≥ job.stageEndsAt. Returns true if the job finished. */
  onStageEnd(job: Job): boolean {
    switch (job.kind) {
      case 'store':
        return this.storeStageEnd(job);
      case 'retrieve':
        return this.retrieveStageEnd(job);
      case 'shuffle':
        return this.shuffleStageEnd(job);
    }
  }

  private storeStageEnd(job: Job): boolean {
    const { rm, t } = this.host;
    const tm = this.cfg.timings;
    const slot = parseSlotKey(job.slotKey);
    switch (job.stage) {
      case 'bay':
        job.callAt = t; // the driver has handed the car over
        this.setStage(job, 'scan', this.timed(tm.scan));
        return false;
      case 'scan':
        this.setStage(job, 'lift_wait', null);
        rm.request({
          jobId: job.id,
          wants: [{ kind: 'shuttle', level: slot.level, zone: zoneOfCol(this.cfg, slot.col) }, this.liftWant(slot.level, slot.col)],
          priority: job.priority,
          createdAt: t,
        });
        return false;
      case 'lift_wait': {
        // lift is at the surface → the car leaves the bay
        rm.release(job.resources.bay!, t);
        delete job.resources.bay;
        this.setStage(job, 'to_lift', this.timed(tm.bayToLift));
        return false;
      }
      case 'to_lift': {
        const lift = rm.get(job.resources.lift!);
        const arrive = rm.moveTo(lift, slot.level + 1, t);
        this.setStageUntil(job, 'lift_move', arrive);
        return false;
      }
      case 'lift_move':
      case 'shuttle_wait': {
        const shuttle = rm.get(job.resources.shuttle!);
        const arrive = rm.arrivalTime(shuttle, t);
        if (arrive > t) {
          this.setStageUntil(job, 'shuttle_wait', arrive);
        } else {
          this.setStage(job, 'handover', this.timed(tm.handover));
        }
        return false;
      }
      case 'handover': {
        rm.release(job.resources.lift!, t);
        delete job.resources.lift;
        const shuttle = rm.get(job.resources.shuttle!);
        const arrive = rm.moveTo(shuttle, slotX(this.cfg, slot.col), t);
        this.setStageUntil(job, 'corridor', arrive);
        return false;
      }
      case 'corridor':
        this.setStage(job, 'insert', this.timed(tm.insert));
        return false;
      case 'insert': {
        const v = this.host.vehicle(job.vehicleId);
        this.host.patchSlot(job.slotKey, { state: 'occupied', vehicleId: v.id, calledBy: null });
        v.slotKey = job.slotKey;
        v.state = 'parked';
        rm.release(job.resources.shuttle!, t);
        delete job.resources.shuttle;
        job.finishedAt = t;
        job.stage = 'done';
        const seconds = t - job.callAt;
        this.host.log('INSERT', `INSERT ${v.id} → ${job.slotKey} · ${seconds.toFixed(1)}s`, { vehicleId: v.id, slotKey: job.slotKey, seconds });
        this.host.onStoreDone(job, seconds);
        return true;
      }
      default:
        throw new Error(`store job ${job.id} in unexpected stage ${job.stage}`);
    }
  }

  private retrieveStageEnd(job: Job): boolean {
    const { rm, t } = this.host;
    const tm = this.cfg.timings;
    const slot = parseSlotKey(job.slotKey);
    switch (job.stage) {
      case 'shuttle_wait':
        this.setStage(job, 'extract', this.timed(tm.extract));
        return false;
      case 'extract': {
        const v = this.host.vehicle(job.vehicleId);
        this.host.patchSlot(job.slotKey, { state: 'free', vehicleId: null, calledBy: null });
        v.slotKey = null;
        v.state = 'in_system';
        this.setStage(job, 'lift_wait', null);
        rm.request({ jobId: job.id, wants: [this.retrieveLiftWant(slot.level, slot.col)], priority: job.priority, createdAt: t });
        return false;
      }
      case 'corridor_out':
      case 'lift_wait': {
        const lift = rm.get(job.resources.lift!);
        const arrive = rm.arrivalTime(lift, t);
        if (arrive > t) {
          this.setStageUntil(job, 'lift_wait', arrive);
        } else {
          this.setStage(job, 'handover', this.timed(tm.handover));
        }
        return false;
      }
      case 'handover': {
        rm.release(job.resources.shuttle!, t);
        delete job.resources.shuttle;
        const lift = rm.get(job.resources.lift!);
        const arrive = rm.moveTo(lift, 0, t);
        this.setStageUntil(job, 'lift_up', arrive);
        return false;
      }
      case 'lift_up':
        this.setStage(job, 'bay_wait', null);
        rm.request({
          jobId: job.id,
          wants: [{ kind: 'bay_out' }],
          priority: job.priority,
          createdAt: t,
          minFreeAfter: job.prefetch ? 1 : 0,
        });
        return false;
      case 'bay_out': {
        rm.release(job.resources.lift!, t);
        delete job.resources.lift;
        const v = this.host.vehicle(job.vehicleId);
        const seconds = Math.max(0, t - job.callAt);
        this.host.log('SELECT', `SELECT ${v.id} ← ${job.slotKey} · ${seconds.toFixed(1)}s`, { vehicleId: v.id, slotKey: job.slotKey, seconds });
        this.host.onRetrieveReady(job, seconds);
        if (t < job.callAt) this.setStageUntil(job, 'ready', job.callAt);
        else this.setStage(job, 'pickup', this.timed(tm.pickup));
        return false;
      }
      case 'ready':
        this.setStage(job, 'pickup', this.timed(tm.pickup));
        return false;
      case 'pickup': {
        rm.release(job.resources.bay!, t);
        delete job.resources.bay;
        job.finishedAt = t;
        job.stage = 'done';
        this.host.onRetrieveDone(job);
        return true;
      }
      default:
        throw new Error(`retrieve job ${job.id} in unexpected stage ${job.stage}`);
    }
  }

  private shuffleStageEnd(job: Job): boolean {
    const { rm, t } = this.host;
    const tm = this.cfg.timings;
    const to = parseSlotKey(job.slotKey);
    const phase = this.shufflePhase.get(job.id) ?? 'a';
    switch (job.stage) {
      case 'shuttle_wait':
        // phase a: shuttle A reached the source column → extract
        // phase lift: shuttle B reached the exchange → second handover
        if (phase === 'lift') this.setStage(job, 'handover', this.timed(tm.handover));
        else this.setStage(job, 'extract', this.timed(tm.extract));
        return false;
      case 'extract': {
        const v = this.host.vehicle(job.vehicleId);
        this.host.patchSlot(job.fromSlotKey!, { state: 'free', vehicleId: null, calledBy: null });
        v.slotKey = null;
        v.state = 'in_system';
        const shuttle = rm.get(job.resources.shuttle!);
        if (job.resources.lift) {
          const arrive = rm.moveTo(shuttle, this.shaftOf(job.resources.lift).x, t);
          this.setStageUntil(job, 'corridor_out', arrive);
        } else {
          const arrive = rm.moveTo(shuttle, slotX(this.cfg, to.col), t);
          this.setStageUntil(job, 'corridor', arrive);
        }
        return false;
      }
      case 'corridor_out':
      case 'lift_wait': {
        const lift = rm.get(job.resources.lift!);
        const arrive = rm.arrivalTime(lift, t);
        if (arrive > t) this.setStageUntil(job, 'lift_wait', arrive);
        else this.setStage(job, 'handover', this.timed(tm.handover));
        return false;
      }
      case 'handover': {
        if (phase === 'a') {
          // shuttle A → lift; A is released, the lift carries the car to the target level
          rm.release(job.resources.shuttle!, t);
          job.resources.shuttle = job.resources.shuttle2;
          delete job.resources.shuttle2;
          this.shufflePhase.set(job.id, 'lift');
          const lift = rm.get(job.resources.lift!);
          const arrive = rm.moveTo(lift, to.level + 1, t);
          this.setStageUntil(job, 'lift_move', arrive);
        } else {
          // lift → shuttle B
          rm.release(job.resources.lift!, t);
          delete job.resources.lift;
          this.shufflePhase.set(job.id, 'b');
          const shuttle = rm.get(job.resources.shuttle!);
          const arrive = rm.moveTo(shuttle, slotX(this.cfg, to.col), t);
          this.setStageUntil(job, 'corridor', arrive);
        }
        return false;
      }
      case 'lift_move': {
        const shuttleB = rm.get(job.resources.shuttle!);
        const arrive = rm.arrivalTime(shuttleB, t);
        if (arrive > t) this.setStageUntil(job, 'shuttle_wait', arrive);
        else this.setStage(job, 'handover', this.timed(tm.handover));
        return false;
      }
      case 'corridor':
        this.setStage(job, 'insert', this.timed(tm.insert));
        return false;
      case 'insert': {
        const v = this.host.vehicle(job.vehicleId);
        this.host.patchSlot(job.slotKey, { state: 'occupied', vehicleId: v.id, calledBy: null });
        v.slotKey = job.slotKey;
        v.state = 'parked';
        rm.release(job.resources.shuttle!, t);
        delete job.resources.shuttle;
        this.shufflePhase.delete(job.id);
        job.finishedAt = t;
        job.stage = 'done';
        this.host.log('SHUFFLE', `SHUFFLE ${v.id} ${job.fromSlotKey} → ${job.slotKey}`, { vehicleId: v.id, slotKey: job.slotKey });
        this.host.onShuffleDone(job);
        return true;
      }
      default:
        throw new Error(`shuffle job ${job.id} in unexpected stage ${job.stage}`);
    }
  }

  // ---- failures -----------------------------------------------------------

  /**
   * A lift went down. Jobs that merely reserved it (car not on it yet) drop the
   * reservation and ask again; jobs physically on it stay frozen.
   */
  onLiftDown(job: Job, liftId: string): void {
    if (job.resources.lift !== liftId) return;
    const { rm, t } = this.host;
    const slot = parseSlotKey(job.kind === 'shuffle' ? job.fromSlotKey! : job.slotKey);
    if (job.kind === 'store' && job.stage === 'lift_wait') {
      rm.release(liftId, t);
      delete job.resources.lift;
      // keep the shuttle (already held, ordering stays shuttle < lift)
      this.setStage(job, 'lift_wait', null);
      rm.request({ jobId: job.id, wants: [this.liftWant(slot.level, slot.col)], priority: job.priority, createdAt: t });
      return;
    }
    if (job.kind === 'retrieve' && (job.stage === 'corridor_out' || job.stage === 'lift_wait')) {
      rm.release(liftId, t);
      delete job.resources.lift;
      this.setStage(job, 'lift_wait', null);
      rm.request({ jobId: job.id, wants: [this.liftWant(slot.level, slot.col)], priority: job.priority, createdAt: t });
    }
  }

  /** Shafts a job's zone can use (for the engine's degraded checks). */
  shaftsForSlot(key: string): number[] {
    const id = parseSlotKey(key);
    return zoneShafts(this.cfg, zoneOfCol(this.cfg, id.col)).map((s) => s.index);
  }
}
