'use client';

// Toggle-style button used for every discrete choice (presets, speeds,
// allocators, filters). Amber when active; never a colour wash (SPEC §7).

import type { ButtonHTMLAttributes } from 'react';

export function chipClass(active: boolean, extra = ''): string {
  return `rounded-sm border px-2 py-0.5 text-xs leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    active ? 'border-amber text-amber' : 'border-line text-ink-soft hover:border-slab-edge hover:text-ink'
  } ${extra}`;
}

export function Chip({ active = false, className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type={type} aria-pressed={active} className={chipClass(active, className)} {...rest} />;
}
