// Built-in facility presets — SPEC §2 (numbers) and §5 (A–D).
// The §2 numbers below are never changed without the user's approval (CLAUDE.md).

import type { FacilityConfig, Timings } from './sim/types.ts';

export const DEFAULT_TIMINGS: Timings = {
  dropOff: 35,
  scan: 8,
  bayToLift: 14,
  liftPerLevel: 2.2,
  liftAlign: 3,
  handover: 6,
  shuttleSpeed: 1.6,
  shuttleAccel: 0.8,
  insert: 11,
  extract: 11,
  pickup: 45,
  jitter: 0.12,
};

const BASE: Omit<FacilityConfig, 'id' | 'label' | 'note'> = {
  levels: 6,
  rows: 2,
  cols: 12,
  levelHeight: 1.9,
  pitch: 2.6,
  slotDepth: 5.2,
  corridorWidth: 3.6,
  lifts: 2,
  baysIn: 3,
  baysOut: 3,
  shuttlesPerLevel: 1,
  spareShuttle: true,
  spareSwapMinutes: 15,
  slotMix: { ev: 0.1, oversize: 0.04 },
  timings: DEFAULT_TIMINGS,
  allocator: 'zoned',
  prefetchLeadMinutes: 0,
  nightDefrag: false,
};

export const PRESETS: Record<'A' | 'B' | 'C' | 'D', FacilityConfig> = {
  A: {
    ...BASE,
    id: 'A',
    label: 'Minimal',
    note: 'Shows where a single lift jams.',
    levels: 4,
    lifts: 1,
    baysIn: 1,
    baysOut: 1,
    spareShuttle: false,
  },
  B: {
    ...BASE,
    id: 'B',
    label: 'Recommended',
    note: 'Reference facility: 144 slots, 2 lifts, 3 + 3 bays, zoned allocation.',
  },
  C: {
    ...BASE,
    id: 'C',
    label: 'High throughput',
    note: 'Shows where the bottleneck moves to the shuttles.',
    levels: 8,
    cols: 20,
    lifts: 4,
    baysIn: 6,
    baysOut: 6,
    shuttlesPerLevel: 2,
  },
  D: {
    ...BASE,
    id: 'D',
    label: 'Bays are cheap',
    note: 'B with 10 input / 10 output bays: bays absorb the queue, they do not add throughput.',
    baysIn: 10,
    baysOut: 10,
  },
};

export const PRESET_IDS = ['A', 'B', 'C', 'D'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export function presetById(id: string): FacilityConfig | undefined {
  return (PRESETS as Record<string, FacilityConfig>)[id];
}

/** Fields a user can edit in the panel (SPEC §8.3 / §8.4). */
export type ConfigPatch = Partial<Pick<FacilityConfig, 'levels' | 'cols' | 'lifts' | 'baysIn' | 'baysOut' | 'shuttlesPerLevel' | 'slotMix' | 'allocator' | 'prefetchLeadMinutes' | 'nightDefrag'>>;

/**
 * SPEC §5: any manual change creates a `custom` version derived from the
 * preset it started from. Editing a custom version keeps its origin.
 */
export function deriveConfig(base: FacilityConfig, patch: ConfigPatch): FacilityConfig {
  const origin = base.derivedFrom ?? base.id;
  return {
    ...base,
    ...patch,
    slotMix: patch.slotMix ? { ...base.slotMix, ...patch.slotMix } : base.slotMix,
    id: 'custom',
    label: 'Custom',
    note: `Derived from ${origin}.`,
    derivedFrom: origin,
  };
}

export function isCustom(cfg: FacilityConfig): boolean {
  return cfg.derivedFrom !== undefined;
}

/** "B · Recommended" / "Custom · from B" for the header and the version list. */
export function versionLabel(cfg: FacilityConfig): string {
  return cfg.derivedFrom ? `Custom · from ${cfg.derivedFrom}` : `${cfg.id} · ${cfg.label}`;
}

/** Edit limits for the facility form: what the layout and the engine support. */
export const CONFIG_LIMITS = {
  levels: { min: 2, max: 10 },
  cols: { min: 6, max: 24 },
  lifts: { min: 1, max: 4 },
  baysIn: { min: 1, max: 10 },
  baysOut: { min: 1, max: 10 },
  shuttlesPerLevel: { min: 1, max: 2 },
  ev: { min: 0, max: 0.4 },
  oversize: { min: 0, max: 0.2 },
} as const;
