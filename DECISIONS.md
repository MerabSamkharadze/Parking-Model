# DECISIONS.md — how the spec's open points were resolved

Every item here fills a gap or resolves a contradiction in `SPEC.md`. Ids match the
question list given in the first session. Nothing in SPEC §2 (levels, lifts, bays,
timings) was changed. If you disagree with a decision, say the id and the engine
will be adjusted.

## Contradictions

- **C1 — engine vs ±15% DoD.** The §2 inputs are fixed and the §2 derived figures are the
  target: lift cycle 25–32 s, ≈220 lift movements/h capacity (preset B), store P50 ≈ 55 s,
  retrieve P50 ≈ 50 s. M1 tests assert ±15 % around them. If the engine lands outside,
  the *engine's modelling* is corrected (resource-holding rules, idle policies), never the
  spec. Measured values are reported in `STATUS.md`.
- **C2 — 2 shuttles/level (preset C).** A level's corridor is split into
  `shuttlesPerLevel` contiguous **zones** of equal column count. Each zone has exactly one
  shuttle that never leaves its zone, so two shuttles can never meet (the §4.2 guarantee
  is kept by construction). Lifts sit at zone boundaries (see E2).
- **C3 — ALL CAPS.** SQL keywords in the event log (`INSERT`, `SELECT`, `LOCK WAIT`,
  `REJECT`, `SHUFFLE`, …) are the intended exception, like `INPUT`/`OUTPUT` on the floor.
  No other label is upper-case.
- **C4 — lot size.** "~34 × 20 m" is descriptive only; nothing is drawn from it. The
  footprint is derived from the config (B: 42.8 m × 14 m underground).
- **C5 — X range.** All coordinates are config-derived in `lib/geometry.ts`; §9's
  −20…+20 is just preset B.

## Engine

- **E1 — lift assignment.** Lifts are bidirectional and pooled: a store may use any lift
  reachable from its slot's zone, a retrieve likewise. Input bays (west deck) and output
  bays (east deck) are pooled resources; the 14 s bay↔lift transfer is the same for every
  bay/lift pair (surface transfer system). Lift choice: the free lift with the smallest
  (repositioning time + corridor travel from that shaft to the slot column).
- **E2 — shaft and bay positions.** Shafts are 5.8 m long in the corridor axis. `W` and
  `E` sit just outside the slot field (B: x = ∓18.5 — matches §2). Lifts 3–4 need a
  second zone: they sit in the gap between zones, one facing each zone (C: `M1`, `M2`).
  A config with more lifts than 2 × zones keeps only the placeable ones and reports a
  warning. Bays are drawn on the surface deck beyond the end shafts, in rows of five
  along Z; they have no engine geometry (pooled resources).
- **E3 — slot key.** `L{level}-R{row}-{col}` with 1-based level and row, 2-digit 1-based
  column: `L1-R1-01` … `L6-R2-12`. `SlotId` stays 0-based.
- **E4 — resource holding.**
  - input bay: held from driver arrival through drop-off (35 s), scan (8 s), waiting for
    the lift, and the bay → lift transfer (14 s); released when the transfer ends.
  - lift: reserved together with the target level's shuttle (all-or-nothing, see below)
    when the scan ends; held while repositioning to the surface, during the transfer, the
    descent and the handover; released after the handover and **left at that level**
    (no empty return — the next job calls it where it needs it).
  - shuttle: for a store, reserved with the lift and sent to the shaft while the lift is
    busy; held through handover, corridor travel and insert; released at the slot. For a
    retrieve, reserved first (sent to the column), held through extract, corridor travel
    and handover.
  - output bay: reserved when the lift reaches the surface; held through the transfer,
    any waiting for the driver (pre-fetch) and the 45 s pick-up.
  - **Deadlock freedom by lock ordering** `bay_in < shuttle < lift < bay_out`: a store
    takes {shuttle, lift} atomically, a retrieve takes shuttle → lift → bay_out, a
    shuffle takes {shuttle A, shuttle B, lift} atomically. No job ever waits for a
    lower-ranked resource while holding a higher one, so no cycle can form.
  - **Idle positioning** (needed to reach the §2 figures — see STATUS.md): an idle lift
    returns to the surface; when two or more lifts are idle, the spare ones pre-position
    toward a level with a retrieve in progress. An idle shuttle waits at the column of the
    parked car on its level with the earliest planned departure (the system knows dwell
    targets — the same knowledge `dwell-aware` and pre-fetch use) when that departure is
    within 20 min, otherwise at the centre of its zone. Idle moves are interruptible.
  - A retrieve may use any free lift its zone can reach (`any` policy). Restricting it to
    the nearest shaft was measured: +3 % lift capacity, but retrieve P95 under stress
    rises from ~100 s to ~140 s, so `any` stays.
