'use client';

// SPEC §9: the R3F canvas, dpr [1, 1.75]. The frameloop stays "always": the
// browser already suspends requestAnimationFrame in hidden tabs. Everything
// drawn here is derived from the engine snapshot and lib/geometry — the scene
// never invents state.
//
// Subscriptions are deliberate: React re-renders only when the slot array or
// the set of sliding slots changes; lifts, shuttles and cars read the latest
// snapshot inside useFrame (see SimDriver / motion.ts).

import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import { bounds, layout } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';
import { AdaptiveQuality } from './AdaptiveQuality';
import { Bays } from './Bays';
import { CameraRig, DEFAULT_FOV, cameraGoal, useReducedMotion } from './CameraRig';
import { Context } from './Context';
import { DevHandle } from './DevHandle';
import { EnvironmentLight } from './EnvironmentLight';
import { Ground } from './Ground';
import { LevelSlab } from './LevelSlab';
import { ParkedCars } from './ParkedCars';
import { Lighting } from './Lighting';
import { Shaft } from './Shaft';
import { Shuttle } from './Shuttle';
import { SimDriver } from './SimDriver';
import { SlotField } from './SlotField';
import { SlotMarker } from './SlotMarker';
import { Structure } from './Structure';
import { SurfaceDeck } from './SurfaceDeck';
import { VehiclePool } from './VehiclePool';
import { slidingSlots } from './motion';
import { readPalette } from './palette';

const EMPTY: ReadonlySet<string> = new Set();

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/** Slots mid-slide, as a set that keeps its identity while its contents are unchanged. */
function useSliding(): ReadonlySet<string> {
  const [cache] = useState<{ set: ReadonlySet<string> }>({ set: EMPTY });
  return useSimStore((s) => {
    if (!s.snapshot) return EMPTY;
    const next = slidingSlots(s.snapshot);
    if (sameSet(next, cache.set)) return cache.set;
    cache.set = next;
    return next;
  });
}

/** Shuttle ids with their level; stable across snapshots (resources never change identity). */
function useShuttles(): Array<{ id: string; level: number }> {
  const key = useSimStore((s) => s.snapshot?.resources.map((r) => (r.kind === 'shuttle' ? `${r.id}:${r.level}` : '')).join('|') ?? '');
  return useMemo(
    () =>
      key
        .split('|')
        .filter(Boolean)
        .map((e) => {
          const [id, level] = e.split(':');
          return { id, level: Number(level) };
        }),
    [key],
  );
}

function Scene({ cfg, shadows, onShadows }: { cfg: FacilityConfig; shadows: boolean; onShadows: (on: boolean) => void }) {
  const palette = useMemo(() => readPalette(), []);
  const lay = useMemo(() => layout(cfg), [cfg]);
  const extent = useMemo(() => {
    const b = bounds(cfg);
    return Math.max(b.maxX - b.minX, b.maxZ - b.minZ, -b.minY) * 0.6;
  }, [cfg]);
  // re-render on slot changes (or a new engine) only; the array itself is read off the store
  const slotsKey = useSimStore((s) => (s.snapshot ? `${s.epoch}:${s.snapshot.slotsVersion}` : ''));
  const slots = useMemo(() => (slotsKey ? (useSimStore.getState().snapshot?.slots ?? null) : null), [slotsKey]);
  const sliding = useSliding();
  const shuttles = useShuttles();
  const selectedLevel = useUiStore((s) => s.selectedLevel);
  const selectedSlotKey = useUiStore((s) => s.selectedSlotKey);
  const cameraPreset = useUiStore((s) => s.cameraPreset);
  const cameraNonce = useUiStore((s) => s.cameraNonce);
  const flyTo = useUiStore((s) => s.flyTo);
  const setting = useUiStore((s) => s.setting);
  const reduced = useReducedMotion();

  return (
    <>
      <color attach="background" args={[palette.void]} />
      <fog attach="fog" args={[palette.void, 140, 420]} />
      <SimDriver />
      <Lighting palette={palette} shadows={shadows} extent={extent} />
      <Ground cfg={cfg} palette={palette} />
      <SurfaceDeck cfg={cfg} palette={palette} />
      <Bays cfg={cfg} palette={palette} />
      <Structure cfg={cfg} palette={palette} />
      {Array.from({ length: cfg.levels }, (_, level) => (
        <LevelSlab key={level} cfg={cfg} level={level} palette={palette} dimmed={selectedLevel !== null && selectedLevel !== level} />
      ))}
      {slots && <SlotField cfg={cfg} slots={slots} palette={palette} selectedLevel={selectedLevel} sliding={sliding} onPick={flyTo} />}
      <SlotMarker cfg={cfg} slotKey={selectedSlotKey} palette={palette} />
      {lay.shafts.map((shaft) => (
        <Shaft key={shaft.id} cfg={cfg} shaft={shaft} palette={palette} />
      ))}
      {shuttles.map((s) => (
        <Shuttle key={s.id} cfg={cfg} shuttleId={s.id} level={s.level} palette={palette} dimmed={selectedLevel !== null && selectedLevel !== s.level} />
      ))}
      <Suspense fallback={null}>
        <VehiclePool cfg={cfg} palette={palette} />
        {slots && <ParkedCars cfg={cfg} slots={slots} sliding={sliding} selectedLevel={selectedLevel} />}
        <Context cfg={cfg} palette={palette} setting={setting} reduced={reduced} />
      </Suspense>
      <EnvironmentLight />
      <CameraRig cfg={cfg} preset={cameraPreset} nonce={cameraNonce} selectedSlotKey={selectedSlotKey} selectedLevel={selectedLevel} />
      <AdaptiveQuality onShadows={onShadows} />
      {process.env.NODE_ENV !== 'production' && <DevHandle />}
    </>
  );
}

export function Viewport() {
  const cfg = useSimStore((s) => s.config);
  const ready = useSimStore((s) => s.snapshot !== null);
  const [shadows, setShadows] = useState(true);
  const initial = useMemo(() => cameraGoal(cfg, 'isometric', null, null), [cfg]);
  if (!ready) return null;
  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows="percentage" // PCFShadowMap: three r186 removed PCFSoft, R3F's default
      camera={{ fov: DEFAULT_FOV, near: 0.5, far: 600, position: initial.pos.toArray() }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="touch-none"
    >
      <Scene cfg={cfg} shadows={shadows} onShadows={setShadows} />
    </Canvas>
  );
}
