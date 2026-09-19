'use client';

// SPEC §8 block 2: built-in presets A–D (+ the current custom version), the
// active version's label and note. Picking a preset restarts with the same
// seed (SPEC §5). Saved versions, share and compare arrive in M5.

import { PRESETS, PRESET_IDS, isCustom, versionLabel } from '@/lib/presets';
import { useSimStore } from '@/store/useSimStore';

export function VersionPicker() {
  const config = useSimStore((s) => s.config);
  const setPreset = useSimStore((s) => s.setPreset);
  const custom = isCustom(config);
  const rowClass = (active: boolean) =>
    `flex w-full items-baseline gap-2 border-l-2 px-2 py-1 text-left text-xs transition-colors ${
      active ? 'border-amber text-ink' : 'border-transparent text-ink-soft hover:border-line hover:text-ink'
    }`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col" role="listbox" aria-label="Versions">
        {PRESET_IDS.map((id) => {
          const p = PRESETS[id];
          const active = !custom && config.id === id;
          return (
            <button key={id} type="button" role="option" aria-selected={active} className={rowClass(active)} onClick={() => setPreset(id)}>
              <span className="w-4 font-mono">{id}</span>
              <span>{p.label}</span>
            </button>
          );
        })}
        {custom && (
          <div role="option" aria-selected className={rowClass(true)}>
            <span className="w-4 font-mono">·</span>
            <span>{versionLabel(config)}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-ink-soft">{config.note}</p>
    </div>
  );
}
