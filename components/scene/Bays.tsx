'use client';

// The drop-off and pick-up bays as a viewer sees them (DECISIONS U1): a
// concrete pad inside every marking, a scanner portal over each input bay and
// the scan itself — a light plane sweeping the car while its job is in stage
// 'scan'. Timing comes from the engine (progressAt over the stage window);
// the scene only draws it.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, DoubleSide, type Mesh, MeshStandardMaterial } from 'three';
import { bayPosition } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useSurfaceFade } from './Ground';
import { progressAt } from './motion';
import type { Palette } from './palette';

const BAY_W = 5.4; // the markings in SurfaceDeck
const BAY_D = 2.8;
const PORTAL_H = 2.7;
const SWEEP = 2.5; // half travel of the scan plane along X

export function Bays({ cfg, palette }: { cfg: FacilityConfig; palette: Palette }) {
  const inputs = useMemo(() => Array.from({ length: cfg.baysIn }, (_, i) => bayPosition(cfg, 'bay_in', i)), [cfg]);
  const outputs = useMemo(() => Array.from({ length: cfg.baysOut }, (_, i) => bayPosition(cfg, 'bay_out', i)), [cfg]);
  const sweeps = useRef<Array<Mesh | null>>([]);
  // one material for every pad: it sits on the lid and opens with it
  const padMaterial = useMemo(() => new MeshStandardMaterial({ color: '#2b353b', roughness: 0.9, transparent: true, opacity: 0.25, depthWrite: false }), []);
  const pad = useRef<MeshStandardMaterial>(padMaterial);
  useSurfaceFade(pad, 0.25, 1);

  useFrame(() => {
    const { snapshot, clock } = useSimStore.getState();
    for (const m of sweeps.current) if (m) m.visible = false;
    if (!snapshot) return;
    for (const job of snapshot.jobs) {
      if (job.stage !== 'scan') continue;
      const bay = job.resources.bay ?? job.bay; // "in-3"
      const i = bay ? Number(bay.slice(3)) - 1 : -1;
      const m = sweeps.current[i];
      if (!m) continue;
      const k = progressAt(job, clock.t);
      const s = k < 0.5 ? k * 2 : 2 - k * 2; // there and back
      m.position.x = (s * 2 - 1) * SWEEP;
      m.visible = true;
    }
  });

  return (
    <group>
      {[...inputs, ...outputs].map((b, i) => (
        <mesh key={i} position={[b.x, 0.012, b.z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[BAY_W, BAY_D]} />
          <primitive object={padMaterial} attach="material" />
        </mesh>
      ))}
      {inputs.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, PORTAL_H / 2, side * (BAY_D / 2 + 0.35)]} castShadow>
              <boxGeometry args={[0.12, PORTAL_H, 0.12]} />
              <meshStandardMaterial color={palette.slabEdge} roughness={0.6} metalness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, PORTAL_H, 0]} castShadow>
            <boxGeometry args={[0.14, 0.12, BAY_D + 0.82]} />
            <meshStandardMaterial color={palette.slabEdge} roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[0, PORTAL_H - 0.1, 0]}>
            <boxGeometry args={[0.05, 0.05, BAY_D + 0.4]} />
            <meshBasicMaterial color="#ffe6b8" />
          </mesh>
          <mesh
            ref={(el) => {
              sweeps.current[i] = el;
            }}
            visible={false}
            position={[0, PORTAL_H / 2 - 0.05, 0]}
            rotation-y={Math.PI / 2}
          >
            <planeGeometry args={[BAY_D + 0.6, PORTAL_H - 0.1]} />
            <meshBasicMaterial color={palette.amber} transparent opacity={0.28} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
