'use client';

// SPEC §9: OrbitControls with damping, four preset views (isometric /
// cutaway / shaft / slot focus) and a flyTo animation. Camera goals are
// derived from the config bounds, so every preset works for any facility.

import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Vector3 } from 'three';
import { bounds, layout, levelY, parseSlotKey, slotPosition } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import type { CameraPreset } from '@/store/useUiStore';

type Controls = ComponentRef<typeof OrbitControls>;

interface Goal {
  pos: Vector3;
  target: Vector3;
  active: boolean;
}

export function cameraGoal(cfg: FacilityConfig, preset: CameraPreset, selectedSlotKey: string | null, selectedLevel: number | null): { pos: Vector3; target: Vector3 } {
  const b = bounds(cfg);
  const width = b.maxX - b.minX;
  const e = Math.max(width, 40);
  const cy = b.minY / 2;
  const centre = new Vector3(0, cy, 0);
  switch (preset) {
    case 'cutaway': {
      const y = selectedLevel === null ? cy : levelY(cfg, selectedLevel);
      return { pos: new Vector3(0, y + e * 0.14, e * 0.95), target: new Vector3(0, y, 0) };
    }
    case 'shaft': {
      const shaft = layout(cfg).shafts[0];
      const x = shaft ? shaft.x : b.minX;
      const target = new Vector3(x, cy, 0);
      return { pos: new Vector3(x - e * 0.42, cy + e * 0.3, e * 0.36), target };
    }
    case 'slot': {
      if (selectedSlotKey) {
        const p = slotPosition(cfg, parseSlotKey(selectedSlotKey));
        const target = new Vector3(p.x, p.y + 0.7, p.z);
        const side = p.z < 0 ? -1 : 1;
        return { pos: new Vector3(p.x + 7, p.y + 5.5, p.z + side * 9), target };
      }
      if (selectedLevel !== null) {
        const y = levelY(cfg, selectedLevel);
        return { pos: new Vector3(e * 0.35, y + e * 0.3, e * 0.5), target: new Vector3(0, y, 0) };
      }
      // fall through to isometric
    }
    case 'isometric':
    default:
      return { pos: new Vector3(e * 0.72, cy + e * 0.6, e * 0.72), target: centre };
  }
}

export function CameraRig({
  cfg,
  preset,
  nonce,
  selectedSlotKey,
  selectedLevel,
}: {
  cfg: FacilityConfig;
  preset: CameraPreset;
  nonce: number;
  selectedSlotKey: string | null;
  selectedLevel: number | null;
}) {
  const controls = useRef<Controls>(null);
  const goal = useRef<Goal>({ pos: new Vector3(), target: new Vector3(), active: false });

  useEffect(() => {
    const g = cameraGoal(cfg, preset, selectedSlotKey, selectedLevel);
    goal.current.pos.copy(g.pos);
    goal.current.target.copy(g.target);
    goal.current.active = true;
  }, [cfg, preset, nonce, selectedSlotKey, selectedLevel]);

  useFrame((_, dt) => {
    const c = controls.current;
    const g = goal.current;
    if (!c || !g.active) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 4);
    c.object.position.lerp(g.pos, k);
    c.target.lerp(g.target, k);
    if (c.object.position.distanceToSquared(g.pos) < 0.01 && c.target.distanceToSquared(g.target) < 0.01) g.active = false;
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={260}
      maxPolarAngle={Math.PI * 0.56}
      onStart={() => {
        goal.current.active = false;
      }}
    />
  );
}
