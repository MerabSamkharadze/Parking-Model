// Demand model — SPEC §4.3 with the semantics fixed in DECISIONS E7–E9:
// hourly.arrivals = Poisson rate of visitor arrivals; hourly.departures =
// weights of residents' habitual departure times; residents return after
// residentDwell (or inside residentReturnWindow for the stress profile).

import { slotCount } from '../geometry.ts';
import type { DemandProfile, FacilityConfig, HourlyDemand, SlotClass, Tenant, Vehicle, VehicleProfile } from './types.ts';
import type { Rng } from './prng.ts';

const REFERENCE_SLOTS = 144; // preset B; other configs scale the demand

function hourly(arrivals: number[], departures: number[]): HourlyDemand[] {
  return arrivals.map((a, h) => ({ h, arrivals: a, departures: departures[h] ?? 0 }));
}

const H = 3600;

export const PROFILES: Record<DemandProfile['name'], DemandProfile> = {
  weekday: {
    name: 'weekday',
    residents: 96,
    //            0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    hourly: hourly(
      [1, 0, 0, 0, 0, 1, 2, 4, 6, 8, 10, 14, 16, 14, 12, 12, 14, 16, 14, 10, 6, 4, 2, 1],
      [0, 0, 0, 0, 0, 1, 3, 8, 70, 30, 4, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    ),
    visitorDwell: [45, 180],
    residentDwell: [8.5 * 60, 11 * 60],
    residentLeaveShare: 0.95,
    residentReturnWindow: null,
    evShare: 0.12,
    oversizeShare: 0.04,
  },
  saturday: {
    name: 'saturday',
    residents: 96,
    hourly: hourly(
      [1, 0, 0, 0, 0, 0, 1, 2, 4, 8, 14, 20, 24, 24, 22, 20, 18, 16, 14, 12, 8, 4, 2, 1],
      [0, 0, 0, 0, 0, 0, 1, 3, 8, 14, 18, 16, 12, 8, 5, 3, 2, 1, 1, 0, 0, 0, 0, 0],
    ),
    visitorDwell: [60, 240],
    residentDwell: [2 * 60, 7 * 60],
    residentLeaveShare: 0.6,
    residentReturnWindow: null,
    evShare: 0.12,
    oversizeShare: 0.04,
  },
  stress: {
    name: 'stress',
    residents: 96,
    hourly: hourly(
      [1, 0, 0, 0, 0, 0, 1, 2, 4, 6, 8, 8, 8, 8, 8, 8, 8, 10, 12, 40, 20, 8, 4, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ),
    visitorDwell: [60, 180],
    residentDwell: [10 * 60, 11 * 60],
    residentLeaveShare: 1,
    residentReturnWindow: [18 * H + 55 * 60, 19 * H + 10 * 60],
    evShare: 0.12,
    oversizeShare: 0.04,
  },
};

export function profileByName(name: string): DemandProfile {
  const p = (PROFILES as Record<string, DemandProfile>)[name];
  if (!p) throw new Error(`unknown demand profile ${name}`);
  return p;
}

export function demandScale(cfg: FacilityConfig): number {
  return slotCount(cfg) / REFERENCE_SLOTS;
}

export function scaledResidents(profile: DemandProfile, cfg: FacilityConfig): number {
  return Math.min(slotCount(cfg) - 4, Math.round(profile.residents * demandScale(cfg)));
}

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
/** Residents charge at home less often than visitors need a charger. */
const RESIDENT_EV_FACTOR = 0.6;

/** Vehicle factory + arrival sampling; all randomness from the seeded rng. */
export class DemandGenerator {
  readonly profile: DemandProfile;
  readonly cfg: FacilityConfig;
  private readonly rng: Rng;
  private readonly scale: number;
  private readonly departureWeights: number[];

  constructor(profile: DemandProfile, cfg: FacilityConfig, rng: Rng) {
    this.profile = profile;
    this.cfg = cfg;
    this.rng = rng;
    this.scale = demandScale(cfg);
    this.departureWeights = profile.hourly.map((h) => h.departures);
  }

  /** Visitor arrivals in one tick (Bernoulli thinning of the hourly Poisson rate). */
  arrivalsThisTick(secondsOfDay: number, dt: number): number {
    const h = Math.floor(secondsOfDay / H) % 24;
    const rate = this.profile.hourly[h].arrivals * this.scale; // per hour
    const p = (rate * dt) / H;
    return this.rng.next() < p ? 1 : 0;
  }

  /** Seconds-of-day a resident habitually leaves (uniform inside the drawn hour). */
  habitualDeparture(): number {
    const h = this.rng.weightedIndex(this.departureWeights);
    return h * H + this.rng.uniform(0, H);
  }

  /** Does this resident leave today at all? */
  residentLeavesToday(): boolean {
    return this.rng.next() < this.profile.residentLeaveShare;
  }

  /** ± 10 min daily variation on the habitual time. */
  departureJitter(): number {
    return this.rng.uniform(-600, 600);
  }

  visitorDwellSeconds(): number {
    const [lo, hi] = this.profile.visitorDwell;
    return this.rng.uniform(lo, hi) * 60;
  }

  /** Absolute time a resident comes back after leaving at `departedAt` (day-relative window if configured). */
  residentReturnAt(departedAt: number): number {
    const w = this.profile.residentReturnWindow;
    if (w) {
      const dayStart = Math.floor(departedAt / (24 * H)) * 24 * H;
      let at = dayStart + this.rng.uniform(w[0], w[1]);
      if (at <= departedAt + 600) at += 24 * H; // already past today's window → tomorrow
      return at;
    }
    const [lo, hi] = this.profile.residentDwell;
    return departedAt + this.rng.uniform(lo, hi) * 60;
  }

  private plate(): string {
    const l = () => LETTERS[this.rng.int(0, LETTERS.length - 1)];
    return `${l()}${l()}-${this.rng.int(100, 999)}-${l()}${l()}`;
  }

  /**
   * Dimensions consistent with the facility (DECISIONS S39/E10): every car fits a
   * 5.2 m slot with the parking margin, and rides the 0.2 m shuttle deck under the
   * 1.9 m clear level height. Oversize = longer than 4.75 m or taller than 1.62 m.
   */
  private profileFor(cls: SlotClass, ev: boolean): VehicleProfile {
    if (cls === 'oversize') {
      const tall = this.rng.next() < 0.5;
      return {
        length: tall ? this.rng.uniform(4.5, 4.75) : this.rng.uniform(4.76, 5.0),
        width: this.rng.uniform(1.85, 2.05),
        height: tall ? this.rng.uniform(1.63, 1.68) : this.rng.uniform(1.5, 1.62),
        ev,
      };
    }
    return {
      length: this.rng.uniform(4.0, 4.75),
      width: this.rng.uniform(1.7, 1.95),
      height: this.rng.uniform(1.4, 1.62),
      ev,
    };
  }

  makeVehicle(id: string, tenant: Tenant, t: number): Vehicle {
    const r = this.rng.next();
    const evShare = tenant === 'resident' ? this.profile.evShare * RESIDENT_EV_FACTOR : this.profile.evShare;
    const cls: SlotClass = r < this.profile.oversizeShare ? 'oversize' : r < this.profile.oversizeShare + evShare ? 'ev' : 'standard';
    const profile = this.profileFor(cls, cls === 'ev');
    return {
      id,
      plate: this.plate(),
      profile,
      cls,
      tenant,
      slotKey: null,
      state: 'arriving',
      arrivedAt: t,
      dwellTarget: 0,
      plannedDeparture: null,
      habitualDeparture: null,
    };
  }
}

/** Oversize classification thresholds (DECISIONS E10, revised with S39). */
export function classify(p: VehicleProfile): SlotClass {
  if (p.length > 4.75 || p.height > 1.62 || p.width > 2.05) return 'oversize';
  return p.ev ? 'ev' : 'standard';
}
