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

describe('command edge cases found by the 2026-09-19 audit', () => {
  it('calling a car mid-shuffle keeps its planned departure (it is not stranded)', () => {
    const e = new Engine({ config: { ...PRESETS.B, nightDefrag: true }, demand: PROFILES.weekday, seed: 42, devChecks: true });
    e.run(3 * 3600 + 1); // 03:00 — night defrag creates shuffle jobs
    const shuffle = [...e.activeJobs.values()].find((j) => j.kind === 'shuffle');
    expect(shuffle).toBeDefined();
    const id = shuffle!.vehicleId;
    const planned = e.allVehicles.get(id)!.plannedDeparture!;
    expect(e.callVehicle(id)).toBeNull(); // being moved: the call does not take
    expect(e.allVehicles.get(id)!.plannedDeparture).toBe(planned);
    e.run(9 * 3600); // noon: its habitual morning departure must still have happened
    expect(e.allVehicles.get(id)!.state).toBe('gone');
  });
  it('setFailure with an unknown id is a no-op', () => {
    const e = new Engine({ config: PRESETS.B, demand: quiet, seed: 1, devChecks: true });
    expect(() => e.setFailure('lift', 'lift-Z', true)).not.toThrow();
    expect(() => e.setFailure('shuttle', 'nope', true)).not.toThrow();
    expect(e.metrics().degraded).toBe(false);
  });
  it('one lift with two shuttles per level runs one zone, so no job can wait forever', () => {
    const cfg = { ...PRESETS.B, lifts: 1, shuttlesPerLevel: 2 };
    const e = new Engine({ config: cfg, demand: PROFILES.weekday, seed: 42, devChecks: true });
    e.run(24 * 3600);
    const stuck = [...e.activeJobs.values()].filter((j) => j.stageEndsAt === Infinity && e.t - j.stageStartedAt > 3 * 3600);
    expect(stuck).toEqual([]);
    expect(e.metrics().completedStore).toBeGreaterThan(100);
  });
});
