'use client';

// Labelled range input; the value is shown in mono with a fixed width so the
// row never reflows while dragging.

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
        className="h-1 min-w-0 flex-1 cursor-pointer accent-amber"
        aria-label={label}
      />
      <span className="font-mono text-ink" style={{ minWidth: `${chars}ch`, textAlign: 'right' }}>
        {format(value)}
      </span>
    </label>
  );
}
