'use client';

// SPEC §9: every slot is one instance of a single InstancedMesh (one draw
// call), coloured per instance: free / reserved / occupied / called / ev
// (DECISIONS S2). Occupied slots rise to a car-sized block so occupancy reads
// from any distance; parked cars are never separate meshes (DECISIONS S4).
//
// Level isolation uses a second, ghosted InstancedMesh (opacity 0.15, no
// depth write) for the non-selected levels — so the common case stays one
// draw call and the isolated case needs no per-instance alpha shader.
//
// Updates are incremental: slot objects are replaced by the engine only when
// they change, so a single slot's colour change touches one instance and
// never re-mounts anything (M2 DoD). Slots whose car is mid-slide (insert /
// extract, `sliding`) drop to a pad so the VehiclePool's car is what moves.

import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { slotPosition } from '@/lib/geometry';
import type { FacilityConfig, Slot } from '@/lib/sim/types';
import { GHOST_OPACITY } from './LevelSlab';
import type { Palette } from './palette';

const SLOT_W = 2.3; // X, inside the 2.6 m pitch
const SLOT_D = 4.9; // Z, inside the 5.2 m depth
const HEIGHT = { free: 0.06, reserved: 0.5, occupied: 1.4 } as const;

// module-level scratch objects: nothing is allocated per update (SPEC §9)
const _obj = new Object3D();

interface Placement {
  mesh: 0 | 1;
  index: number;
}

const NO_SLIDING: ReadonlySet<string> = new Set();

export function SlotField({
  cfg,
  slots,
  palette,
  selectedLevel,
  sliding = NO_SLIDING,
  onPick,
}: {
  cfg: FacilityConfig;
  slots: readonly Slot[];
  palette: Palette;
  selectedLevel: number | null;
  sliding?: ReadonlySet<string>;
  onPick?: (slotKey: string) => void;
}) {
  const n = slots.length;
  const geometry = useMemo(() => new BoxGeometry(SLOT_W, 1, SLOT_D), []);
  const solidMaterial = useMemo(() => new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }), []);
  const ghostMaterial = useMemo(
    () => new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, transparent: true, opacity: GHOST_OPACITY, depthWrite: false }),
    [],
  );
  const colors = useMemo(
    () => ({
      free: new Color(palette.slabEdge),
      ev: new Color(palette.lime),
      reserved: new Color(palette.amber).lerp(new Color(palette.slab), 0.45),
      occupied: new Color(palette.data),
      called: new Color(palette.clay),
    }),
    [palette],
  );

  const solidRef = useRef<InstancedMesh>(null);
  const ghostRef = useRef<InstancedMesh>(null);
  const placement = useRef<Placement[]>([]);
  const solidSlots = useRef<number[]>([]); // instance index → slot index (for picking)
  const keyIndex = useRef<Map<string, number>>(new Map());
  const prev = useRef<{ slots: readonly Slot[] | null; level: number | null; sliding: ReadonlySet<string> }>({ slots: null, level: null, sliding: NO_SLIDING });

  useEffect(() => {
    const solid = solidRef.current;
    const ghost = ghostRef.current;
    if (!solid || !ghost) return;
    const meshes = [solid, ghost] as const;

    const write = (i: number) => {
      const s = slots[i];
      const p = placement.current[i];
      const mesh = meshes[p.mesh];
      const pos = slotPosition(cfg, s.id);
      const h = sliding.has(s.key) ? HEIGHT.free : s.state === 'occupied' ? HEIGHT.occupied : s.state === 'reserved' ? HEIGHT.reserved : HEIGHT.free;
      _obj.position.set(pos.x, pos.y + h / 2, pos.z);
      _obj.scale.set(1, h, 1);
      _obj.updateMatrix();
      mesh.setMatrixAt(p.index, _obj.matrix);
      const color =
        s.calledBy !== null ? colors.called : s.state === 'occupied' ? colors.occupied : s.state === 'reserved' ? colors.reserved : s.cls === 'ev' ? colors.ev : colors.free;
      mesh.setColorAt(p.index, color);
    };

    const full = prev.current.slots === null || prev.current.level !== selectedLevel || prev.current.slots.length !== n;
    if (full) {
      let si = 0;
      let gi = 0;
      solidSlots.current = [];
      keyIndex.current = new Map(slots.map((s, i) => [s.key, i]));
      placement.current = slots.map((s, i) => {
        if (selectedLevel === null || s.id.level === selectedLevel) {
          solidSlots.current[si] = i;
          return { mesh: 0, index: si++ };
        }
        return { mesh: 1, index: gi++ };
      });
      solid.count = si;
      ghost.count = gi;
      for (let i = 0; i < n; i++) write(i);
      for (const m of meshes) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }
    } else {
      const old = prev.current.slots!;
      let touchedSolid = false;
      let touchedGhost = false;
      const touch = (i: number) => {
        if (i < 0) return;
        write(i);
        if (placement.current[i].mesh === 0) touchedSolid = true;
        else touchedGhost = true;
      };
      if (old !== slots) {
        for (let i = 0; i < n; i++) if (old[i] !== slots[i]) touch(i);
      }
      const wasSliding = prev.current.sliding;
      if (wasSliding !== sliding) {
        for (const key of wasSliding) if (!sliding.has(key)) touch(keyIndex.current.get(key) ?? -1);
        for (const key of sliding) if (!wasSliding.has(key)) touch(keyIndex.current.get(key) ?? -1);
      }
      if (touchedSolid) {
        solid.instanceMatrix.needsUpdate = true;
        if (solid.instanceColor) solid.instanceColor.needsUpdate = true;
      }
      if (touchedGhost) {
        ghost.instanceMatrix.needsUpdate = true;
        if (ghost.instanceColor) ghost.instanceColor.needsUpdate = true;
      }
    }
    prev.current = { slots, level: selectedLevel, sliding };
  }, [slots, selectedLevel, sliding, cfg, colors, n]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPick || e.instanceId === undefined) return;
    const slotIndex = solidSlots.current[e.instanceId];
    if (slotIndex !== undefined) {
      e.stopPropagation();
      onPick(slots[slotIndex].key);
    }
  };

  return (
    <group>
      <instancedMesh
        key={`solid-${n}`}
        ref={solidRef}
        args={[geometry, solidMaterial, n]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onClick={handleClick}
      />
      <instancedMesh key={`ghost-${n}`} ref={ghostRef} args={[geometry, ghostMaterial, n]} frustumCulled={false} />
    </group>
  );
}
