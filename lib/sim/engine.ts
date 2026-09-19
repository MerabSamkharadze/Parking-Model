// Simulation engine — SPEC §4. Pure TypeScript: no React, no three.js, no
// window, no Math.random. Fixed 100 ms ticks; `step()` advances one tick.

import { corridorDistance, hotLevels, layout, parseSlotKey, slotCount, slotIndex, slotKey, slotX, zoneOfCol, zoneShafts } from '../geometry.ts';
import { liftTravelTime, shuttleTravelTime } from './kinematics.ts';
import { ALLOCATORS, nearestCost, type AllocContext } from './allocator.ts';
import { DemandGenerator, scaledResidents } from './demand.ts';
import { assertInvariants } from './invariants.ts';
import { JobMachine, type JobHost } from './jobs.ts';
import { emptyPercentiles, RingStats, RollingRate, THROUGHPUT_WINDOW } from './metrics.ts';
import { mulberry32, type Rng } from './prng.ts';
import { ResourceManager, type Grant } from './resources.ts';
import type {
  AllocatorName,
  DemandProfile,
  EventKind,
  FacilityConfig,
  FailureState,
  Job,
  JobStage,
  Metrics,
  SimEvent,
  SimSnapshot,
  Slot,
  SlotClass,
  Vehicle,
} from './types.ts';

export const TICK = 0.1; // s of sim time per step
export const DAY = 24 * 3600;
const EVENT_LOG_SIZE = 200;
const DEFRAG_HOUR = 3;
const DEFRAG_MAX_MOVES = 30;
const DEFRAG_UTIL_LIMIT = 0.2;
const QUEUE_SAMPLE_TICKS = 10;
/** Idle shuttles wait at the next expected departure on their level if it is this close. */
const SHUTTLE_ANTICIPATE_SECONDS = 20 * 60;
const SHUTTLE_REST_REFRESH_TICKS = 100; // rest targets are recomputed every 10 s of sim time

const IN_TRANSIT: ReadonlySet<JobStage> = new Set<JobStage>([
  'to_lift',
  'lift_move',
  'shuttle_wait',
  'handover',
  'corridor',
  'insert',
  'extract',
  'corridor_out',
  'lift_up',
  'bay_wait',
  'bay_out',
]);

export interface EngineOptions {
  config: FacilityConfig;
  demand: DemandProfile;
  seed: number;
  /** Run the §4.2 invariant checks every tick (slower). */
  devChecks?: boolean;
}

interface Scheduled {
  at: number;
  vehicleId: string;
}

/** Pre-fetch safety margin on top of the expected retrieve duration (E13). */
const PREFETCH_MARGIN = 1.15;
const PREFETCH_MARGIN_SECONDS = 12;
const PREFETCH_RETRY_SECONDS = 5;

function insertSorted(list: Scheduled[], item: Scheduled): void {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].at <= item.at) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, item);
}

export class Engine {
  readonly cfg: FacilityConfig;
  readonly demandProfile: DemandProfile;
  readonly seed: number;
  readonly warnings: string[];

  tick = 0;
  t = 0;

  private slots: Slot[];
  private readonly slotByKey = new Map<string, number>();
  private readonly vehicles = new Map<string, Vehicle>();
  private readonly jobs = new Map<string, Job>();
  private readonly rm: ResourceManager;
  private readonly rng: Rng;
  private readonly demand: DemandGenerator;
  private readonly machine: JobMachine;
  private readonly devChecks: boolean;

  private allocator: AllocatorName;
  private prefetchLeadMinutes: number;
  private nightDefrag: boolean;

  private readonly departures: Scheduled[] = []; // planned retrieve creation times
  private readonly returns: Scheduled[] = []; // residents coming back

  private nextTicket = 1;
  private events: SimEvent[] = [];
  private eventSeq = 0;
  private eventsDirty = true;
  private eventsView: SimEvent[] = [];
  private slotsVersion = 0;

  private readonly storeStats = new RingStats();
  private readonly retrieveStats = new RingStats();
  private readonly liftCycleStats = new RingStats();
  private readonly throughput = new RollingRate(THROUGHPUT_WINDOW);
  private rejected = 0;
  private completedStore = 0;
  private completedRetrieve = 0;
  private completedShuffle = 0;
  private queueIn = 0;
  private queueOut = 0;
  private queueInMax = 0;
  private queueOutMax = 0;

  private power = false;
  private spareUsed = false;
  private spareDueAt: number | null = null;
  private spareTarget: string | null = null;
  private lastDefragDay = -1;
  private liftCycleCount = 0;
  private shuttleRestCache = new Map<string, number>();
  private shuttleRestTick = -1;

