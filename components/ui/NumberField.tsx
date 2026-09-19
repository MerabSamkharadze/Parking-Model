'use client';

// Integer stepper for facility fields: −/+ buttons around a mono value. The
// stepper never shrinks; a label that does not fit truncates (full text in
// the tooltip), so every stepper in a column sits at the same x.

export function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 truncate text-ink-soft" title={label}>
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label={`${label}: less`} disabled={value <= min} onClick={() => set(value - 1)} className="h-6 w-6 rounded-sm border border-line text-ink-soft hover:border-slab-edge hover:text-ink disabled:opacity-30">
          −
        </button>
        <span className="w-6 text-center font-mono text-ink">{value}</span>
        <button type="button" aria-label={`${label}: more`} disabled={value >= max} onClick={() => set(value + 1)} className="h-6 w-6 rounded-sm border border-line text-ink-soft hover:border-slab-edge hover:text-ink disabled:opacity-30">
          +
        </button>
      </span>
    </div>
  );
}
