'use client';

// SPEC §8 block 9: the engine's event log in SQL style — monospace,
// auto-scroll (unless the reader scrolled up), filter by kind. The upper-case
// keywords are the log's own vocabulary (DECISIONS C3).

import { useEffect, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { clockOf } from '@/lib/format';
import type { EventKind, SimEvent } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';

const FILTERS: Array<{ id: string; label: string; kinds: EventKind[] | null }> = [
  { id: 'all', label: 'all', kinds: null },
  { id: 'insert', label: 'INSERT', kinds: ['INSERT'] },
  { id: 'select', label: 'SELECT', kinds: ['SELECT', 'PREFETCH'] },
  { id: 'wait', label: 'LOCK WAIT', kinds: ['LOCK WAIT'] },
  { id: 'reject', label: 'REJECT', kinds: ['REJECT'] },
  { id: 'ops', label: 'ops', kinds: ['SHUFFLE', 'DEFRAG', 'FAIL', 'RECOVER', 'SPARE'] },
];

function toneOf(kind: EventKind): string {
  switch (kind) {
    case 'REJECT':
    case 'FAIL':
      return 'text-clay';
    case 'LOCK WAIT':
    case 'SPARE':
      return 'text-amber';
    case 'SELECT':
    case 'PREFETCH':
      return 'text-data';
    case 'RECOVER':
      return 'text-lime';
    default:
      return 'text-ink';
  }
}

const EMPTY: SimEvent[] = [];

export function EventLog() {
  const events = useSimStore((s) => s.snapshot?.events ?? EMPTY);
  const [filter, setFilter] = useState('all');
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? null;
  const shown = kinds ? events.filter((e) => kinds.includes(e.kind)) : events;

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length, filter]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Event filter">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} className="font-mono" onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div
        ref={list}
        className="h-56 overflow-y-auto rounded-sm border border-line bg-void px-2 py-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
        aria-label="Event log"
        aria-live="off"
      >
        {shown.length === 0 && <p className="font-mono text-[11px] text-ink-soft">— no events yet —</p>}
        {shown.map((e) => (
          <div key={e.seq} className="flex gap-2 font-mono text-[11px] leading-4 whitespace-nowrap">
            <span className="text-ink-soft">{clockOf(e.t, true)}</span>
            <span className={toneOf(e.kind)}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