  constructor(opts: EngineOptions) {
    this.cfg = opts.config;
    this.demandProfile = opts.demand;
    this.seed = opts.seed;
    this.devChecks = opts.devChecks ?? false;
    this.rng = mulberry32(opts.seed);
    this.rm = new ResourceManager(this.cfg);
    this.warnings = [...layout(this.cfg).warnings];
    this.demand = new DemandGenerator(this.demandProfile, this.cfg, this.rng.fork());
    this.allocator = this.cfg.allocator;
    this.prefetchLeadMinutes = this.cfg.prefetchLeadMinutes;
    this.nightDefrag = this.cfg.nightDefrag;
    this.slots = this.buildSlots();
    this.slots.forEach((s, i) => this.slotByKey.set(s.key, i));
    this.machine = new JobMachine(this.host());
    this.seedResidents();
  }

  // ---- setup --------------------------------------------------------------

  private buildSlots(): Slot[] {
    const cfg = this.cfg;
    const hot = hotLevels(cfg);
    const perLevel = 2 * cfg.cols;
    const evPerLevel = Math.round(cfg.slotMix.ev * perLevel);
    const oversizePerLevel = Math.round(cfg.slotMix.oversize * perLevel);
    const slots: Slot[] = new Array(slotCount(cfg));
    for (let level = 0; level < cfg.levels; level++) {
      // EV slots at the columns nearest the west shaft, oversize at the far end (E10)
      const order: Array<{ row: 0 | 1; col: number }> = [];
      for (let col = 0; col < cfg.cols; col++) for (const row of [0, 1] as const) order.push({ row, col });
      const cls = new Map<string, SlotClass>();
      for (let i = 0; i < evPerLevel && i < order.length; i++) cls.set(`${order[i].row}:${order[i].col}`, 'ev');
      for (let i = 0; i < oversizePerLevel && i < order.length; i++) {
        const o = order[order.length - 1 - i];
        cls.set(`${o.row}:${o.col}`, 'oversize');
      }
      for (const row of [0, 1] as const) {
        for (let col = 0; col < cfg.cols; col++) {
          const id = { level, row, col };
          const key = slotKey(id);
          slots[slotIndex(cfg, id)] = {
            id,
            key,
            cls: cls.get(`${row}:${col}`) ?? 'standard',
            zone: level < hot ? 'hot' : 'cold',
            state: 'free',
            vehicleId: null,
            calledBy: null,
          };
        }
      }
    }
    return slots;
  }

  private seedResidents(): void {
    const n = scaledResidents(this.demandProfile, this.cfg);
    let placed = 0;
    for (let attempt = 0; placed < n && attempt < n * 2; attempt++) {
      const v = this.demand.makeVehicle(this.ticket(), 'resident', 0);
      v.habitualDeparture = this.demand.habitualDeparture();
      const slot = this.allocate(v);
      if (!slot) continue; // e.g. no EV slot left for an EV resident
      placed++;
      this.vehicles.set(v.id, v);
      this.slots[this.slotByKey.get(slot.key)!] = { ...slot, state: 'occupied', vehicleId: v.id };
      v.slotKey = slot.key;
      v.state = 'parked';
      v.arrivedAt = -this.rng.uniform(3600, 6 * 3600);
      this.scheduleResidentDeparture(v);
    }
  }

  private ticket(): string {
    return `#${String(this.nextTicket++).padStart(4, '0')}`;
  }

  // ---- host interface for the job machine ---------------------------------

  private host(): JobHost {
    return new EngineHost(this);
  }

  /** @internal accessors used by EngineHost */
  _hostSlot(key: string): Slot {
    return this.getSlot(key);
  }
  _hostPatchSlot(key: string, patch: Partial<Slot>): void {
    this.patchSlot(key, patch);
  }
  _hostVehicle(id: string): Vehicle {
    return this.getVehicle(id);
  }
  _hostLog(kind: EventKind, text: string, extra?: { vehicleId?: string; slotKey?: string; seconds?: number }): void {
    this.log(kind, text, extra);
  }
  _hostStoreDone(job: Job, seconds: number): void {
    this.onStoreDone(job, seconds);
  }
  _hostRetrieveReady(job: Job, seconds: number): void {
    this.onRetrieveReady(job, seconds);
  }
  _hostRetrieveDone(job: Job): void {
    this.onRetrieveDone(job);
  }
  _hostShuffleDone(): void {
    this.completedShuffle++;
  }
  get rngStream(): Rng {
    return this.rng;
  }
  get rm_(): ResourceManager {
    return this.rm;
  }

