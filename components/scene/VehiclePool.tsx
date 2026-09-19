'use client';

// SPEC §9 VehiclePool: a fixed pool of POOL_SIZE cars, each body + cabin +
// glass, drawn as three InstancedMeshes (three draw calls for every moving
// car). No geometry is created at runtime: one unit box, scaled per instance.
// Placement comes from motion.ts every frame; parked cars are slot colour.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import type { FacilityConfig, SlotClass } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { POOL_SIZE, newPlacements, placeVehicles } from './motion';
import type { Palette } from './palette';

interface CarDims {
  length: number;
  width: number;
  bodyH: number;
  cabinL: number; // fraction of length
  cabinH: number;
  cabinBack: number; // cabin centre offset towards the rear, fraction of length
}

// 3 variants (SPEC §9) × standard / oversize
const VARIANTS: CarDims[] = [
  { length: 4.2, width: 1.8, bodyH: 0.62, cabinL: 0.5, cabinH: 0.58, cabinBack: 0.06 }, // hatchback
  { length: 4.7, width: 1.85, bodyH: 0.6, cabinL: 0.42, cabinH: 0.52, cabinBack: 0.02 }, // sedan
  { length: 4.6, width: 1.9, bodyH: 0.8, cabinL: 0.52, cabinH: 0.55, cabinBack: 0.05 }, // suv
];
const OVERSIZE: CarDims = { length: 5.3, width: 2.05, bodyH: 1.0, cabinL: 0.7, cabinH: 0.75, cabinBack: 0.1 };
const CLEARANCE = 0.14;

function variantOf(vehicleId: string): number {
  let h = 0;
  for (let i = 0; i < vehicleId.length; i++) h = (h * 31 + vehicleId.charCodeAt(i)) | 0;
  return Math.abs(h) % VARIANTS.length;
}

function dimsOf(cls: SlotClass, vehicleId: string): CarDims {
  return cls === 'oversize' ? OVERSIZE : VARIANTS[variantOf(vehicleId)];
}

// module-level scratch (SPEC §9: nothing allocated in useFrame)
const _obj = new Object3D();
const _placements = newPlacements(POOL_SIZE);

export function VehiclePool({ cfg, palette }: { cfg: FacilityConfig; palette: Palette }) {
  const body = useRef<InstancedMesh>(null);
  const cabin = useRef<InstancedMesh>(null);
  const glass = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const materials = useMemo(
    () => ({
      body: new MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 }),
      cabin: new MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 }),
      glass: new MeshStandardMaterial({ color: palette.data, roughness: 0.15, metalness: 0.4 }),
    }),
    [palette],
  );
  const colours = useMemo(() => {
    const body = { standard: new Color(palette.inkSoft), ev: new Color(palette.lime), oversize: new Color(palette.ink) };
    const cabin = {
      standard: body.standard.clone().multiplyScalar(0.7),
      ev: body.ev.clone().multiplyScalar(0.7),
      oversize: body.oversize.clone().multiplyScalar(0.7),
    };
    return { body, cabin };
  }, [palette]);

  useFrame(() => {
    const b = body.current;
    const c = cabin.current;
    const g = glass.current;
    if (!b || !c || !g) return;
    const { snapshot, resourcesById, clock } = useSimStore.getState();
    const n = snapshot ? placeVehicles(cfg, snapshot, resourcesById, clock.t, _placements) : 0;
    for (let i = 0; i < n; i++) {
      const p = _placements[i];
      const d = dimsOf(p.cls, p.vehicleId);
      const cos = Math.cos(p.yaw);
      const sin = Math.sin(p.yaw);
      // body
      _obj.position.set(p.x, p.y + CLEARANCE + d.bodyH / 2, p.z);
      _obj.rotation.set(0, p.yaw, 0);
      _obj.scale.set(d.length, d.bodyH, d.width);
      _obj.updateMatrix();
      b.setMatrixAt(i, _obj.matrix);
      b.setColorAt(i, colours.body[p.cls]);
      // cabin: set back from the centre along the car's own axis
      const back = -d.length * d.cabinBack;
      const cx = p.x + back * cos;
      const cz = p.z - back * sin;
      const cabinY = p.y + CLEARANCE + d.bodyH + d.cabinH / 2;
      _obj.position.set(cx, cabinY, cz);
      _obj.scale.set(d.length * d.cabinL, d.cabinH, d.width * 0.86);
      _obj.updateMatrix();
      c.setMatrixAt(i, _obj.matrix);
      c.setColorAt(i, colours.cabin[p.cls]);
      // glass band: the lower half of the cabin, a hair wider
      _obj.position.set(cx, p.y + CLEARANCE + d.bodyH + d.cabinH * 0.3, cz);
      _obj.scale.set(d.length * d.cabinL * 1.01, d.cabinH * 0.42, d.width * 0.9);
      _obj.updateMatrix();
      g.setMatrixAt(i, _obj.matrix);
    }
    b.count = n;
    c.count = n;
    g.count = n;
    b.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    g.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={body} args={[geometry, materials.body, POOL_SIZE]} castShadow frustumCulled={false} />
      <instancedMesh ref={cabin} args={[geometry, materials.cabin, POOL_SIZE]} castShadow frustumCulled={false} />
      <instancedMesh ref={glass} args={[geometry, materials.glass, POOL_SIZE]} frustumCulled={false} />
    </group>
  );
}