- **E5 — job stages.** The §3 list is kept and extended so that every wait is explicit and
  the renderer never guesses: `queued, bay, scan, lift_wait, to_lift, lift_move,
  shuttle_wait, handover, corridor, insert, extract, corridor_out, lift_up, bay_wait,
  bay_out, ready, pickup, done`. Resource repositioning (a lift coming to a level, a
  shuttle driving to the shaft) is motion of the *resource*, tracked on the resource with
  start/end times, not a job stage.
- **E6 — jitter.** Every timed stage is `nominal × (1 + U(−0.12, +0.12))`, seeded.
- **E7/E8/E9 — demand.** `hourly[h].arrivals` is the Poisson rate of **visitor** arrivals;
  `hourly[h].departures` is the weight distribution of **residents' habitual departure
  times** (each resident leaves daily at its habitual time ± 10 min and returns after
  `residentDwell`). Visitors leave after `visitorDwell`. The sim starts at 00:00 with
  `residents` cars parked (via the active allocator, cold zone under `zoned`) and runs
  day after day with the same profile. `stress` = every resident leaves 08:00–09:00 and
  returns 18:55–19:10, plus a visitor spike at 19:00. Full tables are in
  `lib/sim/demand.ts`. Arrivals are EV with `evShare` (residents 0.6 × that — EV slots are
  10 % of the field and residents charge at home) and oversize with `oversizeShare`.
  Residents and visitor rates scale with `slots / 144` so presets A–D see comparable
  demand intensity (A: 64 residents, C: 213).
- **E10 — slot mix.** Preset B: 10 % EV, 4 % oversize (per level: 2 EV slots at the two
  columns nearest the W shaft, 1 oversize slot at the far column). EV cars need an EV
  slot and oversize cars an oversize slot — otherwise `REJECT`. A standard car takes a
  standard slot first, then an EV slot, then an oversize slot (last resort). Oversize =
  length > 5.3 m or height > 1.65 m or width > 2.05 m.
- **E11 — zoned overflow.** `zoned` spills to the other zone when the preferred zone has
  no compatible free slot. When the whole facility has no compatible slot, the arrival is
  rejected (`REJECT #id full`) and counted in `metrics.rejected`.
- **E12 — nearest.** Cost is in seconds: `level × 2.2 + columns-from-nearest-shaft × 1.625`
  (pitch ÷ shuttle speed). Ties → lower level, lower column.
- **E13 — pre-fetch.** The app signal arrives `prefetchLeadMinutes` before the planned
  departure. The engine does **not** fetch the car immediately (measured: cars fetched
  15 min early fill the three output bays, later cars wait on the lift and lift capacity
  collapses from 215 to 51 movements/h). Instead it starts the retrieve just in time —
  at `planned − (nominal retrieve duration for that slot × 1.15 + 12 s)` — and admits at
  most `baysOut − 1` pre-fetched cars at once, so one bay always stays for on-demand
  retrieves. The car waits in the bay (`ready` stage) for the driver. Retrieve time is
  measured from the planned departure (driver arrival) to ready-in-bay, so a successful
  pre-fetch scores 0 s (measured: P50 0 s, P90 10 s, P95 38 s with a 10-min lead).
- **E14 — night defrag.** At 03:00, if 15-min lift utilisation < 20 % and `nightDefrag`
  is on: up to 30 `shuffle` jobs move the cars with the earliest planned departures to
  free slots with a lower `nearest` cost (upper level / nearer shaft). Pre-fetch and
  defrag belong to M1 (engine) and are exposed in the panel in M4.
