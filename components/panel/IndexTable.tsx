'use client';

// SPEC §8 block 8: virtualised index of every car in the system — ticket,
// plate, slot key (or the job stage while moving), zone, dwell. Search by
// plate or ticket; a row click selects the car and flies the camera to its
// slot; "Retrieve" calls it. Hand-rolled windowing (DECISIONS S6): fixed row
// height, only the visible rows (+ overscan) are mounted.

import { useMemo, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { durationOf } from '@/lib/format';
import { hotLevels, parseSlotKey } from '@/lib/geometry';
import type { Job, SimSnapshot, Vehicle } from '@/lib/sim/types';
import { usePanelSnapshot, useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';

const ROW_H = 24;
const VIEW_H = 240;
const OVERSCAN = 4;

interface Row {
  id: string;
  plate: string;
  where: string; // slot key or stage
  moving: boolean;
  zone: string;
  dwell: number;
  slotKey: string | null;
}

function rowsOf(snapshot: SimSnapshot, hot: number): Row[] {
  const stageOf = new Map<string, Job['stage']>();
  for (const j of snapshot.jobs) stageOf.set(j.vehicleId, j.stage);
  const out: Row[] = [];
  for (const v of Object.values(snapshot.vehicles) as Vehicle[]) {
    if (v.state !== 'parked' && v.state !== 'in_system' && v.state !== 'arriving') continue;
    const stage = stageOf.get(v.id);
    const parked = v.state === 'parked' && v.slotKey !== null;
    out.push({
      id: v.id,
      plate: v.plate,
      where: parked ? v.slotKey! : (stage ?? v.state),
      moving: !parked,
      zone: v.slotKey ? (parseSlotKey(v.slotKey).level < hot ? 'hot' : 'cold') : '—',
      dwell: Math.max(0, snapshot.t - v.arrivedAt),
      slotKey: parked ? v.slotKey : null,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return out;
}

export function IndexTable() {
  const snapshot = usePanelSnapshot();
  const cfg = useSimStore((s) => s.config);
  const callVehicle = useSimStore((s) => s.callVehicle);
  const selectedVehicleId = useUiStore((s) => s.selectedVehicleId);
  const selectVehicle = useUiStore((s) => s.selectVehicle);
  const selectSlot = useUiStore((s) => s.selectSlot);
  const flyTo = useUiStore((s) => s.flyTo);
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => (snapshot ? rowsOf(snapshot, hotLevels(cfg)) : []), [snapshot, cfg]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? rows.filter((r) => r.id.toLowerCase().includes(q) || r.plate.toLowerCase().includes(q)) : rows), [rows, q]);
  const parked = rows.filter((r) => !r.moving).length;

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(visible.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN);
  const selected = selectedVehicleId ? rows.find((r) => r.id === selectedVehicleId) : undefined;

  const pick = (r: Row) => {
    selectVehicle(r.id === selectedVehicleId ? null : r.id);
    if (r.id === selectedVehicleId) selectSlot(null);
    else if (r.slotKey) flyTo(r.slotKey);
    else selectSlot(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setScrollTop(0);
            if (viewport.current) viewport.current.scrollTop = 0;
          }}
          placeholder="plate or ticket"
          aria-label="Search plate or ticket"
          className="min-w-0 flex-1 rounded-sm border border-line bg-void px-1.5 py-0.5 font-mono text-xs text-ink outline-none placeholder:text-ink-soft focus:border-amber"
        />
        <Chip disabled={!selected || selected.moving} onClick={() => selected && callVehicle(selected.id)} title={selected ? `Retrieve ${selected.id}` : 'Select a parked car first'}>
          Retrieve
        </Chip>
      </div>
      <p className="font-mono text-[11px] text-ink-soft">
        {rows.length} cars · {parked} parked · {rows.length - parked} moving{q ? ` · ${visible.length} match` : ''}
      </p>
      <div className="grid grid-cols-[3.5rem_5rem_1fr_2.5rem_3.5rem] gap-x-2 border-b border-line pb-1 text-[11px] text-ink-soft">
        <span>ticket</span>
        <span>plate</span>
        <span>slot / stage</span>
        <span>zone</span>
        <span className="text-right">dwell</span>
      </div>
      <div ref={viewport} className="overflow-y-auto" style={{ height: VIEW_H }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="listbox" aria-label="Cars in the system">
        <div role="presentation" style={{ height: visible.length * ROW_H, position: 'relative' }}>
          {visible.slice(first, last).map((r, i) => {
            const active = r.id === selectedVehicleId;
            return (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(r)}
                style={{ position: 'absolute', top: (first + i) * ROW_H, height: ROW_H }}
                className={`grid w-full grid-cols-[3.5rem_5rem_1fr_2.5rem_3.5rem] items-center gap-x-2 border-l-2 pl-1 text-left font-mono text-[11px] leading-none transition-colors ${
                  active ? 'border-amber bg-slab/60 text-ink' : 'border-transparent text-ink hover:bg-slab/40'
                }`}
              >
                <span>{r.id}</span>
                <span>{r.plate}</span>
                <span className={r.moving ? 'text-amber' : 'text-data'}>{r.where}</span>
                <span className="text-ink-soft">{r.zone}</span>
                <span className="text-right text-ink-soft">{durationOf(r.dwell)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
