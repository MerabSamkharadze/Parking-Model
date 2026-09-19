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
const LABEL_SIZE = 1.7;

/** Floor-marking anchors (also fed to the camera fit so labels stay in frame). */
export function floorLabels(cfg: FacilityConfig): Array<{ text: string; x: number; z: number; halfWidth: number }> {
  const z = bounds(cfg).minZ - 2.2;
  return [
    { text: 'INPUT', x: bayPosition(cfg, 'bay_in', 0).x, z, halfWidth: LABEL_SIZE * 0.6 * 2.5 },
    { text: 'OUTPUT', x: bayPosition(cfg, 'bay_out', 0).x, z, halfWidth: LABEL_SIZE * 0.6 * 3 },
  ];
}

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
  const labels = useMemo(() => floorLabels(cfg), [cfg]);

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
      {labels.map((l) => (
        <Text key={l.text} font={LABEL_FONT} fontSize={LABEL_SIZE} color={palette.inkSoft} anchorX="center" anchorY="middle" position={[l.x, 0.03, l.z]} rotation={[-Math.PI / 2, 0, 0]}>
          {l.text}
        </Text>
      ))}
    </group>
  );
}
