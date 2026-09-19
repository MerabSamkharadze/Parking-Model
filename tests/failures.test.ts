import { describe, expect, it } from 'vitest';
import { PRESETS } from '../lib/presets.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { Engine } from '../lib/sim/engine.ts';

describe('failure injection (SPEC §4.5, DECISIONS E15)', () => {
  it('lift down: the other lift carries the traffic, the failed one stays idle', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42, devChecks: true });
    e.run(8 * 3600);
    e.setFailure('lift', 'lift-W', true);
    const before = e.metrics().completedStore + e.metrics().completedRetrieve;
    const busyBefore = e.resourceManager.get('lift-W').busySeconds;
    e.run(2 * 3600);
    const after = e.metrics().completedStore + e.metrics().completedRetrieve;
    expect(after).toBeGreaterThan(before + 20);
    expect(e.metrics().degraded).toBe(true);
    // the failed lift may only hold a job that was already on it; it does no new work
    expect(e.resourceManager.get('lift-W').busySeconds - busyBefore).toBeLessThan(60);
    expect(e.snapshot().events.some((x) => x.kind === 'FAIL')).toBe(true);
    e.setFailure('lift', 'lift-W', false);
    e.run(3600);
    expect(e.metrics().degraded).toBe(false);
    expect(e.resourceManager.get('lift-W').busySeconds - busyBefore).toBeGreaterThan(60);
  });

  it('power loss freezes every job in its stage; recovery resumes exactly there', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42, devChecks: true });
    e.run(8 * 3600 + 600);
    e.setFailure('power', null, true);
    const stagesBefore = new Map([...e.activeJobs.values()].map((j) => [j.id, j.stage]));
    const completedBefore = e.metrics().completedStore + e.metrics().completedRetrieve;
    const tBefore = e.t;
    e.run(600);
    expect(e.t).toBeCloseTo(tBefore + 600, 3);
    for (const [id, stage] of stagesBefore) expect(e.activeJobs.get(id)?.stage).toBe(stage);
    expect(e.metrics().completedStore + e.metrics().completedRetrieve).toBe(completedBefore);
    expect(e.metrics().queueIn + e.metrics().queueOut).toBeGreaterThan(0);
    e.recoverAll();
    e.run(1800);
    expect(e.metrics().completedStore + e.metrics().completedRetrieve).toBeGreaterThan(completedBefore);
  });

  it('shuttle down: the spare takes over after 15 sim-minutes, once', () => {
    const e = new Engine({ config: PRESETS.B, demand: PROFILES.weekday, seed: 42, devChecks: true });
    e.run(3600);
    e.setFailure('shuttle', 'shuttle-L1', true);
    e.run(14 * 60);
    expect(e.failures.shuttles).toEqual(['shuttle-L1']);
    e.run(2 * 60);
    expect(e.failures.shuttles).toEqual([]);
    expect(e.failures.spareUsed).toBe(true);
    expect(e.snapshot().events.some((x) => x.kind === 'SPARE')).toBe(true);
    e.setFailure('shuttle', 'shuttle-L2', true);
    e.run(20 * 60);
    expect(e.failures.shuttles).toEqual(['shuttle-L2']);
  });
});
