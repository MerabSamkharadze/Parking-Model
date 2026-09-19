// Travel-time functions for the moving resources (SPEC §2 timings). Pure.
// The scene interpolates positions with the same helpers, so engine time and
// rendered motion always agree.

import type { ResourceMove, Timings } from './types.ts';

/** Lift travel between level numbers (0 = surface): 2.2 s/level + 3 s align. */
export function liftTravelTime(t: Timings, fromLevel: number, toLevel: number): number {
  const d = Math.abs(toLevel - fromLevel);
  if (d < 1e-9) return 0;
  return d * t.liftPerLevel + t.liftAlign;
}

/** Shuttle travel over `distance` metres with a trapezoidal speed profile. */
export function shuttleTravelTime(t: Timings, distance: number): number {
  const d = Math.abs(distance);
  if (d < 1e-9) return 0;
  const v = t.shuttleSpeed;
  const a = t.shuttleAccel;
  const rampDistance = (v * v) / a; // accelerate + decelerate
  if (d <= rampDistance) return 2 * Math.sqrt(d / a);
  return d / v + v / a;
}

/** Position of a resource at time `now`: a trapezoidal speed profile with
 *  `move.ramp` seconds of acceleration and braking (linear when ramp is 0).
 *  Symmetric, so the midpoint is reached at half time. */
export function positionAt(move: ResourceMove | null, restPos: number, now: number): number {
  if (!move) return restPos;
  if (now >= move.end) return move.to;
  if (now <= move.start) return move.from;
  const T = move.end - move.start;
  const t = now - move.start;
  const D = move.to - move.from;
  const r = Math.min(move.ramp ?? 0, T / 2);
  if (r <= 1e-9) return move.from + D * (t / T);
  const v = D / (T - r); // peak velocity: trapezoid area = v × (T − r) = D
  let d: number;
  if (t < r) d = 0.5 * (v / r) * t * t;
  else if (t <= T - r) d = (v * r) / 2 + v * (t - r);
  else d = D - 0.5 * (v / r) * (T - t) * (T - t);
  return move.from + d;
}

/** Ramp (accel = brake) seconds for a move of `duration` by a resource kind. */
export function rampFor(t: Timings, kind: 'lift' | 'shuttle', duration: number): number {
  const ramp = kind === 'lift' ? t.liftAlign / 2 : t.shuttleSpeed / t.shuttleAccel;
  return Math.min(ramp, duration / 2);
}
