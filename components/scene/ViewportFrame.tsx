'use client';

// Hosts the canvas (client-only, no SSR for three.js) and the thin overlay
// the layout diagram calls "in the shadow: bay row, level label" (SPEC §7).

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore, type CameraPreset } from '@/store/useUiStore';

const Viewport = dynamic(() => import('./Viewport').then((m) => m.Viewport), {
  ssr: false,
  loading: () => <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">Loading scene…</p>,
});

const VIEWS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'isometric', label: 'Isometric' },
  { id: 'cutaway', label: 'Cutaway' },
  { id: 'shaft', label: 'Shaft' },
  { id: 'slot', label: 'Slot' },
];

function chip(active: boolean): string {
  return `rounded-sm border px-2 py-0.5 text-xs leading-5 transition-colors ${
    active ? 'border-amber text-amber' : 'border-line text-ink-soft hover:border-slab-edge hover:text-ink'
  }`;
}

function Overlay() {
  const cfg = useSimStore((s) => s.config);
  // one string per bay kind: re-renders only when a bay changes state
  const bayDots = useSimStore((s) => {
    if (!s.snapshot) return '';
    let inDots = '';
    let outDots = '';
    for (const r of s.snapshot.resources) {
      if (r.kind === 'bay_in') inDots += r.busyWith ? '●' : '○';
      else if (r.kind === 'bay_out') outDots += r.busyWith ? '●' : '○';
    }
    return `in ${inDots} · out ${outDots}`;
  });
  const selectedLevel = useUiStore((s) => s.selectedLevel);
  const toggleLevel = useUiStore((s) => s.toggleLevel);
  const preset = useUiStore((s) => s.cameraPreset);
  const setPreset = useUiStore((s) => s.setCameraPreset);
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs text-ink-soft">{bayDots}</p>
        <div className="pointer-events-auto flex flex-wrap gap-1" role="group" aria-label="Level isolation">
          {Array.from({ length: cfg.levels }, (_, level) => (
            <button
              key={level}
              type="button"
              aria-pressed={selectedLevel === level}
              className={`font-mono ${chip(selectedLevel === level)}`}
              onClick={() => toggleLevel(level)}
            >
              L{level + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-auto flex flex-wrap gap-1" role="group" aria-label="Camera view">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={preset === v.id} className={chip(preset === v.id)} onClick={() => setPreset(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ViewportFrame() {
  const engine = useSimStore((s) => s.engine);
  const init = useSimStore((s) => s.init);
  const boot = useSimStore((s) => s.boot);
  const epoch = useSimStore((s) => s.epoch);
  const selectSlot = useUiStore((s) => s.selectSlot);
  const selectVehicle = useUiStore((s) => s.selectVehicle);
  useEffect(() => {
    if (!engine) {
      boot(); // ?v= share link and saved versions, before the first engine
      init();
    }
  }, [engine, init, boot]);
  // a new engine has new cars: drop the old selection
  useEffect(() => {
    selectSlot(null);
    selectVehicle(null);
  }, [epoch, selectSlot, selectVehicle]);
  return (
    <section aria-label="3D viewport" className="shell-viewport relative overflow-hidden bg-void">
      <Viewport />
      <Overlay />
    </section>
  );
}
