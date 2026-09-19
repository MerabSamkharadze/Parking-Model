// Every camera preset, level isolation and a flyTo — run against `pnpm dev`:
//   node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/presets.js docs/shots
await waitFor('!!window.__avp');
await wait(800);
const clip = await evaluate(`(() => { const r = document.querySelector('section[aria-label="3D viewport"]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const ui = (code) => evaluate(`(() => { const s = window.__avp.ui.getState(); ${code}; return true; })()`);
const settle = () => wait(1600);
await settle();
await shot('isometric', clip);
await ui(`s.setCameraPreset('cutaway')`); await settle(); await shot('cutaway', clip);
await ui(`s.setCameraPreset('shaft')`); await settle(); await shot('shaft', clip);
await ui(`s.setCameraPreset('isometric'); s.toggleLevel(2)`); await settle(); await shot('isolation-L3', clip);
await ui(`s.clearLevel(); s.flyTo('L3-R2-05')`); await settle(); await shot('flyto-L3-R2-05', clip);
// DoD: 320 slots at 60 FPS — preset C, real requestAnimationFrame plus GPU-synced frame cost
await evaluate(`(() => { const sim = window.__avp.sim; sim.setState({ config: window.__avp.presets.C, engine: null, snapshot: null }); sim.getState().init(); return true; })()`);
await ui(`s.clearLevel(); s.selectSlot(null); s.setCameraPreset('isometric')`); await wait(2500);
const cost = await evaluate(`window.__avp.time(120)`);
const fps = await evaluate(`new Promise(res => { let n = 0; const t0 = performance.now(); function f() { n++; const dt = performance.now() - t0; if (dt < 3000) requestAnimationFrame(f); else res(Math.round(n / dt * 1000)); } requestAnimationFrame(f); })`);
const canvas = await evaluate(`(() => { const c = document.getElementsByTagName('canvas')[0]; return [c.width, c.height]; })()`);
await shot('isometric-C', clip);
return { slots: 320, canvas, fps, msPerFrame: +(cost.ms / cost.frames).toFixed(2) };
