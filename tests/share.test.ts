// Share links and saved versions (SPEC §5): a URL restores the exact setup,
// storage failures never break the app, at most 12 versions are kept.

import { describe, expect, it } from 'vitest';
import { MAX_VERSIONS, decodeSetup, deleteVersion, encodeSetup, loadVersions, saveVersion, shareUrl, type Setup, type StorageLike } from '@/lib/share';
import { PRESETS, deriveConfig } from '@/lib/presets';
import { PROFILES } from '@/lib/sim/demand';
import { Engine } from '@/lib/sim/engine';

function memoryStorage(fail = false): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (fail ? (() => { throw new Error('blocked'); })() : (data.get(k) ?? null)),
    setItem: (k, v) => {
      if (fail) throw new Error('quota');
      data.set(k, v);
    },
  };
}

const custom: Setup = {
  config: deriveConfig(PRESETS.B, { lifts: 1, baysIn: 5, slotMix: { ev: 0.25, oversize: 0.04 }, allocator: 'dwell-aware', prefetchLeadMinutes: 7 }),
  demandName: 'stress',
  residents: 120,
  seed: 7,
};

describe('share link', () => {
  it('uses the short form for an untouched preset', () => {
    const v = encodeSetup({ config: PRESETS.C, demandName: 'weekday', residents: PROFILES.weekday.residents, seed: 42 });
    expect(v).toBe('C');
    expect(decodeSetup('C')?.config).toBe(PRESETS.C);
  });

  it('round-trips a custom setup exactly and restores the same simulation', () => {
    const encoded = encodeSetup(custom);
    expect(encoded).not.toMatch(/[+/=]/); // base64url, safe in a query string
    const back = decodeSetup(encoded)!;
    expect(back.config).toEqual(custom.config);
    expect(back.demandName).toBe('stress');
    expect(back.residents).toBe(120);
    expect(back.seed).toBe(7);
    const a = new Engine({ config: custom.config, demand: { ...PROFILES.stress, residents: 120 }, seed: 7, devChecks: false });
    const b = new Engine({ config: back.config, demand: { ...PROFILES[back.demandName], residents: back.residents }, seed: back.seed, devChecks: false });
    a.run(2 * 3600);
    b.run(2 * 3600);
    expect(b.snapshot().metrics).toEqual(a.snapshot().metrics);
    const url = shareUrl(custom, 'https://example.test/app?x=1#frag');
    expect(new URL(url).searchParams.get('v')).toBe(encoded);
  });

  it('rejects garbage', () => {
    expect(decodeSetup(null)).toBeNull();
    expect(decodeSetup('')).toBeNull();
    expect(decodeSetup('not-base64!!')).toBeNull();
    expect(decodeSetup(btoa('{"v":1,"config":{"id":"x"}}'))).toBeNull();
    expect(decodeSetup(btoa('[1,2,3]'))).toBeNull();
  });
});

describe('saved versions', () => {
  it('saves newest first, replaces by label, keeps at most 12', () => {
    const storage = memoryStorage();
    let list = loadVersions(storage);
    expect(list).toEqual([]);
    for (let i = 0; i < 15; i++) list = saveVersion(storage, list, custom, `v${i}`, 1000 + i);
    expect(list).toHaveLength(MAX_VERSIONS);
    expect(list[0].label).toBe('v14');
    expect(list[0].config.label).toBe('v14');
    list = saveVersion(storage, list, custom, 'v14', 5000);
    expect(list.filter((v) => v.label === 'v14')).toHaveLength(1);
    expect(loadVersions(storage)).toEqual(list);
    const id = list[3].id;
    list = deleteVersion(storage, list, id);
    expect(list.find((v) => v.id === id)).toBeUndefined();
    expect(loadVersions(storage)).toHaveLength(MAX_VERSIONS - 1);
  });

  it('survives a blocked or full storage', () => {
    const storage = memoryStorage(true);
    expect(loadVersions(storage)).toEqual([]);
    const list = saveVersion(storage, [], custom, 'x');
    expect(list).toHaveLength(1); // kept in memory for the session
    expect(loadVersions(null)).toEqual([]);
  });

  it('ignores corrupt entries', () => {
    const storage = memoryStorage();
    storage.setItem('avp.versions.v1', JSON.stringify([{ id: 'a', config: { id: 'nope' } }, null, 5]));
    expect(loadVersions(storage)).toEqual([]);
    storage.setItem('avp.versions.v1', '{not json');
    expect(loadVersions(storage)).toEqual([]);
  });
});
