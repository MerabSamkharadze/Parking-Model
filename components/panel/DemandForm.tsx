'use client';

// SPEC §8 block 5: demand profile, residents, manual "+ car" / "− retrieve".
// Profile and residents restart the day (they seed the engine); the two
// buttons act on the running sim at once. "− Retrieve" names the selected
// car only while that car is parked and not yet called (DECISIONS S7/S26);
// otherwise it falls back to the earliest planned departure, and it is
// disabled when no car could be called at all.

import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { scaledResidents } from '@/lib/sim/demand';
import type { DemandProfile } from '@/lib/sim/types';
import { clampResidents, residentsCap, usePanelSnapshot, useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';
import { anyCallable, isCallable } from './indexRows';

const PROFILE_NAMES: DemandProfile['name'][] = ['weekday', 'saturday', 'stress'];
const NOTE_MS = 2500;

export function DemandForm() {
  const demand = useSimStore((s) => s.demand);
  const config = useSimStore((s) => s.config);
  const setDemandProfile = useSimStore((s) => s.setDemandProfile);
  const setResidents = useSimStore((s) => s.setResidents);
  const addVehicle = useSimStore((s) => s.addVehicle);
  const callVehicle = useSimStore((s) => s.callVehicle);
  const snapshot = usePanelSnapshot();
  const selectedVehicleId = useUiStore((s) => s.selectedVehicleId);
  const [residentsText, setResidentsText] = useState(String(demand.residents));
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setResidentsText(String(demand.residents)), [demand.residents]);
  useEffect(() => {
    if (note === null) return;
    const id = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(id);
  }, [note]);

  const ready = snapshot !== null;
  const cap = residentsCap(config);
  const selectedParked = snapshot !== null && isCallable(snapshot, selectedVehicleId);
  const callable = snapshot !== null && (selectedParked || anyCallable(snapshot));

  const commitResidents = () => {
    const n = clampResidents(Number(residentsText.trim() === '' ? NaN : residentsText), config, demand.residents);
    if (n !== demand.residents) setResidents(n);
    else setResidentsText(String(demand.residents)); // clamped or unchanged: show what counts
  };

  const add = () => {
    if (addVehicle('visitor') !== null) return;
    // rejected at the gate: the engine logged why ("REJECT #1103 full" / "ev" / "oversize")
    const events = useSimStore.getState().snapshot?.events ?? [];
    const last = events[events.length - 1];
    const reason = last && last.kind === 'REJECT' ? last.text.split(' ').pop() : 'full';
    setNote(`rejected · ${reason}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1" role="group" aria-label="Demand profile">
        {PROFILE_NAMES.map((name) => (
          <Chip key={name} active={demand.name === name} onClick={() => setDemandProfile(name)}>
            {name}
          </Chip>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="w-24 shrink-0">Residents</span>
        <input
          type="text"
          inputMode="numeric"
          value={residentsText}
          onChange={(e) => setResidentsText(e.target.value)}
          onBlur={commitResidents}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-16 rounded-sm border border-line bg-void px-1.5 py-0.5 font-mono text-ink outline-none focus:border-amber"
          aria-label="Residents (per 144 slots)"
          title={`0 to ${cap} for this facility`}
        />
        <span>
          → <span className="font-mono text-ink">{scaledResidents(demand, config)}</span> parked at <span className="font-mono">00:00</span>
        </span>
      </label>
      <div className="flex items-center gap-1">
        <Chip disabled={!ready} onClick={add}>
          + Car
        </Chip>
        <Chip
          disabled={!callable}
          onClick={() => callVehicle(selectedParked ? selectedVehicleId! : undefined)}
          title={selectedParked ? `Retrieve ${selectedVehicleId}` : callable ? 'Retrieve the car with the earliest planned departure' : 'No parked car to retrieve'}
        >
          − Retrieve{selectedParked && <span className="font-mono"> {selectedVehicleId}</span>}
        </Chip>
        {note && (
          <span className="text-xs text-clay-text" role="status">
            {note}
          </span>
        )}
      </div>
    </div>
  );
}
