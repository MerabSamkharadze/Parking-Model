// Compare mode orchestration — SPEC §5: 2–3 versions, same day (current
// demand profile, residents and seed), each in its own Web Worker. Pure of
// React; the store owns the state.

import type { BenchResult, BenchSummary } from './sim/bench.ts';
import type { DemandProfile, FacilityConfig } from './sim/types.ts';

export interface CompareCandidate {
  id: string;
  label: string;
  config: FacilityConfig;
}

export interface CompareRow {
  id: string;
  label: string;
  slots: number;
  elapsedMs: number;
  summary: BenchSummary;
}

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;
export const COMPARE_HOURS = 24;

/** The table rows (SPEC §5): metric → per-version formatted value. */
export const COMPARE_METRICS: Array<{ key: string; label: string; value: (s: BenchSummary) => number; format: (v: number) => string; better: 'high' | 'low' }> = [
  { key: 'throughput', label: 'Throughput /h', value: (s) => s.throughputPerHour, format: (v) => v.toFixed(1), better: 'high' },
  { key: 'peak', label: 'Peak /h', value: (s) => s.throughputPeak, format: (v) => v.toFixed(0), better: 'high' },
  { key: 'capacity', label: 'Lift capacity /h', value: (s) => s.liftCapacityPerHour, format: (v) => v.toFixed(0), better: 'high' },
  { key: 'storeP50', label: 'Store P50', value: (s) => s.storeP50, format: (v) => `${v.toFixed(1)}s`, better: 'low' },
  { key: 'retrieveP50', label: 'Retrieve P50', value: (s) => s.retrieveP50, format: (v) => `${v.toFixed(1)}s`, better: 'low' },
  { key: 'retrieveP95', label: 'Retrieve P95', value: (s) => s.retrieveP95, format: (v) => `${v.toFixed(1)}s`, better: 'low' },
  { key: 'liftUtil', label: 'Lift utilisation', value: (s) => s.liftUtilMean, format: (v) => `${Math.round(v * 100)}%`, better: 'low' },
  { key: 'queueIn', label: 'Queue in max', value: (s) => s.queueInMax, format: (v) => v.toFixed(0), better: 'low' },
  { key: 'queueOut', label: 'Queue out max', value: (s) => s.queueOutMax, format: (v) => v.toFixed(0), better: 'low' },
  { key: 'rejected', label: 'Rejected', value: (s) => s.rejected, format: (v) => v.toFixed(0), better: 'low' },
];

export function rowOf(candidate: CompareCandidate, result: BenchResult): CompareRow {
  return { id: candidate.id, label: candidate.label, slots: result.slots, elapsedMs: result.elapsedMs, summary: result.summary };
}

/** Index of the best value per metric (ties → −1, so nothing is highlighted). */
export function bestOf(rows: CompareRow[], metric: (typeof COMPARE_METRICS)[number]): number {
  if (rows.length < 2) return -1;
  const values = rows.map((r) => metric.value(r.summary));
  const target = metric.better === 'high' ? Math.max(...values) : Math.min(...values);
  const winners = values.filter((v) => v === target).length;
  return winners === 1 ? values.indexOf(target) : -1;
}

export interface CompareRequestPlan {
  demandName: DemandProfile['name'];
  residents: number;
  seed: number;
  hours: number;
  candidates: CompareCandidate[];
}
