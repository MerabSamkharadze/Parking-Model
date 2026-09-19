'use client';

// SPEC §7: the 24 h timeline strip under the viewport — throughput (line)
// and queue (area) per minute of the sim day, hour ticks, a cursor at the
// current time. Minutes not yet reached this day show yesterday's values
// dimmed. Fixed-height SVG: nothing here can shift the layout.

import { useMemo } from 'react';
import { clockOf } from '@/lib/format';
import { MINUTES_PER_DAY } from '@/lib/history';
import { useSimStore } from '@/store/useSimStore';

const H = 96;
const PAD_X = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 16;

function path(values: Float32Array, from: number, to: number, x: (i: number) => number, y: (v: number) => number, area: boolean): string {
  let d = '';
  let pen = false;
  let startX = 0;
  for (let i = from; i < to; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      if (pen && area) d += `L${x(i - 1).toFixed(1)} ${y(0).toFixed(1)} Z `;
      pen = false;
      continue;
    }
    if (!pen) {
      startX = x(i);
      d += area ? `M${startX.toFixed(1)} ${y(0).toFixed(1)} L` : 'M';
      pen = true;
    } else d += 'L';
    d += `${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
  }
  if (pen && area) d += `L${x(to - 1).toFixed(1)} ${y(0).toFixed(1)} Z`;
  return d;
}

export function TimelineStrip() {
  const historyVersion = useSimStore((s) => s.historyVersion);
  const history = useSimStore((s) => s.history);
  const secondsOfDay = useSimStore((s) => s.snapshot?.secondsOfDay ?? 0);
  const width = 1000; // viewBox units; the SVG stretches to the strip
  const x = (minute: number) => PAD_X + (minute / MINUTES_PER_DAY) * (width - 2 * PAD_X);
  const paths = useMemo(() => {
    void historyVersion;
    const head = history.head;
    const tMax = Math.max(1, ...Array.from(history.throughput).filter(Number.isFinite));
    const qMax = Math.max(1, ...Array.from(history.queue).filter(Number.isFinite));
    const yT = (v: number) => H - PAD_BOTTOM - (v / tMax) * (H - PAD_TOP - PAD_BOTTOM);
    const yQ = (v: number) => H - PAD_BOTTOM - (v / qMax) * (H - PAD_TOP - PAD_BOTTOM) * 0.6;
    const today = head < 0 ? 0 : head + 1;
    return {
      throughputToday: path(history.throughput, 0, today, x, yT, false),
      queueToday: path(history.queue, 0, today, x, yQ, true),
      throughputBefore: path(history.throughput, today, MINUTES_PER_DAY, x, yT, false),
      queueBefore: path(history.queue, today, MINUTES_PER_DAY, x, yQ, true),
      tMax,
      qMax,
    };
  }, [historyVersion, history]);
  const cursor = x(secondsOfDay / 60);

  return (
    <footer aria-label="Timeline" className="shell-timeline relative border-t border-line bg-void">
      <svg viewBox={`0 0 ${width} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label="24 hour timeline: throughput and queue">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <line key={h} x1={x(h * 60)} x2={x(h * 60)} y1={PAD_TOP - 4} y2={H - PAD_BOTTOM} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={PAD_X} x2={width - PAD_X} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} stroke="var(--slab-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={paths.queueBefore} fill="var(--clay)" opacity="0.12" />
        <path d={paths.throughputBefore} fill="none" stroke="var(--data)" strokeWidth="1" opacity="0.3" vectorEffect="non-scaling-stroke" />
        <path d={paths.queueToday} fill="var(--clay)" opacity="0.35" />
        <path d={paths.throughputToday} fill="none" stroke="var(--data)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1={cursor} x2={cursor} y1={PAD_TOP - 6} y2={H - PAD_BOTTOM} stroke="var(--amber)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="pointer-events-none absolute inset-x-4 top-0 flex justify-between font-mono text-[10px] leading-4 text-ink-soft">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
      <div className="pointer-events-none absolute right-4 bottom-0 flex gap-3 font-mono text-[10px] leading-4 text-ink-soft">
        <span>
          <span className="text-data">—</span> throughput /h · max {paths.tMax.toFixed(0)}
        </span>
        <span>
          <span className="text-clay">▮</span> queue · max {paths.qMax.toFixed(0)}
        </span>
        <span className="text-amber">{clockOf(secondsOfDay)}</span>
      </div>
    </footer>
  );
}