  private getSlot(key: string): Slot {
    const i = this.slotByKey.get(key);
    if (i === undefined) throw new Error(`unknown slot ${key}`);
    return this.slots[i];
  }

  private patchSlot(key: string, patch: Partial<Slot>): void {
    const i = this.slotByKey.get(key);
    if (i === undefined) throw new Error(`unknown slot ${key}`);
    this.slots[i] = { ...this.slots[i], ...patch };
    this.slotsVersion++;
  }

  private getVehicle(id: string): Vehicle {
    const v = this.vehicles.get(id);
    if (!v) throw new Error(`unknown vehicle ${id}`);
    return v;
  }

  private log(kind: EventKind, text: string, extra?: { vehicleId?: string; slotKey?: string; seconds?: number }): void {
    const ev: SimEvent = { seq: this.eventSeq++, t: this.t, kind, text, ...extra };
    this.events.push(ev);
    if (this.events.length > EVENT_LOG_SIZE * 2) this.events = this.events.slice(-EVENT_LOG_SIZE);
    this.eventsDirty = true;
  }

  // ---- demand hooks -------------------------------------------------------

  private onStoreDone(job: Job, seconds: number): void {
    this.storeStats.push(seconds);
    this.completedStore++;
    this.throughput.push(this.t);
    const v = this.getVehicle(job.vehicleId);
    if (v.tenant === 'resident') this.scheduleResidentDeparture(v);
    else this.scheduleDeparture(v, v.arrivedAt + v.dwellTarget);
  }

  private onRetrieveReady(job: Job, seconds: number): void {
    this.retrieveStats.push(seconds);
  }

  private onRetrieveDone(job: Job): void {
    this.completedRetrieve++;
    this.throughput.push(this.t);
    const v = this.getVehicle(job.vehicleId);
    v.state = 'gone';
    v.slotKey = null;
    if (v.tenant === 'resident') {
      insertSorted(this.returns, { at: this.demand.residentReturnAt(this.t), vehicleId: v.id });
    } else {
      this.vehicles.delete(v.id);
    }
  }

  private scheduleResidentDeparture(v: Vehicle): void {
    const dayStart = Math.floor(this.t / DAY) * DAY;
    let day = dayStart;
    // first day on which the resident leaves, at its habitual time (after now)
    for (let i = 0; i < 14; i++) {
      const at = day + (v.habitualDeparture ?? 8 * 3600) + this.demand.departureJitter();
      if (at > this.t + 600 && this.demand.residentLeavesToday()) {
        v.plannedDeparture = at;
        v.dwellTarget = at - this.t;
        this.scheduleDeparture(v, at);
        return;
      }
      day += DAY;
    }
    v.plannedDeparture = null;
  }

  private scheduleDeparture(v: Vehicle, plannedAt: number): void {
    v.plannedDeparture = plannedAt;
    const lead = this.prefetchLeadMinutes * 60;
    insertSorted(this.departures, { at: Math.max(this.t, plannedAt - lead), vehicleId: v.id });
  }

  private allocate(v: Vehicle): Slot | null {
    const blocked = new Set<number>();
    for (const r of this.rm.resources) if (r.kind === 'shuttle' && r.down && r.level !== undefined) blocked.add(r.level);
    const ctx: AllocContext = {
      cfg: this.cfg,
      blockedLevels: blocked,
      shuttleLoad: (level) => {
        let load = 0;
        for (const r of this.rm.resources) {
          if (r.kind !== 'shuttle' || r.level !== level) continue;
          if (r.busyWith) load++;
          load += this.rm.pendingForShuttle(level, r.zone ?? 0);
        }
        return load;
      },
    };
    return ALLOCATORS[this.allocator](this.slots, v, ctx);
  }

  /** A vehicle arrives at the gate: allocate, or reject. */
  private arrive(v: Vehicle): Job | null {
    v.arrivedAt = this.t;
    v.state = 'arriving';
    if (v.tenant === 'visitor') v.dwellTarget = this.demand.visitorDwellSeconds();
    const slot = this.allocate(v);
    if (!slot) {
      this.rejected++;
      const reason = v.cls === 'standard' ? 'full' : v.cls;
      this.log('REJECT', `REJECT ${v.id} ${reason}`, { vehicleId: v.id });
      v.state = 'rejected';
      this.vehicles.delete(v.id);
      return null;
    }
    this.vehicles.set(v.id, v);
    const job = this.machine.createStore(v, slot);
    this.jobs.set(job.id, job);
    return job;
  }

