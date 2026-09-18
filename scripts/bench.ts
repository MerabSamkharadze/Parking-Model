// CLI — SPEC §6: pnpm bench --presets A,B,C,D --hours 24 [--demand weekday] [--seed 42]
// Runs with Node's built-in type stripping (no extra dependency, DECISIONS E19).

import { PRESETS } from '../lib/presets.ts';
import { PROFILES } from '../lib/sim/demand.ts';
import { benchTable, runBench, type BenchResult } from '../lib/sim/bench.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const presets = arg('presets', 'A,B,C,D').split(',').map((s) => s.trim().toUpperCase());
const hours = Number(arg('hours', '24'));
const seed = Number(arg('seed', '42'));
const demands = arg('demand', 'weekday').split(',').map((s) => s.trim());
const checks = process.argv.includes('--checks');

const results: BenchResult[] = [];
for (const d of demands) {
  const demand = (PROFILES as Record<string, (typeof PROFILES)['weekday']>)[d];
  if (!demand) throw new Error(`unknown demand profile ${d}`);
  for (const id of presets) {
    const config = (PRESETS as Record<string, (typeof PRESETS)['B']>)[id];
    if (!config) throw new Error(`unknown preset ${id}`);
    results.push(runBench({ config, demand, hours, seed, devChecks: checks }));
  }
}

console.log(`bench · ${hours} h · seed ${seed} · demand ${demands.join(', ')}\n`);
console.log(benchTable(results));
