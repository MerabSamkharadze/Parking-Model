'use client';

// SPEC §9: surface plate, input/output bay markings, transparent "street"
// plane. INPUT / OUTPUT are real floor markings — the one place upper-case
// labels are allowed (SPEC §7).

import { Text } from '@react-three/drei';
import { useMemo } from 'react';
import { SHAFT_LENGTH, bayPosition, bounds, layout } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { RectOutline } from './RectOutline';
import type { Palette } from './palette';

export const LABEL_FONT = '/fonts/IBMPlexMono-Medium.ttf';
const BAY_W = 5.4; // along X
const BAY_D = 2.8; // along Z

export function SurfaceDeck({ cfg, palette }: { cfg: FacilityConfig; palette: Palette }) {
  const b = useMemo(() => bounds(cfg), [cfg]);
  const lay = useMemo(() => layout(cfg), [cfg]);
  const width = b.maxX - b.minX + 8;
  const depth = b.maxZ - b.minZ + 8;
  const bays = useMemo(() => {
    const out: Array<{ kind: 'bay_in' | 'bay_out'; x: number; z: number }> = [];
    for (let i = 0; i < cfg.baysIn; i++) out.push({ kind: 'bay_in', ...bayPosition(cfg, 'bay_in', i) });
    for (let i = 0; i < cfg.baysOut; i++) out.push({ kind: 'bay_out', ...bayPosition(cfg, 'bay_out', i) });
    return out;
  }, [cfg]);
  const labelIn = bayPosition(cfg, 'bay_in', 0);
  const labelOut = bayPosition(cfg, 'bay_out', 0);

  return (
    <group>
      {/* street plane: see-through so the levels below stay readable */}
      <mesh position={[(b.minX + b.maxX) / 2, 0, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={palette.slab} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {bays.map((bay, i) => (
        <RectOutline key={i} x={bay.x} y={0.02} z={bay.z} width={BAY_W} depth={BAY_D} color={palette.slabEdge} />
      ))}
      {lay.shafts.map((s) => (
        <RectOutline key={s.id} x={s.x} y={0.02} z={0} width={SHAFT_LENGTH} depth={2.8} color={palette.amber} opacity={0.6} />
      ))}
      <Text
        font={LABEL_FONT}
        fontSize={1.1}
        color={palette.inkSoft}
        anchorX="center"
        anchorY="middle"
        position={[labelIn.x, 0.03, b.maxZ + 2.2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        INPUT
      </Text>
      <Text
        font={LABEL_FONT}
        fontSize={1.1}
        color={palette.inkSoft}
        anchorX="center"
        anchorY="middle"
        position={[labelOut.x, 0.03, b.maxZ + 2.2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        OUTPUT
      </Text>
    </group>
  );
}
