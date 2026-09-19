'use client';

// SPEC §9: OrbitControls with damping, four preset views (isometric /
// cutaway / shaft / slot focus) and a flyTo animation. Camera goals are
// derived from the config bounds, so every preset works for any facility.

import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Vector3 } from 'three';
import { bayPosition, bounds, layout, levelY, parseSlotKey, slotPosition } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import type { CameraPreset } from '@/store/useUiStore';
import { floorLabels } from './SurfaceDeck';

type Controls = ComponentRef<typeof OrbitControls>;

interface Goal {
  pos: Vector3;
  target: Vector3;
  active: boolean;
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
 *  which every point is inside the frustum, with a margin. */
export function fitDistance(points: readonly Vector3[], target: Vector3, dir: Vector3, fovDeg: number, aspect: number, marginX = 1.05, marginY = 1.2): number {
  const forward = dir.clone().negate();
  const right = new Vector3().crossVectors(forward, UP).normalize();
  const up = new Vector3().crossVectors(right, forward);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  let d = 0;
  const p = new Vector3();
  for (const point of points) {
    p.copy(point).sub(target);
    const along = p.dot(dir);
    // marginY leaves room for the overlay chips along the bottom edge
    d = Math.max(d, along + (Math.abs(p.dot(right)) * marginX) / tanH, along + (Math.abs(p.dot(up)) * marginY) / tanV);
  }
  return Math.max(d, 8);
}

function boxPoints(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(new Vector3(i & 1 ? maxX : minX, i & 2 ? maxY : minY, i & 4 ? maxZ : minZ));
  return out;
}

/** The visual hull of a facility: the underground structure (shafts included)
 *  plus the surface bay markings — tighter than the raw bounding box. */
function facilityHull(cfg: FacilityConfig): Vector3[] {
  const l = layout(cfg);
  const b = bounds(cfg);
  const points = boxPoints(l.minX, b.minY, b.minZ, l.maxX, 1, b.maxZ);
  const half = { x: 2.7, z: 1.4 }; // bay marking 5.4 × 2.8 m (SurfaceDeck)
  for (const kind of ['bay_in', 'bay_out'] as const) {
    const count = kind === 'bay_in' ? cfg.baysIn : cfg.baysOut;
    for (let i = 0; i < count; i++) {
      const p = bayPosition(cfg, kind, i);
      points.push(new Vector3(p.x - half.x, 0, p.z - half.z), new Vector3(p.x + half.x, 0, p.z + half.z));
    }
  }
  for (const l of floorLabels(cfg)) points.push(new Vector3(l.x - l.halfWidth, 0, l.z - 1), new Vector3(l.x + l.halfWidth, 0, l.z + 1));
  return points;
}

export function cameraGoal(
  cfg: FacilityConfig,
  preset: CameraPreset,
  selectedSlotKey: string | null,
  selectedLevel: number | null,
  aspect = 16 / 9,
): { pos: Vector3; target: Vector3 } {
  const b = bounds(cfg);
  const l = layout(cfg);
  // Slightly below the box centre: lifts the picture off the overlay chips.
  const centre = new Vector3(0, b.minY * 0.58, 0);
  const frame = (dir: Vector3, target: Vector3, points: readonly Vector3[]) => ({
    pos: target.clone().addScaledVector(dir, fitDistance(points, target, dir, DEFAULT_FOV, aspect)),
    target,
  });
  switch (preset) {
    case 'cutaway': {
      if (selectedLevel === null) return frame(DIR.cutaway, centre, facilityHull(cfg));
      const y = levelY(cfg, selectedLevel);
      return frame(DIR.cutaway, new Vector3(0, y, 0), boxPoints(l.minX, y - cfg.levelHeight, b.minZ, l.maxX, y + cfg.levelHeight, b.maxZ));
    }
    case 'shaft': {
      const shaft = l.shafts[0];
      const x = shaft ? shaft.x : l.minX;
      return frame(DIR.shaft, new Vector3(x, b.minY / 2, 0), boxPoints(x - 8, b.minY, b.minZ, x + 8, 1.5, b.maxZ));
    }
    case 'slot': {
      if (selectedSlotKey) {
        // Three-quarter view from above the slot's outer side; flyTo isolates
        // the level, so the slabs above are ghosted and do not block the view.
        const p = slotPosition(cfg, parseSlotKey(selectedSlotKey));
        const target = new Vector3(p.x, p.y + 0.7, p.z);
        const outward = p.z < 0 ? -1 : 1;
        return { pos: new Vector3(p.x + 7, p.y + 10, p.z + outward * 8), target };
      }
      if (selectedLevel !== null) {
        const y = levelY(cfg, selectedLevel);
        return frame(DIR.level, new Vector3(0, y, 0), boxPoints(l.minX, y, b.minZ, l.maxX, y + 2, b.maxZ));
      }
      return frame(DIR.isometric, centre, facilityHull(cfg));
    }
    case 'isometric':
    default:
      return frame(DIR.isometric, centre, facilityHull(cfg));
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