- **E15 — failures.** A failed lift/shuttle (or power loss) freezes the job holding it
  mid-stage (timers shift by the downtime) and is skipped by new reservations; waiting
  jobs re-target the remaining resources. Recovery resumes exactly where things stopped.
  The spare shuttle replaces the first failed shuttle after 15 sim-minutes
  (`spareSwapMinutes`), once per run, when `spareShuttle` is true (B: true).
- **E16 — invariant (4).** Counts jobs that hold at least one resource; queued jobs are
  unbounded by design (that is what `stress` shows).
- **E17 — BenchResult.** `{ presetId, seed, hours, ticks, elapsedMs, summary }` with
  throughput/h, store P50/P90, retrieve P50/P95, lift and shuttle utilisation, queue max,
  rejected — everything the compare table (§5) needs.
- **E18 — `derivedFrom`.** Added as an optional field on `FacilityConfig`.
- **E20 — shuttle start position.** Shuttles start at the centre of their zone, the same
  place idle shuttles rest (E4), instead of the west end. Bench figures are unchanged
  (the rest logic moved them there within the first 10 sim-seconds anyway); the scene
  no longer shows six shuttles hanging in the west shaft at 00:00.
- **E21 — `Job.bay` and `slotsVersion`.** A store's input bay is released the moment the
  car leaves it (`lift_wait` → `to_lift`), which is right for capacity but leaves the
  scene without the transfer's origin; jobs therefore keep `bay` (the bay id) after the
  resource is released. Snapshots carry `slotsVersion`, bumped on every slot change, so
  React work on the slot field happens only when a slot actually changed (20 Hz
  snapshots otherwise re-render nothing).
- **E19 — bench runner.** `pnpm bench` runs `scripts/bench.ts` with Node's built-in
  `--experimental-strip-types` (Node 22.17 here) — no extra dependency. Consequences:
  engine files import each other with explicit `.ts` extensions and use `import type`
  for types (`verbatimModuleSyntax` is on so `tsc` enforces it).

## User overrides

- **U1 — presentation grade (2026-09-19).** The user asked for a realistic, presentable
  showcase: real car models found on the internet (licence-clean), breathtaking detail,
  and animation that explains the idea to a first-time viewer — the facility fits malls,
  large buildings and residential courtyards and solves the city's parking problem. This
  overrides SPEC §12 ("no GLTF, everything from primitives") for cars and raises the
  visual bar of §7/§9 without dropping the dark industrial identity. Delivered as M7
  (see STATUS.md, decisions S32–S38); CC0 assets only (~330 KB of models in total), the
  engine untouched, every scene addition still driven by engine state (SPEC §0.3).

## Scene / UI (applied from M2 on)

- **S1** drei: `OrbitControls`, `Instances`, `Text` allowed; `Environment` not used.
- **S2** slot colours: free = `--slab-edge`, reserved = `--amber` at 50 %, occupied =
  `--data`, called (retrieve in progress) = `--clay`, EV = `--lime` when free; the EV
  colour yields to occupied/called.
- **S3** level k (1-based) floor at y = −k × levelHeight (L1 ceiling is the surface).
  L1 is the "upper" level.
- **S4** parked cars are slot colour only; the 40-mesh pool renders cars in bays and in
  motion.
- **S5** level labels use drei `Text` (one draw per level), not sprites.
- **S6** the index table is hand-rolled windowing (~40 lines), no library.
- **S7** "− retrieve" calls the selected index row, else the parked car with the
  earliest planned departure.
- **S8** the timeline strip is built in M4.
- **S9** hot zone = `ceil(levels / 3)` upper levels (A: 2, B: 2, C: 3).
- **S10** Lighthouse is run with `npx lighthouse` (tool, not a dependency) in M6.
- **S11 — React StrictMode is off** (`next.config.ts`). R3F 9.7's `Canvas` tears its
  renderer down 500 ms after an unmount (`forceContextLoss`); StrictMode's simulated
  unmount in development fires that while the same canvas is still mounted, so the dev
  scene went black after "THREE.WebGLRenderer: Context Lost". Production builds are not
  affected (verified). Revisit when upstream handles the double mount.
