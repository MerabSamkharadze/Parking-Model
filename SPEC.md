# AVP Simulator — პროექტის სპეციფიკაცია

**პროდუქტი:** ავტომატური მიწისქვეშა პარკინგის (Automated Vehicle Parking) ინტერაქტიული 3D სიმულატორი — ერთი გვერდი, სადაც მარცხნივ ცხოვრობს 3D მოდელი, მარჯვნივ control panel, საიდანაც ირჩევ კონფიგურაციის ვერსიებს და აკონტროლებ სისტემის რეალურ დროში მდგომარეობას.

**აუდიტორია:** ავტორი (portfolio / დემო), არქიტექტორი ან developer, რომელსაც უნდა გაიგოს რატომ არის ეს კვანძი უფრო სწრაფი ვიდრე ჩვეულებრივი ზვინვარა პარკინგი.

**მთავარი idea:** პარკინგი = database. ადგილი = row, მისამართი = primary key, ჩაყენება = INSERT, გამოძახება = SELECT, lift/shuttle = worker, სართული = shard. ეს ანალოგია UI-ში ღიად ჩანს (event log SQL-ის სტილში, index table, allocation strategy), მაგრამ არასდროს ხდება მთავარი შოუ — მთავარი შოუ არის მექანიკა.

---

## 0. როგორ გამოიყენოს ეს ფაილი Claude Code-მა

1. პროექტის root-ში შეინახე ეს ფაილი როგორც `SPEC.md`, გააკეთე `CLAUDE.md` სადაც ერთი აბზაცი წერია: «ყველა სამუშაო SPEC.md-ის მიხედვით. milestone-ებს ვასრულებთ თანმიმდევრობით. რიცხვები (levels, lifts, cycle times) სპეციფიკაციიდან არ იცვლება ჩემი დასტურის გარეშე.»
2. მუშაობა milestone-ებად (§9). ყოველი milestone ბოლოს: `pnpm typecheck`, `pnpm test`, `pnpm build` მწვანე უნდა იყოს, შემდეგ commit.
3. sim engine იწერება 3D-მდე. ანიმაცია არასდროს არაა truth source — მხოლოდ engine-ის state-ის ვიზუალიზაცია.
4. თუ სპეციფიკაციაში წინააღმდეგობა აღმოაჩინე — შეაჩერე და იკითხე, არ გამოიგონო.

---

## 1. Stack

| ფენა | არჩევანი | შენიშვნა |
|---|---|---|
| framework | Next.js 15, App Router, TypeScript strict | ერთი route `/`, სრულად client-side სიმულაცია |
| 3D | three.js + `@react-three/fiber` + `@react-three/drei` | drei-დან მხოლოდ: `OrbitControls`, `Instances`, `Text`, `Environment` არ გამოიყენო |
| state | `zustand` | ორი store: `useSimStore` (snapshot), `useUiStore` (camera, panel, selection) |
| styling | Tailwind v4 + CSS variables tokens | tokens §7-ში |
| charts | საკუთარი SVG sparkline კომპონენტი (~60 ხაზი) | chart library არ ჩაამატო, overkill-ია |
| animation (UI) | `framer-motion` მხოლოდ panel-ის გადასვლებზე | 3D-ში framer არ ერევა |
| tests | `vitest` | მხოლოდ engine-ს ვფარავთ, UI-ს არა |
| package manager | pnpm | |

არ გამოიყენო: redux, socket, backend, database, auth. ყველაფერი browser-შია.

---

## 2. Facility spec (ფიზიკური მოდელი, default preset «B»)

ეს არის რეფერენს-ობიექტი: შერეული დანიშნულების შენობა ცენტრში, ნაკვეთი ~34×20 მ.