  private callVehicleAt(v: Vehicle, callAt: number, prefetch: boolean): Job | null {
    if (v.state !== 'parked' || !v.slotKey) return null;
    if (this.getSlot(v.slotKey).calledBy) return null;
    const job = this.machine.createRetrieve(v, callAt, prefetch);
    this.jobs.set(job.id, job);
    return job;
  }

  // ---- public commands ----------------------------------------------------

  /** Manual "+ car": a visitor arrives now. */
  addVehicle(tenant: 'visitor' | 'resident' = 'visitor'): Job | null {
    const v = this.demand.makeVehicle(this.ticket(), tenant, this.t);
    if (tenant === 'resident') v.habitualDeparture = this.demand.habitualDeparture();
    return this.arrive(v);
  }

  /** Manual "− retrieve": call a parked vehicle now (default: the earliest planned departure). */
  callVehicle(vehicleId?: string): Job | null {
    let v: Vehicle | undefined;
    if (vehicleId) v = this.vehicles.get(vehicleId);
    else {
      let best = Infinity;
      for (const c of this.vehicles.values()) {
        if (c.state !== 'parked' || !c.slotKey || this.getSlot(c.slotKey).calledBy) continue;
        const at = c.plannedDeparture ?? Infinity;
        if (at < best) {
          best = at;
          v = c;
        }
      }
    }
    if (!v) return null;
    const job = this.callVehicleAt(v, this.t, false);
    // the car is leaving now: drop its scheduled departure — but only when the call
    // took (a car mid-shuffle or already called keeps its plan, else it is stranded)
    if (job) {
      const i = this.departures.findIndex((d) => d.vehicleId === v!.id);
      if (i >= 0) this.departures.splice(i, 1);
    }
    return job;
  }

  setAllocator(name: AllocatorName): void {
    this.allocator = name;
  }

  setPrefetchLead(minutes: number): void {
    this.prefetchLeadMinutes = Math.max(0, minutes);
    // re-time scheduled departures with the new lead
    const items = this.departures.splice(0);
    for (const d of items) {
      const v = this.vehicles.get(d.vehicleId);
      if (v && v.plannedDeparture !== null) this.scheduleDeparture(v, v.plannedDeparture);
    }
  }

  setNightDefrag(on: boolean): void {
    this.nightDefrag = on;
  }

  getStrategy(): { allocator: AllocatorName; prefetchLeadMinutes: number; nightDefrag: boolean } {
    return { allocator: this.allocator, prefetchLeadMinutes: this.prefetchLeadMinutes, nightDefrag: this.nightDefrag };
  }

  /** Experimental: retrieve lift policy (see DECISIONS E1). */
  setRetrieveLiftPolicy(p: 'any' | 'nearest'): void {
    this.machine.retrieveLiftPolicy = p;
  }

  /** Failure injection — SPEC §4.5. */
  setFailure(kind: 'lift' | 'shuttle' | 'power', id: string | null, down: boolean): void {
    if (kind === 'power') {
      if (this.power === down) return;
      this.power = down;
      this.log(down ? 'FAIL' : 'RECOVER', down ? 'FAIL power' : 'RECOVER power');
      return;
    }
    if (!id) return;
    const r = this.rm.resources.find((x) => x.id === id);
    if (!r || r.down === down) return;
    r.down = down;
    this.log(down ? 'FAIL' : 'RECOVER', `${down ? 'FAIL' : 'RECOVER'} ${id}`);
    if (down) {
      if (kind === 'lift') {
        for (const job of this.jobs.values()) this.machine.onLiftDown(job, id);
      } else if (this.cfg.spareShuttle && !this.spareUsed && this.spareDueAt === null) {
        this.spareDueAt = this.t + this.cfg.spareSwapMinutes * 60;
        this.spareTarget = id;
      }
    } else if (this.spareTarget === id) {
      this.spareDueAt = null;
      this.spareTarget = null;
    }
    this.rm.dirty = true;
  }

  recoverAll(): void {
    this.setFailure('power', null, false);
    for (const r of this.rm.resources) {
      if (r.down) this.setFailure(r.kind === 'lift' ? 'lift' : 'shuttle', r.id, false);
    }
  }

  get failures(): FailureState {
    return {
      lifts: this.rm.resources.filter((r) => r.kind === 'lift' && r.down).map((r) => r.id),
      shuttles: this.rm.resources.filter((r) => r.kind === 'shuttle' && r.down).map((r) => r.id),
      power: this.power,
      spareUsed: this.spareUsed,
    };
  }

