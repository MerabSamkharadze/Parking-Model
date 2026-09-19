import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { runBench } from '../lib/sim/bench.ts';
import { PROFILES } from '../lib/sim/demand.ts';

const within = (value: number, target: number, tol = 0.15) => {
  expect(value).toBeGreaterThanOrEqual(target * (1 - tol));
  expect(value).toBeLessThanOrEqual(target * (1 + tol));
};

describe('derived figures match SPEC §2 within ±15% (preset B, seed 42, 24 h)', () => {
  const r = runBench({ config: PRESETS.B, demand: PROFILES.weekday, hours: 24, seed: 42 });

  it('store time P50 ≈ 55 s', () => within(r.summary.storeP50, 55));
  it('retrieve time P50 ≈ 50 s', () => within(r.summary.retrieveP50, 50));
  it('lift cycle ≈ 25–32 s', () => {
    expect(r.summary.liftCycleMean).toBeGreaterThanOrEqual(25 * 0.85);
    expect(r.summary.liftCycleMean).toBeLessThanOrEqual(32 * 1.15);
    expect(r.summary.liftCycleP50).toBeGreaterThanOrEqual(25);
    expect(r.summary.liftCycleP50).toBeLessThanOrEqual(32 * 1.05);
  });
  it('lift capacity ≈ 2 × 110 = 220 movements/h', () => within(r.summary.liftCapacityPerHour, 220));
  it('preset A: one lift ≈ 110 movements/h', () => {
    const a = runBench({ config: PRESETS.A, demand: PROFILES.weekday, hours: 24, seed: 42 });
    within(a.summary.liftCapacityPerHour, 110);
  });
  it('the whole day runs in seconds, not minutes (a loose bound: the machine may be busy)', () => {
    expect(r.elapsedMs).toBeLessThan(15000);
  });
});

describe('pre-fetch (SPEC §2/§4.5): retrieve P50 drops to 0–15 s without hurting the lifts', () => {
  it('lead 10 min', () => {
    const base = runBench({ config: PRESETS.B, demand: PROFILES.weekday, hours: 24, seed: 42 });
    const pre = runBench({ config: { ...PRESETS.B, prefetchLeadMinutes: 10 }, demand: PROFILES.weekday, hours: 24, seed: 42 });
    expect(pre.summary.retrieveP50).toBeLessThanOrEqual(15);
    expect(pre.summary.retrieveP50).toBeLessThan(base.summary.retrieveP50 / 2);
    within(pre.summary.liftCapacityPerHour, base.summary.liftCapacityPerHour, 0.05);
  });
});
