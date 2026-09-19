// M5 check — compare mode timing, share round trip, saved versions:
//   DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/versions.js out/
await waitFor('!!window.__avp');
await wait(600);
const click = (sel) => evaluate(`(() => { const el = ${sel}; if (!el) return 'missing'; el.click(); return (el.textContent || '').trim(); })()`);
const byText = (text) => `[...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === '${text}')`;
const out = {};
// 1. make it custom (strategy chip), then compare current vs B vs C
await click(byText('dwell-aware'));
await click(byText('Compare')); await wait(300);
out.options = await evaluate(`[...document.querySelectorAll('[aria-label="Versions to compare"] button')].map(b => b.textContent.trim())`);
await click(`[...document.querySelectorAll('[aria-label="Versions to compare"] button')].find(b => b.textContent.trim().startsWith('C ·'))`);
out.picked = await evaluate(`[...document.querySelectorAll('[aria-label="Versions to compare"] button[aria-pressed="true"]')].map(b => b.textContent.trim())`);
await click(byText('Run compare'));
await waitFor(`window.__avp.sim.getState().compare.running === false && window.__avp.sim.getState().compare.rows.length > 0`, 30000);
out.compare = await evaluate(`(() => { const c = window.__avp.sim.getState().compare; return { elapsedMs: c.elapsedMs, rows: c.rows.map(r => ({ id: r.id, label: r.label, slots: r.slots, ms: r.elapsedMs, storeP50: +r.summary.storeP50.toFixed(1), retrieveP50: +r.summary.retrieveP50.toFixed(1), throughput: +r.summary.throughputPerHour.toFixed(1) })), error: c.error }; })()`);
const clip = await evaluate(`(() => { const h = [...document.querySelectorAll('aside h2')].find(h => h.textContent === 'Version'); h.parentElement.scrollIntoView({ block: 'start' }); const r = h.parentElement.getBoundingClientRect(); return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, innerHeight) }; })()`);
await wait(300);
await shot('compare', clip);
// 2. save as a version, then share
await click(byText('Save as…')); await wait(200);
await evaluate(`(() => { const i = document.querySelector('input[aria-label="Version name"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, 'Dwell test'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await click(byText('Save')); await wait(300);
out.versions = await evaluate(`window.__avp.sim.getState().versions.map(v => ({ label: v.label, from: v.config.derivedFrom, allocator: v.config.allocator }))`);
out.stored = await evaluate(`(localStorage.getItem('avp.versions.v1') || '').length`);
await click(byText('Share')); await wait(400);
out.url = await evaluate(`location.href`);
out.shareState = await evaluate(`(() => { const s = window.__avp.sim.getState(); return { allocator: s.config.allocator, from: s.config.derivedFrom, seed: s.seed, demand: s.demand.name }; })()`);
return out;
