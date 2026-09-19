# STATUS.md — what exists, what is measured, what is left

Updated after each milestone. Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Milestones

| milestone | state | commit | notes |
|---|---|---|---|
| M0 scaffold | ✅ done | `fac7360` | Next 15.5, TS 5.9 strict, Tailwind v4 tokens, Noto Sans Georgian + IBM Plex Mono, layout shell |
| M1 sim engine | ✅ done | `7f6452a` | pure TS engine, 46 tests, `pnpm bench`; §2 figures reproduced (below) |
| M2 static 3D | ✅ done | `74dcca7` | geometry from config, InstancedMesh slots, 4 camera presets, level isolation, flyTo |
| M3 engine ↔ scene | ✅ done | `00c21ec` | 20 Hz snapshot bridge, render clock, VehiclePool, lift/shuttle/car animation at every stage, run control |
| M4 control panel | ✅ done | `096212c` | §8 blocks 1–9, virtualised index + flyTo, event log, sparklines, timeline strip, custom versions |
| M5 versions | ✅ done | `d585183` | saved versions (localStorage, max 12), share `?v=` links, compare mode in Web Workers |
| M6 failure & polish | ✅ done | `9fdab40` | failure panel, degraded UI, keyboard shortcuts, reduced motion, README screenshots, Lighthouse a11y 100 |
| M7 presentation (user request, DECISIONS U1) | ✅ done | — | real CC0 car models (instanced, LOD twins), steel rack, street + mall / tower / courtyard, readable bays with a scan sweep, guided tour with follow camera, 60 FPS kept |

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

## M2 — static 3D (what is on screen)

Everything is drawn from `snapshot()` + `lib/geometry.ts`; the scene holds no state of
its own. Preset B at 00:00: residents parked (L3–L6 full, hot levels L1–L2 free except
the EV/oversize residents), lifts parked at the surface, shuttles at their zone centre.

- `SurfaceDeck` — see-through street plane, bay markings (rows of 5 beyond the end
  shafts), amber shaft outlines, `INPUT` / `OUTPUT` floor labels (drei `Text`).
- `LevelSlab` × levels — one box per zone, edge lines, `L{n}` label; ghosted at 0.15
  when another level is isolated.
- `SlotField` — two `InstancedMesh`es (solid / ghost) for all slots: free pad 0.06 m,
  reserved 0.5 m, occupied 1.4 m block; colours per DECISIONS S2; incremental updates.
- `Shaft` per lift (posts + head frame) with the amber `LiftPlatform` at `liftY(pos)`;
  `Shuttle` per level/zone at the engine's x; `SlotMarker` ring on the selected slot.
- `CameraRig` — OrbitControls (damped) + fitted presets: Isometric, Cutaway, Shaft,
  Slot; `flyTo(slotKey)` isolates the level and flies to the slot.
- Overlay — bay dots `in ○○○ · out ○○○`, level chips L1…Ln (isolation), preset chips;
  wraps at phone width.

### M2 DoD, measured (headless Chrome 153, Apple M1 / Metal, dpr 1.75 → 1890 × 1323)

| check | result |
|---|---|
| 320 slots (preset C) at 60 FPS | 60 FPS (rAF-bound); 4.8 ms per frame GPU-synced, i.e. ≈ 3× headroom |
| single slot colour change without re-mount | ✓ — replacing one slot object recolours one instance; canvas element unchanged |
| presets A–D render from config alone | ✓ — A (1 shaft, 1+1 bays), B, C (2 zones, 4 shafts, 8 levels), D (10+10 bays) |
| level isolation | ✓ — selected level solid, others at 0.15, shuttles and labels follow |
| console clean | only R3F's upstream `THREE.Clock` deprecation notice; no errors, no 404s |
| gates | lint, typecheck, 46 tests, build green (route `/` 15.9 kB, 118 kB first load) |

Repeat with `pnpm dev` running:
`DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/presets.js out/`.

### Things learned in M2 (so nobody re-learns them)

- `next build` while `next dev` is running wipes `.next` under the dev server — every
  chunk 404s until dev is restarted. Stop dev before building.
- With React StrictMode on, R3F 9.7 loses the WebGL context 500 ms after mount in dev
  (DECISIONS S11); production is fine.
