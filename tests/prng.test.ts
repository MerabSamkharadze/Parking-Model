import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../lib/sim/prng.ts';

describe('prng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    const sc = Array.from({ length: 20 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('stays in range and jitters within ±12%', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const j = r.jitter(100, 0.12);
      expect(j).toBeGreaterThanOrEqual(88);
      expect(j).toBeLessThanOrEqual(112);
    }
  });

  it('never draws a zero-weight index', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 2000; i++) expect([1, 3]).toContain(r.weightedIndex([0, 5, 0, 1, 0]));
  });
});
