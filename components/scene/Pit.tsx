'use client';

// The hole the facility sits in (DECISIONS S45): concrete retaining walls on
// all four sides, a base slab, and the ground mass behind the walls, so the
// rack reads as a pit cut into the earth rather than a shelf floating in the
// dark. Dollhouse rule: only the walls (and earth) on the far side of the
// camera are drawn, so nothing ever stands between the viewer and the levels.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { bounds, layout } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { noiseTexture } from './textures';

const WALL = 0.4; // m
const CLEAR = 0.6; // m between the rack and the wall
const EARTH = 34; // m of ground drawn behind each wall
const BASE = 0.45; // base slab thickness

export function Pit({ cfg }: { cfg: FacilityConfig }) {
  const b = useMemo(() => bounds(cfg), [cfg]);
  const l = useMemo(() => layout(cfg), [cfg]);
  const noise = useMemo(() => noiseTexture(), []);
  const sides = useRef<Array<Group | null>>([null, null, null, null]);
  // interior of the pit (the rack plus clearance; bays and the deck stay on the surface)
  const x0 = l.minX - CLEAR; // the shaft ends, not bounds(): bays and the deck stay on the surface
  const x1 = l.maxX + CLEAR;
  const z0 = b.minZ - CLEAR;
  const z1 = b.maxZ + CLEAR;
  const depth = -b.minY + BASE;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;

  useFrame(({ camera }) => {
    // 0 north (−z), 1 south (+z), 2 west (−x), 3 east (+x): show the far sides only
    const s = sides.current;
    if (s[0]) s[0].visible = camera.position.z > cz;
    if (s[1]) s[1].visible = camera.position.z <= cz;
    if (s[2]) s[2].visible = camera.position.x > cx;
    if (s[3]) s[3].visible = camera.position.x <= cx;
  });

  const wallMat = <meshStandardMaterial color="#26323a" roughness={0.92} map={noise} />;
  const earthMat = <meshStandardMaterial color="#231f1c" roughness={1} map={noise} />;
  const yMid = -depth / 2;

  return (
    <group>
      {/* base slab under the lowest level */}
      <mesh position={[cx, b.minY - BASE / 2, cz]} receiveShadow>
        <boxGeometry args={[w + 2 * WALL, BASE, d + 2 * WALL]} />
        {wallMat}
      </mesh>
      {/* ground under the base */}
      <mesh position={[cx, b.minY - BASE - 1.5, cz]}>
        <boxGeometry args={[w + 2 * EARTH, 3, d + 2 * EARTH]} />
        {earthMat}
      </mesh>
      {/* north */}
      <group
        ref={(g) => {
          sides.current[0] = g;
        }}
      >
        <mesh position={[cx, yMid, z0 - WALL / 2]} receiveShadow>
          <boxGeometry args={[w + 2 * WALL, depth, WALL]} />
          {wallMat}
        </mesh>
        <mesh position={[cx, yMid - 0.02, z0 - WALL - EARTH / 2]}>
          <boxGeometry args={[w + 2 * WALL + 2 * EARTH, depth - 0.04, EARTH]} />
          {earthMat}
        </mesh>
      </group>
      {/* south */}
      <group
        ref={(g) => {
          sides.current[1] = g;
        }}
      >
        <mesh position={[cx, yMid, z1 + WALL / 2]} receiveShadow>
          <boxGeometry args={[w + 2 * WALL, depth, WALL]} />
          {wallMat}
        </mesh>
        <mesh position={[cx, yMid - 0.02, z1 + WALL + EARTH / 2]}>
          <boxGeometry args={[w + 2 * WALL + 2 * EARTH, depth - 0.04, EARTH]} />
          {earthMat}
        </mesh>
      </group>
      {/* west */}
      <group
        ref={(g) => {
          sides.current[2] = g;
        }}
      >
        <mesh position={[x0 - WALL / 2, yMid, cz]} receiveShadow>
          <boxGeometry args={[WALL, depth, d]} />
          {wallMat}
        </mesh>
        <mesh position={[x0 - WALL - EARTH / 2, yMid - 0.02, cz]}>
          <boxGeometry args={[EARTH, depth - 0.04, d + 2 * WALL]} />
          {earthMat}
        </mesh>
      </group>
      {/* east */}
      <group
        ref={(g) => {
          sides.current[3] = g;
        }}
      >
        <mesh position={[x1 + WALL / 2, yMid, cz]} receiveShadow>
          <boxGeometry args={[WALL, depth, d]} />
          {wallMat}
        </mesh>
        <mesh position={[x1 + WALL + EARTH / 2, yMid - 0.02, cz]}>
          <boxGeometry args={[EARTH, depth - 0.04, d + 2 * WALL]} />
          {earthMat}
        </mesh>
      </group>
    </group>
  );
}
