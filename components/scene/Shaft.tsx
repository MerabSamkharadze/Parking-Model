'use client';

// SPEC §9: vertical shaft frame + the amber LiftPlatform. The platform's Y
// comes from the engine's lift position (level number, 0 = surface) via
// lib/geometry › liftY — the scene never decides where a lift is.

import { SHAFT_LENGTH, liftY, type Shaft as ShaftLayout } from '@/lib/geometry';
import type { FacilityConfig, Resource } from '@/lib/sim/types';
import type { Palette } from './palette';

const SHAFT_DEPTH = 2.8; // Z
const POST = 0.16;

export function LiftPlatform({ x, y, palette, down }: { x: number; y: number; palette: Palette; down: boolean }) {
  const color = down ? palette.clay : palette.amber;
  return (
    <group position={[x, y, 0]}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[SHAFT_LENGTH - 0.3, 0.16, SHAFT_DEPTH - 0.5]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.36, side * (SHAFT_DEPTH / 2 - 0.3)]} castShadow>
          <boxGeometry args={[SHAFT_LENGTH - 0.3, 0.4, 0.08]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

export function Shaft({ cfg, shaft, resource, palette }: { cfg: FacilityConfig; shaft: ShaftLayout; resource: Resource | undefined; palette: Palette }) {
  const bottom = -cfg.levels * cfg.levelHeight - 0.4;
  const top = 0.9;
  const h = top - bottom;
  const cy = (top + bottom) / 2;
  const hx = SHAFT_LENGTH / 2 - POST / 2;
  const hz = SHAFT_DEPTH / 2 - POST / 2;
  const posts: Array<[number, number]> = [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ];
  return (
    <group position={[shaft.x, 0, 0]}>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, cy, pz]}>
          <boxGeometry args={[POST, h, POST]} />
          <meshStandardMaterial color={palette.slabEdge} roughness={0.7} />
        </mesh>
      ))}
      {/* head frame */}
      {[-hz, hz].map((pz, i) => (
        <mesh key={`x${i}`} position={[0, top, pz]}>
          <boxGeometry args={[SHAFT_LENGTH, POST, POST]} />
          <meshStandardMaterial color={palette.slabEdge} roughness={0.7} />
        </mesh>
      ))}
      {[-hx, hx].map((px, i) => (
        <mesh key={`z${i}`} position={[px, top, 0]}>
          <boxGeometry args={[POST, POST, SHAFT_DEPTH]} />
          <meshStandardMaterial color={palette.slabEdge} roughness={0.7} />
        </mesh>
      ))}
      <LiftPlatform x={0} y={liftY(cfg, resource?.pos ?? 0)} palette={palette} down={resource?.down ?? false} />
    </group>
  );
}
