// Headless benchmark — SPEC §6. Runs the engine at full speed with no
// rendering; used by the CLI (scripts/bench.ts), the compare-mode worker and
// the tests.

import { slotCount } from '../geometry.ts';
import { Engine, TICK } from './engine.ts';
import type { DemandProfile, FacilityConfig, Metrics } from './types.ts';

export interface BenchOptions {
  config: FacilityConfig;
  demand: DemandProfile;
  hours: number;
  seed: number;
  devChecks?: boolean;
  /** Called every `sampleEveryMinutes` sim-minutes with the live metrics. */
  onSample?: (t: number, m: Metrics) => void;
  sampleEveryMinutes?: number;
}

export interface BenchSummary {
  throughputPerHour: number; // completed store + retrieve per hour over the run
  throughputPeak: number; // best 15-min window, per hour
  liftCapacityPerHour: number;
  liftCycleMean: number;
  liftCycleP50: number;
  storeP50: number;
  storeP90: number;
  retrieveP50: number;
  retrieveP95: number;
  liftUtilMean: number; // mean over lifts of cumulative busy share
  shuttleUtilMax: number; // busiest shuttle, cumulative busy share
  queueInMax: number;
  queueOutMax: number;
  rejected: number;
  completedStore: number;
  completedRetrieve: number;
  completedShuffle: number;
  occupancyEnd: number;
}

export interface BenchResult {
  presetId: string;
  demand: string;
  seed: number;
  hours: number;
  slots: number;
  ticks: number;
  elapsedMs: number;
  metrics: Metrics;
  summary: BenchSummary;
}

export function runBench(opts: BenchOptions): BenchResult {
  const engine = new Engine({ config: opts.config, demand: opts.demand, seed: opts.seed, devChecks: opts.devChecks });
  const ticks = Math.round((opts.hours * 3600) / TICK);
  const sampleEvery = Math.round(((opts.sampleEveryMinutes ?? 15) * 60) / TICK);
  const started = Date.now();
  for (let i = 0; i < ticks; i++) {
    engine.step();
    if (opts.onSample && i % sampleEvery === 0) opts.onSample(engine.t, engine.metrics());
  }
  const elapsedMs = Date.now() - started;
  const m = engine.metrics();
  const rm = engine.resourceManager;
  const lifts = rm.ofKind('lift');
  const shuttles = rm.ofKind('shuttle');
  const span = engine.t;
  const liftUtilMean = lifts.length ? lifts.reduce((a, r) => a + r.busySeconds / span, 0) / lifts.length : 0;
  const shuttleUtilMax = shuttles.reduce((a, r) => Math.max(a, r.busySeconds / span), 0);
  const completed = m.completedStore + m.completedRetrieve;
  return {
    presetId: opts.config.id,
    demand: opts.demand.name,
    seed: opts.seed,
    hours: opts.hours,
    slots: slotCount(opts.config),
    ticks,
    elapsedMs,
    metrics: m,
    summary: {
      throughputPerHour: (completed / span) * 3600,
      throughputPeak: m.throughputPeak,
      liftCapacityPerHour: m.liftCapacityPerHour,
      liftCycleMean: m.liftCycle.n ? m.liftCapacityPerHour > 0 ? (lifts.length * 3600) / m.liftCapacityPerHour : 0 : 0,
      liftCycleP50: m.liftCycle.p50,
      storeP50: m.storeTime.p50,
      storeP90: m.storeTime.p90,
      retrieveP50: m.retrieveTime.p50,
      retrieveP95: m.retrieveTime.p95,
      liftUtilMean,
      shuttleUtilMax,
      queueInMax: m.queueInMax,
      queueOutMax: m.queueOutMax,
      rejected: m.rejected,
      completedStore: m.completedStore,
      completedRetrieve: m.completedRetrieve,
      completedShuffle: m.completedShuffle,
      occupancyEnd: m.occupancy,
    },
  };
}

/** Markdown table for a set of results (CLI + README). */
export function benchTable(results: BenchResult[]): string {
  const f1 = (n: number) => n.toFixed(1);
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const head = [
    'preset',
    'demand',
    'slots',
    'moves/h',
    'peak/h',
    'lift cap/h',
    'lift cycle',
    'store P50',
    'store P90',
    'retr P50',
    'retr P95',
    'lift util',
    'shuttle max',
    'queue in/out',
    'rejected',
    'ms',
  ];
  const rows = results.map((r) => [
    r.presetId,
    r.demand,
    String(r.slots),
    f1(r.summary.throughputPerHour),
    f1(r.summary.throughputPeak),
    f1(r.summary.liftCapacityPerHour),
    `${f1(r.summary.liftCycleMean)} s`,
    `${f1(r.summary.storeP50)} s`,
    `${f1(r.summary.storeP90)} s`,
    `${f1(r.summary.retrieveP50)} s`,
    `${f1(r.summary.retrieveP95)} s`,
    pct(r.summary.liftUtilMean),
    pct(r.summary.shuttleUtilMax),
    `${r.summary.queueInMax} / ${r.summary.queueOutMax}`,
    String(r.summary.rejected),
    String(r.elapsedMs),
  ]);
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}