  // ---- loop ---------------------------------------------------------------

  /** Advance one tick (100 ms of sim time). */
  step(): void {
    this.tick++;
    this.t = this.tick * TICK;
    const t = this.t;
    const dt = TICK;

    this.spawnDemand(t, dt);

    if (this.power) {
      for (const job of this.jobs.values()) this.freeze(job, dt);
      for (const r of this.rm.resources) if (!r.busyWith) this.rm.shiftMove(r, dt, t);
    } else {
      this.spareCheck();
      this.advanceJobs();
      this.positionIdle(t);
      this.maybeDefrag();
    }

    this.rm.account(t, dt);
    if (this.tick % QUEUE_SAMPLE_TICKS === 0) this.sampleQueues();
    if (this.devChecks) assertInvariants(this.cfg, t, this.slots, this.vehicles, this.jobs, this.rm);
  }

  /** Run `seconds` of sim time. */
  run(seconds: number): void {
    const ticks = Math.round(seconds / TICK);
    for (let i = 0; i < ticks; i++) this.step();
  }

  private spawnDemand(t: number, dt: number): void {
    const sod = t % DAY;
    const n = this.demand.arrivalsThisTick(sod, dt);
    for (let i = 0; i < n; i++) this.arrive(this.demand.makeVehicle(this.ticket(), 'visitor', t));
    while (this.returns.length && this.returns[0].at <= t) {
      const r = this.returns.shift()!;
      const v = this.vehicles.get(r.vehicleId);
      if (v && v.state === 'gone') this.arrive(v);
    }
    while (this.departures.length && this.departures[0].at <= t) {
      const d = this.departures.shift()!;
      const v = this.vehicles.get(d.vehicleId);
      if (!v || v.plannedDeparture === null || v.state !== 'parked' || !v.slotKey) continue;
      const planned = v.plannedDeparture;
      if (t >= planned - 1) {
        this.callVehicleAt(v, planned, false);
        continue;
      }
      // Pre-fetch (E13): the app signal arrived early; start just in time so the
      // car reaches the bay shortly before the driver, and never take the last bay.
      const startAt = planned - this.expectedRetrieveSeconds(v.slotKey);
      if (startAt > t) {
        insertSorted(this.departures, { at: Math.min(startAt, planned), vehicleId: v.id });
        continue;
      }
      if (this.prefetchAdmissible()) this.callVehicleAt(v, planned, true);
      else insertSorted(this.departures, { at: Math.min(t + PREFETCH_RETRY_SECONDS, planned), vehicleId: v.id });
    }
  }

  /** Nominal retrieve duration for a slot (no waiting), with margin. */
  private expectedRetrieveSeconds(slotKey: string): number {
    const id = parseSlotKey(slotKey);
    const tm = this.cfg.timings;
    const zone = zoneOfCol(this.cfg, id.col);
    let corridor = Infinity;
    for (const sh of zoneShafts(this.cfg, zone)) corridor = Math.min(corridor, corridorDistance(this.cfg, sh.index, id.col));
    if (!Number.isFinite(corridor)) corridor = 0;
    const approach = shuttleTravelTime(tm, slotX(this.cfg, id.col) - this.rm.zoneCentre(zone)); // shuttle rests at the zone centre
    const nominal = approach + tm.extract + shuttleTravelTime(tm, corridor) + tm.handover + liftTravelTime(tm, 0, id.level + 1) + tm.bayToLift;
    return nominal * PREFETCH_MARGIN + PREFETCH_MARGIN_SECONDS;
  }

  /** At most baysOut − 1 pre-fetched cars may be in flight or waiting in bays. */
  private prefetchAdmissible(): boolean {
    let inFlight = 0;
    for (const job of this.jobs.values()) if (job.kind === 'retrieve' && job.prefetch && job.stage !== 'pickup') inFlight++;
    return inFlight < this.cfg.baysOut - 1;
  }

  private freeze(job: Job, dt: number): void {
    job.frozen = true;
    job.stageStartedAt += dt;
    if (Number.isFinite(job.stageEndsAt)) job.stageEndsAt += dt;
    const r = job.resources;
    if (r.bay) this.rm.shiftMove(this.rm.get(r.bay), dt, this.t);
    if (r.lift) this.rm.shiftMove(this.rm.get(r.lift), dt, this.t);
    if (r.shuttle) this.rm.shiftMove(this.rm.get(r.shuttle), dt, this.t);
    if (r.shuttle2) this.rm.shiftMove(this.rm.get(r.shuttle2), dt, this.t);
  }

