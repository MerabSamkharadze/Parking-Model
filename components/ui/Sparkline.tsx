// Fixed-size SVG line for one telemetry series (SPEC §8.7). NaN breaks the
// line; the box never resizes, so updates cannot shift the layout.

import { RollingNumber } from './StatValue';

export function Sparkline({
  label,
  values,
  format,
  width = 152,
  height = 34,
  color = 'var(--data)',
  floor = 0,
}: {
  label: string;
  values: number[];
  format: (v: number) => string;
  width?: number;
  height?: number;
  color?: string;
  /** Lower bound of the y-axis; `null` fits the data. */
  floor?: number | null;
}) {
  const finite = values.filter((v) => Number.isFinite(v));
  const last = finite.length ? finite[finite.length - 1] : NaN;
  let min = floor ?? Math.min(...finite);
  let max = Math.max(...finite, floor ?? -Infinity);
  if (!finite.length) {
    min = 0;
    max = 1;
  }
  if (max - min < 1e-9) max = min + 1;
  const pad = 2;
  const n = values.length;
  let d = '';
  let pen = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    const x = pad + (i / Math.max(1, n - 1)) * (width - 2 * pad);
    const y = height - pad - ((v - min) / (max - min)) * (height - 2 * pad);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    pen = true;
  }
  return (
    <div className="flex flex-col gap-0.5" style={{ width }}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="truncate text-ink-soft">{label}</span>
        <span className="text-ink">{Number.isFinite(last) ? <RollingNumber value={format(last)} /> : <span className="font-mono text-ink-soft">—</span>}</span>
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={`${label} sparkline`}>
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--line)" strokeWidth="1" />
        {d && <path d={d} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" />}
      </svg>
    </div>
  );
}
