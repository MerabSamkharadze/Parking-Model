// M3 DoD: a full 24 h day at 60× (≈ 24 min wall). Reports FPS samples, the
// sim time reached and any console error. Run against `pnpm dev`:
//   DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/day60x.js out/
await waitFor('!!window.__avp');
await wait(800);
const clip = await evaluate(`(() => { const r = document.querySelector('section[aria-label="3D viewport"]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const sim = (code) => evaluate(`(() => { const s = window.__avp.sim.getState(); ${code}; return true; })()`);
await sim(`s.setSpeed(60); s.setRunning(true)`);
const samples = [];
const started = Date.now();
let nextShot = 3 * 3600;
while (Date.now() - started < 25 * 60 * 1000) {
  const fps = await evaluate(`new Promise(res => { let n = 0; const t0 = performance.now(); function f() { n++; const dt = performance.now() - t0; if (dt < 5000) requestAnimationFrame(f); else res(Math.round(n / dt * 1000)); } requestAnimationFrame(f); })`);
  const st = await evaluate(`(() => { const s = window.__avp.sim.getState(); const m = s.snapshot.metrics; return { t: Math.round(s.snapshot.t), day: s.snapshot.day, jobs: s.snapshot.jobs.length, inTransit: m.inTransit, queueIn: m.queueIn, warnings: s.snapshot.warnings.length }; })()`);
  samples.push({ wall: Math.round((Date.now() - started) / 1000), fps, ...st });
  if (st.day >= 1) break;
  if (st.t >= nextShot) { await shot(`day-${String(Math.floor(st.t / 3600)).padStart(2, '0')}h`, clip); nextShot += 3 * 3600; }
  await wait(55000);
}
await sim(`s.setRunning(false)`);
const end = await evaluate(`(() => { const s = window.__avp.sim.getState(); const m = s.snapshot.metrics; return { t: Math.round(s.snapshot.t), day: s.snapshot.day, completedStore: m.completedStore, completedRetrieve: m.completedRetrieve, storeP50: m.storeTime.p50, retrieveP50: m.retrieveTime.p50, rejected: m.rejected }; })()`);
await shot('day-end', clip);
return { clip, samples, end, minFps: Math.min(...samples.map((x) => x.fps)) };
