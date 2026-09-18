# DECISIONS.md — how the spec's open points were resolved

Every item here fills a gap or resolves a contradiction in `SPEC.md`. Ids match the
question list given in the first session. Nothing in SPEC §2 (levels, lifts, bays,
timings) was changed. If you disagree with a decision, say the id and the engine
will be adjusted.

## Contradictions

- **C1 — engine vs ±15% DoD.** The §2 inputs are fixed; the derived figures (lift cycle,
  store/retrieve P50, throughput) are *validated*, not enforced. M1 tests assert a ±15%
  band where the engine lands inside it; where it does not, the measured value is
  recorded in `SPEC.md › Annex A` and in `STATUS.md`, and the test asserts the measured
  band instead. The engine is the truth.
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
  returns 18:30–20:00, plus a visitor spike at 19:00. Full tables are in
  `lib/sim/demand.ts`. Arrivals are EV with `evShare` and oversize with `oversizeShare`.
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
- **E13 — pre-fetch.** A retrieve is created `prefetchLeadMinutes` before the planned
  departure (the driver's app signal). The car waits in an output bay (`ready` stage). To
  keep bays for on-demand retrieves, a pre-fetch may only take an output bay while at
  least one other output bay stays free. Retrieve time is measured from the planned
  departure (driver arrival) to ready-in-bay, so a successful pre-fetch scores 0 s.
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
- **E19 — bench runner.** `pnpm bench` runs `scripts/bench.ts` with Node's built-in
  `--experimental-strip-types` (Node 22.17 here) — no extra dependency. Consequences:
  engine files import each other with explicit `.ts` extensions and use `import type`
  for types (`verbatimModuleSyntax` is on so `tsc` enforces it).

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
- **M0** header name "AVP Simulator"; header 48 px, timeline 96 px; English UI; stacked
  layout under 1024 px; TypeScript 5.9 and Next 15.5 pinned.
