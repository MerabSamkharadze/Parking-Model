'use client';

// SPEC §9 VehiclePool, presentation grade (DECISIONS U1): a fixed pool of
// POOL_SIZE cars drawn from real CC0 models (public/models). Every model is
// two InstancedMeshes — body paint (tinted per car) and the rest — so the
// whole moving fleet costs eight draw calls. No geometry is created at
// runtime: the models are baked once when they load. Placement comes from
// motion.ts every frame; parked cars stay slot colour (S4).

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { parseSlotKey } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';
import { CAR_MODELS, OVERSIZE_SCALE, PAINTS, pickModel } from './carModels';
import { POOL_SIZE, newPlacements, placeVehicles } from './motion';
import type { Palette } from './palette';
import { useCarModels } from './useCarModels';

/** Where the followed car is this frame (story mode / follow camera). `side` is the
 *  corridor side the camera should stay on: away from the shaft the car's slot uses,
 *  so the rig never looks down through a lift platform. */
export const followed = { active: false, x: 0, y: 0, z: 0, yaw: 0, side: 1 };

// module-level scratch (SPEC §9: nothing allocated in useFrame)
const _obj = new Object3D();
const _placements = newPlacements(POOL_SIZE);
const _order: number[][] = CAR_MODELS.map(() => []);
/** Surface transfer trolleys (DECISIONS S42): one under every car crossing the deck. */
const TROLLEYS = 12;
const TROLLEY = { x: 4.8, y: 0.12, z: 2.0 } as const;

export const CAR_MATERIALS = {
  paint: new MeshStandardMaterial({ color: new Color('#ffffff'), metalness: 0.75, roughness: 0.32, envMapIntensity: 0.9 }),
  rest: new MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55, envMapIntensity: 0.5 }),
};

export function VehiclePool({ cfg, palette }: { cfg: FacilityConfig; palette: Palette }) {
  const baked = useCarModels();
  const materials = useMemo(() => CAR_MATERIALS, []);
  const paintRefs = useRef<Array<InstancedMesh | null>>(CAR_MODELS.map(() => null));
  const restRefs = useRef<Array<InstancedMesh | null>>(CAR_MODELS.map(() => null));
  const trolleys = useRef<InstancedMesh>(null);
  const lengthOf = useMemo(
    () => (vehicleId: string, oversize = false) => {
      const pick = pickModel(vehicleId, oversize);
      return baked[pick.model].length * (oversize ? OVERSIZE_SCALE : 1);
    },
    [baked],
  );

  useFrame(() => {
    const { snapshot, resourcesById, clock } = useSimStore.getState();
    const followId = useUiStore.getState().followVehicleId;
    const lengthById = (id: string) => lengthOf(id, snapshot?.vehicles[id]?.cls === 'oversize');
    const n = snapshot ? placeVehicles(cfg, snapshot, resourcesById, clock.t, _placements, lengthById) : 0;
    for (const o of _order) o.length = 0;
    followed.active = false;
    let onDeck = 0;
    const tr = trolleys.current;
    for (let i = 0; i < n; i++) {
      const p = _placements[i];
      _order[pickModel(p.vehicleId, p.cls === 'oversize').model].push(i);
      const job = snapshot!.jobs.find((j) => j.id === p.jobId);
      if (tr && job && (job.stage === 'to_lift' || job.stage === 'bay_out') && onDeck < TROLLEYS) {
        _obj.position.set(p.x, TROLLEY.y / 2 + 0.01, p.z);
        _obj.rotation.set(0, 0, 0);
        _obj.scale.set(1, 1, 1);
        _obj.updateMatrix();
        tr.setMatrixAt(onDeck++, _obj.matrix);
      }
      if (followId !== null && p.vehicleId === followId) {
        followed.active = true;
        followed.x = p.x;
        followed.y = p.y;
        followed.z = p.z;
        followed.yaw = p.yaw;
        const fj = snapshot!.jobs.find((j) => j.id === p.jobId);
        if (fj) followed.side = parseSlotKey(fj.slotKey).col < cfg.cols / 2 ? 1 : -1;
      }
    }
    for (let m = 0; m < CAR_MODELS.length; m++) {
      const paint = paintRefs.current[m];
      const rest = restRefs.current[m];
      if (!paint || !rest) continue;
      const list = _order[m];
      for (let k = 0; k < list.length; k++) {
        const p = _placements[list[k]];
        const s = p.cls === 'oversize' ? OVERSIZE_SCALE : 1;
        _obj.position.set(p.x, p.y, p.z);
        _obj.rotation.set(0, p.yaw, 0);
        _obj.scale.set(s, s, s);
        _obj.updateMatrix();
        paint.setMatrixAt(k, _obj.matrix);
        rest.setMatrixAt(k, _obj.matrix);
        paint.setColorAt(k, PAINTS[pickModel(p.vehicleId, false).paint]);
      }
      paint.count = list.length;
      rest.count = list.length;
      paint.instanceMatrix.needsUpdate = true;
      rest.instanceMatrix.needsUpdate = true;
      if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
    }
    if (tr) {
      tr.count = onDeck;
      tr.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={trolleys} args={[undefined, undefined, TROLLEYS]} frustumCulled={false} castShadow>
        <boxGeometry args={[TROLLEY.x, TROLLEY.y, TROLLEY.z]} />
        <meshStandardMaterial color={palette.amber} roughness={0.5} metalness={0.2} />
      </instancedMesh>
      {baked.map((b, m) => (
        <group key={b.id}>
          <instancedMesh
            ref={(el) => {
              paintRefs.current[m] = el;
            }}
            args={[b.paint, materials.paint, POOL_SIZE]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
          <instancedMesh
            ref={(el) => {
              restRefs.current[m] = el;
            }}
            args={[b.rest, materials.rest, POOL_SIZE]}
            castShadow
            frustumCulled={false}
          />
        </group>
      ))}
    </group>
  );
}
