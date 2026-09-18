// Allocation strategies — SPEC §4.4, DECISIONS E10–E12, S9.
// Interface: (slots, vehicle, ctx) => Slot | null. All strategies share the
// same constraint filter; they only differ in how they rank the candidates.

import { corridorDistance, hotLevels, zoneOfCol, zoneShafts } from '../geometry.ts';
import type { AllocatorName, FacilityConfig, Slot, SlotClass, Vehicle } from './types.ts';

export interface AllocContext {
  cfg: FacilityConfig;
  /** Levels whose shuttle is down (avoid for new stores). */
  blockedLevels: ReadonlySet<number>;
  /** Pending + active work on a level's shuttles (balanced strategy). */
  shuttleLoad: (level: number) => number;
}

export type Allocator = (slots: readonly Slot[], v: Vehicle, ctx: AllocContext) => Slot | null;

/** Slot classes a vehicle may use, in order of preference (E10). */
export function compatibleClasses(cls: SlotClass): SlotClass[] {
  if (cls === 'ev') return ['ev'];
  if (cls === 'oversize') return ['oversize'];
  return ['standard', 'ev', 'oversize'];
}

/** Seconds-based distance cost: level × lift time + columns × (pitch / shuttle speed). */
export function nearestCost(cfg: FacilityConfig, s: Slot): number {
  const w1 = cfg.timings.liftPerLevel;
  const w2 = cfg.pitch / cfg.timings.shuttleSpeed;
  const zone = zoneOfCol(cfg, s.id.col);
  let best = Infinity;
  for (const sh of zoneShafts(cfg, zone)) {
    best = Math.min(best, corridorDistance(cfg, sh.index, s.id.col) / cfg.pitch);
  }
  if (!Number.isFinite(best)) best = s.id.col;
  return (s.id.level + 1) * w1 + best * w2;
}

function candidates(slots: readonly Slot[], v: Vehicle, ctx: AllocContext): Slot[] {
  const out: Slot[] = [];
  for (const s of slots) {
    if (s.state !== 'free' || ctx.blockedLevels.has(s.id.level)) continue;
    out.push(s);
  }
  return out;
}

/** Pick the lowest-cost slot, honouring class preference order first. */
function pickByCost(cands: Slot[], v: Vehicle, cost: (s: Slot) => number): Slot | null {
  const order = compatibleClasses(v.cls);
  for (const cls of order) {
    let best: Slot | null = null;
    let bestCost = Infinity;
    for (const s of cands) {
      if (s.cls !== cls) continue;
      const c = cost(s);
      if (c < bestCost || (c === bestCost && best && (s.id.level < best.id.level || (s.id.level === best.id.level && s.id.col < best.id.col)))) {
        best = s;
        bestCost = c;
      }
    }
    if (best) return best;
  }
  return null;
}

const nearest: Allocator = (slots, v, ctx) => pickByCost(candidates(slots, v, ctx), v, (s) => nearestCost(ctx.cfg, s));

const zoned: Allocator = (slots, v, ctx) => {
  const all = candidates(slots, v, ctx);
  const wantHot = v.tenant === 'visitor';
  const preferred = all.filter((s) => (s.zone === 'hot') === wantHot);
  const inZone = pickByCost(preferred, v, (s) => nearestCost(ctx.cfg, s));
  if (inZone) return inZone;
  // E11: spill to the other zone rather than reject.
  return pickByCost(all, v, (s) => nearestCost(ctx.cfg, s));
};

const balanced: Allocator = (slots, v, ctx) => {
  const all = candidates(slots, v, ctx);
  return pickByCost(all, v, (s) => ctx.shuttleLoad(s.id.level) * 1000 + nearestCost(ctx.cfg, s));
};

const dwellAware: Allocator = (slots, v, ctx) => {
  const all = candidates(slots, v, ctx);
  const { cfg } = ctx;
  // Short stays go up, long stays go down: target level grows with the dwell.
  const share = Math.min(1, Math.max(0, v.dwellTarget / (12 * 3600)));
  const target = Math.round(share * (cfg.levels - 1));
  const w1 = cfg.timings.liftPerLevel;
  return pickByCost(all, v, (s) => Math.abs(s.id.level - target) * w1 * 3 + nearestCost(cfg, s));
};

export const ALLOCATORS: Record<AllocatorName, Allocator> = {
  nearest,
  zoned,
  balanced,
  'dwell-aware': dwellAware,
};

export function isHotLevel(cfg: FacilityConfig, level: number): boolean {
  return level < hotLevels(cfg);
}
