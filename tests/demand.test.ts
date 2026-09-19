import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { DemandGenerator, PROFILES, scaledResidents } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';
import { mulberry32 } from '../lib/sim/prng.ts';

describe('demand model (SPEC §4.3, DECISIONS E7–E9)', () => {
  it('visitor arrivals over a day ≈ the hourly table (Poisson thinning)', () => {
    const g = new DemandGenerator(PROFILES.weekday, PRESETS.B, mulberry32(5));
    let n = 0;
    for (let tick = 0; tick < 24 * 36000; tick++) n += g.arrivalsThisTick((tick * 0.1) % 86400, 0.1);
    const expected = PROFILES.weekday.hourly.reduce((a, h) => a + h.arrivals, 0);
    expect(n).toBeGreaterThan(expected * 0.8);
    expect(n).toBeLessThan(expected * 1.2);
  });

  it('residents scale with the facility and never exceed it', () => {
    expect(scaledResidents(PROFILES.weekday, PRESETS.B)).toBe(96);
    expect(scaledResidents(PROFILES.weekday, PRESETS.A)).toBe(64);
    expect(scaledResidents(PROFILES.weekday, PRESETS.C)).toBe(213);
  });

  it('weekday: residents leave in the morning peak and come back in the evening', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42 });
    const occ = (h: number) => {
      e.run(h * 3600 - e.t);
      return e.metrics().occupancy;
    };
    const night = occ(6);
    const midday = occ(12);
    const evening = occ(22);
    expect(night).toBeGreaterThan(0.6);
    expect(midday).toBeLessThan(night - 0.3);
    expect(evening).toBeGreaterThan(midday + 0.3);
  });

  it('stress: everyone returns around 19:00 and a queue forms', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.stress, seed: 42 });
    e.run(18.5 * 3600);
    expect(e.metrics().queueInMax).toBe(0);
    e.run(1.5 * 3600);
    expect(e.metrics().queueInMax).toBeGreaterThan(40);
  });
});
