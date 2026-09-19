'use client';

// SPEC §9: OrbitControls with damping, four preset views (isometric /
// cutaway / shaft / slot focus) and a flyTo animation. Camera goals are
// derived from the config bounds, so every preset works for any facility.

import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
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

interface Box3 {
  min: Vector3;
  max: Vector3;
}

const UP = new Vector3(0, 1, 0);
const DIR = {
  isometric: new Vector3(0.72, 0.6, 0.72).normalize(),
  cutaway: new Vector3(0, 0.22, 1).normalize(),
  shaft: new Vector3(-0.75, 0.45, 0.62).normalize(),
  level: new Vector3(0.5, 0.55, 0.7).normalize(),
} as const;

export const DEFAULT_FOV = 40;

/** Smallest camera distance along `dir` (unit, from target towards camera) at
 *  which every corner of `box` is inside the frustum, with a margin. */
export function fitDistance(box: Box3, target: Vector3, dir: Vector3, fovDeg: number, aspect: number, margin = 1.08): number {
  const forward = dir.clone().negate();
  const right = new Vector3().crossVectors(forward, UP).normalize();
  const up = new Vector3().crossVectors(right, forward);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  let d = 0;
  const p = new Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
    const along = p.dot(dir);
    d = Math.max(d, along + (Math.abs(p.dot(right)) * margin) / tanH, along + (Math.abs(p.dot(up)) * margin) / tanV);
  }
  return Math.max(d, 8);
}

export function cameraGoal(
  cfg: FacilityConfig,
  preset: CameraPreset,
  selectedSlotKey: string | null,
  selectedLevel: number | null,
  aspect = 16 / 9,
): { pos: Vector3; target: Vector3 } {
  const b = bounds(cfg);
  const box: Box3 = { min: new Vector3(b.minX, b.minY, b.minZ), max: new Vector3(b.maxX, b.maxY + 1, b.maxZ) };
  const centre = new Vector3(0, b.minY / 2, 0);
  const frame = (dir: Vector3, target: Vector3, fitBox: Box3 = box) => ({
    pos: target.clone().addScaledVector(dir, fitDistance(fitBox, target, dir, DEFAULT_FOV, aspect)),
    target,
  });
  switch (preset) {
    case 'cutaway': {
      if (selectedLevel === null) return frame(DIR.cutaway, centre);
      const y = levelY(cfg, selectedLevel);
      const levelBox: Box3 = { min: new Vector3(b.minX, y - cfg.levelHeight, b.minZ), max: new Vector3(b.maxX, y + cfg.levelHeight, b.maxZ) };
      return frame(DIR.cutaway, new Vector3(0, y, 0), levelBox);
    }
    case 'shaft': {
      const shaft = layout(cfg).shafts[0];
      const x = shaft ? shaft.x : b.minX;
      const shaftBox: Box3 = { min: new Vector3(x - 8, b.minY, b.minZ), max: new Vector3(x + 8, 1.5, b.maxZ) };
      return frame(DIR.shaft, new Vector3(x, b.minY / 2, 0), shaftBox);
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
        const levelBox: Box3 = { min: new Vector3(b.minX, y, b.minZ), max: new Vector3(b.maxX, y + 2, b.maxZ) };
        return frame(DIR.level, new Vector3(0, y, 0), levelBox);
      }
      return frame(DIR.isometric, centre);
    }
    case 'isometric':
    default:
      return frame(DIR.isometric, centre);
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
  const aspect = useThree((s) => s.viewport.aspect);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  // A new goal only when the preset / selection changes: a viewport resize
  // must not yank the camera away from where the user left it.
  useEffect(() => {
    const g = cameraGoal(cfg, preset, selectedSlotKey, selectedLevel, aspectRef.current);
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
