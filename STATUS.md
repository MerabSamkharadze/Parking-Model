# STATUS.md — what exists, what is measured, what is left

Updated after each milestone. Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Milestones

| milestone | state | commit | notes |
|---|---|---|---|
| M0 scaffold | ✅ done | `fac7360` | Next 15.5, TS 5.9 strict, Tailwind v4 tokens, Noto Sans Georgian + IBM Plex Mono, layout shell |
| M1 sim engine | ✅ done | — | pure TS engine, 46 tests, `pnpm bench`; §2 figures reproduced (below) |
| M2 static 3D | ⬜ next | | geometry from config, InstancedMesh slots, camera presets, level isolation |
| M3 engine ↔ scene | ⬜ | | snapshot bridge at 20 Hz, vehicle pool, lift/shuttle animation, play/pause/speed |
| M4 control panel | ⬜ | | §8 blocks 1–9, index table + flyTo, event log, sparklines, timeline strip |
| M5 versions | ⬜ | | presets A–D in the UI, custom configs, localStorage, share URL, compare mode (worker) |
| M6 failure & polish | ⬜ | | failure panel, degraded UI, keyboard shortcuts, reduced motion, README, Lighthouse ≥ 95 |

## M1 — engine vs SPEC §2 (preset B, weekday demand, seed 42, 24 h)

| figure | SPEC §2 | engine | Δ |
|---|---|---|---|
| store time P50 (drop-off → in slot) | ≈ 55 s | 56.1 s | +2 % |
| retrieve time P50 (call → ready in bay) | ≈ 50 s | 49.2 s | −2 % |
| retrieve P50 with pre-fetch (10 min lead) | 0–15 s | 0 s (P90 10 s) | ✓ |
| lift cycle (hold per movement) | ≈ 25–32 s | P50 32.5 s, mean 34.3 s | mean +7 % over the range top |
| lift capacity | ≈ 2 × 110 = 220 /h | 210 /h | −4.5 % |
| preset A, one lift | ≈ 110 /h | 101 /h | −8 % |

All within the ±15 % band asserted by `tests/engine.timings.test.ts`. What it took to get there
(engine fixes, not spec changes — see DECISIONS E4/E13): idle lifts park at the surface and
spare idle lifts pre-position for retrieves; idle shuttles wait at the next expected departure;
pre-fetch starts just in time instead of hogging output bays.

### Engine findings worth knowing

- The lift cycle **mean** (34 s) sits above the §2 range because retrieves hold the lift
  while it travels to the level and during the 14 s lift → bay transfer; stores hold it
  during the 14 s bay → lift transfer and the descent. The P50 (32.5 s) is inside the range.
- Under `stress`, preset B peaks at ~145 movements/h, below its 210/h lift capacity: cars
  wait for a lift *inside* the three input bays (35 + 8 s + wait), so the bays bind first.
  Preset D (10 + 10 bays) peaks at ~170/h and cuts the outside queue from 71 to 56 cars,
  but its store P50 balloons (cars now wait inside bays, which counts as store time). So
  "bays are cheap" holds for the queue, and bays *do* add ~15 % throughput until the lifts
  bind — the spec's narrative is directionally right, not literally.
- Preset C (320 slots, 4 lifts, 2 shuttles/level): lift capacity 407/h; shuttle
  utilisation stays under 10 % on weekday demand, so the "bottleneck moves to the
  shuttles" story needs the stress profile or a higher hot-zone concentration to show.
- Performance: 24 sim-hours in 0.4 s (A) – 1.5 s (C) without invariant checks; ~3–10 s
  with them. Compare mode (3 × 24 h) will fit the < 3 s target on the main presets.

### `pnpm bench --presets A,B,C,D --hours 24 --demand weekday,stress` (seed 42)

| preset | demand | slots | moves/h | peak/h | lift cap/h | lift cycle | store P50 | store P90 | retr P50 | retr P95 | lift util | shuttle max | queue in/out | rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | weekday | 96 | 13.2 | 64.0 | 101.3 | 35.5 s | 56.7 s | 76.6 s | 52.3 s | 129.3 s | 13% | 6% | 2 / 5 | 4 |
| B | weekday | 144 | 21.4 | 112.0 | 210.0 | 34.3 s | 56.1 s | 83.1 s | 49.2 s | 90.1 s | 10% | 9% | 1 / 5 | 0 |
| C | weekday | 320 | 46.6 | 192.0 | 407.1 | 35.4 s | 56.8 s | 90.0 s | 50.3 s | 88.3 s | 11% | 9% | 1 / 8 | 0 |
| D | weekday | 144 | 21.4 | 108.0 | 210.6 | 34.2 s | 55.7 s | 81.4 s | 48.7 s | 89.8 s | 10% | 9% | 0 / 5 | 0 |
| A | stress | 96 | 13.2 | 84.0 | 97.1 | 37.1 s | 60.0 s | 85.4 s | 61.7 s | 258.3 s | 14% | 7% | 49 / 6 | 6 |
| B | stress | 144 | 19.5 | 144.0 | 203.7 | 35.3 s | 66.2 s | 158.7 s | 53.5 s | 99.1 s | 10% | 8% | 71 / 5 | 11 |
| C | stress | 320 | 44.5 | 260.0 | 391.4 | 36.8 s | 70.5 s | 187.5 s | 52.1 s | 154.1 s | 11% | 9% | 175 / 13 | 19 |
| D | stress | 144 | 19.5 | 168.0 | 195.9 | 36.7 s | 92.9 s | 397.3 s | 53.0 s | 96.2 s | 10% | 8% | 56 / 5 | 11 |

`moves/h` = completed store + retrieve over the day; `peak/h` = best 15-min window;
`lift cap/h` = lifts × 3600 / mean lift cycle; utilisation = busy share over the day.

## What the engine exposes (for M2–M6)

- `new Engine({ config, demand, seed, devChecks })`, `step()`, `run(seconds)`, `snapshot()`,
  `metrics()`; hot strategy changes `setAllocator / setPrefetchLead / setNightDefrag`;
  commands `addVehicle / callVehicle`; failures `setFailure(kind, id, down) / recoverAll`.
- `runBench({ config, demand, hours, seed })` → `BenchResult` with a `summary` for the
  compare table; `benchTable(results)` renders markdown.
- Snapshot: immutable shallow copies — slot objects are replaced only when they change,
  jobs carry `progress` 0..1, resources carry `pos` and the current `move` so the scene
  can interpolate lifts (level number) and shuttles (x in metres) with
  `lib/sim/kinematics.ts › positionAt`.
- All coordinates: `lib/geometry.ts` (`slotPosition`, `slotX`, `levelY`, `liftY`, `rowZ`,
  `layout().shafts`, `bayPosition`, `bounds`).

## Left to do

Everything from M2 on (table above). Open items that need the user's eye, not code:
the header name "AVP Simulator", header/timeline heights (48/96 px), and any decision in
`DECISIONS.md` they want changed.
