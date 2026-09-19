'use client';

// SPEC §7: facility name · version · sim clock (live from the snapshot).

import { clockOf } from '@/lib/format';
import { useSimStore } from '@/store/useSimStore';

export function Header() {
  const label = useSimStore((s) => `${s.config.id} · ${s.config.label}`);
  const clock = useSimStore((s) => (s.snapshot ? clockOf(s.snapshot.secondsOfDay) : '00:00'));
  const day = useSimStore((s) => s.snapshot?.day ?? 0);
  const running = useSimStore((s) => s.running);
  return (
    <header className="shell-header flex items-center gap-3 border-b border-line bg-panel px-4 text-sm">
      <h1 className="text-base">AVP Simulator</h1>
      <span aria-hidden className="text-ink-soft">
        ·
      </span>
      <span className="text-ink-soft">{label}</span>
      <span aria-hidden className="text-ink-soft">
        ·
      </span>
      <time className={`font-mono ${running ? 'text-ink' : 'text-ink-soft'}`} aria-label="Simulation clock">
        {day > 0 ? `D${day + 1} ` : ''}
        {clock}
      </time>
      {!running && <span className="text-xs text-ink-soft">paused</span>}
    </header>
  );
}
