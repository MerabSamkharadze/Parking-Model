'use client';

// SPEC §8 block 6: occupancy per level, in-transit, queues, degraded banner.
// Bars are fixed-width boxes with a proportional fill; numbers roll in place.

import { Badge } from '@/components/ui/Badge';
import { StatValue } from '@/components/ui/StatValue';
import { hotLevels } from '@/lib/geometry';
import { usePanelSnapshot, useSimStore } from '@/store/useSimStore';

export function LiveState() {
  const snapshot = usePanelSnapshot();
  const cfg = useSimStore((s) => s.config);
  if (!snapshot) return null;
  const perLevel = Array.from({ length: cfg.levels }, () => ({ occupied: 0, total: 0 }));
  for (const s of snapshot.slots) {
    const l = perLevel[s.id.level];
    l.total++;
    if (s.state === 'occupied') l.occupied++;
  }
  const hot = hotLevels(cfg);
  const m = snapshot.metrics;
  const f = snapshot.failures;
  const problems = [...f.lifts.map((id) => `${id} down`), ...f.shuttles.map((id) => `${id} down`), ...(f.power ? ['power loss'] : [])];
  return (
    <div className="flex flex-col gap-2">
      {m.degraded && (
        <div className="rounded-sm border border-clay px-2 py-1 text-xs text-clay" role="status">
          Degraded · {problems.join(' · ')}
        </div>
      )}
      <div className="flex flex-col gap-1" aria-label="Occupancy by level">
        {perLevel.map((l, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-6 font-mono text-ink-soft">L{i + 1}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-sm bg-slab">
              <span className={`block h-full ${i < hot ? 'bg-amber' : 'bg-data'}`} style={{ width: `${l.total ? (100 * l.occupied) / l.total : 0}%` }} />
            </span>
            <span className="w-14 text-right font-mono text-ink">
              {l.occupied}/{l.total}
            </span>
            <span className="w-7">{i < hot && <Badge tone="amber">hot</Badge>}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <StatValue label="Occupancy" value={`${Math.round(m.occupancy * 100)}%`} chars={4} />
        <StatValue label="Hot zone" value={`${Math.round(m.hotZoneOccupancy * 100)}%`} chars={4} />
        <StatValue label="In transit" value={String(m.inTransit)} chars={3} tone="amber" />
        <StatValue label="Queue in / out" value={`${m.queueIn} / ${m.queueOut}`} chars={7} tone={m.queueIn > 0 ? 'clay' : 'ink'} />
      </div>
    </div>
  );
}
