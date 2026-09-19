import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';

describe('snapshot (SPEC §4.1): immutable shallow copies', () => {
  it('unchanged slots keep their identity, changed slots are new objects', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42 });
    e.run(8 * 3600);
    const a = e.snapshot();
    e.run(600);
    const b = e.snapshot();
    let same = 0;
    let changed = 0;
    for (let i = 0; i < a.slots.length; i++) {
      if (a.slots[i] === b.slots[i]) same++;
      else {
        changed++;
        expect(a.slots[i].key).toBe(b.slots[i].key);
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(same).toBeGreaterThan(changed);
    expect(a.slots).not.toBe(b.slots);
  });

  it('mutating a snapshot does not touch the engine', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42 });
    e.run(3600);
    const s = e.snapshot();
    s.slots.length = 0;
    for (const j of s.jobs) j.stage = 'done';
    expect(e.snapshot().slots).toHaveLength(144);
    expect(e.snapshot().jobs.every((j) => j.stage !== 'done')).toBe(true);
  });

  it('jobs carry a 0..1 progress, resources an interpolated position, events ≤ 200', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.stress, seed: 42 });
    e.run(19.2 * 3600);
    const s = e.snapshot();
    expect(s.jobs.length).toBeGreaterThan(5);
    for (const j of s.jobs) {
      expect(j.progress).toBeGreaterThanOrEqual(0);
      expect(j.progress).toBeLessThanOrEqual(1);
    }
    for (const r of s.resources) if (r.kind === 'lift') expect(r.pos).toBeGreaterThanOrEqual(0);
    expect(s.events.length).toBeLessThanOrEqual(200);
    expect(s.events.some((x) => x.text.startsWith('INSERT #'))).toBe(true);
    expect(s.events.some((x) => x.text.startsWith('LOCK WAIT'))).toBe(true);
  });
});
