// Simulation store — SPEC §1: `useSimStore` holds the engine snapshot the
// scene and panel render from. M2: a static snapshot; M3 adds the loop.

import { create } from 'zustand';
import { PRESETS } from '@/lib/presets';
import { PROFILES } from '@/lib/sim/demand';
import { Engine } from '@/lib/sim/engine';
import type { DemandProfile, FacilityConfig, SimSnapshot } from '@/lib/sim/types';

interface SimState {
  config: FacilityConfig;
  demand: DemandProfile;
  seed: number;
  engine: Engine | null;
  snapshot: SimSnapshot | null;
  /** Create the engine for the current config/demand/seed and publish its first snapshot. */
  init: () => void;
  setSnapshot: (s: SimSnapshot) => void;
}

export const useSimStore = create<SimState>((set, get) => ({
  config: PRESETS.B,
  demand: PROFILES.weekday,
  seed: 42,
  engine: null,
  snapshot: null,
  init: () => {
    const { config, demand, seed } = get();
    const engine = new Engine({ config, demand, seed, devChecks: process.env.NODE_ENV !== 'production' });
    set({ engine, snapshot: engine.snapshot() });
  },
  setSnapshot: (snapshot) => set({ snapshot }),
}));
