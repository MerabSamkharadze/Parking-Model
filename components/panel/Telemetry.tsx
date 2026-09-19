'use client';

// SPEC §8 block 7: four sparklines (throughput/h, queue, store P50, lift
// utilisation) over the last three hours, then the percentile table.

import { Sparkline } from '@/components/ui/Sparkline';
import { StatValue } from '@/components/ui/StatValue';
import type { Percentiles } from '@/lib/sim/types';
import { usePanelSnapshot, useSimStore } from '@/store/useSimStore';

const WINDOW_MINUTES = 180;

function Row({ label, p }: { label: string; p: Percentiles }) {
  const cell = (v: number) => <td className="w-12 text-right font-mono text-ink">{p.n > 0 ? v.toFixed(v >= 100 ? 0 : 1) : '—'}</td>;
  return (
    <tr>
      <td className="text-ink-soft">{label}</td>
      {cell(p.p50)}
      {cell(p.p90)}
      {cell(p.p95)}
      {cell(p.max)}
      <td className="w-10 text-right font-mono text-ink-soft">{p.n}</td>
    </tr>
  );
}

export function Telemetry() {
  const snapshot = usePanelSnapshot();
  const historyVersion = useSimStore((s) => s.historyVersion);
  const history = useSimStore((s) => s.history);
  void historyVersion; // re-render key: the buffer itself is mutable
  const series = {
    throughput: history.recent('throughput', WINDOW_MINUTES),
    queue: history.recent('queue', WINDOW_MINUTES),
    storeP50: history.recent('storeP50', WINDOW_MINUTES),
    liftUtil: history.recent('liftUtil', WINDOW_MINUTES),
  };
  if (!snapshot) return null;
  const m = snapshot.metrics;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Sparkline label="Throughput /h" values={series.throughput} format={(v) => v.toFixed(0)} />
        <Sparkline label="Queue" values={series.queue} format={(v) => v.toFixed(0)} color="var(--clay)" />
        <Sparkline label="Store P50" values={series.storeP50} format={(v) => `${v.toFixed(0)}s`} floor={null} />
        <Sparkline label="Lift utilisation" values={series.liftUtil} format={(v) => `${Math.round(v * 100)}%`} color="var(--amber)" />
      </div>
      <table className="w-full border-collapse text-xs" aria-label="Percentiles (seconds)">
        <thead>
          <tr className="text-ink-soft">
            <th className="text-left font-normal">seconds</th>
            <th className="text-right font-normal">P50</th>
            <th className="text-right font-normal">P90</th>
            <th className="text-right font-normal">P95</th>
            <th className="text-right font-normal">max</th>
            <th className="text-right font-normal">n</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Store" p={m.storeTime} />
          <Row label="Retrieve" p={m.retrieveTime} />
          <Row label="Lift cycle" p={m.liftCycle} />
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <StatValue label="Lift capacity /h" value={m.liftCapacityPerHour.toFixed(0)} chars={4} />
        <StatValue label="Peak /h" value={m.throughputPeak.toFixed(0)} chars={4} />
        <StatValue label="Completed" value={`${m.completedStore} / ${m.completedRetrieve}`} chars={9} hint="stores / retrieves" />
        <StatValue label="Rejected" value={String(m.rejected)} chars={3} tone={m.rejected > 0 ? 'clay' : 'ink'} />
      </div>
    </div>
  );
}
