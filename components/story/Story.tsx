'use client';

// The guided tour (DECISIONS U1): nine captions that walk a first-time
// viewer from the parking problem to a car being dropped off, stored,
// called back and the numbers behind it, driving the camera, the
// surroundings and the simulation. Steps advance on time or on what the
// followed car is doing (lib/story.ts); the viewer can step, go back or
// leave at any point.

import { useCallback, useEffect, useRef, useState } from 'react';
import { chipClass } from '@/components/ui/Chip';
import { parseSlotKey } from '@/lib/geometry';
import { STORY, stepDone, type StoryContext } from '@/lib/story';
import { useSimStore, type Speed } from '@/store/useSimStore';
import { useUiStore, type CameraPreset, type Setting } from '@/store/useUiStore';

interface Saved {
  running: boolean;
  speed: Speed;
  setting: Setting;
  preset: CameraPreset;
}

export function useStory() {
  const step = useUiStore((s) => s.storyStep);
  const setStep = useUiStore((s) => s.setStoryStep);
  const vehicle = useRef<string | null>(null);
  const started = useRef(0);
  const saved = useRef<Saved | null>(null);
  const [, force] = useState(0);

  const stop = useCallback(() => {
    const ui = useUiStore.getState();
    const sim = useSimStore.getState();
    ui.follow(null);
    ui.clearLevel();
    ui.selectSlot(null);
    if (saved.current) {
      sim.setSpeed(saved.current.speed);
      sim.setRunning(saved.current.running || true);
      ui.setSetting(saved.current.setting);
      ui.setCameraPreset(saved.current.preset === 'follow' ? 'isometric' : saved.current.preset);
      saved.current = null;
    }
    vehicle.current = null;
    setStep(-1);
  }, [setStep]);

  const start = useCallback(() => {
    const ui = useUiStore.getState();
    const sim = useSimStore.getState();
    if (!sim.snapshot) return;
    saved.current = { running: sim.running, speed: sim.speed, setting: ui.setting, preset: ui.cameraPreset };
    vehicle.current = null;
    ui.selectSlot(null);
    ui.clearLevel();
    sim.setRunning(true);
    setStep(0);
  }, [setStep]);

  const go = useCallback(
    (index: number) => {
      if (index < 0) return;
      if (index >= STORY.length) {
        stop();
        return;
      }
      setStep(index);
    },
    [setStep, stop],
  );

  // entering a step: camera, surroundings, speed, actions
  useEffect(() => {
    if (step < 0) return;
    const s = STORY[step];
    const ui = useUiStore.getState();
    const sim = useSimStore.getState();
    started.current = performance.now();
    sim.setSpeed(s.speed);
    sim.setRunning(true);
    if (s.setting) ui.setSetting(s.setting);
    if (s.enter === 'spawn') {
      ui.clearLevel();
      const id = sim.addVehicle('visitor');
      vehicle.current = id;
      const job = id ? useSimStore.getState().snapshot?.jobs.find((j) => j.vehicleId === id) : undefined;
      if (job) ui.isolateLevel(parseSlotKey(job.slotKey).level);
      ui.follow(id);
    } else if (s.enter === 'call') {
      const id = vehicle.current;
      const v = id ? useSimStore.getState().snapshot?.vehicles[id] : undefined;
      if (id && v?.state === 'parked' && v.slotKey) {
        ui.isolateLevel(parseSlotKey(v.slotKey).level);
        sim.callVehicle(id);
        ui.follow(id);
      } else {
        // the tour's car is gone: call whoever is next and follow that one
        sim.callVehicle();
        const called = useSimStore.getState().snapshot?.jobs.find((j) => j.kind === 'retrieve' && j.stage !== 'done');
        vehicle.current = called?.vehicleId ?? null;
        if (called) ui.isolateLevel(parseSlotKey(called.slotKey).level);
        ui.follow(vehicle.current);
      }
    } else if (s.enter === 'isolate-slot') {
      const id = vehicle.current;
      const v = id ? useSimStore.getState().snapshot?.vehicles[id] : undefined;
      ui.follow(null);
      if (v?.slotKey) ui.flyTo(v.slotKey);
      else ui.setCameraPreset('isometric');
    } else if (s.camera === 'follow') {
      ui.follow(vehicle.current);
      if (!vehicle.current) ui.setCameraPreset('isometric');
    } else {
      ui.follow(null);
      ui.clearLevel();
      ui.setCameraPreset(s.camera);
    }
    force((n) => n + 1);
  }, [step]);

  // polling: auto-advance and setting cycles
  useEffect(() => {
    if (step < 0) return;
    const s = STORY[step];
    const timer = window.setInterval(() => {
      const sim = useSimStore.getState();
      const elapsed = (performance.now() - started.current) / 1000;
      const ctx: StoryContext = { cfg: sim.config, snapshot: sim.snapshot, vehicleId: vehicle.current, elapsed };
      if (s.cycleSettings) {
        const i = Math.min(s.cycleSettings.order.length - 1, Math.floor(elapsed / s.cycleSettings.every));
        const want = s.cycleSettings.order[i];
        if (useUiStore.getState().setting !== want) useUiStore.getState().setSetting(want);
      }
      if (stepDone(s, ctx)) go(step + 1);
      else force((n) => n + 1); // live texts (ticket, slot, numbers)
    }, 250);
    return () => window.clearInterval(timer);
  }, [step, go]);

  const sim = useSimStore.getState();
  const ctx: StoryContext = { cfg: sim.config, snapshot: sim.snapshot, vehicleId: vehicle.current, elapsed: (performance.now() - started.current) / 1000 };
  return { step, start, stop, go, ctx };
}

