# CLAUDE.md — AVP Simulator

## Rules

1. **All work follows `SPEC.md`.** It is the single source of truth. If the spec is unclear or contradicts itself, stop and ask — do not invent (SPEC §0.4).
2. **Milestones are done in order: M0 → M6** (SPEC §10). No work from a later milestone starts before the current one is done. Every milestone ends with `pnpm typecheck`, `pnpm test` and `pnpm build` green, then a commit (SPEC §0.2).
3. **The numbers in SPEC §2 are never changed without the user's approval** — levels, lifts, bays, slot geometry, timings. If the engine produces different derived figures, report them; do not edit §2.
4. **The sim engine in `lib/sim` stays pure TypeScript.** No React, no three.js imports, no `window`, no `Math.random` — it must run headless (SPEC §4, §6).
5. **`lib/geometry.ts` is the only place slot coordinates are computed.** Engine and scene both call it; there is no second source of positions (SPEC §11).

## Working agreement

- Ask before installing any dependency that is not listed in SPEC §1.
- The 3D scene only visualises engine state; animation is never a source of truth (SPEC §0.3).
