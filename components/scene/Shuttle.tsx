'use client';

// SPEC §9: flat amber unit per level (per zone in preset C). X is read every
// frame from the engine's shuttle move (metres along the corridor), held at
// the dock beside a shaft instead of inside it (DECISIONS S41).

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Mesh, MeshStandardMaterial } from 'three';
import { SHUTTLE_LENGTH, levelY } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { GHOST_OPACITY } from './LevelSlab';
import { SHUTTLE_HEIGHT, drawnShuttleXAt } from './motion';
import type { Palette } from './palette';

export const SHUTTLE_SIZE = { x: SHUTTLE_LENGTH, y: SHUTTLE_HEIGHT, z: 2.0 } as const;

export function Shuttle({ cfg, shuttleId, level, palette, dimmed }: { cfg: FacilityConfig; shuttleId: string; level: number; palette: Palette; dimmed: boolean }) {
  const mesh = useRef<Mesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const down = useSimStore((s) => (s.resourcesById.get(shuttleId)?.down ?? false) || (s.snapshot?.failures.power ?? false));
  useEffect(() => {
    const m = mat.current;
    if (!m) return;
    m.transparent = dimmed;
    m.opacity = dimmed ? GHOST_OPACITY : 1;
    m.depthWrite = !dimmed;
    m.needsUpdate = true;
  }, [dimmed]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const { resourcesById, clock } = useSimStore.getState();
    const r = resourcesById.get(shuttleId);
    if (r) m.position.x = drawnShuttleXAt(cfg, r, clock.t);
  });
  const y = levelY(cfg, level) + SHUTTLE_SIZE.y / 2 + 0.02;
  return (
    <mesh ref={mesh} position={[0, y, 0]} castShadow>
      <boxGeometry args={[SHUTTLE_SIZE.x, SHUTTLE_SIZE.y, SHUTTLE_SIZE.z]} />
      <meshStandardMaterial ref={mat} color={down ? palette.clay : palette.amber} roughness={0.5} metalness={0.2} />
    </mesh>
  );
}
