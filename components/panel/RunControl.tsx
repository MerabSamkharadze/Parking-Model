'use client';

// SPEC §8 block 1: play/pause, speed 1× / 4× / 16× / 60×, sim clock, reset,
// seed. Every control acts immediately on the store — no submit.

import { useState } from 'react';
import { clockOf } from '@/lib/format';
import { SPEEDS, useSimStore } from '@/store/useSimStore';

export function chipClass(active: boolean): string {
  return `rounded-sm border px-2 py-0.5 text-xs leading-5 transition-colors ${
    active ? 'border-amber text-amber' : 'border-line text-ink-soft hover:border-slab-edge hover:text-ink'
  }`;
}

export function RunControl() {
  const running = useSimStore((s) => s.running);
  const toggleRunning = useSimStore((s) => s.toggleRunning);
  const speed = useSimStore((s) => s.speed);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const reset = useSimStore((s) => s.reset);
  const seed = useSimStore((s) => s.seed);
  const setSeed = useSimStore((s) => s.setSeed);
  const clock = useSimStore((s) => (s.snapshot ? clockOf(s.snapshot.secondsOfDay) : '00:00'));
  const day = useSimStore((s) => s.snapshot?.day ?? 0);
  const [seedText, setSeedText] = useState(String(seed));

  const commitSeed = () => {
    const n = Number.parseInt(seedText, 10);
    if (Number.isFinite(n) && n !== seed) setSeed(n);
    else setSeedText(String(seed));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" aria-pressed={running} className={`${chipClass(running)} min-w-16`} onClick={toggleRunning}>
          {running ? 'Pause' : 'Play'}
        </button>
        <div className="flex gap-1" role="group" aria-label="Speed">
          {SPEEDS.map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} className={`font-mono ${chipClass(speed === v)}`} onClick={() => setSpeed(v)}>
              {v}×
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-sm tabular-nums" aria-label="Simulation clock">
          {day > 0 ? `D${day + 1} ` : ''}
          {clock}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-soft">
        <label className="flex items-center gap-1">
          seed
          <input
            type="text"
            inputMode="numeric"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            onBlur={commitSeed}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-16 rounded-sm border border-line bg-void px-1.5 py-0.5 font-mono text-ink outline-none focus:border-amber"
            aria-label="Seed"
          />
        </label>
        <button type="button" className={chipClass(false)} onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  );
}