export function StoryOverlay() {
  const { step, start, stop, go, ctx } = useStory();
  const ready = useSimStore((s) => s.snapshot !== null);

  // ?tour=1 starts the tour on load
  useEffect(() => {
    if (ready && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === '1' && useUiStore.getState().storyStep < 0) start();
  }, [ready, start]);

  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') go(step + 1);
      else if (e.key === 'ArrowLeft') go(step - 1);
      else if (e.key === 'Escape') stop();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, go, stop]);

  if (step < 0) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={!ready}
        className="pointer-events-auto absolute top-3 left-4 rounded-sm border border-amber bg-panel/80 px-3 py-1 text-sm text-amber backdrop-blur-[2px] transition-colors hover:bg-amber hover:text-void disabled:opacity-40"
      >
        ▶ Tour
      </button>
    );
  }
  const s = STORY[step];
  const last = step === STORY.length - 1;
  return (
    <div className="pointer-events-auto absolute top-3 left-4 flex max-w-[460px] flex-col gap-3 rounded-sm border border-line bg-panel/90 p-4 backdrop-blur-[2px]" role="dialog" aria-label="Guided tour">
      <div className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
        <span>
          {step + 1} / {STORY.length}
        </span>
        <span className="flex gap-1" aria-hidden>
          {STORY.map((x, i) => (
            <span key={x.id} className={`h-1 w-4 rounded-sm ${i <= step ? 'bg-amber' : 'bg-line'}`} />
          ))}
        </span>
      </div>
      <h3 className="text-xl leading-tight">{s.title}</h3>
      <p className="text-[15px] leading-relaxed text-ink">{s.text(ctx)}</p>
      <div className="flex items-center gap-1">
        <button type="button" className={chipClass(false)} disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </button>
        <button type="button" className={chipClass(true)} onClick={() => go(step + 1)}>
          {last ? 'Explore' : 'Next'}
        </button>
        {!last && (
          <button type="button" className={`${chipClass(false)} ml-auto`} onClick={stop}>
            Skip tour
          </button>
        )}
      </div>
    </div>
  );
}
