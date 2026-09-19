// The guided tour end to end (DECISIONS U1): one screenshot per step, run
// against `pnpm dev`:
//   DPR=2 node scripts/screenshot.mjs "http://localhost:3000/?tour=1" scripts/shots/tour.js out/
await waitFor('!!window.__avp');
await wait(3000);
const viewport = () => evaluate(`(() => { const r = document.querySelector('section[aria-label="3D viewport"]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const clip = await viewport();
const state = () => evaluate(`(() => { const u = window.__avp.ui.getState(); const s = window.__avp.sim.getState(); return { step: u.storyStep, preset: u.cameraPreset, setting: u.setting, follow: u.followVehicleId, level: u.selectedLevel, speed: s.speed, running: s.running, t: Math.round(s.snapshot.t) }; })()`);
const seen = [];
let last = -2;
const started = Date.now();
while (Date.now() - started < 240000) {
  const st = await state();
  if (st.step !== last) {
    last = st.step;
    if (st.step < 0) break;
    await wait(2500);
    const title = await evaluate(`(() => { const h = document.querySelector('[aria-label="Guided tour"] h3'); return h ? h.textContent : null; })()`);
    await shot(`tour-${String(st.step + 1).padStart(2, '0')}`, clip);
    seen.push({ ...(await state()), title });
    if (st.step === 8) {
      // the last step waits for the viewer
      await evaluate(`(() => { const b = [...document.querySelectorAll('[aria-label="Guided tour"] button')].find(b => b.textContent.trim() === 'Explore'); b.click(); return true; })()`);
      await wait(500);
      seen.push(await state());
      break;
    }
  }
  await wait(400);
}
const fps = await evaluate(`new Promise(res => { let n = 0; const t0 = performance.now(); function f() { n++; const dt = performance.now() - t0; if (dt < 2000) requestAnimationFrame(f); else res(Math.round(n / dt * 1000)); } requestAnimationFrame(f); })`);
return { seen, fps, wall: Math.round((Date.now() - started) / 1000) };
