// The guided tour (DECISIONS U1): what a first-time viewer should see, in
// order, and when each step is over. Pure data + predicates; the Story
// component drives the stores. Texts are English (the UI language).

import { layout, slotCount } from './geometry.ts';
import type { FacilityConfig, Job, SimSnapshot } from './sim/types.ts';
import type { CameraPreset, Setting } from '../store/useUiStore.ts';

export interface StoryContext {
  cfg: FacilityConfig;
  snapshot: SimSnapshot | null;
  /** The car the tour spawned / called, once it exists. */
  vehicleId: string | null;
  /** Seconds since the step started. */
  elapsed: number;
}

export interface StoryStep {
  id: string;
  title: string;
  text: (ctx: StoryContext) => string;
  camera: CameraPreset;
  setting?: Setting;
  speed: 1 | 4 | 16 | 60;
  /** What happens on entering the step. */
  enter?: 'spawn' | 'call' | 'isolate-slot';
  /** Cycle the surroundings while on this step (seconds per setting). */
  cycleSettings?: { every: number; order: Setting[] };
  /** When to move on automatically; `manual` waits for the viewer. */
  advance: { after: number } | { stage: Job['stage'][]; timeout: number } | { done: true; timeout: number } | 'manual';
  /** Stage-driven steps never end before this many seconds: reading time for the caption. */
  minSeconds?: number;
}

const n = (v: number) => Math.round(v).toLocaleString('en-US');

export function footprint(cfg: FacilityConfig): { width: number; depth: number } {
  const l = layout(cfg);
  return { width: l.maxX - l.minX, depth: cfg.corridorWidth + 2 * cfg.slotDepth };
}

function jobOf(ctx: StoryContext): Job | undefined {
  if (!ctx.snapshot || !ctx.vehicleId) return undefined;
  return ctx.snapshot.jobs.find((j) => j.vehicleId === ctx.vehicleId);
}

export const STORY: StoryStep[] = [
  {
    id: 'problem',
    title: 'The parking problem',
    text: () => 'A city block has more cars than kerb. Drivers circle for a space, garages ramp three floors down, and the ground under every building stays empty.',
    camera: 'street',
    setting: 'mall',
    speed: 1,
    advance: { after: 9 },
  },
  {
    id: 'idea',
    title: 'The idea',
    text: ({ cfg }) => {
      const f = footprint(cfg);
      return `${n(slotCount(cfg))} cars under a ${n(f.width)} × ${n(f.depth)} m footprint, ${cfg.levels} levels deep. Nobody drives inside: ${cfg.lifts === 1 ? 'a lift' : `${cfg.lifts} lifts`} and one shuttle per level do the parking.`;
    },
    camera: 'isometric',
    setting: 'mall',
    speed: 4,
    advance: { after: 9 },
  },
  {
    id: 'dropoff',
    title: 'Drop off',
    text: () => 'You stop in the entry bay and walk away. A scan measures the car — from here the machine takes over.',
    camera: 'follow',
    speed: 4,
    enter: 'spawn',
    advance: { stage: ['lift_move', 'shuttle_wait', 'handover', 'corridor', 'insert'], timeout: 75 },
    minSeconds: 6,
  },
  {
    id: 'lift',
    title: 'Down the shaft',
    text: ({ cfg }) => `The lift lowers the car ${cfg.timings.liftPerLevel} s per level, and the shuttle of that level is already waiting at the shaft.`,
    camera: 'follow',
    speed: 1, // real time: the descent is the moment to watch
    advance: { stage: ['corridor', 'insert'], timeout: 45 },
    minSeconds: 5,
  },
  {
    id: 'slot',
    title: 'Into the slot',
    text: ({ cfg }) => `The shuttle carries it along the corridor at ${cfg.timings.shuttleSpeed} m/s; a quarter turn and a push and it is parked. Bay to slot in about a minute.`,
    camera: 'follow',
    speed: 4,
    advance: { done: true, timeout: 60 },
    minSeconds: 5,
  },
  {
    id: 'parked',
    title: 'Parked',
    text: ({ snapshot, vehicleId }) => {
      const v = snapshot && vehicleId ? snapshot.vehicles[vehicleId] : null;
      return `Ticket ${vehicleId ?? '—'} is in slot ${v?.slotKey ?? '—'}. No light, no walking, nobody near the car until it is yours again.`;
    },
    camera: 'slot',
    speed: 4,
    enter: 'isolate-slot',
    advance: { after: 6 },
  },
  {
    id: 'call',
    title: 'Call it back',
    text: ({ cfg }) =>
      `Call the car from your phone before you leave. It is pulled out, lifted and waiting in the exit bay in about ${n(50)} s — or already there when pre-fetch knows you are coming${cfg.prefetchLeadMinutes ? ` (${cfg.prefetchLeadMinutes} min ahead)` : ''}.`,
    camera: 'follow',
    speed: 4,
    enter: 'call',
    advance: { stage: ['ready', 'pickup'], timeout: 90 },
    minSeconds: 6,
  },
  {
    id: 'fit',
    title: 'Where it fits',
    text: () => 'Under a shopping centre, an office tower or a residential courtyard: the same machine, sized to the demand, with a lift shaft where a ramp used to be.',
    camera: 'isometric',
    speed: 16,
    cycleSettings: { every: 4, order: ['tower', 'courtyard', 'mall'] },
    advance: { after: 12 },
  },
  {
    id: 'numbers',
    title: 'The numbers',
    text: ({ cfg, snapshot }) => {
      const m = snapshot?.metrics;
      const cap = m ? n(m.liftCapacityPerHour) : '—';
      return `${cfg.lifts} lift${cfg.lifts === 1 ? '' : 's'} serve about ${cap} movements an hour; ${cfg.baysIn} + ${cfg.baysOut} bays absorb the rush; ${cfg.levels * cfg.shuttlesPerLevel} shuttles never meet. Every number here is the live simulation — change the facility and watch it move.`;
    },
    camera: 'cutaway',
    setting: 'mall',
    speed: 16,
    advance: 'manual',
  },
];

/** Whether the current step's exit condition is met. */
export function stepDone(step: StoryStep, ctx: StoryContext): boolean {
  const a = step.advance;
  if (a === 'manual') return false;
  if ('after' in a) return ctx.elapsed >= a.after;
  if (ctx.elapsed < (step.minSeconds ?? 0)) return false;
  const job = jobOf(ctx);
  if ('done' in a) {
    const v = ctx.snapshot && ctx.vehicleId ? ctx.snapshot.vehicles[ctx.vehicleId] : null;
    return ctx.elapsed >= a.timeout || (v !== null && v !== undefined && v.state === 'parked') || (ctx.elapsed > 3 && !job && v?.state !== 'in_system');
  }
  if (ctx.elapsed >= a.timeout) return true;
  if (!job) return ctx.elapsed > 3; // rejected or already finished: move on
  return a.stage.includes(job.stage);
}
