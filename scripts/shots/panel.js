// M4 check — the whole panel at 08:30, plus an interaction pass:
//   DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/panel.js out/
await waitFor('!!window.__avp');
await wait(800);
const sim = (code) => evaluate(`(() => { const s = window.__avp.sim.getState(); ${code}; return true; })()`);
const state = () => evaluate(`(() => { const s = window.__avp.sim.getState(); const u = window.__avp.ui.getState(); const m = s.snapshot.metrics; return { t: Math.round(s.snapshot.t), config: s.config.id, from: s.config.derivedFrom ?? null, allocator: s.config.allocator, engineStrategy: s.engine.getStrategy(), demand: s.demand.name, residents: s.demand.residents, epoch: s.epoch, jobs: s.snapshot.jobs.length, events: s.snapshot.events.length, inTransit: m.inTransit, preset: u.cameraPreset, slot: u.selectedSlotKey, vehicle: u.selectedVehicleId, historyHead: s.history.head }; })()`);
const out = {};
// 08:30 with the morning behind us, so every block has data
await sim(`s.engine.run(8.5 * 3600); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
// the history only sees what was published: replay the day per minute for the sparklines/timeline
await sim(`const e = s.engine; const h = s.history; h.clear(); const snapMinutes = Math.floor(e.t / 60); const e2 = new (e.constructor)({ config: s.config, demand: s.demand, seed: s.seed, devChecks: false }); for (let m = 0; m <= snapMinutes; m++) { if (m > 0) e2.run(60); h.sample(e2.snapshot()); } s.setSnapshot(e.snapshot())`);
await wait(600);
await shot('panel-full');
// scroll the panel to each block and capture it
const blocks = ['Run control', 'Version', 'Facility', 'Strategy', 'Demand', 'Live state', 'Telemetry', 'Index', 'Event log'];
for (const b of blocks) {
  await evaluate(`(() => { const h = [...document.querySelectorAll('aside h2')].find(h => h.textContent === '${b}'); h.parentElement.scrollIntoView({ block: 'start' }); return true; })()`);
  await wait(300);
  const r = await evaluate(`(() => { const h = [...document.querySelectorAll('aside h2')].find(h => h.textContent === '${b}'); const r = h.parentElement.getBoundingClientRect(); return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, innerHeight - Math.max(0, r.y)) }; })()`);
  await shot(`block-${b.toLowerCase().replace(/ /g, '-')}`, r);
}
out.before = await state();
// --- interactions through the DOM ---
const click = (sel) => evaluate(`(() => { const el = ${sel}; if (!el) return 'missing'; el.click(); return el.textContent; })()`);
const byText = (text, root = 'aside') => `[...document.querySelectorAll('${root} button')].find(b => b.textContent.trim() === '${text}')`;
out.nearest = await click(byText('nearest')); await wait(200); out.afterNearest = await state();
out.defrag = await click(`document.querySelector('aside [role=switch]')`); await wait(200); out.afterDefrag = await state();
out.plusCar = await click(byText('+ Car')); await wait(200); out.afterPlusCar = await state();
// index: click the first parked row → flyTo + selection
out.row = await evaluate(`(() => { const rows = [...document.querySelectorAll('[aria-label="Cars in the system"] [role=option]')]; const r = rows.find(x => x.querySelector('.text-data')); if (!r) return 'no parked row'; r.click(); return r.textContent; })()`);
await wait(400); out.afterRow = await state();
out.retrieve = await click(byText('Retrieve')); await wait(300); out.afterRetrieve = await state();
// layout-shift check: the panel's block offsets must not move while numbers update
const offsets = () => evaluate(`JSON.stringify([...document.querySelectorAll('aside section')].map(s => Math.round(s.getBoundingClientRect().top)))`);
await evaluate(`(() => { document.querySelector('aside').scrollTop = 0; return true; })()`);
const o1 = await offsets();
await sim(`s.setSpeed(60); s.setRunning(true)`); await wait(2500);
const o2 = await offsets();
await sim(`s.setRunning(false)`);
out.layout = { before: o1, after: o2, same: o1 === o2 };
out.afterRun = await state();
// preset switch restarts
out.presetC = await click(`[...document.querySelectorAll('aside [role=option]')].find(o => o.textContent.includes('High throughput'))`); await wait(800); out.afterPreset = await state();
await shot('panel-after');
return out;