```
slots           144   (6 levels × 2 rows × 12 columns)
level height    1.9 m (ადამიანი შიგნით არ შედის)
slot pitch      2.6 m (X ღერძი)
slot depth      5.2 m (Z ღერძი, ორივე მხარეს)
corridor width  3.6 m (Z = 0 ღერძზე, shuttle-ის ლიანდაგი)
lifts           2 (bidirectional): shaft W (x = -18.5), shaft E (x = +18.5)
input bays      3 (surface, დასავლეთი deck)
output bays     3 (surface, აღმოსავლეთი deck)
shuttles        1 თითო სართულზე + 1 სათადარიგო (სათადარიგო არ მოდელირდება ანიმაციაში, მხოლოდ reliability-ში)
pallet          არ არის — comb/fork exchange
```

**დროები (nominal, თითოეული ± jitter 12%):**

```
driver drop-off (bay occupancy)        35 s
profile scan + gate                     8 s
bay → lift transfer                    14 s
lift vertical, per level               2.2 s  (+ 3 s accel/decel/level align)
lift → shuttle handover                 6 s
shuttle corridor travel                1.6 m/s (accel 0.8 m/s²)
insert into slot (rotate + push)       11 s
extract from slot                      11 s
driver pick-up (bay occupancy)         45 s
```

**წარმოებული მაჩვენებლები, რომლებსაც engine-მა უნდა დაადასტუროს:**
- lift cycle ≈ 25–32 s → throughput ≈ 2 × 110 = ~220 მოძრაობა/სთ
- store time (bay-დან slot-მდე): P50 ≈ 55 s
- retrieve time (call-დან bay-ში მზადყოფნამდე): P50 ≈ 50 s, pre-fetch-ით 0–15 s
- თუ engine სხვა შედეგს აძლევს — engine არის სწორი, სპეციფიკაციაში კომენტარით ჩაწერე რეალური მნიშვნელობა

---

## 3. Domain model (`lib/sim/types.ts`)

```ts
export type SlotClass = 'standard' | 'ev' | 'oversize';
export type Zone = 'hot' | 'cold';

export interface SlotId { level: number; row: 0 | 1; col: number }  // 0-based
export interface Slot {
  id: SlotId;
  key: string;            // "L3-R2-07"  ← primary key, UI-ში ჩანს
  cls: SlotClass;
  zone: Zone;
  state: 'free' | 'reserved' | 'occupied';
  vehicleId: string | null;
}

export interface Vehicle {
  id: string;             // ticket: "#1042"
  plate: string;
  profile: { length: number; width: number; height: number; ev: boolean };
  tenant: 'resident' | 'visitor';   // cold / hot
  slotKey: string | null;
  arrivedAt: number;      // sim seconds
  dwellTarget: number;    // დაგეგმილი დგომის ხანგრძლივობა
}

export type JobKind = 'store' | 'retrieve' | 'shuffle';   // shuffle = ღამის defrag
export type JobStage =
  | 'queued' | 'bay' | 'to_lift' | 'lift_move' | 'handover'
  | 'corridor' | 'insert' | 'done'
  | 'extract' | 'corridor_out' | 'lift_up' | 'bay_out';

export interface Job {
  id: string;
  kind: JobKind;
  vehicleId: string;
  slotKey: string;
  stage: JobStage;
  stageStartedAt: number;
  stageEndsAt: number;
  createdAt: number;
  finishedAt: number | null;
  resources: { bay?: string; lift?: string; shuttle?: string };
  progress: number;       // 0..1 მიმდინარე stage-ში, რენდერი ამას იყენებს
}

export interface Resource { id: string; kind: 'bay_in'|'bay_out'|'lift'|'shuttle'; busyWith: string | null; level?: number }

export interface FacilityConfig { /* §5 */ }
export interface DemandProfile { /* §4.3 */ }

export interface SimSnapshot {
  t: number;              // sim seconds
  slots: Slot[];
  vehicles: Record<string, Vehicle>;
  jobs: Job[];
  resources: Resource[];
  metrics: Metrics;
  events: SimEvent[];     // ბოლო 200
}
```

