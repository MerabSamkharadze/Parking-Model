// Compare mode — SPEC §5/§6: one worker per version runs the headless bench
// (24 h at full speed) so the main thread and the 3D scene never block.

import { runBench, type BenchResult } from '@/lib/sim/bench';
import { PROFILES } from '@/lib/sim/demand';
import type { DemandProfile, FacilityConfig } from '@/lib/sim/types';

export interface BenchRequest {
  id: string;
  config: FacilityConfig;
  demandName: DemandProfile['name'];
  residents: number;
  seed: number;
  hours: number;
}

export interface BenchResponse {
  id: string;
  result: BenchResult;
}

// The DOM lib types `self` as a Window; a dedicated worker's message API is the Worker one.
const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<BenchRequest>) => {
  const { id, config, demandName, residents, seed, hours } = e.data;
  const demand = { ...PROFILES[demandName], residents };
  const result = runBench({ config, demand, hours, seed, devChecks: false });
  const response: BenchResponse = { id, result };
  ctx.postMessage(response);
};
