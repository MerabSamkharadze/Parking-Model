import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';

function digest(seed: number, hours: number) {
  const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed });
  e.run(hours * 3600);
  const s = e.snapshot();
  return {
    metrics: s.metrics,
    events: s.events.map((x) => `${x.t.toFixed(1)} ${x.text}`),
    slots: s.slots.map((x) => `${x.key}:${x.state}:${x.vehicleId ?? ''}`).join(','),
  };
}

describe('engine determinism (SPEC §4.1)', () => {
  it('same seed + config → identical metrics, events and slot state', () => {
    const a = digest(42, 8);
    const b = digest(42, 8);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.events).toEqual(b.events);
    expect(a.slots).toEqual(b.slots);
    expect(a.metrics.completedStore).toBeGreaterThan(20);
  });

  it('different seeds → different runs', () => {
    const a = digest(42, 8);
    const b = digest(43, 8);
    expect(a.events).not.toEqual(b.events);
  });
});
