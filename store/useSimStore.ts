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
import { History } from '@/lib/history';
import { PRESETS, deriveConfig, presetById, type ConfigPatch } from '@/lib/presets';
import { PROFILES, profileByName } from '@/lib/sim/demand';
import { Engine, TICK } from '@/lib/sim/engine';
import type { DemandProfile, FacilityConfig, Resource, SimSnapshot } from '@/lib/sim/types';

export const SPEEDS = [1, 4, 16, 60] as const;
export type Speed = (typeof SPEEDS)[number];
export const MAX_TICKS_PER_FRAME = 40;
export const SNAPSHOT_INTERVAL_MS = 50; // 20 Hz
export const PANEL_INTERVAL_MS = 500; // 2 Hz

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
  addVehicle: (tenant?: 'visitor' | 'resident') => void;
  callVehicle: (vehicleId?: string) => void;
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
      set({ seed });
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
      set({ config: preset });
      create_();
    },
    applyFacility: (patch) => {
      set((s) => ({ config: deriveConfig(s.config, patch) }));
      create_();
    },
    setStrategy: (patch) => {
      const { engine } = get();
      set((s) => ({ config: deriveConfig(s.config, patch) }));
      if (!engine) return;
      if (patch.allocator !== undefined) engine.setAllocator(patch.allocator);
      if (patch.prefetchLeadMinutes !== undefined) engine.setPrefetchLead(patch.prefetchLeadMinutes);
      if (patch.nightDefrag !== undefined) engine.setNightDefrag(patch.nightDefrag);
      get().setSnapshot(engine.snapshot());
    },
    setDemandProfile: (name) => {
      set({ demand: profileByName(name) });
      create_();
    },
    setResidents: (residents) => {
      set((s) => ({ demand: { ...s.demand, residents: Math.max(0, Math.round(residents)) } }));
      create_();
    },
    addVehicle: (tenant = 'visitor') => {
      const { engine } = get();
      if (!engine) return;
      engine.addVehicle(tenant);
      get().setSnapshot(engine.snapshot());
    },
    callVehicle: (vehicleId) => {
      const { engine } = get();
      if (!engine) return;
      engine.callVehicle(vehicleId);
      get().setSnapshot(engine.snapshot());
    },
  };
});

/** The latest snapshot at panel cadence (≤ 2 Hz while running, plus every command/restart). */
export function usePanelSnapshot(): SimSnapshot | null {
  useSimStore((s) => s.panelTick);
  return useSimStore.getState().snapshot;
}
