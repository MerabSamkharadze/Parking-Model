'use client';

// SPEC §9: the R3F canvas. dpr [1, 1.75]; frameloop "always" only while the
// tab is visible. Everything drawn here is derived from the engine snapshot
// and lib/geometry — the scene never invents state.

import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { bounds, layout } from '@/lib/geometry';
import type { FacilityConfig, SimSnapshot } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';
import { AdaptiveQuality } from './AdaptiveQuality';
import { CameraRig, cameraGoal } from './CameraRig';
import { LevelSlab } from './LevelSlab';
import { Lighting } from './Lighting';
import { Shaft } from './Shaft';
import { Shuttle } from './Shuttle';
import { SlotField } from './SlotField';
import { SurfaceDeck } from './SurfaceDeck';
import { readPalette } from './palette';

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

function Scene({ cfg, snapshot, shadows, onShadows }: { cfg: FacilityConfig; snapshot: SimSnapshot; shadows: boolean; onShadows: (on: boolean) => void }) {
  const palette = useMemo(() => readPalette(), []);
  const lay = useMemo(() => layout(cfg), [cfg]);
  const extent = useMemo(() => {
    const b = bounds(cfg);
    return Math.max(b.maxX - b.minX, b.maxZ - b.minZ, -b.minY) * 0.6;
  }, [cfg]);
  const selectedLevel = useUiStore((s) => s.selectedLevel);
  const selectedSlotKey = useUiStore((s) => s.selectedSlotKey);
  const cameraPreset = useUiStore((s) => s.cameraPreset);
  const cameraNonce = useUiStore((s) => s.cameraNonce);
  const flyTo = useUiStore((s) => s.flyTo);
  const lifts = snapshot.resources.filter((r) => r.kind === 'lift');
  const shuttles = snapshot.resources.filter((r) => r.kind === 'shuttle');

  return (
    <>
      <color attach="background" args={[palette.void]} />
      <Lighting palette={palette} shadows={shadows} extent={extent} />
      <SurfaceDeck cfg={cfg} palette={palette} />
      {Array.from({ length: cfg.levels }, (_, level) => (
        <LevelSlab key={level} cfg={cfg} level={level} palette={palette} dimmed={selectedLevel !== null && selectedLevel !== level} />
      ))}
      <SlotField cfg={cfg} slots={snapshot.slots} palette={palette} selectedLevel={selectedLevel} onPick={flyTo} />
      {lay.shafts.map((shaft) => (
        <Shaft key={shaft.id} cfg={cfg} shaft={shaft} resource={lifts[shaft.index]} palette={palette} />
      ))}
      {shuttles.map((r) => (
        <Shuttle key={r.id} cfg={cfg} resource={r} palette={palette} dimmed={selectedLevel !== null && selectedLevel !== r.level} />
      ))}
      <CameraRig cfg={cfg} preset={cameraPreset} nonce={cameraNonce} selectedSlotKey={selectedSlotKey} selectedLevel={selectedLevel} />
      <AdaptiveQuality onShadows={onShadows} />
    </>
  );
}

export function Viewport() {
  const cfg = useSimStore((s) => s.config);
  const snapshot = useSimStore((s) => s.snapshot);
  const visible = usePageVisible();
  const [shadows, setShadows] = useState(true);
  const initial = useMemo(() => cameraGoal(cfg, 'isometric', null, null), [cfg]);
  if (!snapshot) return null;
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={visible ? 'always' : 'never'}
      shadows
      camera={{ fov: 40, near: 0.5, far: 600, position: initial.pos.toArray() }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="touch-none"
    >
      <Scene cfg={cfg} snapshot={snapshot} shadows={shadows} onShadows={setShadows} />
    </Canvas>
  );
}
