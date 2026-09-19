'use client';

// SPEC §8 block 5: demand profile, residents, manual "+ car" / "− retrieve".
// Profile and residents restart the day (they seed the engine); the two
// buttons act on the running sim at once.

import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { scaledResidents } from '@/lib/sim/demand';
import type { DemandProfile } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';

const PROFILE_NAMES: DemandProfile['name'][] = ['weekday', 'saturday', 'stress'];

export function DemandForm() {
  const demand = useSimStore((s) => s.demand);
  const config = useSimStore((s) => s.config);
  const setDemandProfile = useSimStore((s) => s.setDemandProfile);
  const setResidents = useSimStore((s) => s.setResidents);
  const addVehicle = useSimStore((s) => s.addVehicle);
  const callVehicle = useSimStore((s) => s.callVehicle);
  const ready = useSimStore((s) => s.snapshot !== null);
  const selectedVehicleId = useUiStore((s) => s.selectedVehicleId);
  const [residentsText, setResidentsText] = useState(String(demand.residents));
  useEffect(() => setResidentsText(String(demand.residents)), [demand.residents]);

  const commitResidents = () => {
    const n = Number.parseInt(residentsText, 10);
    if (Number.isFinite(n) && n >= 0 && n !== demand.residents) setResidents(n);
    else setResidentsText(String(demand.residents));
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
        />
        <span>
          → <span className="font-mono text-ink">{scaledResidents(demand, config)}</span> parked at 00:00
        </span>
      </label>
      <div className="flex gap-1">
        <Chip disabled={!ready} onClick={() => addVehicle('visitor')}>
          + Car
        </Chip>
        <Chip disabled={!ready} onClick={() => callVehicle(selectedVehicleId ?? undefined)} title={selectedVehicleId ? `Retrieve ${selectedVehicleId}` : 'Retrieve the car with the earliest planned departure'}>
          − Retrieve{selectedVehicleId ? ` ${selectedVehicleId}` : ''}
        </Chip>
      </div>
    </div>
  );
}
