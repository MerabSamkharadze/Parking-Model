'use client';

// SPEC §8 block 2 / §5: built-in presets A–D, saved custom versions
// (localStorage, max 12), the active version's note, save / share / compare.
// Picking a version restarts with its setup.

import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { PRESETS, PRESET_IDS, isCustom, versionLabel } from '@/lib/presets';
import { useSimStore } from '@/store/useSimStore';
import { CompareSheet } from './CompareSheet';

export function VersionPicker() {
  const config = useSimStore((s) => s.config);
  const setPreset = useSimStore((s) => s.setPreset);
  const versions = useSimStore((s) => s.versions);
  const saveCurrent = useSimStore((s) => s.saveCurrent);
  const deleteSaved = useSimStore((s) => s.deleteSaved);
  const loadSaved = useSimStore((s) => s.loadSaved);
  const shareLink = useSimStore((s) => s.shareLink);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [comparing, setComparing] = useState(false);
  const custom = isCustom(config);
  const activeSaved = versions.find((v) => v.config === config)?.id ?? null;
  const rowClass = (active: boolean) =>
    `flex w-full items-baseline gap-2 border-l-2 px-2 py-1 text-left text-xs transition-colors ${
      active ? 'border-amber text-ink' : 'border-transparent text-ink-soft hover:border-line hover:text-ink'
    }`;

  const share = async () => {
    const url = shareLink();
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false); // the link is shown below for manual copying
    }
  };

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
        {versions.map((v) => {
          const active = activeSaved === v.id;
          return (
            <div key={v.id} className="flex items-stretch">
              <button type="button" role="option" aria-selected={active} className={`${rowClass(active)} min-w-0 flex-1`} onClick={() => loadSaved(v.id)}>
                <span className="w-4 font-mono">·</span>
                <span className="truncate">{v.label}</span>
                <span className="ml-auto font-mono text-[10px] text-ink-soft">from {v.config.derivedFrom ?? v.config.id}</span>
              </button>
              <button type="button" aria-label={`Delete ${v.label}`} className="px-2 text-xs text-ink-soft hover:text-clay" onClick={() => deleteSaved(v.id)}>
                ×
              </button>
            </div>
          );
        })}
        {custom && activeSaved === null && (
          <div role="option" aria-selected className={rowClass(true)}>
            <span className="w-4 font-mono">·</span>
            <span>{versionLabel(config)}</span>
            <span className="ml-auto text-[10px] text-ink-soft">unsaved</span>
          </div>
        )}
      </div>
      <p className="text-xs text-ink-soft">{config.note}</p>
      <div className="flex flex-wrap items-center gap-1">
        {saving ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              saveCurrent(name);
              setSaving(false);
              setName('');
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="version name"
              aria-label="Version name"
              className="w-32 rounded-sm border border-line bg-void px-1.5 py-0.5 text-xs text-ink outline-none placeholder:text-ink-soft focus:border-amber"
            />
            <Chip type="submit" active>
              Save
            </Chip>
            <Chip onClick={() => setSaving(false)}>Cancel</Chip>
          </form>
        ) : (
          <Chip onClick={() => setSaving(true)} title="Save the running setup as a version (this browser)">
            Save as…
          </Chip>
        )}
        <Chip onClick={share}>{copied ? 'Link copied' : 'Share'}</Chip>
        <Chip active={comparing} onClick={() => setComparing((c) => !c)}>
          Compare
        </Chip>
      </div>
      {link && !copied && (
        <input readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-sm border border-line bg-void px-1.5 py-0.5 font-mono text-[11px] text-ink-soft outline-none focus:border-amber" />
      )}
      {comparing && <CompareSheet onClose={() => setComparing(false)} />}
    </div>
  );
}
