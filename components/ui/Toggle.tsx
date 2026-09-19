'use client';

// On/off switch with a text label. The knob is the only thing that moves.

export function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 text-xs ${disabled ? 'opacity-40' : ''}`}>
      <span className="text-ink-soft">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors ${checked ? 'border-amber bg-amber/20' : 'border-line bg-void'}`}
      >
        <span
          className={`absolute top-0.5 h-[10px] w-[10px] rounded-full transition-transform motion-reduce:transition-none ${checked ? 'translate-x-[15px] bg-amber' : 'translate-x-[2px] bg-ink-soft'}`}
        />
      </button>
    </label>
  );
}
