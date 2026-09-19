'use client';

// SPEC §9: flat amber unit per level (per zone in preset C). X is read every
// frame from the engine's shuttle move (metres along the corridor); the scene
// holds it at the dock outside a shaft (DECISIONS S41). The telescopic comb
// arm is drawn while the shuttle's job is exchanging with the lift or sliding
// a car into / out of a slot — the mechanism that moves the car, not the car
// floating (S40/S41).

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { SHUTTLE_LENGTH, levelY } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { GHOST_OPACITY } from './LevelSlab';
import { SHUTTLE_HEIGHT, drawnShuttleXAt, newPlacements, placeJob } from './motion';
import type { Palette } from './palette';

export const SHUTTLE_SIZE = { x: SHUTTLE_LENGTH, y: SHUTTLE_HEIGHT, z: 2.0 } as const;
const ARM_W = 1.7; // comb arm width (inside the wheel track)
const ARM_H = 0.06;
const _arm = newPlacements(1)[0];

export function Shuttle({ cfg, shuttleId, level, palette, dimmed }: { cfg: FacilityConfig; shuttleId: string; level: number; palette: Palette; dimmed: boolean }) {
  const group = useRef<Group>(null);
  const arm = useRef<Mesh>(null);
  const mats = useRef<MeshStandardMaterial[]>([]);
  const lengthOf = useMemo(() => () => 4.4, []);
  const down = useSimStore((s) => (s.resourcesById.get(shuttleId)?.down ?? false) || (s.snapshot?.failures.power ?? false));
  useEffect(() => {
    for (const m of mats.current) {
      if (!m) continue;
      m.transparent = dimmed;
      m.opacity = dimmed ? GHOST_OPACITY : 1;
      m.depthWrite = !dimmed;
      m.needsUpdate = true;
    }
  }, [dimmed]);
  useFrame(() => {
    const g = group.current;
    const a = arm.current;
    if (!g || !a) return;
    const { snapshot, resourcesById, clock } = useSimStore.getState();
    const r = resourcesById.get(shuttleId);
    if (!r) return;
    const x = drawnShuttleXAt(cfg, r, clock.t);
    g.position.x = x;
    // the comb arm: from the deck centre to wherever the car this shuttle is moving is
    a.visible = false;
    if (!snapshot) return;
    for (const job of snapshot.jobs) {
      if (job.resources.shuttle !== shuttleId && job.resources.shuttle2 !== shuttleId) continue;
      if (job.stage !== 'handover' && job.stage !== 'insert' && job.stage !== 'extract') continue;
      if (!placeJob({ cfg, resources: resourcesById, t: clock.t, lengthOf }, job, _arm)) continue;
      const dx = _arm.x - x;
      const dz = _arm.z;
      const along = job.stage === 'handover' ? Math.abs(dx) : Math.abs(dz);
      if (along < 0.05) break;
      a.visible = true;
      if (job.stage === 'handover') {
        a.position.set(dx / 2, 0, 0);
        a.scale.set(along + 0.6, 1, 1);
        a.rotation.y = 0;
      } else {
        a.position.set(0, 0, dz / 2);
        a.scale.set(along + 0.6, 1, 1);
        a.rotation.y = Math.PI / 2;
      }
      break;
    }
  });
  const y = levelY(cfg, level) + SHUTTLE_SIZE.y / 2 + 0.02;
  const color = down ? palette.clay : palette.amber;
  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh castShadow>
        <boxGeometry args={[SHUTTLE_SIZE.x, SHUTTLE_SIZE.y, SHUTTLE_SIZE.z]} />
        <meshStandardMaterial
          ref={(m) => {
            if (m) mats.current[0] = m;
          }}
          color={color}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      {/* telescopic comb arm: a unit box along X, scaled to the reach each frame */}
      <mesh ref={arm} visible={false} position={[0, SHUTTLE_SIZE.y / 2 - ARM_H / 2, 0]}>
        <boxGeometry args={[1, ARM_H, ARM_W]} />
        <meshStandardMaterial
          ref={(m) => {
            if (m) mats.current[1] = m;
          }}
          color={color}
          roughness={0.4}
          metalness={0.5}
        />
      </mesh>
    </group>
  );
}
