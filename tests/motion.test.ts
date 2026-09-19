// Scene placement (components/scene/motion.ts) against a real engine run:
// every drawn car is somewhere sensible, and positions are continuous inside
// a stage and across stage changes (the lift/shuttle/slot hand-offs meet).

import { describe, expect, it } from 'vitest';
import { POOL_SIZE, newPlacements, placeJob, placeVehicles, progressAt, slidingSlots } from '@/components/scene/motion';
import { bounds, layout } from '@/lib/geometry';
import { PRESETS } from '@/lib/presets';
import { PROFILES } from '@/lib/sim/demand';
import { Engine, TICK } from '@/lib/sim/engine';
import type { Job, Resource } from '@/lib/sim/types';

const cfg = PRESETS.B;

function index(resources: Resource[]): Map<string, Resource> {
  return new Map(resources.map((r) => [r.id, r]));
}

describe('progressAt', () => {
  const base: Job = {
    id: 'j',
    kind: 'store',
    vehicleId: '#1',
    slotKey: 'L1-R1-01',
    fromSlotKey: null,
    stage: 'bay',
    stageStartedAt: 100,
    stageEndsAt: 110,
    createdAt: 0,
    callAt: 0,
    finishedAt: null,
    resources: {},
    bay: null,
    progress: 0,
    priority: 1,
    prefetch: false,
    frozen: false,
  };
  it('interpolates and clamps', () => {
    expect(progressAt(base, 105)).toBeCloseTo(0.5);
    expect(progressAt(base, 90)).toBe(0);
    expect(progressAt(base, 200)).toBe(1);
  });
  it('is 0 while waiting for a resource', () => {
    expect(progressAt({ ...base, stageEndsAt: Infinity }, 1e9)).toBe(0);
  });
});

describe('placements over a morning (preset B, weekday)', () => {
  const engine = new Engine({ config: cfg, demand: PROFILES.weekday, seed: 42, devChecks: false });
  const b = bounds(cfg);
  const shaftXs = layout(cfg).shafts.map((s) => s.x);
  const SAMPLE_TICKS = 20; // 2 sim-seconds
  const MAX_STEP = 6; // metres per sample, any carrier
  // surface transfers may cross the deck (a W lift feeding the east output bays, DECISIONS E1)
  const MAX_TRANSFER_STEP = 12;
  const out = newPlacements(POOL_SIZE);
  const last = new Map<string, { stage: string; x: number; y: number; z: number }>();
  const stagesSeen = new Set<string>();
  let drawnMax = 0;
  let jumps = 0;

  it('keeps every car in bounds and continuous through 09:00', () => {
    const until = 9 * 3600;
    while (engine.t < until) {
      for (let i = 0; i < SAMPLE_TICKS; i++) engine.step();
      const snap = engine.snapshot();
      const res = index(snap.resources);
      const t = snap.t + TICK * 0.5; // the render clock runs inside the tick
      const n = placeVehicles(cfg, snap, res, t, out);
      drawnMax = Math.max(drawnMax, n);
      expect(n).toBeLessThanOrEqual(POOL_SIZE);
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        const p = out[i];
        seen.add(p.jobId);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
        expect(p.y).toBeGreaterThanOrEqual(b.minY - 0.5);
        expect(p.y).toBeLessThanOrEqual(0.5);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(b.maxZ + 8);
        const job = snap.jobs.find((j) => j.id === p.jobId)!;
        stagesSeen.add(`${job.kind}:${job.stage}`);
        if (job.stage === 'lift_move' || job.stage === 'lift_up' || job.stage === 'bay_wait') {
          expect(shaftXs.some((x) => Math.abs(x - p.x) < 1e-6)).toBe(true);
        }
        const prev = last.get(p.jobId);
        if (prev && prev.stage !== 'queued') {
          const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
          const limit = job.stage === 'to_lift' || job.stage === 'bay_out' ? MAX_TRANSFER_STEP : MAX_STEP;
          if (d > limit) jumps++;
          expect(d, `${job.kind} ${prev.stage} → ${job.stage} jumped ${d.toFixed(1)} m`).toBeLessThanOrEqual(limit);
        }
        last.set(p.jobId, { stage: job.stage, x: p.x, y: p.y, z: p.z });
      }
      for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
      for (const key of slidingSlots(snap)) expect(snap.slots.some((s) => s.key === key)).toBe(true);
    }
    expect(jumps).toBe(0);
    expect(drawnMax).toBeGreaterThan(0);
    // the morning covers arrivals, departures and the 03:00 defrag
    for (const stage of ['store:bay', 'store:to_lift', 'store:lift_move', 'store:handover', 'store:corridor', 'store:insert', 'retrieve:extract', 'retrieve:lift_up', 'retrieve:bay_out', 'retrieve:pickup']) {
      expect(stagesSeen.has(stage), stage).toBe(true);
    }
  });

  it('never draws a parked car twice: sliding slots are pads, others keep their block', () => {
    const snap = engine.snapshot();
    const sliding = slidingSlots(snap);
    for (const job of snap.jobs) {
      if (job.stage === 'insert' || job.stage === 'extract') {
        const key = job.stage === 'extract' && job.kind === 'shuffle' && job.fromSlotKey ? job.fromSlotKey : job.slotKey;
        expect(sliding.has(key)).toBe(true);
      }
    }
  });

  it('placeJob leaves parked and queued cars to the field', () => {
    const snap = engine.snapshot();
    const res = index(snap.resources);
    const p = newPlacements(1)[0];
    for (const job of snap.jobs) {
      if (job.stage === 'queued' || job.stage === 'done') expect(placeJob({ cfg, resources: res, t: snap.t }, job, p)).toBe(false);
    }
  });
});
