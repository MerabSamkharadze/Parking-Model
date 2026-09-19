// M6 check — failure toggles, recovery, keyboard shortcuts:
//   DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/failures.js out/
await waitFor('!!window.__avp');
await wait(600);
const sim = (code) => evaluate(`(() => { const s = window.__avp.sim.getState(); ${code}; return true; })()`);
const state = () => evaluate(`(() => { const s = window.__avp.sim.getState(); const u = window.__avp.ui.getState(); return { running: s.running, preset: u.cameraPreset, failures: s.snapshot.failures, degraded: s.snapshot.metrics.degraded, focus: document.activeElement && document.activeElement.getAttribute('aria-label') }; })()`);
const key = (k) => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k === ' ' ? 'Space' : k === '/' ? 'Slash' : k === 'Escape' ? 'Escape' : 'Digit' + k, text: k.length === 1 ? k : undefined }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k === ' ' ? 'Space' : k === '/' ? 'Slash' : k === 'Escape' ? 'Escape' : 'Digit' + k }));
const out = {};
await sim(`s.engine.run(7.5 * 3600); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
// shortcuts: space toggles, 3 → shaft, / → search focus, esc → clears
await key(' '); await wait(150); out.afterSpace = await state();
await key(' '); await wait(150);
await key('3'); await wait(150); out.afterThree = await state();
await key('/'); await wait(150); out.afterSlash = await state();
await key('Escape'); await wait(150); // in the field: ignored
await evaluate(`(() => { document.activeElement.blur(); return true; })()`);
// failures via the DOM toggles
const toggle = (label) => evaluate(`(() => { const t = [...document.querySelectorAll('aside [role=switch]')].find(x => x.getAttribute('aria-label') === '${label}'); if (!t) return 'missing'; t.click(); return t.getAttribute('aria-checked'); })()`);
out.liftW = await toggle('lift-W down'); await wait(200); out.afterLift = await state();
out.power = await toggle('Power loss (everything freezes)'); await wait(200); out.afterPower = await state();
const clip = await evaluate(`(() => { const h = [...document.querySelectorAll('aside h2')].find(h => h.textContent === 'Failures'); h.parentElement.scrollIntoView({ block: 'start' }); const r = h.parentElement.getBoundingClientRect(); return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, innerHeight) }; })()`);
await wait(300); await shot('failures', clip);
await shot('degraded-page');
out.recover = await evaluate(`(() => { const b = [...document.querySelectorAll('aside button')].find(b => b.textContent.trim() === 'Recover all'); b.click(); return b.textContent.trim(); })()`);
await wait(200); out.afterRecover = await state();
return out;
