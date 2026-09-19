// M3 check: step the engine to moments where cars are in given stages and
// screenshot them (paused, one frame each). Run against `pnpm dev`:
//   DPR=2 node scripts/screenshot.mjs http://localhost:3000/ scripts/shots/stages.js out/
await waitFor('!!window.__avp');
await wait(800);
const clip = await evaluate(`(() => { const r = document.querySelector('section[aria-label="3D viewport"]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const sim = (code) => evaluate(`(() => { const s = window.__avp.sim.getState(); ${code}; return true; })()`);
const ui = (code) => evaluate(`(() => { const s = window.__avp.ui.getState(); ${code}; return true; })()`);
// step until some job is in `stage`; returns that job (or null after `max` ticks)
const stepUntil = (kind, stage, max = 400000) => evaluate(`(() => {
  const s = window.__avp.sim.getState(); const e = s.engine; let n = 0; let hit = null;
  while (n++ < ${max}) { e.step(); for (const j of e.activeJobs.values()) if (j.kind === '${kind}' && j.stage === '${stage}') { hit = j; break; } if (hit) break; }
  s.setSnapshot(e.snapshot()); s.clock.t = e.t;
  return hit ? { id: hit.id, slot: hit.slotKey, res: hit.resources, t: Math.round(e.t) } : null;
})()`);
const out = {};
await sim(`s.engine.run(6 * 3600); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
out.toLift = await stepUntil('store', 'to_lift');
await sim(`s.engine.run(7); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`); // mid-transfer
await ui(`s.clearLevel(); s.setCameraPreset('shaft')`); await wait(1800); await shot('stage-to-lift', clip);
out.liftMove = await stepUntil('store', 'lift_move');
await sim(`s.engine.run(3); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await wait(300); await shot('stage-lift-move', clip);
out.corridor = await stepUntil('store', 'corridor');
await sim(`s.engine.run(2); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
const level = out.corridor ? Number(out.corridor.slot.slice(1, out.corridor.slot.indexOf('-'))) - 1 : 0;
await ui(`s.clearLevel(); s.toggleLevel(${level}); s.setCameraPreset('cutaway')`); await wait(1800); await shot('stage-corridor', clip);
out.insert = await stepUntil('store', 'insert');
await sim(`s.engine.run(4); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await ui(`s.flyTo('${out.insert ? out.insert.slot : 'L1-R1-01'}')`); await wait(1800); await shot('stage-insert', clip);
out.extract = await stepUntil('retrieve', 'extract');
await sim(`s.engine.run(4); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await ui(`s.flyTo('${out.extract ? out.extract.slot : 'L1-R1-01'}')`); await wait(1800); await shot('stage-extract', clip);
out.bayOut = await stepUntil('retrieve', 'bay_out');
await sim(`s.engine.run(7); s.setSnapshot(s.engine.snapshot()); s.clock.t = s.engine.t`);
await ui(`s.clearLevel(); s.selectSlot(null); s.setCameraPreset('isometric')`); await wait(1800); await shot('stage-bay-out', clip);
out.queued = await stepUntil('store', 'queued', 800000);
await wait(300); await shot('stage-queued', clip);
out.summary = await evaluate(`(() => { const snap = window.__avp.sim.getState().snapshot; return { t: Math.round(snap.t), jobs: snap.jobs.map(j => j.kind[0] + ':' + j.stage) }; })()`);
return { clip, ...out };
