// Metrics — SPEC §4.6. Percentiles from a 4000-sample ring buffer (no
// reservoir needed), throughput over a rolling 15 sim-minute window.

import type { Percentiles } from './types.ts';

export const RING_SIZE = 4000;
export const THROUGHPUT_WINDOW = 15 * 60; // s

export class RingStats {
  private readonly buf = new Float64Array(RING_SIZE);
  private n = 0;
  private head = 0;
  private sorted: Float64Array | null = null;
  max = 0;
  total = 0;

  push(v: number): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % RING_SIZE;
    if (this.n < RING_SIZE) this.n++;
    this.total++;
    if (v > this.max) this.max = v;
    this.sorted = null;
  }

  get count(): number {
    return this.n;
  }

  private ensureSorted(): Float64Array {
    if (!this.sorted) {
      this.sorted = this.buf.slice(0, this.n).sort();
    }
    return this.sorted;
  }

  quantile(q: number): number {
    if (this.n === 0) return 0;
    const s = this.ensureSorted();
    const idx = Math.min(this.n - 1, Math.max(0, Math.ceil(q * this.n) - 1));
    return s[idx];
  }

  mean(): number {
    if (this.n === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.n; i++) sum += this.buf[i];
    return sum / this.n;
  }

  percentiles(): Percentiles {
    return { p50: this.quantile(0.5), p90: this.quantile(0.9), p95: this.quantile(0.95), max: this.max, n: this.total };
  }
}

/** Completion timestamps in a rolling window → events per hour. */
export class RollingRate {
  private times: number[] = [];
  private start = 0;
  peakPerHour = 0;

  constructor(private readonly windowSeconds: number) {}

  push(t: number): void {
    this.times.push(t);
    this.trim(t);
    this.peakPerHour = Math.max(this.peakPerHour, this.perHour(t));
  }

  private trim(t: number): void {
    const cutoff = t - this.windowSeconds;
    while (this.start < this.times.length && this.times[this.start] < cutoff) this.start++;
    if (this.start > 256 && this.start * 2 > this.times.length) {
      this.times = this.times.slice(this.start);
      this.start = 0;
    }
  }

  perHour(t: number): number {
    this.trim(t);
    const span = Math.min(t, this.windowSeconds);
    if (span <= 0) return 0;
    return ((this.times.length - this.start) * 3600) / span;
  }
}

export function emptyPercentiles(): Percentiles {
  return { p50: 0, p90: 0, p95: 0, max: 0, n: 0 };
}
