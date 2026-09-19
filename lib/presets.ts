// Built-in facility presets — SPEC §2 (numbers) and §5 (A–D).
// The §2 numbers below are never changed without the user's approval (CLAUDE.md).

import type { AllocatorName, FacilityConfig, Timings } from './sim/types.ts';

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
  // own properties only: "constructor" or "__proto__" from a share link is not a preset
  return Object.prototype.hasOwnProperty.call(PRESETS, id) ? (PRESETS as Record<string, FacilityConfig>)[id] : undefined;
}

/** Fields a user can edit in the panel (SPEC §8.3 / §8.4). */
export type ConfigPatch = Partial<Pick<FacilityConfig, 'levels' | 'cols' | 'lifts' | 'baysIn' | 'baysOut' | 'shuttlesPerLevel' | 'slotMix' | 'allocator' | 'prefetchLeadMinutes' | 'nightDefrag'>>;

/**
 * SPEC §5: any manual change creates a `custom` version derived from the
 * preset it started from. Editing a custom version keeps its origin.
 */
export function deriveConfig(base: FacilityConfig, patch: ConfigPatch): FacilityConfig {
  const origin = base.derivedFrom ?? base.id;
  return normalizeConfig(
    {
      ...base,
      ...patch,
      slotMix: patch.slotMix ? { ...base.slotMix, ...patch.slotMix } : base.slotMix,
      id: 'custom',
      label: 'Custom',
      note: `Derived from ${origin}.`,
      derivedFrom: origin,
    },
    base,
  );
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
  prefetchLeadMinutes: { min: 0, max: 15 },
} as const;

const TIMING_KEYS: Array<keyof Timings> = ['dropOff', 'scan', 'bayToLift', 'liftPerLevel', 'liftAlign', 'handover', 'shuttleSpeed', 'shuttleAccel', 'insert', 'extract', 'pickup', 'jitter'];
const ALLOCATORS: AllocatorName[] = ['nearest', 'zoned', 'balanced', 'dwell-aware'];

function num(v: unknown, lo: number, hi: number, fallback: number, integer = false): number {
  let n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  if (integer) n = Math.round(n);
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Every field inside what the layout and the engine support. Share links, saved
 * versions and the facility form all pass through here, so a hostile or stale
 * payload can neither crash `layout()` nor build a facility the engine cannot
 * serve: a corridor zone needs a lift of its own (DECISIONS C2/E2), so
 * `shuttlesPerLevel ≤ lifts`, and a lift needs a zone end to sit at, so
 * `lifts ≤ 2 × zones`. Unknown or malformed fields fall back to `fallback`.
 */
export function normalizeConfig(raw: Partial<FacilityConfig> | null | undefined, fallback: FacilityConfig = PRESETS.B): FacilityConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FacilityConfig>;
  const L = CONFIG_LIMITS;
  let lifts = num(r.lifts, L.lifts.min, L.lifts.max, fallback.lifts, true);
  let shuttlesPerLevel = num(r.shuttlesPerLevel, L.shuttlesPerLevel.min, L.shuttlesPerLevel.max, fallback.shuttlesPerLevel, true);
  shuttlesPerLevel = Math.min(shuttlesPerLevel, lifts);
  lifts = Math.min(lifts, 2 * shuttlesPerLevel);
  const rawTimings = (r.timings && typeof r.timings === 'object' ? r.timings : {}) as Partial<Timings>;
  const timings = {} as Timings;
  for (const k of TIMING_KEYS) {
    // a timing is either a plausible number or the preset's: a negative or zero
    // duration is garbage, not "as fast as possible"
    const v = rawTimings[k];
    const ok = typeof v === 'number' && Number.isFinite(v) && (k === 'jitter' ? v >= 0 && v <= 0.5 : v > 0 && v <= 3600);
    timings[k] = ok ? v : fallback.timings[k];
  }
  const mix = (r.slotMix && typeof r.slotMix === 'object' ? r.slotMix : {}) as Partial<FacilityConfig['slotMix']>;
  const derivedFrom = typeof r.derivedFrom === 'string' && presetById(r.derivedFrom) ? r.derivedFrom : undefined;
  return {
    id: typeof r.id === 'string' ? r.id : 'custom',
    label: typeof r.label === 'string' ? r.label : 'Custom',
    note: typeof r.note === 'string' ? r.note : '',
    ...(derivedFrom ? { derivedFrom } : {}),
    levels: num(r.levels, L.levels.min, L.levels.max, fallback.levels, true),
    rows: 2,
    cols: num(r.cols, L.cols.min, L.cols.max, fallback.cols, true),
    levelHeight: num(r.levelHeight, 1.5, 4, fallback.levelHeight),
    pitch: num(r.pitch, 2, 4, fallback.pitch),
    slotDepth: num(r.slotDepth, 4, 8, fallback.slotDepth),
    corridorWidth: num(r.corridorWidth, 2.5, 8, fallback.corridorWidth),
    lifts,
    baysIn: num(r.baysIn, L.baysIn.min, L.baysIn.max, fallback.baysIn, true),
    baysOut: num(r.baysOut, L.baysOut.min, L.baysOut.max, fallback.baysOut, true),
    shuttlesPerLevel,
    spareShuttle: typeof r.spareShuttle === 'boolean' ? r.spareShuttle : fallback.spareShuttle,
    spareSwapMinutes: num(r.spareSwapMinutes, 1, 240, fallback.spareSwapMinutes),
    slotMix: { ev: num(mix.ev, L.ev.min, L.ev.max, fallback.slotMix.ev), oversize: num(mix.oversize, L.oversize.min, L.oversize.max, fallback.slotMix.oversize) },
    timings,
    allocator: ALLOCATORS.includes(r.allocator as AllocatorName) ? (r.allocator as AllocatorName) : fallback.allocator,
    prefetchLeadMinutes: num(r.prefetchLeadMinutes, L.prefetchLeadMinutes.min, L.prefetchLeadMinutes.max, fallback.prefetchLeadMinutes),
    nightDefrag: typeof r.nightDefrag === 'boolean' ? r.nightDefrag : fallback.nightDefrag,
  };
}