- **S12 — dev handle.** Development builds expose `window.__avp`
  (`components/scene/DevHandle.tsx`): `render()`, `frame()`, `time(n)`, `snapshot()`, the
  stores and the presets. A hidden or headless tab gets no `requestAnimationFrame`, so
  this is how the scene is driven and screenshot-checked without a visible window
  (`scripts/screenshot.mjs` + `scripts/shots/*.js`, headless Chrome over CDP, no
  dependencies). Stripped from production bundles.
- **S13 — camera presets are fits, not positions.** `cameraGoal` fits the facility hull
  (structure, bay markings, floor labels) into the frustum for the live aspect ratio
  (`fitDistance`), so isometric / cutaway / shaft work for A–D and custom configs. Slot
  focus (`flyTo`, index click) also isolates the slot's level and draws an amber ring
  on the slot floor; a resize never moves the camera, only a new preset does.
- **S14 — level isolation = two InstancedMeshes** (solid + ghost at opacity 0.15,
  no depth write). The common case is one draw call; single-slot changes touch one
  instance (no re-mount).
- **S15 — quality.** `PCFShadowMap` (three r186 removed PCFSoft, R3F's default);
  `AdaptiveQuality` drops shadows, then dpr to 1, when a 2 s window averages under
  50 FPS, ignoring stalled frames (hidden tab) so a tab switch never degrades quality.
  dpr is capped at 1.75 (SPEC §9).
- **S16 — pins.** React/react-dom `~19.2` (R3F 9.7 peer range `<19.3`); `@types/three`
  for strict typing; IBM Plex Mono is self-hosted (`public/fonts`, OFL) because drei
  `Text` needs a font file, not a CSS font.
- **S17 — the catch-up cap drops owed time.** `advance(dt)` accumulates `dt × speed`,
  steps whole ticks, at most 40 per frame (SPEC §4.1). Sim time owed beyond that cap is
  discarded: after a hidden tab the clock slips instead of bursting (a burst would
  freeze the UI for seconds at 60×). At 60 FPS the cap only binds above 240×; at 15 FPS
  it caps the effective speed at exactly 60×.
- **S18 — render clock.** Snapshots go to React at 20 Hz; the scene never animates from
  frame deltas. Every frame reads `clock.t = engine.t + owed` (the sub-tick time) and
  evaluates the engine's own move descriptors (`positionAt`) and stage windows
  (`progressAt`), so 1× motion is smooth at 60 FPS and 60× shows the same trajectories
  faster. A frame may run ≤ 50 ms ahead of its snapshot; everything clamps to the stage
  and move it knows, so the worst case is a car resting for one snapshot interval.
- **S19 — where a car is drawn** (`components/scene/motion.ts`, tested over a 9-hour run
  for continuity at every hand-off): store `bay/scan/lift_wait` in the bay; `to_lift`
  bay → platform; `lift_move/shuttle_wait` on the platform; `handover` the car changes
  height between platform and shuttle at the shaft; `corridor` on the shuttle; `insert`
  quarter turn + push into the slot, lowered onto the floor. Retrieve is the mirror
  (`extract` … `bay_out`, `ready`, `pickup` drives off during the last third). Shuffles
  reuse the same rules with `shuttle2` marking the source-level phase. Parked cars stay
  slot colour (S4); a slot mid-slide drops to a pad so the car is never drawn twice.
- **S20 — surface transfer lane.** Pooled lifts (E1) mean a retrieve may surface in the
  west shaft and end in an east output bay; the transfer crosses the deck at ground
  level in the 14 s bay ↔ lift time. A faint lane is drawn across the deck so this reads
  as designed, not as a glitch.
- **S21 — VehiclePool.** Three InstancedMeshes (body, cabin, glass) × 40, one unit box
  scaled per instance — three draw calls for every moving car, no runtime geometry.
  Three variants (hatchback / sedan / SUV) chosen by a hash of the ticket; oversize cars
  are longer and taller. Colours: standard `--ink-soft`, EV `--lime`, oversize `--ink`,
  glass `--data`. The lift plate's top is flush with the level floor, so a car stands at
  the same height on the platform, the floor and the deck. At most 6 queued cars are
  drawn on the street west of the input bays; the panel shows the real queue.
- **S22 — run control lives in the panel from M3** (play/pause, 1×/4×/16×/60×, clock,
  reset, seed) because M3's DoD needs it; M4 fills the other blocks. The header clock
  is live and shows `D2` … on later days.
- **S23 — panel cadence.** Panel blocks read the snapshot at most twice a second
  (`panelTick`), the event log only when events change, sparklines and the timeline once
  per sim-minute (`lib/history.ts`, a 1440-slot ring of throughput / queue / store P50 /
  lift utilisation / occupancy). The scene keeps its 20 Hz snapshots; React never
  re-renders the panel at snapshot rate.
- **S24 — what restarts, what is hot.** Facility fields are a draft: the "Restart needed"
  badge appears as soon as it differs and an explicit Restart applies it (SPEC §8.3).
  Demand profile and residents restart immediately (they seed the engine). Strategy is
  hot (SPEC §8.4). Any of these makes the running config a `custom` version derived
  from the preset (`deriveConfig`, SPEC §5), shown in the header and the version list;
  saving and sharing it is M5. A restart drops the index selection.
- **S25 — digits roll.** `RollingNumber` / `StatValue` render each digit as a 1ch column
  that translates to its new value (300 ms; none under `prefers-reduced-motion`). Every
  stat has a fixed width in `ch`, sparklines and bars are fixed boxes, so an update can
  never shift the layout (M4 DoD). When a value's length changes the digits remount
  instead of rolling.
- **S26 — index table.** Hand-rolled windowing: 24 px rows in a 240 px viewport, four rows
  of overscan. Rows are cars parked or in the system; moving cars show their job stage
  in amber instead of a slot. A row click selects the car and, when parked, isolates its
  level and flies to the slot; "Retrieve" calls the selected parked car; the Demand
  block's "− Retrieve" uses the selection, else the earliest planned departure (S7).
- **S27 — timeline strip.** Per-minute throughput (line, `--data`) and queue (area,
  `--clay`) for the current day, an amber cursor at now; minutes not yet reached today
  show yesterday's values dimmed. Axis labels are the only mono text on it.
- **S28 — event log.** Filters: all / INSERT / SELECT (+PREFETCH) / LOCK WAIT / REJECT /
  ops (SHUFFLE, DEFRAG, FAIL, RECOVER, SPARE). Colours by kind (clay for REJECT/FAIL,
  amber for LOCK WAIT/SPARE, data for SELECT, lime for RECOVER). Auto-scroll sticks to
  the bottom unless the reader scrolled up; timestamps are HH:MM:SS of the sim day.
- **S29 — share links.** `?v=` carries base64url JSON of `{config, demand profile,
  residents, seed}` (an untouched preset shares as just its id, `?v=C`). Decoding
  validates every numeric field and the allocator before trusting it; a shared preset id
  maps back to the built-in object. "Share" copies the link and writes it to the address
  bar, so the URL always reproduces what is on screen. Saved versions live in
  localStorage (`avp.versions.v1`, newest first, max 12, same label replaces), every
  access in try/catch — a blocked storage keeps working in memory for the session.
- **S30 — compare mode runs the same day for every version**: the current demand
  profile, residents and seed, 24 h, one Web Worker per version in parallel (2–3), so
  the wall time is the slowest version, not the sum. The best value per metric is amber;
  ties highlight nothing. The candidates are the unsaved custom setup, A–D and the saved
  versions; the scene keeps showing the active one.
- **S31 — M6 polish.** Shortcuts (`space`, `1`–`4`, `/`, `esc`) live in one global
  listener that ignores keystrokes inside fields. `prefers-reduced-motion` makes camera
  goals cuts (no lerp, no orbit damping) and is honoured by every CSS transition
  (`motion-reduce:`). `:focus-visible` is a 1 px amber outline everywhere. Power loss
  colours every lift and shuttle clay (frozen), a failed resource only itself; the header
  shows a clay `degraded` badge. Touch targets are ≥ 24 px (steppers 24, switches 24 × 40)
  — Lighthouse accessibility 100 / best practices 100 on the production build.
  Lighthouse is run with `npx lighthouse@12` (a tool, not a dependency — S10).
- **S32 — real cars (U1; supersedes S4 for the car itself).** Four CC0 Quaternius models
  (`public/models`, ~55 KB each after meshopt) are baked once at load into two geometries
  per model — *paint* (tinted per instance) and *rest* (vertex colours; headlights forced
  warm white, tail lights red) — oriented +X forward with the wheels on y = 0, so
  `motion.ts` placement needs no per-model offsets. Everything is instanced: the moving
  pool costs two draw calls per model, the parked field four (solid + ghost for the
  non-isolated levels), the kerb two. Model and paint per ticket come from an FNV hash of
  the vehicle id (stable across frames, reloads and machines); oversize cars are the SUV
  at × 1.12. Parked and kerb cars use a reduced-detail twin (`public/models/lod`,
  `scripts/models/lod.mjs`: normals dropped so the flat-shaded seams weld, meshopt
  simplification at 1 % error → ~52 % of the triangles, flat normals recomputed when
  baked) — invisible at slot-camera distance, 724 k → 375 k triangles for preset C.
  The slot pad keeps the S2 hues under the car, occupied and EV pulled most of the way to
  the slab so the field reads as a floor with cars on it, not a grid of lights.
- **S33 — lighting budget.** Every point light is evaluated by every lit pixel, and the
  ground and lid cover the whole frame, so: at most three level lights (`litLevelsOf`,
  spread top to bottom; a light reaches its neighbours anyway) plus two over the bays;
  the surface planes use the Lambert model (matte asphalt gains nothing from PBR); street
  lamps light nothing — their pools are additive glow discs on the ground; a hemisphere
  light gives the night sky fill. Preset C at 1890 × 1323 went from 14.4 to ~11 ms GPU.
- **S34 — surface and context.** The ground is a four-plane frame around the pit plus a lid
  over it; `surfaceOpacity(cameraY)` fades all of it from 12 % above 8 m (the dollhouse
  view) to opaque below 3.5 m (the street view). Around it: a two-lane street with kerb
  cars (one gap every fifth space) and lamps, a far-side city wall, fog from 140 m. Site
  chips: none / mall (block with a sign band and canopy) / tower (podium + 28 × 64 m
  tower) / courtyard (three residential blocks, lawn, trees on the far side of the pit
  only so the levels stay readable). Section views (cutaway, shaft) drop the near street,
  which would otherwise float in front of the pit.
- **S35 — bays you can read.** Concrete pads inside the markings, a scanner portal with a
  light bar over every input bay, and the scan itself: an amber plane sweeps the car
  there and back while its job is in stage `scan` — timing is `progressAt` over the
  engine's stage window, the scene never decides when.
- **S36 — guided tour.** Nine steps (`lib/story.ts`): problem (street, 1×) → idea
  (isometric, 4×) → drop-off / down the shaft / into the slot (follow camera; the shaft
  step runs at 1× so the descent is watchable) → parked (slot view) → call it back
  (follow) → where it fits (settings cycle every 4 s) → the numbers (cutaway, manual).
  Stage-driven steps end on the job's stage, never before `minSeconds` (reading time) and
  never after their timeout; a rejected car moves the tour on after 3 s. Starting saves
  running / speed / setting / view and stopping restores them; `?tour=1` autostarts; `→`
  `Enter` `←` `Esc` navigate; the tour spawns a visitor and follows it, and calls that
  same car back (else the next planned departure).
- **S37 — steel.** Instanced posts at every column boundary on both rows, shuttle guide
  rails per corridor, a light strip under each slab (one draw call each for the whole
  rack); the follow camera sits at (7, 4.5, 8.5) from the car, damped at 2.5 s⁻¹.
- **S38 — the street lives.** Ten cars circulate on the two driving lanes (scenery on
  wall-clock time — never engine state, SPEC §0.3 — frozen under reduced motion, hidden
  with the rest of the near street in section views). A store's car now *arrives*: during
  the first fifth of the drop-off dwell it drives from the head of the queue lane into its
  bay (`motion.ts`, stage `bay`, engine-timed like everything else), so the follow camera
  and the tour show a car pulling in, being scanned, and leaving the driver behind. The
  app opens under the mall (`setting: 'mall'`), not in a void.
- **M0** header name "AVP Simulator"; header 48 px, timeline 96 px; English UI; stacked
  layout under 1024 px; TypeScript 5.9 and Next 15.5 pinned.