---

## 4. Simulation engine (`lib/sim/*`) — ყველაზე მნიშვნელოვანი ნაწილი

წესი: engine არის pure TypeScript, არ იცის React-ის და three.js-ის შესახებ, არ ეხება `window`-ს. ეს საშუალებას გვაძლევს, იგივე კოდი გავუშვათ headless benchmark-ში (§6).

### 4.1 Loop
- fixed timestep: `TICK = 100 ms` sim-დროში. `engine.step()` წინ სწევს ერთი tick-ით.
- host (React) აგროვებს `dt * speed` და უშვებს იმდენ tick-ს, რამდენიც სჭირდება, ერთ frame-ში მაქსიმუმ 40 tick (catch-up cap).
- determinism: seeded PRNG (mulberry32). ერთი და იგივე seed + config = ერთი და იგივე შედეგი. `Math.random()` engine-ში აკრძალულია.
- snapshot React-ს გადაეცემა 20 Hz-ზე (`structuredClone` არ გამოიყენო — აგროვე immutable shallow ასლები).

### 4.2 Resource model (collision-safety)
შეჯახება გამორიცხულია არქიტექტურით, არა ჭკვიანი ლოგიკით:
- ყოველი მოძრაობა მოითხოვს `acquire(resource)`-ს. თუ რესურსი დაკავებულია — job ჩერდება `queued` stage-ში და რიგში ელოდება (FIFO + priority).
- ერთ სართულზე ერთი shuttle → ორი მანქანა ერთ დერეფანში ვერ ხვდება.
- ერთ შახტში ერთი პლატფორმა.
- slot ჯერ `reserved` ხდება, მხოლოდ შემდეგ იძვრება მანქანა → double-booking შეუძლებელია.
- `assert` ფუნქცია `lib/sim/invariants.ts`-ში, ყოველ tick-ზე dev-რეჟიმში ამოწმებს: (1) ერთი resource ერთ job-ზე, (2) ერთი slot ერთ vehicle-ზე, (3) მოძრავი მანქანა არ არის slot-ში, (4) job-ების რაოდენობა ≤ რესურსების რაოდენობა × 3.

### 4.3 Demand model
```ts
interface DemandProfile {
  name: string;                  // 'weekday' | 'saturday' | 'stress'
  residents: number;             // ღამით დაკავებული ადგილები
  hourly: Array<{ h: number; arrivals: number; departures: number }>; // 0..23
  visitorDwell: [number, number];  // წთ, uniform
  residentDwell: [number, number];
}
```
- მოსვლა = Poisson process საათობრივი rate-ით (seeded).
- `weekday` preset: დილის peak 8:00–9:30 (departures ~95), საღამოს peak 18:00–20:00, კომერციის ნაკადი 11:00–19:00.
- `stress` preset: ყველა ერთდროულად 19:00-ზე — რიგის ქცევის ჩვენება.

### 4.4 Allocation strategies (`lib/sim/allocator.ts`)
ინტერფეისი: `(slots: Slot[], v: Vehicle, ctx) => Slot | null`
1. `nearest` — უმცირესი cost = `level*W1 + col*W2`; მაქსიმალური სიჩქარე, ცუდი ბალანსი
2. `zoned` — visitor → hot (L1–L2), resident → cold (L3–L6); **default**
3. `balanced` — ირჩევს ყველაზე ნაკლებად დატვირთულ სართულს (shuttle queue-ის მიხედვით)
4. `dwell-aware` — dwellTarget-ის მიხედვით: მოკლე დგომა ზედა სართულზე

EV/oversize მანქანა შესაბამის `SlotClass`-ს მოითხოვს, სხვაგან არ განთავსდება (constraint).

