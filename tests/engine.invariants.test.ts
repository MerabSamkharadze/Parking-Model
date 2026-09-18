import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';

describe('collision / booking invariants hold for 24 h (SPEC §4.2)', () => {
  it('preset B, weekday', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42, devChecks: true });
    expect(() => e.run(24 * 3600)).not.toThrow();
    expect(e.metrics().completedStore).toBeGreaterThan(200);
  });

  it('preset B, stress (queues of 80+ cars)', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.stress, seed: 42, devChecks: true });
    expect(() => e.run(24 * 3600)).not.toThrow();
    expect(e.metrics().queueInMax).toBeGreaterThan(40);
  });

  it('preset C (two shuttle zones, four lifts), stress', () => {
    const e = new Engine({ config: PRESETS.C, demand: PROFILES.stress, seed: 7, devChecks: true });
    expect(() => e.run(24 * 3600)).not.toThrow();
    expect(e.metrics().completedRetrieve).toBeGreaterThan(200);
  });

  it('preset A (single lift, single bays), weekday with night defrag and pre-fetch', () => {
    const e = new Engine({ config: { ...PRESETS.A, nightDefrag: true, prefetchLeadMinutes: 10 }, demand: PROFILES.weekday, seed: 3, devChecks: true });
    expect(() => e.run(30 * 3600)).not.toThrow();
    expect(e.metrics().completedShuffle).toBeGreaterThan(0);
  });

  it('no job ever holds a resource after finishing; no vehicle is lost', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42 });
    e.run(24 * 3600);
    const s = e.snapshot();
    for (const r of s.resources) if (r.busyWith) expect(s.jobs.some((j) => j.id === r.busyWith)).toBe(true);
    const parked = s.slots.filter((x) => x.state === 'occupied').length;
    const vehiclesParked = Object.values(s.vehicles).filter((v) => v.state === 'parked').length;
    expect(parked).toBe(vehiclesParked);
  });
});
