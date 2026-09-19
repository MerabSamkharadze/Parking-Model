// M3 check — run against `pnpm dev`:
//   DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/motion.js out/
// Fast-forwards to the morning peak, plays at 4×, screenshots the motion,
// then checks that a paused scene is pixel-identical between two frames.
await waitFor('!!window.__avp');
await wait(800);
const clip = await evaluate(`(() => { const r = document.querySelector('section[aria-label="3D viewport"]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const sim = (code) => evaluate(`(() => { const s = window.__avp.sim.getState(); ${code}; return true; })()`);
const ui = (code) => evaluate(`(() => { const s = window.__avp.ui.getState(); ${code}; return true; })()`);
// 07:40 — residents leaving, visitors arriving
await sim(`s.engine.run(7 * 3600 + 40 * 60); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await ui(`s.setCameraPreset('isometric')`);
await sim(`s.setSpeed(4); s.setRunning(true)`);
await wait(2500);
await shot('motion-iso-1', clip);
await wait(3000);
await shot('motion-iso-2', clip);
await ui(`s.setCameraPreset('shaft')`); await wait(2500);
await shot('motion-shaft', clip);
await ui(`s.setCameraPreset('cutaway')`); await wait(2500);
await shot('motion-cutaway', clip);
const state = await evaluate(`(() => { const s = window.__avp.sim.getState(); const snap = s.snapshot; return { t: Math.round(snap.t), clock: Math.round(s.clock.t), jobs: snap.jobs.map(j => j.kind[0] + ':' + j.stage), inTransit: snap.metrics.inTransit, queueIn: snap.metrics.queueIn }; })()`);
// pause: two frames a second apart must be identical
await sim(`s.setRunning(false)`);
await wait(2500); // let the camera damping settle
const a = await shot('paused-a', clip);
await wait(1000);
const b = await shot('paused-b', clip);
const fps = await evaluate(`new Promise(res => { let n = 0; const t0 = performance.now(); function f() { n++; const dt = performance.now() - t0; if (dt < 2000) requestAnimationFrame(f); else res(Math.round(n / dt * 1000)); } requestAnimationFrame(f); })`);
return { clip, state, paused: [a, b], fps };
