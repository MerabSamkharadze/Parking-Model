import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { ResourceManager } from '../lib/sim/resources.ts';

describe('resource manager (SPEC §4.2)', () => {
  it('grants are all-or-nothing and follow priority, then FIFO', () => {
    const rm = new ResourceManager(PRESETS.A); // 1 lift, 1+1 bays
    rm.request({ jobId: 'low', wants: [{ kind: 'bay_in' }, { kind: 'lift' }], priority: 2, createdAt: 0 });
    rm.request({ jobId: 'high', wants: [{ kind: 'lift' }], priority: 0, createdAt: 1 });
    rm.request({ jobId: 'mid', wants: [{ kind: 'bay_in' }], priority: 1, createdAt: 2 });
    const grants = rm.process(2).map((g) => g.jobId);
    // high takes the lift; low cannot get lift+bay together; mid gets the bay
    expect(grants).toEqual(['high', 'mid']);
    expect(rm.get('lift-W').busyWith).toBe('high');
    expect(rm.get('in-1').busyWith).toBe('mid');
    rm.release('lift-W', 10);
    expect(rm.process(10)).toEqual([]);
    rm.release('in-1', 20);
    expect(rm.process(20).map((g) => g.jobId)).toEqual(['low']);
  });

  it('minFreeAfter keeps a bay for on-demand retrieves', () => {
    const rm = new ResourceManager(PRESETS.B); // 3 output bays
    rm.request({ jobId: 'p1', wants: [{ kind: 'bay_out' }], priority: 2, createdAt: 0, minFreeAfter: 1 });
    rm.request({ jobId: 'p2', wants: [{ kind: 'bay_out' }], priority: 2, createdAt: 0, minFreeAfter: 1 });
    rm.request({ jobId: 'p3', wants: [{ kind: 'bay_out' }], priority: 2, createdAt: 0, minFreeAfter: 1 });
    expect(rm.process(0).map((g) => g.jobId)).toEqual(['p1', 'p2']);
    rm.request({ jobId: 'demand', wants: [{ kind: 'bay_out' }], priority: 0, createdAt: 1 });
    expect(rm.process(1).map((g) => g.jobId)).toEqual(['demand']);
  });

  it('moves interpolate linearly and can be re-commanded mid-way', () => {
    const rm = new ResourceManager(PRESETS.B);
    const lift = rm.get('lift-W');
    const end = rm.moveTo(lift, 4, 0); // 4 levels: 4×2.2 + 3 = 11.8 s
    expect(end).toBeCloseTo(11.8);
    expect(rm.positionOf(lift, 5.9)).toBeCloseTo(2);
    const end2 = rm.moveTo(lift, 0, 5.9); // back up from level 2
    expect(end2).toBeCloseTo(5.9 + 2 * 2.2 + 3);
    expect(rm.positionOf(lift, 100)).toBe(0);
  });

  it('utilisation is a rolling 15-minute share', () => {
    const rm = new ResourceManager(PRESETS.B);
    rm.request({ jobId: 'j', wants: [{ kind: 'lift' }], priority: 0, createdAt: 0 });
    rm.process(0);
    for (let t = 0.1; t <= 450; t = Math.round((t + 0.1) * 10) / 10) rm.account(t, 0.1);
    expect(rm.utilization(rm.get('lift-W'), 450)).toBeCloseTo(1, 1);
    rm.release('lift-W', 450);
    for (let t = 450.1; t <= 900; t = Math.round((t + 0.1) * 10) / 10) rm.account(t, 0.1);
    expect(rm.utilization(rm.get('lift-W'), 900)).toBeCloseTo(0.5, 1);
  });
});