### 4.5 დამატებითი ქცევები
- **pre-fetch:** `retrieve` job-ის შექმნა app-ის სიგნალით, მძღოლის მოსვლამდე N წუთით. `prefetchLeadMinutes` config-ში. ეფექტი პირდაპირ უნდა ჩანდეს retrieve P50-ზე.
- **night defrag:** 03:00-ზე `shuffle` job-ები ალაგებს მანქანებს გასვლის სავარაუდო რიგის მიხედვით. მხოლოდ მაშინ, თუ lift utilization < 20%.
- **failure injection:** panel-იდან ჩართვადი — lift down, shuttle down, power loss. ქცევა: მიმდინარე job ჩერდება `stage`-ში (fail-safe brake), რიგი გადადის დარჩენილ რესურსზე, metrics-ში ჩნდება degraded ბანერი.

### 4.6 Metrics
```ts
interface Metrics {
  occupancy: number;            // 0..1
  inTransit: number;
  queueIn: number; queueOut: number;
  storeTime: Percentiles;       // {p50, p90, p95, max, n}
  retrieveTime: Percentiles;
  throughputPerHour: number;    // rolling 15 sim-min ფანჯარა
  liftUtilization: number[];    // per lift
  shuttleUtilization: number[]; // per level
  hotZoneOccupancy: number;
  rejected: number;             // constraint violations
}
```
Percentile-ებისთვის reservoir არ სჭირდება — 4000-ელემენტიანი ring buffer საკმარისია.

---

## 5. Version / preset სისტემა (control panel-ის ღერძი)

```ts
interface FacilityConfig {
  id: string; label: string; note: string;
  levels: number; rows: 2; cols: number; levelHeight: number;
  pitch: number; slotDepth: number; corridorWidth: number;
  lifts: number; baysIn: number; baysOut: number; shuttlesPerLevel: number;
  slotMix: { ev: number; oversize: number };   // წილი
  timings: Timings;                             // §2 ცხრილი, ყველა ველი override-ადი
  allocator: 'nearest'|'zoned'|'balanced'|'dwell-aware';
  prefetchLeadMinutes: number;                  // 0 = გამორთული
  nightDefrag: boolean;
}
```

**built-in presets (`lib/presets.ts`):**

| id | label | კონფიგი | რისთვის |
|---|---|---|---|
| `A` | მინიმალური | 4 levels, 1 lift, 1+1 bay, 96 slots | აჩვენებს, სად იჭედება ერთი lift |
| `B` | რეკომენდებული | 6 levels, 2 lifts, 3+3 bays, 144 slots, zoned | default |
| `C` | მაღალი throughput | 8 levels, 4 lifts, 6+6 bays, 2 shuttle/level, 320 slots | აჩვენებს, სად გადადის bottleneck shuttle-ზე |
| `D` | «ბაქანი იაფია» | B + 10 input / 10 output bay | ამტკიცებს, რომ ბაქანი throughput-ს არ ზრდის, რიგს კი ხსნის |

**ფუნქციონალი:**
- preset-ის არჩევა → engine restart იმავე seed-ით
- ნებისმიერი ველის ხელით შეცვლა → იქმნება `custom` ვერსია (`derivedFrom: 'B'`)
- ვერსიები ინახება `localStorage`-ში (`try/catch`-ით), max 12
- share: config → JSON → base64 → `?v=` query param
- **compare mode:** 2–3 ვერსია ერთდროულად გაიშვება headless-ად (§6) და panel აჩვენებს გვერდიგვერდ ცხრილს: throughput, store P50, retrieve P50/P95, lift util, queue max. 3D სცენაზე ჩანს მხოლოდ აქტიური ვერსია.

---

## 6. Headless benchmark (`lib/sim/bench.ts` + `scripts/bench.ts`)

```ts
runBench({ config, demand, hours: 24, seed: 42 }): BenchResult
```
- გადის სიმულაციას მაქსიმალური სიჩქარით, რენდერის გარეშე
- UI-ში იძახება Web Worker-ში (`workers/bench.worker.ts`), რომ main thread არ დაიბლოკოს
- CLI: `pnpm bench --presets A,B,C,D --hours 24` → markdown ცხრილი stdout-ში
- იგივე ფუნქცია გამოიყენება compare mode-ისთვის

