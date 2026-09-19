// README screenshots (JPEG) — run against `pnpm dev`:
//   W=1440 H=900 DPR=2 FORMAT=jpeg node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/readme.js docs/screenshots
await waitFor('!!window.__avp');
await wait(600);
const sim = (code) => evaluate(`(() => { const s = window.__avp.sim.getState(); ${code}; return true; })()`);
const ui = (code) => evaluate(`(() => { const s = window.__avp.ui.getState(); ${code}; return true; })()`);
const stepUntil = (kind, stage, max = 400000) => evaluate(`(() => {
  const s = window.__avp.sim.getState(); const e = s.engine; let n = 0; let hit = null;
  while (n++ < ${max}) { e.step(); for (const j of e.activeJobs.values()) if (j.kind === '${kind}' && j.stage === '${stage}') { hit = j; break; } if (hit) break; }
  s.setSnapshot(e.snapshot()); s.clock.t = e.t;
  return hit ? hit.slotKey : null;
})()`);
const viewport = () => evaluate(`(() => { const r = document.querySelector('section[aria-label="3D viewport"]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
// 1. the whole app mid-morning with cars moving
await sim(`s.engine.run(7 * 3600 + 50 * 60); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await sim(`const e = s.engine; const h = s.history; h.clear(); const e2 = new (e.constructor)({ config: s.config, demand: s.demand, seed: s.seed, devChecks: false }); for (let m = 0; m <= 470; m++) { if (m > 0) e2.run(60); h.sample(e2.snapshot()); } s.setSnapshot(e.snapshot())`);
await stepUntil('store', 'corridor');
await ui(`s.setCameraPreset('isometric')`); await wait(1800);
await shot('app');
// 2. a car being inserted, level isolated
const slot = await stepUntil('store', 'insert');
await sim(`s.engine.run(4); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await ui(`s.flyTo('${slot}')`); await wait(1800);
await shot('insert', await viewport());
// 3. the shaft with a car on the lift
await stepUntil('store', 'lift_move');
await sim(`s.engine.run(3); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await ui(`s.clearLevel(); s.selectSlot(null); s.setCameraPreset('shaft')`); await wait(1800);
await shot('shaft', await viewport());
// 4. compare table
const click = (text) => evaluate(`(() => { const b = [...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === '${text}'); b.click(); return true; })()`);
await click('Compare'); await wait(200);
await click('Run compare');
await waitFor(`window.__avp.sim.getState().compare.rows.length > 0`, 30000);
await wait(300);
const clip = await evaluate(`(() => { const h = [...document.querySelectorAll('aside h2')].find(h => h.textContent === 'Version'); h.parentElement.scrollIntoView({ block: 'start' }); const r = h.parentElement.getBoundingClientRect(); return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, innerHeight) }; })()`);
await wait(200);
await shot('compare', clip);
return { slot };
