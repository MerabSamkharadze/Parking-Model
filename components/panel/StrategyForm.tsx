'use client';

// SPEC §8 block 4: allocator, pre-fetch lead, night defrag — applied hot,
// no restart (the engine's setAllocator / setPrefetchLead / setNightDefrag).

import { Chip } from '@/components/ui/Chip';
import { Slider } from '@/components/ui/Slider';
import { Toggle } from '@/components/ui/Toggle';
import type { AllocatorName } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';

const ALLOCATORS: Array<{ id: AllocatorName; label: string }> = [
  { id: 'nearest', label: 'nearest' },
  { id: 'zoned', label: 'zoned' },
  { id: 'balanced', label: 'balanced' },
  { id: 'dwell-aware', label: 'dwell-aware' },
];

export function StrategyForm() {
  const allocator = useSimStore((s) => s.config.allocator);
  const lead = useSimStore((s) => s.config.prefetchLeadMinutes);
  const defrag = useSimStore((s) => s.config.nightDefrag);
  const setStrategy = useSimStore((s) => s.setStrategy);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Allocator">
        {ALLOCATORS.map((a) => (
          <Chip key={a.id} active={allocator === a.id} onClick={() => setStrategy({ allocator: a.id })}>
            {a.label}
          </Chip>
        ))}
      </div>
      <Slider label="Pre-fetch lead" value={lead} min={0} max={15} format={(v) => (v === 0 ? 'off' : `${v} min`)} chars={6} onChange={(v) => setStrategy({ prefetchLeadMinutes: v })} />
      <Toggle label="Night defrag at 03:00" checked={defrag} onChange={(on) => setStrategy({ nightDefrag: on })} />
    </div>
  );
}
