'use client';

// SPEC §5 compare mode: pick 2–3 versions, run them headless in workers for
// the same day (current demand + seed), read the side-by-side table. The 3D
// scene keeps showing the active version.

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { COMPARE_MAX, COMPARE_METRICS, COMPARE_MIN, bestOf } from '@/lib/compare';
import { PRESETS, PRESET_IDS, isCustom } from '@/lib/presets';
import { compareStaleNote, useSimStore } from '@/store/useSimStore';

export function CompareSheet({ onClose }: { onClose: () => void }) {
  const config = useSimStore((s) => s.config);
  const versions = useSimStore((s) => s.versions);
  const demand = useSimStore((s) => s.demand);
  const seed = useSimStore((s) => s.seed);
  const compare = useSimStore((s) => s.compare);
  const runCompare = useSimStore((s) => s.runCompare);
  const clearCompare = useSimStore((s) => s.clearCompare);
  const [picked, setPicked] = useState<string[]>(() => (isCustom(config) ? ['current', config.derivedFrom ?? 'B'] : [config.id, config.id === 'B' ? 'C' : 'B']));

  const options: Array<{ id: string; label: string }> = [
    ...(isCustom(config) ? [{ id: 'current', label: `Custom · from ${config.derivedFrom}` }] : []),
    ...PRESET_IDS.map((id) => ({ id, label: `${id} · ${PRESETS[id].label}` })),
    ...versions.map((v) => ({ id: v.id, label: v.label })),
  ];
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= COMPARE_MAX ? [...p.slice(1), id] : [...p, id]));
  const canRun = picked.length >= COMPARE_MIN && !compare.running;
  const stale = compare.rows.length > 0 ? compareStaleNote(compare.setup, { demand, seed, config }) : null;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Versions to compare">
        {options.map((o) => (
          <Chip key={o.id} active={picked.includes(o.id)} onClick={() => toggle(o.id)}>
            {o.label}
          </Chip>
        ))}
      </div>
      <p className="text-xs text-ink-soft">
        Same day for all: {demand.name}, <span className="font-mono">{demand.residents}</span> residents, seed <span className="font-mono">{seed}</span>, <span className="font-mono">24</span> h headless.
      </p>
      <div className="flex items-center gap-2">
        <Chip primary={canRun} disabled={!canRun} onClick={() => runCompare(picked)}>
          {compare.running ? 'Running…' : 'Run compare'}
        </Chip>
        {compare.elapsedMs !== null && (
          <span className="font-mono text-xs text-ink-soft">
            {compare.elapsedMs} ms
          </span>
        )}
        <Chip
          className="ml-auto"
          onClick={() => {
            clearCompare();
            onClose();
          }}
        >
          Close
        </Chip>
      </div>
      {compare.error && <p className="text-xs text-clay-text">{compare.error}</p>}
      {stale && (
        <p className="text-xs">
          <Badge tone="amber">{stale}</Badge>
        </p>
      )}
      {compare.rows.length > 0 && (
        // fixed layout: the metric column takes 40 %, the versions share the
        // rest, and a long saved-version label truncates instead of squeezing
        // the values together
        <table className="w-full table-fixed border-collapse text-xs" aria-label="Compare results">
          <thead>
            <tr className="text-ink-soft">
              <th className="w-[40%] pb-1 text-left font-normal">metric</th>
              {compare.rows.map((r) => (
                <th key={r.id} className="truncate pb-1 pl-2 text-right font-normal" title={r.label}>
                  {r.label.split(' · ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="text-ink-soft">
              <td className="truncate">Slots</td>
              {compare.rows.map((r) => (
                <td key={r.id} className="pl-2 text-right font-mono">
                  {r.slots}
                </td>
              ))}
            </tr>
            {COMPARE_METRICS.map((m) => {
              const best = bestOf(compare.rows, m);
              return (
                <tr key={m.key}>
                  <td className="truncate text-ink-soft" title={m.label}>
                    {m.label}
                  </td>
                  {compare.rows.map((r, i) => (
                    <td key={r.id} className={`pl-2 text-right font-mono ${i === best ? 'text-amber' : 'text-ink'}`}>
                      {m.format(m.value(r.summary))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
