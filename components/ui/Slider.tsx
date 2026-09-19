'use client';

// Labelled range input; the value is shown in mono with a fixed width so the
// row never reflows while dragging. The input is 24 px tall for the touch
// target; the 4 px track and the thumb are styled in globals.css (`.slider`).

import type { CSSProperties } from 'react';

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  chars = 4,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  chars?: number;
  onChange: (v: number) => void;
}) {
  const fill = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-24 shrink-0 text-ink-soft">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider h-6 min-w-0 flex-1 cursor-pointer"
        style={{ '--slider-fill': `${fill}%` } as CSSProperties}
        aria-label={label}
      />
      <span className="font-mono text-ink" style={{ minWidth: `${chars}ch`, textAlign: 'right' }}>
        {format(value)}
      </span>
    </label>
  );
}
