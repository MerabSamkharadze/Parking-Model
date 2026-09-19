import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';

const quiet = {
  ...PROFILES.weekday,
  hourly: PROFILES.weekday.hourly.map((h) => ({ ...h, arrivals: 0 })),
  residents: 0,
  evShare: 0,
  oversizeShare: 0,
};

describe('manual commands and rejects (SPEC §8.5, DECISIONS E11)', () => {
  it('+ car stores a visitor, − retrieve brings it back', () => {
    const e = new Engine({ config: PRESETS.B, demand: quiet, seed: 1, devChecks: true });
    const job = e.addVehicle()!;
    expect(job.kind).toBe('store');
    e.run(180);
    const v = e.allVehicles.get(job.vehicleId)!;
    expect(v.state).toBe('parked');
    expect(v.slotKey).toMatch(/^L1-R[12]-\d\d$/);
    expect(e.slotOf(v.slotKey!).state).toBe('occupied');
    const r = e.callVehicle(v.id)!;
    expect(r.kind).toBe('retrieve');
    e.run(240);
    expect(e.allVehicles.has(v.id)).toBe(false);
    expect(e.metrics().completedRetrieve).toBe(1);
    expect(e.snapshot().events.map((x) => x.kind)).toEqual(expect.arrayContaining(['INSERT', 'SELECT']));
  });

  it('a full facility rejects, and the reject is logged and counted', () => {
    const cfg = { ...PRESETS.A, slotMix: { ev: 0, oversize: 0 } };
    const e = new Engine({ config: cfg, demand: quiet, seed: 1 });
    for (let i = 0; i < 96; i++) e.addVehicle('resident'); // residents stay until the morning
    e.run(4 * 3600);
    expect(e.metrics().occupancy).toBe(1);
    expect(e.addVehicle()).toBeNull();
    expect(e.metrics().rejected).toBe(1);
    expect(e.snapshot().events.at(-1)?.text).toMatch(/^REJECT #\d{4} full$/);
  });

  it('strategy changes apply hot, without a restart', () => {
    const e = new Engine({ config: PRESETS.B, demand: quiet, seed: 1 });
    e.setAllocator('nearest');
    e.setPrefetchLead(5);
    e.setNightDefrag(true);
    expect(e.getStrategy()).toEqual({ allocator: 'nearest', prefetchLeadMinutes: 5, nightDefrag: true });
    const job = e.addVehicle('resident')!;
    e.run(120);
    expect(e.allVehicles.get(job.vehicleId)!.slotKey).toMatch(/^L1-/);
  });
});
