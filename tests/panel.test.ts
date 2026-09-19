// Pure pieces behind the control panel (SPEC §5, §8): per-minute history,
// custom-version derivation and formatting.

import { describe, expect, it } from 'vitest';
import { clockOf, durationOf } from '@/lib/format';
import { History, MINUTES_PER_DAY } from '@/lib/history';
import { CONFIG_LIMITS, PRESETS, deriveConfig, isCustom, versionLabel } from '@/lib/presets';
import { layout } from '@/lib/geometry';
import { PROFILES } from '@/lib/sim/demand';
import { Engine } from '@/lib/sim/engine';

describe('History (sparklines + timeline)', () => {
  it('samples once per sim-minute and keeps a day in a ring', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42, devChecks: false });
    const h = new History();
    expect(h.sample(e.snapshot())).toBe(true);
    expect(h.sample(e.snapshot())).toBe(false); // same minute
    e.run(59);
    expect(h.sample(e.snapshot())).toBe(false);
    e.run(1);
    expect(h.sample(e.snapshot())).toBe(true);
    expect(h.head).toBe(1);
    expect(h.version).toBe(2);
    e.run(7 * 3600);
    let samples = 0;
    for (let i = 0; i < 60; i++) {
      e.run(60);
      if (h.sample(e.snapshot())) samples++;
    }
    expect(samples).toBe(60);
    expect(h.head).toBe(Math.floor(e.t / 60) % MINUTES_PER_DAY);
    const recent = h.recent('occupancy', 5);
    expect(recent).toHaveLength(5);
    expect(recent.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(h.occupancy[h.head])).toBe(true);
    expect(Number.isNaN(h.occupancy[h.head + 1])).toBe(true); // not reached today
    h.clear();
    expect(h.head).toBe(-1);
    expect(h.recent('queue', 3).every(Number.isNaN)).toBe(true);
  });
});

describe('custom versions (SPEC §5)', () => {
  it('derives a custom config from a preset and keeps the origin', () => {
    const c1 = deriveConfig(PRESETS.B, { lifts: 1, slotMix: { ev: 0.2, oversize: 0.04 } });
    expect(isCustom(c1)).toBe(true);
    expect(c1.derivedFrom).toBe('B');
    expect(c1.lifts).toBe(1);
    expect(c1.slotMix.ev).toBeCloseTo(0.2);
    expect(c1.levels).toBe(PRESETS.B.levels);
    const c2 = deriveConfig(c1, { allocator: 'nearest' });
    expect(c2.derivedFrom).toBe('B');
    expect(c2.lifts).toBe(1);
    expect(versionLabel(c2)).toBe('Custom · from B');
    expect(versionLabel(PRESETS.C)).toBe('C · High throughput');
    expect(isCustom(PRESETS.A)).toBe(false);
  });

  it('every value inside the form limits produces a valid layout', () => {
    const L = CONFIG_LIMITS;
    for (const shuttles of [L.shuttlesPerLevel.min, L.shuttlesPerLevel.max]) {
      for (const lifts of [L.lifts.min, L.lifts.max]) {
        const cfg = deriveConfig(PRESETS.B, { shuttlesPerLevel: shuttles, lifts, cols: L.cols.min, levels: L.levels.max });
        const lay = layout(cfg);
        expect(lay.shafts.length).toBeGreaterThanOrEqual(1);
        expect(lay.shafts.length).toBeLessThanOrEqual(lifts);
        const e = new Engine({ config: cfg, demand: PROFILES.weekday, seed: 1, devChecks: true });
        e.run(1800);
        expect(e.snapshot().warnings.length === 0 || lifts > 2 + 2 * (shuttles - 1)).toBe(true);
      }
    }
  });
});

describe('format', () => {
  it('clock and durations', () => {
    expect(clockOf(0)).toBe('00:00');
    expect(clockOf(7 * 3600 + 32 * 60 + 5)).toBe('07:32');
    expect(clockOf(7 * 3600 + 32 * 60 + 5, true)).toBe('07:32:05');
    expect(clockOf(86400 + 60)).toBe('00:01');
    expect(durationOf(54.21)).toBe('54.2s');
    expect(durationOf(192)).toBe('3m 12s');
    expect(durationOf(2 * 3600 + 5 * 60)).toBe('2h 05m');
    expect(durationOf(NaN)).toBe('—');
  });
});
