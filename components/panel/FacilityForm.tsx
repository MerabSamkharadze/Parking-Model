'use client';

// SPEC §8 block 3: levels, lifts, bays, shuttles per level, slot mix. Edits
// are a draft; the "Restart needed" badge appears as soon as it differs from
// the running config, and "Restart" applies it as a custom version.

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { NumberField } from '@/components/ui/NumberField';
import { Slider } from '@/components/ui/Slider';
import { layout, slotCount } from '@/lib/geometry';
import { CONFIG_LIMITS, deriveConfig, type ConfigPatch } from '@/lib/presets';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';

interface Draft {
  levels: number;
  cols: number;
  lifts: number;
  baysIn: number;
  baysOut: number;
  shuttlesPerLevel: number;
  ev: number; // percent
  oversize: number; // percent
}

function draftOf(c: FacilityConfig): Draft {
  return {
    levels: c.levels,
    cols: c.cols,
    lifts: c.lifts,
    baysIn: c.baysIn,
    baysOut: c.baysOut,
    shuttlesPerLevel: c.shuttlesPerLevel,
    ev: Math.round(c.slotMix.ev * 100),
    oversize: Math.round(c.slotMix.oversize * 100),
  };
}

function patchOf(d: Draft): ConfigPatch {
  return {
    levels: d.levels,
    cols: d.cols,
    lifts: d.lifts,
    baysIn: d.baysIn,
    baysOut: d.baysOut,
    shuttlesPerLevel: d.shuttlesPerLevel,
    slotMix: { ev: d.ev / 100, oversize: d.oversize / 100 },
  };
}

export function FacilityForm() {
  const config = useSimStore((s) => s.config);
  const applyFacility = useSimStore((s) => s.applyFacility);
  const [draft, setDraft] = useState<Draft>(() => draftOf(config));
  useEffect(() => setDraft(draftOf(config)), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(config));
  const preview = deriveConfig(config, patchOf(draft));
  const warnings = layout(preview).warnings;
  const set = (k: keyof Draft) => (v: number) => setDraft((d) => ({ ...d, [k]: v }));
  const L = CONFIG_LIMITS;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <NumberField label="Levels" value={draft.levels} min={L.levels.min} max={L.levels.max} onChange={set('levels')} />
        <NumberField label="Columns" value={draft.cols} min={L.cols.min} max={L.cols.max} onChange={set('cols')} />
        <NumberField label="Lifts" value={draft.lifts} min={L.lifts.min} max={L.lifts.max} onChange={set('lifts')} />
        <NumberField label="Shuttles/level" value={draft.shuttlesPerLevel} min={L.shuttlesPerLevel.min} max={L.shuttlesPerLevel.max} onChange={set('shuttlesPerLevel')} />
        <NumberField label="Bays in" value={draft.baysIn} min={L.baysIn.min} max={L.baysIn.max} onChange={set('baysIn')} />
        <NumberField label="Bays out" value={draft.baysOut} min={L.baysOut.min} max={L.baysOut.max} onChange={set('baysOut')} />
      </div>
      <Slider label="EV slots" value={draft.ev} min={L.ev.min * 100} max={L.ev.max * 100} format={(v) => `${v}%`} onChange={set('ev')} />
      <Slider label="Oversize slots" value={draft.oversize} min={L.oversize.min * 100} max={L.oversize.max * 100} format={(v) => `${v}%`} onChange={set('oversize')} />
      <div className="flex items-center gap-2 text-xs text-ink-soft">
        <span>
          <span className="font-mono text-ink">{slotCount(preview)}</span> slots
        </span>
        {dirty && <Badge tone="amber">Restart needed</Badge>}
        <span className="ml-auto flex gap-1">
          {dirty && (
            <Chip onClick={() => setDraft(draftOf(config))} aria-label="Discard changes">
              Discard
            </Chip>
          )}
          <Chip active={dirty} disabled={!dirty} onClick={() => applyFacility(patchOf(draft))}>
            Restart
          </Chip>
        </span>
      </div>
      {warnings.map((w) => (
        <p key={w} className="text-xs text-clay">
          {w}
        </p>
      ))}
    </div>
  );
}
