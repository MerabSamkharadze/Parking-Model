'use client';

// SPEC §8 block 10 / §4.5: lift down, shuttle down, power loss toggles and
// "Recover all". A failed resource freezes the job holding it; waiting jobs
// re-target what is left; the spare shuttle replaces the first failed
// shuttle after `spareSwapMinutes` (DECISIONS E15).

import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { Toggle } from '@/components/ui/Toggle';
import { usePanelSnapshot, useSimStore } from '@/store/useSimStore';

export function FailurePanel() {
  const snapshot = usePanelSnapshot();
  const cfg = useSimStore((s) => s.config);
  const setFailure = useSimStore((s) => s.setFailure);
  const recoverAll = useSimStore((s) => s.recoverAll);
  if (!snapshot) return null;
  const lifts = snapshot.resources.filter((r) => r.kind === 'lift');
  const shuttles = snapshot.resources.filter((r) => r.kind === 'shuttle');
  const f = snapshot.failures;
  const anything = f.power || f.lifts.length > 0 || f.shuttles.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <Toggle label="Power loss (everything freezes)" checked={f.power} onChange={(on) => setFailure('power', null, on)} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {lifts.map((r) => (
          <Toggle key={r.id} label={`${r.id} down`} checked={r.down} onChange={(on) => setFailure('lift', r.id, on)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {shuttles.map((r) => (
          <Toggle key={r.id} label={`${r.id} down`} checked={r.down} onChange={(on) => setFailure('shuttle', r.id, on)} />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-soft">
        {cfg.spareShuttle ? (
          <span>
            Spare shuttle: {f.spareUsed ? <Badge tone="lime">used</Badge> : <Badge>ready · replaces the first failed shuttle after {cfg.spareSwapMinutes} min</Badge>}
          </span>
        ) : (
          <span>No spare shuttle in this version.</span>
        )}
        <Chip className="ml-auto" active={anything} disabled={!anything} onClick={recoverAll}>
          Recover all
        </Chip>
      </div>
    </div>
  );
}