  private isFrozen(job: Job): boolean {
    if (!this.anyDown) return false;
    const r = job.resources;
    return (
      (!!r.bay && this.rm.get(r.bay).down) ||
      (!!r.lift && this.rm.get(r.lift).down) ||
      (!!r.shuttle && this.rm.get(r.shuttle).down) ||
      (!!r.shuttle2 && this.rm.get(r.shuttle2).down)
    );
  }

  private get anyDown(): boolean {
    for (const r of this.rm.resources) if (r.down) return true;
    return false;
  }

  private advanceJobs(): void {
    const t = this.t;
    // 1. stage ends (loop: zero-length stages may chain within a tick)
    for (const job of this.jobs.values()) {
      if (this.isFrozen(job)) {
        this.freeze(job, TICK);
        continue;
      }
      job.frozen = false;
      let guard = 0;
      while (t >= job.stageEndsAt && job.stage !== 'done' && guard++ < 8) {
        if (this.machine.onStageEnd(job)) {
          this.jobs.delete(job.id);
          break;
        }
      }
    }
    // idle resources that are down keep their motion frozen too
    for (const r of this.rm.resources) if (r.down && !r.busyWith) this.rm.shiftMove(r, TICK, t);
    // 2. grants
    let grants: Grant[] = this.rm.process(t);
    let rounds = 0;
    while (grants.length && rounds++ < 4) {
      for (const g of grants) {
        const job = this.jobs.get(g.jobId);
        if (!job) continue;
        this.machine.onGrant(job, g);
        // zero-length waits resolve immediately
        let guard = 0;
        while (t >= job.stageEndsAt && job.stage !== 'done' && guard++ < 8) {
          if (this.machine.onStageEnd(job)) {
            this.jobs.delete(job.id);
            break;
          }
        }
      }
      grants = this.rm.process(t);
    }
    // lift cycles → metric
    for (const r of this.rm.resources) {
      if (r.kind !== 'lift') continue;
      while (r.cycles.length) {
        this.liftCycleStats.push(r.cycles.shift()!);
        this.liftCycleCount++;
      }
    }
  }

  /**
   * Rest targets for idle lifts and shuttles. Shuttles go to the centre of
   * their zone. Lifts go to the surface, except that when more than one lift
   * is idle, the spare ones pre-position toward levels with a retrieve in
   * progress (car not yet at the shaft) that their shaft can serve.
   */
  private positionIdle(t: number): void {
    const pending: Array<{ level: number; zone: number; createdAt: number }> = [];
    for (const job of this.jobs.values()) {
      if (job.kind !== 'retrieve' || job.resources.lift) continue;
      if (job.stage !== 'shuttle_wait' && job.stage !== 'extract') continue;
      const id = parseSlotKey(job.slotKey);
      pending.push({ level: id.level, zone: zoneOfCol(this.cfg, id.col), createdAt: job.createdAt });
    }
    pending.sort((a, b) => a.createdAt - b.createdAt);
    const idleLifts = this.rm.resources
      .filter((r) => r.kind === 'lift' && !r.busyWith && !r.down)
      .sort((a, b) => this.rm.positionOf(a, t) - this.rm.positionOf(b, t) || (a.id < b.id ? -1 : 1));
    const liftTarget = new Map<string, number>();
    const claimed = new Set<number>();
    idleLifts.forEach((r, i) => {
      // the lift nearest the surface stays there for stores
      if (i === 0 || pending.length === 0) {
        liftTarget.set(r.id, 0);
        return;
      }
      const p = pending.find((x) => x.zone === r.zone && !claimed.has(x.level));
      if (p) {
        claimed.add(p.level);
        liftTarget.set(r.id, p.level + 1);
      } else liftTarget.set(r.id, 0);
    });
    this.rm.parkIdle(t, (r) => (r.kind === 'lift' ? (liftTarget.get(r.id) ?? 0) : this.shuttleRest(r.level ?? 0, r.zone ?? 0, t)));
  }

