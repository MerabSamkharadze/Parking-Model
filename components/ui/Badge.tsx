// Small status label: "Restart needed", "hot", "degraded".

import type { ReactNode } from 'react';

const TONES = {
  neutral: 'border-line text-ink-soft',
  amber: 'border-amber text-amber',
  clay: 'border-clay text-clay-text',
  data: 'border-data text-data',
  lime: 'border-lime text-lime',
} as const;

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={`inline-block rounded-sm border px-1.5 text-[11px] leading-4 ${TONES[tone]} ${className}`}>{children}</span>;
}
