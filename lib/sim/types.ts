// Domain model — SPEC §3, extended per DECISIONS.md (E5, E17, E18).
// This file is pure types: no runtime code, no imports.

export type SlotClass = 'standard' | 'ev' | 'oversize';
export type Zone = 'hot' | 'cold';
export type SlotState = 'free' | 'reserved' | 'occupied';

export interface SlotId {
  level: number; // 0-based
  row: 0 | 1;
  col: number; // 0-based
}

export interface Slot {
  id: SlotId;
  key: string; // "L3-R2-07" — 1-based, primary key shown in the UI
  cls: SlotClass;
  zone: Zone;
  state: SlotState;
  vehicleId: string | null;
  /** Retrieve/shuffle currently pulling the car out (UI colour "called"). */
  calledBy: string | null;
}

export type Tenant = 'resident' | 'visitor';
export type VehicleState = 'arriving' | 'in_system' | 'parked' | 'gone' | 'rejected';

export interface VehicleProfile {
  length: number;
  width: number;
  height: number;
  ev: boolean;
}

export interface Vehicle {
  id: string; // ticket: "#1042"
  plate: string;
  profile: VehicleProfile;
  cls: SlotClass; // derived from profile (DECISIONS E10)
  tenant: Tenant; // cold / hot
  slotKey: string | null;
  state: VehicleState;
  arrivedAt: number; // sim seconds (last arrival)
  dwellTarget: number; // planned dwell, sim seconds
  plannedDeparture: number | null; // absolute sim seconds
  /** Residents: seconds-of-day they habitually leave (DECISIONS E7). */
  habitualDeparture: number | null;
}

export type JobKind = 'store' | 'retrieve' | 'shuffle'; // shuffle = night defrag

export type JobStage =
  | 'queued' // waiting for the first resource (bay_in / shuttle)
  | 'bay' // driver drop-off, bay_in held
  | 'scan' // profile scan + gate, bay_in held
  | 'lift_wait' // waiting for a lift (reservation or arrival)
  | 'to_lift' // bay → lift transfer
  | 'lift_move' // lift travelling with the car to the target level
  | 'shuttle_wait' // waiting for the shuttle to be in place
  | 'handover' // lift ↔ shuttle exchange
  | 'corridor' // shuttle carrying the car towards the slot column
  | 'insert' // rotate + push into the slot
  | 'extract' // pull out of the slot
  | 'corridor_out' // shuttle carrying the car towards the shaft
  | 'lift_up' // lift travelling with the car to the surface
  | 'bay_wait' // car on the lift at the surface, waiting for an output bay
  | 'bay_out' // lift → output bay transfer
  | 'ready' // car in the output bay, waiting for the driver (pre-fetch)
  | 'pickup' // driver pick-up, bay_out held
  | 'done';

export interface JobResources {
  bay?: string;
  lift?: string;
  shuttle?: string;
  /** Shuffle across levels: the destination level's shuttle. */
  shuttle2?: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  vehicleId: string;
  slotKey: string; // destination (store/shuffle) or source (retrieve)
  fromSlotKey: string | null; // shuffle source
  stage: JobStage;
  stageStartedAt: number;
  stageEndsAt: number; // Infinity while waiting for a resource
  createdAt: number;
  /** Retrieve: when the driver is (expected) at the bay. Store: hand-over to the system. */
  callAt: number;
  finishedAt: number | null;
  resources: JobResources;
  progress: number; // 0..1 within the current stage (filled in snapshots)
  priority: number; // 0 = highest
  prefetch: boolean;
  frozen: boolean; // a held resource is down / power loss
}

export type ResourceKind = 'bay_in' | 'bay_out' | 'lift' | 'shuttle';

