import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { ALLOCATORS, nearestCost, type AllocContext } from '../lib/sim/allocator.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';
import type { Slot, Vehicle } from '../lib/sim/types.ts';

function freshSlots(): Slot[] {
  // an engine with no residents gives an empty, correctly classed slot field
  const e = new Engine({ config: PRESETS.B, demand: { ...PROFILES.weekday, residents: 0 }, seed: 1 });
  return e.slotList.slice();
}

function vehicle(over: Partial<Vehicle>): Vehicle {
  return {
    id: '#0001',
    plate: 'AA-111-BB',
    profile: { length: 4.5, width: 1.8, height: 1.5, ev: false },
    cls: 'standard',
    tenant: 'visitor',
    slotKey: null,
    state: 'arriving',
    arrivedAt: 0,
    dwellTarget: 3600,
    plannedDeparture: null,
    habitualDeparture: null,
    ...over,
  };
}

const ctx: AllocContext = { cfg: PRESETS.B, blockedLevels: new Set(), shuttleLoad: () => 0 };

describe('allocators (SPEC §4.4, DECISIONS E10–E12)', () => {
  it('zoned: visitors go to the hot zone, residents to the cold zone', () => {
    const slots = freshSlots();
    const v = ALLOCATORS.zoned(slots, vehicle({ tenant: 'visitor' }), ctx)!;
    const r = ALLOCATORS.zoned(slots, vehicle({ tenant: 'resident' }), ctx)!;
    expect(v.zone).toBe('hot');
    expect(v.id.level).toBe(0);
    expect(r.zone).toBe('cold');
    expect(r.id.level).toBe(2);
  });

  it('EV and oversize cars only take their own class; standard cars prefer standard slots', () => {
    const slots = freshSlots();
    expect(ALLOCATORS.nearest(slots, vehicle({ cls: 'ev' }), ctx)!.cls).toBe('ev');
    expect(ALLOCATORS.nearest(slots, vehicle({ cls: 'oversize' }), ctx)!.cls).toBe('oversize');
    expect(ALLOCATORS.nearest(slots, vehicle({ cls: 'standard' }), ctx)!.cls).toBe('standard');
    const noEv = slots.map((s) => (s.cls === 'ev' ? { ...s, state: 'occupied' as const, vehicleId: '#x' } : s));
    expect(ALLOCATORS.nearest(noEv, vehicle({ cls: 'ev' }), ctx)).toBeNull();
  });

  it('nearest: lowest time cost first, ties broken by level then column', () => {
    const slots = freshSlots();
    const pick = ALLOCATORS.nearest(slots, vehicle({}), ctx)!;
    const cheapest = Math.min(...slots.filter((s) => s.cls === 'standard').map((s) => nearestCost(PRESETS.B, s)));
    expect(nearestCost(PRESETS.B, pick)).toBe(cheapest);
    expect(pick.id.level).toBe(0);
  });

  it('balanced avoids a loaded level; blocked levels are never used', () => {
    const slots = freshSlots();
    const loaded: AllocContext = { ...ctx, shuttleLoad: (level) => (level === 0 ? 5 : 0) };
    expect(ALLOCATORS.balanced(slots, vehicle({}), loaded)!.id.level).toBe(1);
    const blocked: AllocContext = { ...ctx, blockedLevels: new Set([0, 1]) };
    expect(ALLOCATORS.nearest(slots, vehicle({}), blocked)!.id.level).toBe(2);
  });

  it('dwell-aware sends short stays up and long stays down', () => {
    const slots = freshSlots();
    const short = ALLOCATORS['dwell-aware'](slots, vehicle({ dwellTarget: 30 * 60 }), ctx)!;
    const long = ALLOCATORS['dwell-aware'](slots, vehicle({ dwellTarget: 14 * 3600 }), ctx)!;
    expect(short.id.level).toBe(0);
    expect(long.id.level).toBe(5);
  });
});
