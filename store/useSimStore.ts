// Simulation store — SPEC §1/§4.1: owns the engine, drives it from wall time
// and publishes immutable snapshots the scene and panel render from.
//
// Loop (SPEC §4.1): the host accumulates `dt × speed`, steps whole ticks, at
// most MAX_TICKS_PER_FRAME per frame. Time owed beyond the cap is dropped
// (sim time slips instead of a catch-up burst after a hidden tab — DECISIONS
// S17). Snapshots go to React at 20 Hz; `clock.t` is the sub-tick render time
// the scene interpolates with, mutated in place every frame (no re-render).
// The panel reads at `panelTick` cadence (≤ 2 Hz) and the per-minute
// `history` (sparklines, timeline) so it never re-renders at snapshot rate.

import { create } from 'zustand';
import { COMPARE_HOURS, COMPARE_MAX, COMPARE_MIN, rowOf, type CompareCandidate, type CompareRow } from '@/lib/compare';
import { History } from '@/lib/history';
import { PRESETS, deriveConfig, presetById, type ConfigPatch } from '@/lib/presets';
import { SHARE_PARAM, decodeSetup, deleteVersion, loadVersions, saveVersion, shareUrl, type SavedVersion, type Setup, type StorageLike } from '@/lib/share';
import { slotCount } from '@/lib/geometry';
import { PROFILES, demandScale, profileByName } from '@/lib/sim/demand';
import { Engine, TICK } from '@/lib/sim/engine';
import type { DemandProfile, FacilityConfig, Resource, SimSnapshot } from '@/lib/sim/types';
import type { BenchRequest, BenchResponse } from '@/workers/bench.worker';

export const SPEEDS = [1, 4, 16, 60] as const;
export type Speed = (typeof SPEEDS)[number];
export const MAX_TICKS_PER_FRAME = 40;
export const SNAPSHOT_INTERVAL_MS = 50; // 20 Hz
export const PANEL_INTERVAL_MS = 500; // 2 Hz
/** The PRNG takes a 32-bit seed; the field never holds more than that. */
export const SEED_MAX = 4294967295;

/** An integer seed 0…SEED_MAX; anything unparseable falls back. */
export function clampSeed(n: number, fallback = 42): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(SEED_MAX, Math.max(0, Math.round(n)));
}

/**
 * The largest "residents per 144 slots" value that still changes anything:
 * `scaledResidents` (lib/sim/demand.ts) caps the cars parked at 00:00 at
 * slots − 4, so a higher figure parks the same cars and only misleads.
 */
export function residentsCap(cfg: FacilityConfig): number {
  return Math.max(0, Math.floor((slotCount(cfg) - 4) / demandScale(cfg)));
}

/** An integer residents count 0…residentsCap(cfg); unparseable → fallback. */
export function clampResidents(n: number, cfg: FacilityConfig, fallback = 0): number {
  if (!Number.isFinite(n)) return clampResidents(fallback, cfg, 0);
  return Math.min(residentsCap(cfg), Math.max(0, Math.round(n)));
}

export interface RenderClock {
  /** Sim seconds including the fraction of a tick not yet stepped. */
  t: number;
}