export interface ResourceMove {
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface Resource {
  id: string;
  kind: ResourceKind;
  busyWith: string | null;
  level?: number; // shuttles: 0-based level
  zone?: number; // shuttles: corridor zone; lifts: the zone the shaft faces
  /** Lifts: level number (0 = surface, k = level k). Shuttles: x in metres. */
  pos: number;
  move: ResourceMove | null;
  down: boolean;
}

export interface Timings {
  dropOff: number; // s, driver drop-off (bay occupancy)
  scan: number; // s, profile scan + gate
  bayToLift: number; // s, bay ↔ lift transfer
  liftPerLevel: number; // s per level
  liftAlign: number; // s accel/decel/level align per move
  handover: number; // s, lift ↔ shuttle
  shuttleSpeed: number; // m/s
  shuttleAccel: number; // m/s²
  insert: number; // s
  extract: number; // s
  pickup: number; // s, driver pick-up (bay occupancy)
  jitter: number; // ± fraction applied to every timed stage
}

export type AllocatorName = 'nearest' | 'zoned' | 'balanced' | 'dwell-aware';

export interface FacilityConfig {
  id: string;
  label: string;
  note: string;
  derivedFrom?: string;
  levels: number;
  rows: 2;
  cols: number;
  levelHeight: number;
  pitch: number;
  slotDepth: number;
  corridorWidth: number;
  lifts: number;
  baysIn: number;
  baysOut: number;
  shuttlesPerLevel: number;
  spareShuttle: boolean;
  spareSwapMinutes: number;
  slotMix: { ev: number; oversize: number }; // fractions
  timings: Timings;
  allocator: AllocatorName;
  prefetchLeadMinutes: number; // 0 = off
  nightDefrag: boolean;
}

export interface HourlyDemand {
  h: number; // 0..23
  arrivals: number; // visitor arrivals per hour (Poisson rate)
  departures: number; // weight of residents' habitual departure times in this hour
}

export interface DemandProfile {
  name: 'weekday' | 'saturday' | 'stress';
  residents: number; // cars parked at 00:00 for a 144-slot facility (scaled to the config)
  hourly: HourlyDemand[]; // 24 rows
  visitorDwell: [number, number]; // minutes, uniform
  residentDwell: [number, number]; // minutes away, uniform
  /** Fraction of residents that leave at all on this day. */
  residentLeaveShare: number;
  /** When set, residents return at a uniform time in this seconds-of-day window instead of departure + dwell. */
  residentReturnWindow: [number, number] | null;
  evShare: number;
  oversizeShare: number;
}

export interface Percentiles {
  p50: number;
  p90: number;
  p95: number;
  max: number;
  n: number;
}

export interface Metrics {
  occupancy: number; // 0..1
  inTransit: number;
  queueIn: number;
  queueOut: number;
  storeTime: Percentiles;
  retrieveTime: Percentiles;
  throughputPerHour: number; // rolling 15 sim-min window
  liftUtilization: number[]; // per lift, rolling 15 min
  shuttleUtilization: number[]; // per level (max over the level's zones)
  hotZoneOccupancy: number;
  rejected: number;
  // extras (DECISIONS E17)
  liftCycle: Percentiles; // seconds a lift is held per movement
  liftCapacityPerHour: number; // lifts × 3600 / mean lift cycle
  throughputPeak: number; // best 15-min window so far, per hour
  queueInMax: number;
  queueOutMax: number;
  completedStore: number;
  completedRetrieve: number;
  completedShuffle: number;
  degraded: boolean;
}

export type EventKind =
  | 'INSERT'
  | 'SELECT'
  | 'PREFETCH'
  | 'LOCK WAIT'
  | 'REJECT'
  | 'SHUFFLE'
  | 'DEFRAG'
  | 'FAIL'
  | 'RECOVER'
  | 'SPARE';

export interface SimEvent {
  seq: number;
  t: number;
  kind: EventKind;
  text: string; // "INSERT #1042 → L3-R2-07 · 54.2s"
  vehicleId?: string;
  slotKey?: string;
  seconds?: number;
}

export interface FailureState {
  lifts: string[];
  shuttles: string[];
  power: boolean;
  spareUsed: boolean;
}

export interface SimSnapshot {
  t: number; // sim seconds
  tick: number;
  day: number; // 0-based
  secondsOfDay: number;
  slots: Slot[];
  vehicles: Record<string, Vehicle>;
  jobs: Job[]; // active jobs
  resources: Resource[];
  metrics: Metrics;
  events: SimEvent[]; // last 200
  failures: FailureState;
  warnings: string[];
}
