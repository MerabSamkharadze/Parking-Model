'use client';

// SPEC §9: flat amber unit per level (per zone in preset C); X comes from
// the engine's shuttle position in metres.

import { useEffect, useRef } from 'react';
import type { MeshStandardMaterial } from 'three';
import { levelY } from '@/lib/geometry';
import type { FacilityConfig, Resource } from '@/lib/sim/types';
import { GHOST_OPACITY } from './LevelSlab';
import type { Palette } from './palette';

export const SHUTTLE_SIZE = { x: 4.6, y: 0.3, z: 2.0 } as const;

export function Shuttle({ cfg, resource, palette, dimmed }: { cfg: FacilityConfig; resource: Resource; palette: Palette; dimmed: boolean }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useEffect(() => {
    const m = mat.current;
    if (!m) return;
    m.transparent = dimmed;
    m.opacity = dimmed ? GHOST_OPACITY : 1;
    m.depthWrite = !dimmed;
    m.needsUpdate = true;
  }, [dimmed]);
  const y = levelY(cfg, resource.level ?? 0) + SHUTTLE_SIZE.y / 2 + 0.02;
  return (
    <mesh position={[resource.pos, y, 0]} castShadow>
      <boxGeometry args={[SHUTTLE_SIZE.x, SHUTTLE_SIZE.y, SHUTTLE_SIZE.z]} />
      <meshStandardMaterial ref={mat} color={resource.down ? palette.clay : palette.amber} roughness={0.5} metalness={0.2} />
    </mesh>
  );
}