interface SimState {
  config: FacilityConfig;
  demand: DemandProfile;
  seed: number;
  engine: Engine | null;
  /** Increments every time a new engine is created (reset, seed, config). */
  epoch: number;
  snapshot: SimSnapshot | null;
  resourcesById: ReadonlyMap<string, Resource>;
  running: boolean;
  speed: Speed;
  /** Mutable, never replaced: read it inside useFrame. */
  clock: RenderClock;
  /** Mutable per-minute telemetry; `historyVersion` is the change key. */
  history: History;
  historyVersion: number;
  /** Bumps at most every PANEL_INTERVAL_MS while the sim advances (and on every restart). */
  panelTick: number;
  /** Create the engine for the current config/demand/seed and publish its first snapshot. */
  init: () => void;
  reset: () => void;
  setSeed: (seed: number) => void;
  setRunning: (running: boolean) => void;
  toggleRunning: () => void;
  setSpeed: (speed: Speed) => void;
  /** Advance by `dt` wall seconds (called once per rendered frame). */
  advance: (dt: number, nowMs: number) => void;
  setSnapshot: (s: SimSnapshot) => void;
  // --- versions (SPEC §5) ---
  /** Built-in preset → restart with the same seed. */
  setPreset: (id: string) => void;
  /** Facility fields → a custom version, restart. */
  applyFacility: (patch: ConfigPatch) => void;
  /** Strategy fields → applied hot to the running engine, config becomes custom (SPEC §8.4). */
  setStrategy: (patch: Pick<ConfigPatch, 'allocator' | 'prefetchLeadMinutes' | 'nightDefrag'>) => void;
  /** Demand profile / residents → restart. */
  setDemandProfile: (name: DemandProfile['name']) => void;
  setResidents: (residents: number) => void;
  // --- commands (SPEC §8.5) ---
  /** Returns the new vehicle's id (null when the arrival was rejected). */
  addVehicle: (tenant?: 'visitor' | 'resident') => string | null;
  /** Calls a parked car (default: the earliest planned departure); false when nothing could be called. */
  callVehicle: (vehicleId?: string) => boolean;
  // --- failures (SPEC §8.10, §4.5) ---
  setFailure: (kind: 'lift' | 'shuttle' | 'power', id: string | null, down: boolean) => void;
  recoverAll: () => void;
  // --- saved versions, share, compare (SPEC §5, M5) ---
  versions: SavedVersion[];
  /**
   * The saved version the running setup is: set by save / load, cleared by
   * any change to the setup (preset, facility, strategy, demand, seed). The
   * version list marks this row instead of comparing config objects.
   */
  activeVersionId: string | null;
  /** Reads `?v=` and localStorage once, before the first engine (client only). */
  boot: () => void;
  saveCurrent: (label: string) => void;
  deleteSaved: (id: string) => void;
  loadSaved: (id: string) => void;
  /** The share URL for the running setup; also written to the address bar. */
  shareLink: () => string;
  compare: CompareState;
  runCompare: (ids: string[]) => void;
  clearCompare: () => void;
}

export interface CompareState {
  running: boolean;
  rows: CompareRow[];
  elapsedMs: number | null;
  error: string | null;
  /** The day the rows were computed for (null until a run finishes). */
  setup: CompareSetup | null;
}

/** What a compare run was computed with, to tell stale results from current ones. */
export interface CompareSetup {
  demandName: DemandProfile['name'];
  residents: number;
  seed: number;
  /** The running config when the unsaved custom setup was one of the candidates, else null. */
  currentConfig: FacilityConfig | null;
}

const NO_COMPARE: CompareState = { running: false, rows: [], elapsedMs: null, error: null, setup: null };

/**
 * Why a compare table no longer describes the setup on screen — a short note
 * for the badge over the table, or null while the results are current.
 */
export function compareStaleNote(setup: CompareSetup | null, now: { demand: DemandProfile; seed: number; config: FacilityConfig }): string | null {
  if (!setup) return null;
  if (setup.currentConfig && setup.currentConfig !== now.config) return 'results for an earlier custom setup';
  if (setup.demandName !== now.demand.name || setup.residents !== now.demand.residents || setup.seed !== now.seed) {
    return `results for ${setup.demandName} · ${setup.residents} residents · seed ${setup.seed}`;
  }
  return null;
}

function storage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function indexResources(snapshot: SimSnapshot): ReadonlyMap<string, Resource> {
  const m = new Map<string, Resource>();
  for (const r of snapshot.resources) m.set(r.id, r);
  return m;
}

