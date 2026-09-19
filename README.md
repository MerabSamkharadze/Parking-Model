# AVP Simulator

Interactive 3D simulator of an automated underground vehicle-parking facility. Everything runs in the browser.

The project is specified in [`SPEC.md`](./SPEC.md) and built milestone by milestone (M0 → M6). Working rules for contributors and agents are in [`CLAUDE.md`](./CLAUDE.md).

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest (engine only)
pnpm build
pnpm bench --presets A,B,C,D --hours 24 [--demand weekday,stress] [--seed 42]

# scene screenshots / FPS check with headless Chrome (needs `pnpm dev` on :3000)
DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/presets.js out/
```

Progress and measured numbers: [`STATUS.md`](./STATUS.md). How the spec's open points were
resolved: [`DECISIONS.md`](./DECISIONS.md).

## Engine benchmark (24 h, seed 42, weekday demand)

| preset | slots | lift cap/h | lift cycle | store P50 | retrieve P50 | retrieve P95 |
| --- | --- | --- | --- | --- | --- | --- |
| A — minimal | 96 | 101 | 35.5 s | 56.7 s | 52.3 s | 129.3 s |
| B — recommended | 144 | 210 | 34.3 s | 56.1 s | 49.2 s | 90.1 s |
| C — high throughput | 320 | 407 | 35.4 s | 56.8 s | 50.3 s | 88.3 s |
| D — bays are cheap | 144 | 211 | 34.2 s | 55.7 s | 48.7 s | 89.8 s |