---

## 7. ვიზუალური იდენტობა

**სუბიექტი:** ჩაფლული ბეტონის კვანძი, სადაც ყვითელი მექანიკა ბნელში მუშაობს. მითითება — industrial control room და კონსტრუქციული ნახაზი, არა «tech startup dashboard». ბნელი სცენა ლეგიტიმურია, რადგან ობიექტი მიწისქვეშაა.

**Tokens (`app/globals.css`):**
```css
:root{
  --void:#0A1013;        /* სცენის ფონი */
  --slab:#1B252A;        /* ბეტონი */
  --slab-edge:#3A4A53;   /* ნახაზის ხაზი */
  --amber:#F2A615;       /* მექანიკა: lift, shuttle */
  --data:#3AA2CC;        /* დაკავებული slot, index */
  --clay:#D4573A;        /* გამოძახებული, შეცდომა */
  --lime:#A9C23F;        /* ev slot */
  --ink:#E8EBEA; --ink-soft:#8C9A9F; --panel:#121A1E; --line:#26323A;
}
```
light theme არ არის — ობიექტი ბნელია, ეს გადაწყვეტილებაა და არა გამოტოვება. `prefers-color-scheme` არ ვცვლით, `color-scheme: dark` დაყენებულია.

**ტიპოგრაფია:**
- `Noto Sans Georgian` 400/500/700 — ყველა ტექსტი. სათაური 700, tracking `-0.02em`
- `IBM Plex Mono` 400/500 — მხოლოდ იდენტიფიკატორები და რიცხვები: slot key, ticket, დრო, percentile. სხვაგან mono არ გამოიყენო
- სათაურები sentence case-ში. ALL CAPS label-ები აკრძალულია, გარდა 3D სცენაში `INPUT` / `OUTPUT` აღნიშვნების (ეს ნამდვილი იატაკის მარკირებაა)

**Layout:**
```
┌──────────────────────────────────────────────┬──────────────────┐
│  header: ობიექტის სახელი · ვერსია · სთ 18:24  │                  │
├──────────────────────────────────────────────┤   control panel   │
│                                              │   (360 px, scroll)│
│              3D viewport (full bleed)        │                  │
│                                              │   § 8-ის ბლოკები   │
│  [ჩრდილში: ბაქნების რიგი, სართულის label]      │                  │
├──────────────────────────────────────────────┤                  │
│  timeline strip: 24 სთ, throughput + queue    │                  │
└──────────────────────────────────────────────┴──────────────────┘
```
- panel მარჯვნივ, არ ცურავს canvas-ზე — ბეტონის კიდესავით მკაფიო საზღვარი (1px `--line`)
- < 1024 px: panel გადადის ქვემოთ sheet-ად, viewport 55vh
- ერთადერთი «გაბედული» ელემენტი: მექანიკის ყვითელი მოძრაობა ბნელში. დანარჩენი — წყნარი ნაცრისფერი და თხელი ხაზები. gradient wash, glow, glass-morphism, card-ების ერთგვაროვანი ბადე — არა
- არასაჭირო motion არ არის: panel-ის რიცხვები იცვლება ციფრის გადახვევით, არა fade-and-slide-ით

---

## 8. Control panel — ბლოკები