  /**
   * Rest position of an idle shuttle: the column of the parked car on its
   * level/zone with the earliest planned departure, when that departure is
   * near (the system knows dwell targets, SPEC §3/§4.4); otherwise the zone
   * centre. Targets are recomputed every 10 s of sim time.
   */
  private shuttleRest(level: number, zone: number, t: number): number {
    if (this.tick - this.shuttleRestTick >= SHUTTLE_REST_REFRESH_TICKS) {
      this.shuttleRestTick = this.tick;
      const best = new Map<string, Vehicle>();
      for (const v of this.vehicles.values()) {
        if (v.state !== 'parked' || !v.slotKey || v.plannedDeparture === null) continue;
        if (v.plannedDeparture - t > SHUTTLE_ANTICIPATE_SECONDS) continue;
        const id = parseSlotKey(v.slotKey);
        const key = `${id.level}:${zoneOfCol(this.cfg, id.col)}`;
        const cur = best.get(key);
        if (!cur || v.plannedDeparture < cur.plannedDeparture!) best.set(key, v);
      }
      this.shuttleRestCache.clear();
      for (const [key, v] of best) this.shuttleRestCache.set(key, slotX(this.cfg, parseSlotKey(v.slotKey!).col));
    }
    return this.shuttleRestCache.get(`${level}:${zone}`) ?? this.rm.zoneCentre(zone);
  }

  private spareCheck(): void {
    if (this.spareDueAt !== null && this.t >= this.spareDueAt && this.spareTarget) {
      const r = this.rm.get(this.spareTarget);
      this.spareUsed = true;
      this.spareDueAt = null;
      r.down = false;
      this.log('SPARE', `SPARE deployed for ${r.id}`);
      this.spareTarget = null;
      this.rm.dirty = true;
    }
  }

  private sampleQueues(): void {
    let qin = 0;
    let qout = 0;
    for (const job of this.jobs.values()) {
      if (job.kind === 'store' && job.stage === 'queued') qin++;
      else if (job.kind === 'retrieve' && job.callAt <= this.t && job.stage !== 'ready' && job.stage !== 'pickup') qout++;
    }
    this.queueIn = qin;
    this.queueOut = qout;
    if (qin > this.queueInMax) this.queueInMax = qin;
    if (qout > this.queueOutMax) this.queueOutMax = qout;
  }

  // ---- night defrag (E14) -------------------------------------------------

  private maybeDefrag(): void {
    if (!this.nightDefrag) return;
    const day = Math.floor(this.t / DAY);
    const sod = this.t - day * DAY;
    if (day === this.lastDefragDay || sod < DEFRAG_HOUR * 3600 || sod >= DEFRAG_HOUR * 3600 + TICK) return;
    this.lastDefragDay = day;
    const lifts = this.rm.ofKind('lift');
    const util = lifts.reduce((a, r) => a + this.rm.utilization(r, this.t), 0) / Math.max(1, lifts.length);
    if (util >= DEFRAG_UTIL_LIMIT) {
      this.log('DEFRAG', `DEFRAG skipped · lift utilisation ${(util * 100).toFixed(0)}%`);
      return;
    }
    const parked = [...this.vehicles.values()]
      .filter((v) => v.state === 'parked' && v.slotKey && v.plannedDeparture !== null && !this.getSlot(v.slotKey).calledBy)
      .sort((a, b) => a.plannedDeparture! - b.plannedDeparture!);
    let moves = 0;
    for (const v of parked) {
      if (moves >= DEFRAG_MAX_MOVES) break;
      const cur = this.getSlot(v.slotKey!);
      const curCost = nearestCost(this.cfg, cur);
      const zone = zoneOfCol(this.cfg, cur.id.col);
      let best: Slot | null = null;
      let bestCost = curCost - 5; // only worthwhile moves
      for (const s of this.slots) {
        if (s.state !== 'free' || s.cls !== cur.cls || zoneOfCol(this.cfg, s.id.col) !== zone) continue;
        const c = nearestCost(this.cfg, s);
        if (c < bestCost) {
          bestCost = c;
          best = s;
        }
      }
      if (!best) continue;
      const job = this.machine.createShuffle(v, best);
      this.jobs.set(job.id, job);
      moves++;
    }
    this.log('DEFRAG', `DEFRAG start · ${moves} moves`);
  }

  // ---- snapshot -----------------------------------------------------------

  get secondsOfDay(): number {
    return this.t % DAY;
  }

  get day(): number {
    return Math.floor(this.t / DAY);
  }

