// Per-minute telemetry history for the sparklines (SPEC §8.7) and the 24 h
// timeline strip (SPEC §7). One slot per minute of the sim day; a new day
// overwrites the old one minute by minute, so the strip always shows the
// last 24 h. Pure TypeScript, no React.

import type { SimSnapshot } from './sim/types.ts';

export const MINUTES_PER_DAY = 1440;

export type HistorySeries = 'throughput' | 'queue' | 'storeP50' | 'liftUtil' | 'occupancy';
export const HISTORY_SERIES: readonly HistorySeries[] = ['throughput', 'queue', 'storeP50', 'liftUtil', 'occupancy'];

export class History {
  readonly throughput = new Float32Array(MINUTES_PER_DAY).fill(NaN);
  readonly queue = new Float32Array(MINUTES_PER_DAY).fill(NaN);
  readonly storeP50 = new Float32Array(MINUTES_PER_DAY).fill(NaN);
  readonly liftUtil = new Float32Array(MINUTES_PER_DAY).fill(NaN);
  readonly occupancy = new Float32Array(MINUTES_PER_DAY).fill(NaN);
  /** Minute-of-day of the latest sample, −1 when empty. */
  head = -1;
  /** Total samples taken (bumps on every sample; use it as a change key). */
  version = 0;
  private lastMinute = -1;

  clear(): void {
    for (const s of HISTORY_SERIES) this[s].fill(NaN);
    this.head = -1;
    this.lastMinute = -1;
    this.version++;
  }

  /** Records the snapshot if a new sim-minute has begun. Returns true when it did. */
  sample(snapshot: SimSnapshot): boolean {
    const minute = Math.floor(snapshot.t / 60);
    if (minute === this.lastMinute) return false;
    this.lastMinute = minute;
    const i = minute % MINUTES_PER_DAY;
    const m = snapshot.metrics;
    this.throughput[i] = m.throughputPerHour;
    this.queue[i] = m.queueIn + m.queueOut;
    this.storeP50[i] = m.storeTime.n > 0 ? m.storeTime.p50 : NaN;
    this.liftUtil[i] = m.liftUtilization.length ? m.liftUtilization.reduce((a, b) => a + b, 0) / m.liftUtilization.length : 0;
    this.occupancy[i] = m.occupancy;
    this.head = i;
    this.version++;
    return true;
  }

  /** The last `n` minutes ending at the head, oldest first (NaN where unsampled). */
  recent(series: HistorySeries, n: number): number[] {
    const out = new Array<number>(n).fill(NaN);
    if (this.head < 0) return out;
    const src = this[series];
    for (let k = 0; k < n; k++) {
      const i = (((this.head - (n - 1 - k)) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
      out[k] = src[i];
    }
    return out;
  }
}