1. **Run control** — play/pause, სიჩქარე (1× / 4× / 16× / 60×), sim clock (24 სთ ციკლი), reset, seed input
2. **Version** — preset-ების სია (A–D + შენახული custom), აქტიურის label + note, ღილაკი «შედარება»
3. **Facility** — levels, lifts, bays in/out, shuttles/level, slot mix (ev/oversize slider-ები). ცვლილება აჩვენებს «restart საჭიროა» badge-ს
4. **Strategy** — allocator-ის არჩევა, prefetch lead (0–15 წთ), night defrag toggle. ცვლილება გამოიყენება ცხელ რეჟიმში, restart-ის გარეშე
5. **Demand** — profile (weekday / saturday / stress), residents, ხელით `+ მანქანა` / `− გამოძახება` ღილაკები
6. **Live state** — occupancy bar სართულების ჭრილში, in-transit, queue in/out, degraded ბანერი
7. **Telemetry** — 4 sparkline: throughput/სთ, queue, store P50, lift utilization. ქვემოთ percentile ცხრილი
8. **Index** — ვირტუალიზებული ცხრილი: ticket, plate, slot key, zone, dwell. ძებნა plate/ticket-ით, სტრიქონზე დაჭერა → კამერა მიფრინდება slot-თან და მონიშნავს, «გამოტანა» ღილაკი
9. **Event log** — SQL-ის სტილში, monospace, auto-scroll, filter: `INSERT #1042 → L3-R2-07 · 54.2s` / `SELECT #0987 ← L1-R1-03 · 41.8s` / `LOCK WAIT lift-W · 6.1s` / `REJECT #1103 oversize`
10. **Failures** — lift down, shuttle down, power loss toggle-ები + «აღდგენა»

პრინციპი: ყოველი ღილაკი აკეთებს ზუსტად იმას, რასაც წერია. «Submit» არ არსებობს — «მანქანის ჩაყენება» → log-ში `INSERT`.

---

## 9. 3D სცენა (`components/scene/*`)

**კოორდინატები:** X = დერეფანი (−20…+20), Y = სიმაღლე (0 = ზედაპირი, ქვევით უარყოფითი), Z = სართულის სიღრმე (−7…+7). 1 unit = 1 მ.

**შემადგენლობა:**
- `SurfaceDeck` — ზედაპირის ფილა, input/output ბაქნების მარკირება, გამჭვირვალე «ქუჩის» სიბრტყე
- `LevelSlab` (×levels) — იატაკი + `EdgesGeometry` ნახაზის ხაზები + სართულის label sprite
- `SlotField` — **InstancedMesh** ყველა slot-ისთვის (ერთი draw call). ფერი per-instance attribute-ით: free / reserved / occupied / called / ev
- `Shaft` (×lifts) — ვერტიკალური ჩარჩო + `LiftPlatform` (ყვითელი, Y ინტერპოლირდება job progress-იდან)
- `Shuttle` (×levels) — ბრტყელი ყვითელი ერთეული, X მოძრაობს
- `VehiclePool` — 40 mesh-ის pool, არავითარი ახალი geometry runtime-ში. მანქანა = body + cabin + glass, 3 varianti
- `Lighting` — ambient 0.5 + directional key + ცივი fill ქვევიდან. shadow map მხოლოდ directional-ზე, 1024, და მხოლოდ თუ FPS > 50
- `CameraRig` — OrbitControls damping-ით, 4 preset ხედი (isometric / cutaway / shaft / slot focus), `flyTo(slotKey)` ანიმაცია

**რენდერის წესები:**
- ანიმაცია იკითხავს `job.stage` + `job.progress`-ს და მხოლოდ ინტერპოლაციას აკეთებს. თუ sim paused — სცენა გაყინულია
- `useFrame`-ში ახალი ობიექტი არ იქმნება (vector-ები module-ის დონეზე)
- `dpr={[1, 1.75]}`, `frameloop="always"` მხოლოდ როცა tab ხილულია
- 60 FPS სამიზნე desktop-ზე 320 slot-ით და 25 მოძრავი მანქანით. თუ ვერ აღწევს — გამორთე shadow, შემდეგ შეამცირე dpr
- level isolation: არჩეული სართული სრულად ჩანს, დანარჩენები opacity 0.15

---

## 10. Milestones

