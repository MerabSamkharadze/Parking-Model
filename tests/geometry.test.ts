import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import {
  SLAB_THICKNESS,
  bounds,
  corridorDistance,
  layout,
  levelY,
  parseSlotKey,
  rowZ,
  slotCount,
  slotKey,
  slotX,
  zoneOfCol,
  zoneShafts,
} from '../lib/geometry.ts';

describe('geometry (SPEC §2/§9, DECISIONS E2/E3/S3)', () => {
  it('preset B matches the §2 numbers', () => {
    const B = PRESETS.B;
    expect(slotCount(B)).toBe(144);
    const lay = layout(B);
    expect(lay.shafts.map((s) => [s.id, s.x])).toEqual([
      ['W', -18.5],
      ['E', 18.5],
    ]);
    expect(rowZ(B, 0)).toBeCloseTo(-4.4);
    expect(rowZ(B, 1)).toBeCloseTo(4.4);
    expect(levelY(B, 0)).toBeCloseTo(-(1.9 + SLAB_THICKNESS)); // clear height + slab (DECISIONS S39)
    expect(levelY(B, 5)).toBeCloseTo(-6 * (1.9 + SLAB_THICKNESS));
    expect(slotX(B, 0)).toBeCloseTo(-14.3);
    expect(slotX(B, 11)).toBeCloseTo(14.3);
    expect(corridorDistance(B, 0, 0)).toBeCloseTo(4.2);
    expect(bounds(B).minZ).toBeCloseTo(-7);
  });

  it('slot keys are 1-based with a 2-digit column and round-trip', () => {
    expect(slotKey({ level: 0, row: 0, col: 0 })).toBe('L1-R1-01');
    expect(slotKey({ level: 2, row: 1, col: 6 })).toBe('L3-R2-07');
    expect(slotKey({ level: 5, row: 1, col: 11 })).toBe('L6-R2-12');
    expect(parseSlotKey('L3-R2-07')).toEqual({ level: 2, row: 1, col: 6 });
  });

  it('preset C splits the corridor into two zones with two shafts each', () => {
    const C = PRESETS.C;
    const lay = layout(C);
    expect(slotCount(C)).toBe(320);
    expect(lay.zones).toBe(2);
    expect(lay.shafts.map((s) => s.id)).toEqual(['W', 'E', 'M1', 'M2']);
    expect(zoneShafts(C, 0).map((s) => s.id)).toEqual(['W', 'M1']);
    expect(zoneShafts(C, 1).map((s) => s.id)).toEqual(['E', 'M2']);
    expect(zoneOfCol(C, 9)).toBe(0);
    expect(zoneOfCol(C, 10)).toBe(1);
    // the gap holds both middle shafts and columns never overlap a shaft
    for (const s of lay.shafts) {
      for (let col = 0; col < C.cols; col++) expect(Math.abs(slotX(C, col) - s.x)).toBeGreaterThan(2.9 + 1.3 - 1e-9);
    }
    expect(lay.warnings).toEqual([]);
  });

  it('warns when more lifts are requested than the zones can host', () => {
    const cfg = { ...PRESETS.B, lifts: 4 };
    expect(layout(cfg).shafts).toHaveLength(2);
    expect(layout(cfg).warnings[0]).toMatch(/only 2 of 4 lifts/);
  });
});
