'use client';

// Small bordered button used for every discrete choice and command. Amber
// when active; never a colour wash (SPEC §7).
//
// `active` is a toggle state (preset, speed, filter, view): it colours the
// chip and announces `aria-pressed`. `primary` only colours it — for a
// command that is ready to act (Restart, Save, Run compare, Recover all),
// which is not a toggle and must not announce as one.

import type { ButtonHTMLAttributes } from 'react';

export function chipClass(active: boolean, extra = ''): string {
  return `rounded-sm border px-2 py-0.5 text-xs leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    active ? 'border-amber text-amber' : 'border-line text-ink-soft hover:border-slab-edge hover:text-ink'
  } ${extra}`;
}

export function Chip({ active, primary = false, className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; primary?: boolean }) {
  return <button type={type} aria-pressed={active} className={chipClass(active === true || primary, className)} {...rest} />;
}