**M0 — scaffold.** Next.js + TS strict + Tailwind + vitest, tokens, ფონტები, ცარიელი layout (header / viewport / panel / timeline). DoD: `pnpm build` მწვანე, layout responsive.

**M1 — sim engine (3D-ის გარეშე).** types, PRNG, resource manager, job state machine, allocator-ები, demand, metrics, invariants. DoD: 12+ vitest test — determinism (იგივე seed = იგივე metrics), collision invariant-ები 24 სთ-ზე არ ირღვევა, `runBench` აძლევს §2-ის დროებს ±15%-ში. **ამ ეტაპზე UI არ არსებობს — მხოლოდ `pnpm bench`.**

**M2 — სტატიკური 3D.** მთელი გეომეტრია config-იდან, InstancedMesh slot-ები, კამერის preset-ები, level isolation. DoD: 320 slot-ზე 60 FPS, ერთი slot-ის ფერის შეცვლა re-mount-ის გარეშე.

**M3 — engine ↔ scene.** snapshot bridge, VehiclePool, lift/shuttle ანიმაცია ყველა stage-ზე, play/pause/speed. DoD: 24 სთ 60×-ზე გადის artifact-ების გარეშე, paused სცენა გაყინულია.

**M4 — control panel.** §8-ის ბლოკები 1–9, index ცხრილი ძებნით და `flyTo`-თი, event log, sparkline-ები. DoD: ყოველი კონტროლი აისახება sim-ზე, panel-ში layout shift არ ხდება რიცხვების განახლებისას.

**M5 — ვერსიები.** presets A–D, custom config, localStorage, share URL, compare mode Web Worker-ით. DoD: 3 ვერსიის შედარება < 3 წმ-ში, URL-ის გახსნა აღადგენს ზუსტ კონფიგს.

**M6 — failure & polish.** failure injection, degraded UI, keyboard shortcuts (space, 1–4 ხედები, `/` ძებნა), focus-visible, `prefers-reduced-motion`, README ეკრანის სურათებით, `bench` შედეგების ცხრილი README-ში. DoD: Lighthouse a11y ≥ 95, TS/test/build მწვანე.

---

## 11. ფაილების სტრუქტურა

```
app/
  layout.tsx  page.tsx  globals.css
components/
  layout/{Header,PanelRail,TimelineStrip}.tsx
  panel/{RunControl,VersionPicker,FacilityForm,StrategyForm,DemandForm,
         LiveState,Telemetry,IndexTable,EventLog,FailurePanel,CompareSheet}.tsx
  scene/{Viewport,SurfaceDeck,LevelSlab,SlotField,Shaft,LiftPlatform,
         Shuttle,VehiclePool,Lighting,CameraRig}.tsx
  ui/{Sparkline,StatValue,Toggle,Slider,Badge}.tsx
lib/
  sim/{engine,types,prng,resources,jobs,allocator,demand,metrics,invariants,bench}.ts
  presets.ts  share.ts  geometry.ts        # config → 3D კოორდინატები, ერთადერთი source
store/{useSimStore,useUiStore}.ts
workers/bench.worker.ts
scripts/bench.ts
tests/*.test.ts
SPEC.md  CLAUDE.md  README.md
```

`lib/geometry.ts` კრიტიკულია: slot-ის კოორდინატს ითვლის მხოლოდ ერთი ფუნქცია, რომელსაც იყენებს ორივე — engine (მანძილები და დროები) და სცენა (პოზიციები). ორმაგი ჭეშმარიტება არ არსებობს.

---

## 12. არ შედის scope-ში

backend, მრავალმომხმარებლიანობა, ნამდვილი PLC პროტოკოლი, ხარჯების კალკულატორი, VR, სართულის რედაქტორი drag&drop-ით, ხანძრის სიმულაცია, მანქანის დეტალური მოდელი (GLTF-ები არ იტვირთება — ყველაფერი პრიმიტივებისგან).
