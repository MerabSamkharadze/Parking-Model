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

/** Position of a resource at time `now` (linear inside the move). */
export function positionAt(move: ResourceMove | null, restPos: number, now: number): number {
  if (!move) return restPos;
  if (now >= move.end) return move.to;
  if (now <= move.start) return move.from;
  const k = (now - move.start) / (move.end - move.start);
  return move.from + (move.to - move.from) * k;
}