- A hidden tab (occluded window, automation) gets neither `requestAnimationFrame` nor
  `ResizeObserver` callbacks, so R3F never even creates its root. The headless driver
  (DECISIONS S12) is the reliable way to look at the scene.
- Cosmetic, deferred to M3: at handover the lift platform and the shuttle occupy the same
  volume (the engine's shuttle `pos` is the shaft x); the animation layer will offset
  the shuttle to the shaft edge. The slot-focus view looks through the ghosted levels
  above — acceptable, revisit once cars are in the scene.

## M3 — engine ↔ scene (what moves)

- `store/useSimStore.ts` owns the loop: `advance(dt)` accumulates `dt × speed`, steps
  whole ticks (≤ 40 per frame, DECISIONS S17), publishes a snapshot every 50 ms and
  keeps `clock.t` (sub-tick render time) for the scene. `running`, `speed`
  (1/4/16/60×), `reset()`, `setSeed()`, `epoch` (bumps per engine).
- `components/scene/SimDriver.tsx` calls `advance` first in every frame;
  `motion.ts` (pure, tested) turns a snapshot + `clock.t` into car placements
  (DECISIONS S19) and lift / shuttle positions via `positionAt`.
- `VehiclePool.tsx` — 3 InstancedMeshes × 40 (body / cabin / glass, 3 variants);
  `Shaft.tsx` / `Shuttle.tsx` move their platform / unit per frame from the store; the
  slot field turns a mid-slide slot into a pad; `SurfaceDeck` gained the transfer lane.
- Panel block 1 `RunControl` (play / pause, speed, clock, reset, seed); live header clock.

### M3 DoD, measured (headless Chrome 153, Apple M1 / Metal, dpr 1.75)

| check | result |
|---|---|
| paused scene is frozen | two viewport captures 1 s apart while paused: byte-identical PNGs (same md5) |
| every stage animates | `tests/motion.test.ts`: 9 sim-hours of preset B sampled every 2 s — every drawn car in bounds, continuous (≤ 6 m per sample, ≤ 12 m on deck transfers) inside stages *and* across every hand-off; all store/retrieve stages seen |
| 24 h at 60× without artifacts | `scripts/shots/day60x.js`: 24 sim-hours in 24 min wall, 60 FPS in all 25 one-minute samples, no console errors, no engine warnings; 256 stores + 257 retrieves, store P50 56.1 s / retrieve P50 49.2 s — the same figures as `pnpm bench` (the frame-driven loop stepped exactly the bench's ticks) |
| gates | lint, typecheck, 51 tests, build green |

Repeat: `DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/{motion,stages,day60x}.js out/`
(`stages.js` steps the engine to a car mid `to_lift`, `lift_move`, `corridor`, `insert`,
`extract`, `bay_out` and a full queue and screenshots each).

### Things learned in M3

- A store's bay is released *before* the bay → lift transfer starts; without `Job.bay`
  the car vanished for 14 s (the continuity test caught it).
- Retrieves that surface in the west shaft cross the deck to the east output bays
  (pooled lifts, E1): at 44 m in 14 s it is the fastest thing in the facility. The lane
  makes it legible; if it ever bothers, the retrieve lift policy is the knob, not the scene.
- `useStore(selector)` must return stable references at 20 Hz: strings/numbers as keys
  (`epoch:slotsVersion`, shuttle id lists) and a content-compared `Set` for sliding
  slots keep React idle while the engine runs.

## M4 — control panel (what is in the rail)

`components/panel/*` — one component per SPEC §8 block, mounted by `PanelRail`:

| block | component | acts on |
|---|---|---|
| 1 Run control | `RunControl` | running, speed, seed, reset |
| 2 Version | `VersionPicker` | `setPreset` (restart, same seed); shows the custom version when derived |
| 3 Facility | `FacilityForm` | draft → "Restart needed" → `applyFacility` (custom version, restart); layout warnings inline |
| 4 Strategy | `StrategyForm` | `setStrategy` → engine hot (`setAllocator`, `setPrefetchLead`, `setNightDefrag`) |
| 5 Demand | `DemandForm` | profile / residents (restart), `+ Car` → `addVehicle`, `− Retrieve` → `callVehicle` |
| 6 Live state | `LiveState` | occupancy bars per level (hot levels amber), occupancy / hot zone / in-transit / queues, degraded banner |
| 7 Telemetry | `Telemetry` | 4 sparklines over the last 3 h, percentile table, capacity / peak / completed / rejected |
| 8 Index | `IndexTable` | virtualised list, search, row → select + flyTo, Retrieve |
| 9 Event log | `EventLog` | filters, colours, auto-scroll |

Plus `components/ui/{Chip,Badge,Toggle,Slider,NumberField,StatValue,Sparkline}`,
`lib/history.ts` (per-minute ring), `lib/presets.ts › deriveConfig / versionLabel /
CONFIG_LIMITS`, `lib/format.ts`, and the live `TimelineStrip` (throughput + queue, cursor).

### M4 DoD, measured (headless Chrome 153, DOM-driven, `scripts/shots/panel.js`)

| check | result |
|---|---|
| every control reflects on the sim | `nearest` chip → `engine.getStrategy().allocator === 'nearest'`, config `custom · from B`; defrag switch → `nightDefrag: true`; `+ Car` → 1 job; index row → `selectedVehicleId #0001`, camera `slot` on `L3-R1-12`; `Retrieve` → a retrieve job; preset C row → restart (epoch +1, t = 0, config C) |
| no layout shift while numbers update | the ten panel sections' top offsets before and after 2.5 s at 60×: `[0,117,314,533,660,803,1028,1325,1706,2047]` both times |
| frame rate with the panel live | 60 FPS at 60× (preset C, dpr 1.75) |
| gates | lint, typecheck, 55 tests, build green |

### Things learned in M4

- `useStore(selector)` at 20 Hz needs cheap, stable keys: the panel gets `panelTick`
  (≤ 2 Hz) and reads the snapshot off the store; history is a mutable ring with a version
  number. Doing this from the start kept the scene's frame budget untouched.
- A restart must clear UI selections (slot / vehicle) or the index points at a car that
  no longer exists.

## M5 — versions, share, compare

- `lib/share.ts` — `encodeSetup / decodeSetup / shareUrl` (base64url JSON, preset short
  form, validated on the way in) and `loadVersions / saveVersion / deleteVersion` over an
  injected storage (localStorage in the app, memory in tests).
- `lib/compare.ts` + `workers/bench.worker.ts` — candidates, metric table definition,
  one worker per version running `runBench` for 24 h.
- Store: `boot()` (reads `?v=` and localStorage before the first engine), `saveCurrent`,
  `deleteSaved`, `loadSaved`, `shareLink`, `runCompare`, `compare` state.
- Panel: the Version block gained saved rows (load / ×), Save as…, Share (copies + shows
  the link), Compare → `CompareSheet` (pick 2–3, run, side-by-side table, best in amber).

### M5 DoD, measured (headless Chrome, `scripts/shots/versions.js`)

| check | result |
|---|---|
| 3 versions compared in < 3 s | Custom-from-B + B + C, 24 h each: **1 694 ms** wall (workers in parallel: 788 / 786 / 1 638 ms) |
| opening a share URL restores the exact config | a generated link (custom from D: 1 lift, nearest, EV 30 %, stress, 110 residents, seed 9) boots to exactly that setup; `tests/share.test.ts` also proves two engines built from a setup and its decoded link produce identical metrics |
| saved versions persist | "Save as…" → localStorage entry (691 bytes), listed with its origin; max 12, same label replaces, corrupt entries ignored |
| gates | lint, typecheck, 61 tests, build green |

## M6 — failures & polish

- Panel block 10 `FailurePanel`: power loss, each lift, each shuttle as switches; spare
  shuttle status; Recover all. Header `degraded` badge; Live state banner lists what is down;
  the scene colours frozen mechanics clay.
- `Shortcuts`: `space` play/pause, `1`–`4` views, `/` search, `esc` clear (not inside fields).
- `prefers-reduced-motion` → camera cuts, no damping, no digit roll; `:focus-visible` outline.
- README with screenshots (`docs/screenshots/*.jpg`, generated by `scripts/shots/readme.js`)
  and the bench table.

### M6 DoD, measured

| check | result |
|---|---|
| Lighthouse (production build, Chrome 153 headless) | accessibility **100**, best practices **100** (performance 72 under Lighthouse's mobile throttling — a 3D app with a 130 kB first load; not a DoD item) |
| failure injection | `scripts/shots/failures.js`: lift-W switch → `failures.lifts = ['lift-W']`, `degraded: true`; power → `power: true`; Recover all → clean |
| shortcuts | space → running; `3` → shaft view; `/` → search focused; esc → selection cleared |
| gates | lint, typecheck, 61 tests, build green |

## M7 — presentation (DECISIONS U1, S32–S37)

- Real cars: `components/scene/carModels.ts` bakes the four CC0 models into paint / rest
  geometries; `VehiclePool` (moving, full detail), `ParkedCars` (parked field, LOD twin,
  solid + ghost per isolation) and `Context › KerbCars` (street, LOD twin) instance them.
- Surroundings: `Ground` (frame + lid fading with camera height, street, kerbs, lane marks),
  `Context` (lamps with glow pools, kerb cars, city wall, site settings mall / tower /
  courtyard), `Structure` (posts, rails, light strips, ≤ 3 level lights), `Bays` (pads,
  scanner portals, scan sweep), `EnvironmentLight` (RoomEnvironment PMREM), fog.
- Views: `street` and `follow` presets joined isometric / cutaway / shaft / slot; site and
  view chips in the viewport overlay; `useUiStore.follow(id)` tracks any car.
- Tour: `lib/story.ts` (steps, exit rules — tested in `tests/story.test.ts`) and
  `components/story/Story.tsx` (drives the stores, captions, keyboard, `?tour=1`).
- Dev handle grew `info()` (draw calls / triangles), `scene` and `camera` for profiling.

### M7 DoD, measured (headless Chrome 153, Apple M1 7-core GPU, 1440 × 900 window, dpr 1.75 → 1890 × 1323)

| check | result |
|---|---|
| preset B, mall, sim at 60× | isometric **60 FPS**, street 60, cutaway 60; GPU 10.5 ms/frame (73 parked cars) |
| preset C (320 slots), mall, sim at 60× | isometric **59–60 FPS**, street 60, cutaway 60; GPU 12.6 ms/frame (156 parked cars, 450 k triangles, 257 draw calls) |
| what the budget went to (C, before → after) | point lights 10 → 5: −2.8 ms; parked cars on LOD twins: −1.3 ms; Lambert surface: −2 ms; 14.4 → 11 ms with no context |
| tour end to end (`scripts/shots/tour.js`, `?tour=1`) | 9 steps in 82 s wall, every caption rendered, follow camera on the spawned car, 60 FPS at the end, state restored on Explore |
| scan sweep | `Bays` shows the plane only while a job is in stage `scan`; verified mid-scan at k = 0.31 (`scan.js`) |
| models | 4 × ~55 KB meshopt GLB + 4 × ~26 KB LOD twins = 330 KB, loaded once, baked once |
| gates | lint, typecheck, 69 tests (+ `story.test.ts`), build green |

### Things learned in M7

- Quaternius cars are flat-shaded with split normals, so a plain `simplify` barely reduces
  them (seams are locked); drop the normals, weld, simplify, then recompute flat normals.
- `gltf-transform optimize` merges materials by default (`--palette false --join false`
  keeps the body paint separable for per-instance tinting).
- On the M1 the fragment cost of point lights dominates at retina resolution: ~0.9 ms per
  light per full-screen layer at 1890 × 1323; the frame + lid are two such layers.
- Profiling from the headless driver: `window.__avp.info()` after `render()`, and toggling
  `visible` on scene objects between `time()` calls — with ~10 warm-up frames after every
  toggle, or shader recompiles are counted as frame time.

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

Everything in SPEC §10 (M0–M6) and the user's M7 (DECISIONS U1) is done. Open items that
need the user's eye, not code: the header name "AVP Simulator", header/timeline heights
(48/96 px), the tour's captions (English, `lib/story.ts`), and any decision in
`DECISIONS.md` they want changed. Ideas not built: cars driving on the street, a taxi in
the kerb row (the CC0 bundle has one), sound.
