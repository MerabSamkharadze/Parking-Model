'use client';

// Label + number. Digits roll vertically to their new value (SPEC §7: numbers
// change by rolling digits, never fade-and-slide); the width is fixed in
// `ch` so a change never shifts the layout (SPEC §10 M4 DoD).

import type { ReactNode } from 'react';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function RollingDigit({ d }: { d: number }) {
  return (
    <span className="inline-block h-[1.25em] w-[1ch] overflow-hidden align-bottom">
      <span className="block transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateY(-${d * 10}%)` }}>
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1.25em] leading-[1.25em]">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

/** A formatted value whose digits roll; non-digits render as-is. */
export function RollingNumber({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex font-mono whitespace-pre ${className}`} aria-label={value}>
      {Array.from(value).map((ch, i) =>
        ch >= '0' && ch <= '9' ? (
          <RollingDigit key={`${i}-${value.length}`} d={ch.charCodeAt(0) - 48} />
        ) : (
          <span key={`${i}-${value.length}`} className="inline-block h-[1.25em] leading-[1.25em]">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

export function StatValue({ label, value, chars = 6, tone = 'ink', hint }: { label: ReactNode; value: string; chars?: number; tone?: 'ink' | 'amber' | 'clay' | 'data' | 'soft'; hint?: string }) {
  const color = tone === 'amber' ? 'text-amber' : tone === 'clay' ? 'text-clay-text' : tone === 'data' ? 'text-data' : tone === 'soft' ? 'text-ink-soft' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs" title={hint}>
      <span className="truncate text-ink-soft">{label}</span>
      <span className={`text-sm ${color}`} style={{ minWidth: `${chars}ch`, textAlign: 'right' }}>
        <RollingNumber value={value} />
      </span>
    </div>
  );
}
