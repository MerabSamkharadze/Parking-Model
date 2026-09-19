// The guided tour (lib/story.ts): every caption renders against a live
// snapshot, and the step exit rules — reading time, stage matching,
// timeouts, "parked" — behave as the Story component expects.

import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/lib/presets';
import { PROFILES } from '@/lib/sim/demand';
import { Engine } from '@/lib/sim/engine';
import type { Job } from '@/lib/sim/types';
import { STORY, type StoryContext, type StoryStep, footprint, stepDone } from '@/lib/story';

const cfg = PRESETS.B;

function liveContext(): { ctx: StoryContext; job: Job } {
  const engine = new Engine({ config: cfg, demand: PROFILES.weekday, seed: 7, devChecks: false });
  engine.run(8 * 3600);
  const job = engine.addVehicle('visitor');
  if (!job) throw new Error('bay should be free at 08:00');
  engine.run(5);
  return { ctx: { cfg, snapshot: engine.snapshot(), vehicleId: job.vehicleId, elapsed: 0 }, job };
}

describe('story captions', () => {
  it('render for every step with and without a snapshot', () => {
    const { ctx } = liveContext();
    for (const step of STORY) {
      expect(step.text(ctx).length).toBeGreaterThan(20);
      expect(step.text({ ...ctx, snapshot: null, vehicleId: null }).length).toBeGreaterThan(20);
    }
  });

  it('quote the facility, not constants', () => {
    const { ctx } = liveContext();
    const idea = STORY.find((s) => s.id === 'idea')!.text(ctx);
    expect(idea).toContain('144 cars');
    expect(idea).toContain(`${cfg.levels} levels`);
    const f = footprint(cfg);
    expect(idea).toContain(`${Math.round(f.width)} × ${Math.round(f.depth)} m`);
  });

  it('follow steps come after the spawn and the call step re-follows', () => {
    const spawn = STORY.findIndex((s) => s.enter === 'spawn');
    const call = STORY.findIndex((s) => s.enter === 'call');
    expect(spawn).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(spawn);
    for (const s of STORY.slice(spawn, spawn + 3)) expect(s.camera).toBe('follow');
    expect(STORY[STORY.length - 1].advance).toBe('manual');
  });
});

describe('stepDone', () => {
  const stage = (id: string) => STORY.find((s) => s.id === id)!;
  const withStage = (ctx: StoryContext, s: Job['stage']): StoryContext => ({
    ...ctx,
    snapshot: { ...ctx.snapshot!, jobs: ctx.snapshot!.jobs.map((j) => (j.vehicleId === ctx.vehicleId ? { ...j, stage: s } : j)) },
  });

  it('timed steps end after their duration', () => {
    const problem = stage('problem');
    const ctx = liveContext().ctx;
    expect(stepDone(problem, { ...ctx, elapsed: 8.9 })).toBe(false);
    expect(stepDone(problem, { ...ctx, elapsed: 9 })).toBe(true);
    expect(stepDone(stage('numbers'), { ...ctx, elapsed: 1e6 })).toBe(false);
  });

  it('stage steps wait for the reading time, then the stage, then the timeout', () => {
    const lift = stage('lift');
    const { ctx } = liveContext();
    const inCorridor = withStage(ctx, 'corridor');
    expect(stepDone(lift, { ...inCorridor, elapsed: 1 })).toBe(false); // minSeconds
    expect(stepDone(lift, { ...inCorridor, elapsed: lift.minSeconds! })).toBe(true);
    expect(stepDone(lift, { ...withStage(ctx, 'lift_move'), elapsed: 20 })).toBe(false);
    expect(stepDone(lift, { ...withStage(ctx, 'lift_move'), elapsed: 45 })).toBe(true); // timeout
  });

  it('a missing job (rejected car) moves on after a moment', () => {
    const dropoff = stage('dropoff');
    const { ctx } = liveContext();
    const gone: StoryContext = { ...ctx, vehicleId: 'nobody', elapsed: 2 };
    expect(stepDone(dropoff, gone)).toBe(false);
    expect(stepDone(dropoff, { ...gone, elapsed: 7 })).toBe(true);
  });

  it('the slot step ends once the car is parked', () => {
    const slot = stage('slot');
    const engine = new Engine({ config: cfg, demand: PROFILES.weekday, seed: 7, devChecks: false });
    engine.run(8 * 3600);
    const job = engine.addVehicle('visitor')!;
    engine.run(10);
    const early: StoryContext = { cfg, snapshot: engine.snapshot(), vehicleId: job.vehicleId, elapsed: 10 };
    expect(stepDone(slot, early)).toBe(false);
    engine.run(10 * 60);
    const parked: StoryContext = { cfg, snapshot: engine.snapshot(), vehicleId: job.vehicleId, elapsed: 10 };
    expect(parked.snapshot!.vehicles[job.vehicleId].state).toBe('parked');
    expect(stepDone(slot, parked)).toBe(true);
  });

  it('every stage-driven step has a timeout so the tour cannot stall', () => {
    for (const s of STORY as StoryStep[]) {
      if (s.advance === 'manual' || 'after' in s.advance) continue;
      expect(s.advance.timeout).toBeGreaterThan(0);
      expect(s.advance.timeout).toBeGreaterThan(s.minSeconds ?? 0);
    }
  });
});
