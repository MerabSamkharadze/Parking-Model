import { describe, expect, it } from 'vitest';
import { RingStats, RollingRate } from '../lib/sim/metrics.ts';

describe('metrics helpers (SPEC §4.6)', () => {
  it('ring buffer percentiles', () => {
    const r = new RingStats();
    for (let i = 1; i <= 100; i++) r.push(i);
    const p = r.percentiles();
    expect(p.p50).toBe(50);
    expect(p.p90).toBe(90);
    expect(p.p95).toBe(95);
    expect(p.max).toBe(100);
    expect(p.n).toBe(100);
    expect(r.mean()).toBeCloseTo(50.5);
  });

  it('ring buffer keeps only the last 4000 samples', () => {
    const r = new RingStats();
    for (let i = 0; i < 5000; i++) r.push(i);
    expect(r.count).toBe(4000);
    expect(r.quantile(0)).toBe(1000);
    expect(r.percentiles().n).toBe(5000);
  });

  it('rolling rate over a 15-minute window', () => {
    const rate = new RollingRate(900);
    for (let t = 0; t < 900; t += 60) rate.push(t);
    expect(rate.perHour(900)).toBeCloseTo(60);
    expect(rate.perHour(3600)).toBeCloseTo(0);
    expect(rate.peakPerHour).toBeGreaterThanOrEqual(60);
  });
});
