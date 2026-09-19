'use client';

// SPEC §9: one floor per level with EdgesGeometry drawing lines and a level
// label. One box per corridor zone (preset C has a shaft gap between zones).
// Isolation: non-selected levels fade to opacity 0.15 (SPEC §9).

import { Text } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, type LineBasicMaterial, type MeshStandardMaterial } from 'three';
import { SLAB_THICKNESS, layout, levelY } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { LABEL_FONT } from './SurfaceDeck';
import type { Palette } from './palette';

export const GHOST_OPACITY = 0.15;

export function LevelSlab({ cfg, level, palette, dimmed }: { cfg: FacilityConfig; level: number; palette: Palette; dimmed: boolean }) {
  const lay = useMemo(() => layout(cfg), [cfg]);
  const depth = cfg.corridorWidth + 2 * cfg.slotDepth;
  const y = levelY(cfg, level);
  const zones = useMemo(
    () =>
      lay.zoneStartX.map((x0, z) => {
        const w = lay.colsPerZone[z] * cfg.pitch;
        return { cx: x0 + w / 2, w, geometry: new BoxGeometry(w, SLAB_THICKNESS, depth) };
      }),
    [lay, cfg.pitch, depth],
  );
  const slabMats = useRef<MeshStandardMaterial[]>([]);
  const lineMats = useRef<LineBasicMaterial[]>([]);

  // Opacity is set imperatively so isolation never re-creates materials.
  useEffect(() => {
    const o = dimmed ? GHOST_OPACITY : 1;
    for (const m of slabMats.current) {
      if (!m) continue;
      m.transparent = dimmed;
      m.opacity = o;
      m.depthWrite = !dimmed;
      m.needsUpdate = true;
    }
    for (const m of lineMats.current) {
      if (!m) continue;
      m.transparent = dimmed;
      m.opacity = o;
      m.needsUpdate = true;
    }
  }, [dimmed]);

  return (
    <group>
      {zones.map((zone, i) => (
        <group key={i} position={[zone.cx, y - SLAB_THICKNESS / 2, 0]}>
          <mesh geometry={zone.geometry} receiveShadow>
            <meshStandardMaterial
              ref={(m) => {
                if (m) slabMats.current[i] = m;
              }}
              color={palette.slab}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[zone.geometry]} />
            <lineBasicMaterial
              ref={(m) => {
                if (m) lineMats.current[i] = m;
              }}
              color={palette.slabEdge}
            />
          </lineSegments>
          {/* corridor band */}
          <mesh position={[0, SLAB_THICKNESS / 2 + 0.005, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[zone.w, cfg.corridorWidth]} />
            <meshStandardMaterial color={palette.slabEdge} transparent opacity={dimmed ? 0.05 : 0.35} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <Text
        font={LABEL_FONT}
        fontSize={1.3}
        color={dimmed ? palette.line : palette.inkSoft}
        anchorX="left"
        anchorY="middle"
        position={[lay.fieldMinX + 0.4, y + 0.03, depth / 2 + 1.4]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`L${level + 1}`}
      </Text>
    </group>
  );
}