  metrics(): Metrics {
    const t = this.t;
    let occupied = 0;
    let hotOccupied = 0;
    let hotTotal = 0;
    for (const s of this.slots) {
      if (s.zone === 'hot') hotTotal++;
      if (s.state === 'occupied') {
        occupied++;
        if (s.zone === 'hot') hotOccupied++;
      }
    }
    let inTransit = 0;
    for (const job of this.jobs.values()) if (IN_TRANSIT.has(job.stage)) inTransit++;
    const lifts = this.rm.ofKind('lift');
    const shuttleUtil: number[] = [];
    for (let level = 0; level < this.cfg.levels; level++) {
      let m = 0;
      for (const r of this.rm.resources) if (r.kind === 'shuttle' && r.level === level) m = Math.max(m, this.rm.utilization(r, t));
      shuttleUtil.push(m);
    }
    const meanCycle = this.liftCycleStats.mean();
    return {
      occupancy: this.slots.length ? occupied / this.slots.length : 0,
      inTransit,
      queueIn: this.queueIn,
      queueOut: this.queueOut,
      storeTime: this.storeStats.count ? this.storeStats.percentiles() : emptyPercentiles(),
      retrieveTime: this.retrieveStats.count ? this.retrieveStats.percentiles() : emptyPercentiles(),
      throughputPerHour: this.throughput.perHour(t),
      liftUtilization: lifts.map((r) => this.rm.utilization(r, t)),
      shuttleUtilization: shuttleUtil,
      hotZoneOccupancy: hotTotal ? hotOccupied / hotTotal : 0,
      rejected: this.rejected,
      liftCycle: this.liftCycleStats.count ? this.liftCycleStats.percentiles() : emptyPercentiles(),
      liftCapacityPerHour: meanCycle > 0 ? (lifts.length * 3600) / meanCycle : 0,
      throughputPeak: this.throughput.peakPerHour,
      queueInMax: this.queueInMax,
      queueOutMax: this.queueOutMax,
      completedStore: this.completedStore,
      completedRetrieve: this.completedRetrieve,
      completedShuffle: this.completedShuffle,
      degraded: this.power || this.rm.resources.some((r) => r.down),
    };
  }

  /** Immutable shallow copies for the host — no structuredClone (SPEC §4.1). */
  snapshot(): SimSnapshot {
    const t = this.t;
    const jobs: Job[] = [];
    for (const job of this.jobs.values()) {
      const span = job.stageEndsAt - job.stageStartedAt;
      const progress = !Number.isFinite(span) || span <= 0 ? 0 : Math.min(1, Math.max(0, (t - job.stageStartedAt) / span));
      jobs.push({ ...job, resources: { ...job.resources }, progress });
    }
    const vehicles: Record<string, Vehicle> = {};
    for (const [id, v] of this.vehicles) vehicles[id] = { ...v };
    if (this.eventsDirty) {
      this.eventsView = this.events.slice(-EVENT_LOG_SIZE);
      this.eventsDirty = false;
    }
    return {
      t,
      tick: this.tick,
      day: this.day,
      secondsOfDay: this.secondsOfDay,
      slots: this.slots.slice(),
      slotsVersion: this.slotsVersion,
      vehicles,
      jobs,
      resources: this.rm.snapshot(t),
      metrics: this.metrics(),
      events: this.eventsView,
      failures: this.failures,
      warnings: this.warnings,
    };
  }

  /** Read-only views for tests and tools. */
  get activeJobs(): ReadonlyMap<string, Job> {
    return this.jobs;
  }

  get allVehicles(): ReadonlyMap<string, Vehicle> {
    return this.vehicles;
  }

  get slotList(): readonly Slot[] {
    return this.slots;
  }

  get resourceManager(): ResourceManager {
    return this.rm;
  }

  slotOf(key: string): Slot {
    return this.getSlot(key);
  }

  slotIdOf(key: string) {
    return parseSlotKey(key);
  }
}

/** The job machine's view of the engine (SPEC §4: the machine never sees React or the scene). */
class EngineHost implements JobHost {
  readonly cfg: FacilityConfig;
  readonly rm: ResourceManager;
  readonly rng: Rng;
  private readonly engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    this.cfg = engine.cfg;
    this.rm = engine.rm_;
    this.rng = engine.rngStream;
  }

  get t(): number {
    return this.engine.t;
  }
  slot(key: string): Slot {
    return this.engine._hostSlot(key);
  }
  patchSlot(key: string, patch: Partial<Slot>): void {
    this.engine._hostPatchSlot(key, patch);
  }
  vehicle(id: string): Vehicle {
    return this.engine._hostVehicle(id);
  }
  log(kind: EventKind, text: string, extra?: { vehicleId?: string; slotKey?: string; seconds?: number }): void {
    this.engine._hostLog(kind, text, extra);
  }
  onStoreDone(job: Job, seconds: number): void {
    this.engine._hostStoreDone(job, seconds);
  }
  onRetrieveReady(job: Job, seconds: number): void {
    this.engine._hostRetrieveReady(job, seconds);
  }
  onRetrieveDone(job: Job): void {
    this.engine._hostRetrieveDone(job);
  }
  onShuffleDone(): void {
    this.engine._hostShuffleDone();
  }
}
