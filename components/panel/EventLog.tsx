'use client';

// SPEC §8 block 9: the engine's event log in SQL style — monospace,
// auto-scroll (unless the reader scrolled up), filter by kind. The upper-case
// keywords are the log's own vocabulary (DECISIONS C3).

import { useEffect, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { clockOf } from '@/lib/format';
import type { EventKind, SimEvent } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';

// Six chips fit one row of the 360 px rail: short labels, 6 px padding.
// `noun` names the kind in the empty-filter message.
const FILTERS: Array<{ id: string; label: string; noun: string; title: string; kinds: EventKind[] | null }> = [
  { id: 'all', label: 'all', noun: '', title: 'Every event', kinds: null },
  { id: 'insert', label: 'INSERT', noun: 'INSERT', title: 'Cars stored', kinds: ['INSERT'] },
  { id: 'select', label: 'SELECT', noun: 'SELECT', title: 'Cars retrieved (and pre-fetched)', kinds: ['SELECT', 'PREFETCH'] },
  { id: 'wait', label: 'WAIT', noun: 'LOCK WAIT', title: 'LOCK WAIT: a job waited for a lift or shuttle', kinds: ['LOCK WAIT'] },
  { id: 'reject', label: 'REJECT', noun: 'REJECT', title: 'Arrivals turned away', kinds: ['REJECT'] },
  { id: 'ops', label: 'ops', noun: 'ops', title: 'SHUFFLE, DEFRAG, FAIL, RECOVER, SPARE', kinds: ['SHUFFLE', 'DEFRAG', 'FAIL', 'RECOVER', 'SPARE'] },
];

function toneOf(kind: EventKind): string {
  switch (kind) {
    case 'REJECT':
    case 'FAIL':
      return 'text-clay-text';
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
  const current = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const kinds = current.kinds;
  const shown = kinds ? events.filter((e) => kinds.includes(e.kind)) : events;
  // The engine keeps the last 200 events, so the length stops changing once
  // the log is full: the newest event's seq is what says "something arrived".
  const lastSeq = shown.length ? shown[shown.length - 1].seq : -1;

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastSeq, filter]);

  // Rows leave at the top as new ones arrive: without `overflow-anchor: none`
  // Chrome's scroll anchoring would hold the view on the vanishing rows.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Event filter">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} className="px-1.5! font-mono" title={f.title} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div
        ref={list}
        role="log"
        className="h-56 overflow-x-hidden overflow-y-auto rounded-sm border border-line bg-void px-2 py-1"
        style={{ overflowAnchor: 'none' }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
        aria-label="Event log"
        aria-live="off"
      >
        {shown.length === 0 && (
          <p className="text-[11px] text-ink-soft">
            {events.length > 0 && kinds ? (
              <>
                no <span className="font-mono">{current.noun}</span> events in the last <span className="font-mono">{events.length}</span>
              </>
            ) : (
              '— no events yet —'
            )}
          </p>
        )}
        {shown.map((e) => (
          <div key={e.seq} className="flex gap-2 font-mono text-[11px] leading-4">
            <span className="shrink-0 text-ink-soft">{clockOf(e.t, true)}</span>
            <span className={`min-w-0 break-words ${toneOf(e.kind)}`}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
