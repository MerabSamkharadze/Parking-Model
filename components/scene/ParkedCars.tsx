'use client';

// Parked cars as real models (DECISIONS U1, replacing S4's blocks): one
// instance per occupied slot, drawn with the same baked models and paint
// as the moving pool, so a car keeps its look from the bay to the slot and
// back. Solid and ghost sets per model give level isolation without
// per-instance alpha. Rebuilt only when a slot changes (slotsVersion).

import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { slotPosition } from '@/lib/geometry';
import type { FacilityConfig, Slot } from '@/lib/sim/types';
import { GHOST_OPACITY } from './LevelSlab';
import { CAR_MATERIALS } from './VehiclePool';
import { CAR_MODELS, OVERSIZE_SCALE, PAINTS, pickModel } from './carModels';
import { useCarModels } from './useCarModels';

const _obj = new Object3D();

const GHOST_MATERIALS = {
  paint: new MeshStandardMaterial({ color: '#ffffff', metalness: 0.75, roughness: 0.32, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }),
  rest: new MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }),
};

interface Set4 {
  solidPaint: InstancedMesh | null;
  solidRest: InstancedMesh | null;
  ghostPaint: InstancedMesh | null;
  ghostRest: InstancedMesh | null;
}

export function ParkedCars({ cfg, slots, sliding, selectedLevel }: { cfg: FacilityConfig; slots: readonly Slot[]; sliding: ReadonlySet<string>; selectedLevel: number | null }) {
  const baked = useCarModels('lod');
  const refs = useRef<Set4[]>(CAR_MODELS.map(() => ({ solidPaint: null, solidRest: null, ghostPaint: null, ghostRest: null })));
  const capacity = slots.length;

  const placements = useMemo(() => {
    const perModel = CAR_MODELS.map(() => ({ solid: [] as Array<{ s: Slot; paint: number }>, ghost: [] as Array<{ s: Slot; paint: number }> }));
    for (const s of slots) {
      if (s.state !== 'occupied' || !s.vehicleId || sliding.has(s.key)) continue;
      const pick = pickModel(s.vehicleId, s.cls === 'oversize');
      const bucket = selectedLevel === null || s.id.level === selectedLevel ? 'solid' : 'ghost';
      perModel[pick.model][bucket].push({ s, paint: pick.paint });
    }
    return perModel;
  }, [slots, sliding, selectedLevel]);

  useLayoutEffect(() => {
    placements.forEach((p, m) => {
      const r = refs.current[m];
      const write = (paint: InstancedMesh | null, rest: InstancedMesh | null, list: Array<{ s: Slot; paint: number }>) => {
        if (!paint || !rest) return;
        list.forEach((e, i) => {
          const pos = slotPosition(cfg, e.s.id);
          const k = e.s.cls === 'oversize' ? OVERSIZE_SCALE : 1;
          _obj.position.set(pos.x, pos.y, pos.z);
          _obj.rotation.set(0, e.s.id.row === 0 ? Math.PI / 2 : -Math.PI / 2, 0);
          _obj.scale.set(k, k, k);
          _obj.updateMatrix();
          paint.setMatrixAt(i, _obj.matrix);
          rest.setMatrixAt(i, _obj.matrix);
          paint.setColorAt(i, PAINTS[e.paint]);
        });
        paint.count = list.length;
        rest.count = list.length;
        paint.instanceMatrix.needsUpdate = true;
        rest.instanceMatrix.needsUpdate = true;
        if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
      };
      write(r.solidPaint, r.solidRest, p.solid);
      write(r.ghostPaint, r.ghostRest, p.ghost);
    });
  }, [placements, cfg]);

  const set = (m: number, key: keyof Set4) => (el: InstancedMesh | null) => {
    refs.current[m][key] = el;
  };

  return (
    <group>
      {baked.map((b, m) => (
        <group key={b.id}>
          {/* no shadow casting: a second pass over every parked car costs more than the shadows show */}
          <instancedMesh key={`sp${capacity}`} name="parked" ref={set(m, 'solidPaint')} args={[b.paint, CAR_MATERIALS.paint, capacity]} frustumCulled={false} />
          <instancedMesh key={`sr${capacity}`} name="parked" ref={set(m, 'solidRest')} args={[b.rest, CAR_MATERIALS.rest, capacity]} frustumCulled={false} />
          <instancedMesh key={`gp${capacity}`} name="parked-ghost" ref={set(m, 'ghostPaint')} args={[b.paint, GHOST_MATERIALS.paint, capacity]} frustumCulled={false} />
          <instancedMesh key={`gr${capacity}`} name="parked-ghost" ref={set(m, 'ghostRest')} args={[b.rest, GHOST_MATERIALS.rest, capacity]} frustumCulled={false} />
        </group>
      ))}
    </group>
  );
}