export const useSimStore = create<SimState>((set, get) => {
  // loop internals: not React state
  let owed = 0; // sim seconds accumulated but not yet stepped (< TICK after a frame)
  let lastPublishMs = -Infinity;
  let lastPanelMs = -Infinity;

  const publish = (engine: Engine, nowMs: number) => {
    const snapshot = engine.snapshot();
    lastPublishMs = nowMs;
    const { history } = get();
    history.sample(snapshot);
    const panel = nowMs - lastPanelMs >= PANEL_INTERVAL_MS;
    if (panel) lastPanelMs = nowMs;
    set((s) => ({
      snapshot,
      resourcesById: indexResources(snapshot),
      historyVersion: history.version, // unchanged unless a new minute was sampled
      panelTick: panel ? s.panelTick + 1 : s.panelTick,
    }));
  };

  const create_ = () => {
    const { config, demand, seed, clock, history } = get();
    const engine = new Engine({ config, demand, seed, devChecks: process.env.NODE_ENV !== 'production' });
    owed = 0;
    clock.t = 0;
    history.clear();
    const snapshot = engine.snapshot();
    history.sample(snapshot);
    lastPublishMs = -Infinity;
    lastPanelMs = -Infinity;
    set((s) => ({
      engine,
      epoch: s.epoch + 1,
      snapshot,
      resourcesById: indexResources(snapshot),
      historyVersion: history.version,
      panelTick: s.panelTick + 1,
    }));
  };

  return {
    config: PRESETS.B,
    demand: PROFILES.weekday,
    seed: 42,
    engine: null,
    epoch: 0,
    snapshot: null,
    resourcesById: new Map(),
    running: false,
    speed: 1,
    clock: { t: 0 },
    history: new History(),
    historyVersion: 0,
    panelTick: 0,
    init: create_,
    reset: () => {
      create_();
    },
    setSeed: (seed) => {
      set({ seed: clampSeed(seed), activeVersionId: null });
      create_();
    },
    setRunning: (running) => set({ running }),
    toggleRunning: () => set((s) => ({ running: !s.running })),
    setSpeed: (speed) => set({ speed }),
    advance: (dt, nowMs) => {
      const { engine, running, speed, clock } = get();
      if (!engine || !running) return;
      owed += Math.max(0, dt) * speed;
      let ticks = Math.floor(owed / TICK);
      if (ticks > MAX_TICKS_PER_FRAME) {
        ticks = MAX_TICKS_PER_FRAME;
        owed = 0; // drop the rest: the sim slips rather than bursts
      } else {
        owed -= ticks * TICK;
      }
      for (let i = 0; i < ticks; i++) engine.step();
      clock.t = engine.t + owed;
      if (ticks > 0 && nowMs - lastPublishMs >= SNAPSHOT_INTERVAL_MS) publish(engine, nowMs);
    },
    setSnapshot: (snapshot) => {
      const { history } = get();
      history.sample(snapshot);
      set((s) => ({ snapshot, resourcesById: indexResources(snapshot), historyVersion: history.version, panelTick: s.panelTick + 1 }));
    },
    setPreset: (id) => {
      const preset = presetById(id);
      if (!preset) return;
      set({ config: preset, activeVersionId: null });
      create_();
    },
    applyFacility: (patch) => {
      set((s) => ({ config: deriveConfig(s.config, patch), activeVersionId: null }));
      create_();
    },
    setStrategy: (patch) => {
      const { engine } = get();
      set((s) => ({ config: deriveConfig(s.config, patch), activeVersionId: null }));
      if (!engine) return;
      if (patch.allocator !== undefined) engine.setAllocator(patch.allocator);
      if (patch.prefetchLeadMinutes !== undefined) engine.setPrefetchLead(patch.prefetchLeadMinutes);
      if (patch.nightDefrag !== undefined) engine.setNightDefrag(patch.nightDefrag);
      get().setSnapshot(engine.snapshot());
    },
    setDemandProfile: (name) => {
      set({ demand: profileByName(name), activeVersionId: null });
      create_();
    },
    setResidents: (residents) => {
      set((s) => ({ demand: { ...s.demand, residents: clampResidents(residents, s.config, s.demand.residents) }, activeVersionId: null }));
      create_();
    },
    versions: [],
    activeVersionId: null,
    boot: () => {
      if (typeof window === 'undefined') return;
      const shared = decodeSetup(new URLSearchParams(window.location.search).get(SHARE_PARAM));
      const versions = loadVersions(storage());
      if (shared) {
        set({ config: shared.config, demand: { ...PROFILES[shared.demandName], residents: clampResidents(shared.residents, shared.config) }, seed: shared.seed, versions, activeVersionId: null });
      } else set({ versions });
    },
    saveCurrent: (label) => {
      const { config, demand, seed, versions } = get();
      const setup: Setup = { config, demandName: demand.name, residents: demand.residents, seed };
      const next = saveVersion(storage(), versions, setup, label);
      // newest first: the entry just written is the running setup
      set({ versions: next, activeVersionId: next[0]?.id ?? null });
    },
    deleteSaved: (id) => set((s) => ({ versions: deleteVersion(storage(), s.versions, id), activeVersionId: s.activeVersionId === id ? null : s.activeVersionId })),
    loadSaved: (id) => {
      const v = get().versions.find((x) => x.id === id);
      if (!v) return;
      set({ config: v.config, demand: { ...PROFILES[v.demandName], residents: clampResidents(v.residents, v.config) }, seed: v.seed, activeVersionId: v.id });
      create_();
    },
    shareLink: () => {
      const { config, demand, seed } = get();
      const url = shareUrl({ config, demandName: demand.name, residents: demand.residents, seed }, window.location.href);
      try {
        window.history.replaceState(null, '', url);
      } catch {
        /* sandboxed */
      }
      return url;
    },
    compare: NO_COMPARE,
    runCompare: (ids) => {
      const { config, demand, seed, versions, compare } = get();
      if (compare.running) return;
      const candidates: CompareCandidate[] = [];
      for (const id of ids.slice(0, COMPARE_MAX)) {
        if (id === 'current') candidates.push({ id, label: config.derivedFrom ? `Custom · from ${config.derivedFrom}` : `${config.id} · ${config.label}`, config });
        else if (presetById(id)) candidates.push({ id, label: `${id} · ${presetById(id)!.label}`, config: presetById(id)! });
        else {
          const v = versions.find((x) => x.id === id);
          if (v) candidates.push({ id, label: v.label, config: v.config });
        }
      }
      if (candidates.length < COMPARE_MIN) return;
      set({ compare: { ...NO_COMPARE, running: true } });
      const started = performance.now();
      const setup: CompareSetup = { demandName: demand.name, residents: demand.residents, seed, currentConfig: candidates.some((c) => c.id === 'current') ? config : null };
      const results = new Map<string, CompareRow>();
      const workers: Worker[] = [];
      const finish = (error: string | null) => {
        for (const w of workers) w.terminate();
        const rows = candidates.map((c) => results.get(c.id)).filter((r): r is CompareRow => r !== undefined);
        set({ compare: { running: false, rows, elapsedMs: Math.round(performance.now() - started), error, setup } });
      };
      for (const c of candidates) {
        let worker: Worker;
        try {
          worker = new Worker(new URL('../workers/bench.worker.ts', import.meta.url));
        } catch (e) {
          finish(`workers unavailable: ${String(e)}`);
          return;
        }
        workers.push(worker);
        worker.onmessage = (e: MessageEvent<BenchResponse>) => {
          results.set(e.data.id, rowOf(c, e.data.result));
          if (results.size === candidates.length) finish(null);
        };
        worker.onerror = (e) => finish(e.message || 'worker error');
        const request: BenchRequest = { id: c.id, config: c.config, demandName: demand.name, residents: demand.residents, seed, hours: COMPARE_HOURS };
        worker.postMessage(request);
      }
    },
    clearCompare: () => set({ compare: NO_COMPARE }),
    addVehicle: (tenant = 'visitor') => {
      const { engine } = get();
      if (!engine) return null;
      const job = engine.addVehicle(tenant);
      get().setSnapshot(engine.snapshot());
      return job?.vehicleId ?? null;
    },
    callVehicle: (vehicleId) => {
      const { engine } = get();
      if (!engine) return false;
      const job = engine.callVehicle(vehicleId);
      get().setSnapshot(engine.snapshot());
      return job !== null;
    },
    setFailure: (kind, id, down) => {
      const { engine } = get();
      if (!engine) return;
      engine.setFailure(kind, id, down);
      get().setSnapshot(engine.snapshot());
    },
    recoverAll: () => {
      const { engine } = get();
      if (!engine) return;
      engine.recoverAll();
      get().setSnapshot(engine.snapshot());
    },
  };
});

/** The latest snapshot at panel cadence (≤ 2 Hz while running, plus every command/restart). */
export function usePanelSnapshot(): SimSnapshot | null {
  useSimStore((s) => s.panelTick);
  return useSimStore.getState().snapshot;
}
