'use client';

// SPEC §9: vertical shaft frame + the amber LiftPlatform. The platform's Y is
// read every frame from the engine's lift move (lib/sim/kinematics ›
// positionAt) via lib/geometry › liftY — the scene never decides where a
// lift is. The plate's top is flush with the level floor it serves, so a car
// on the lift stands at the same height as one on the floor.

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { DoubleSide, type Group } from 'three';
import { SHAFT_LENGTH, bounds, liftY, type Shaft as ShaftLayout } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { liftLevelAt } from './motion';
import type { Palette } from './palette';

const SHAFT_DEPTH = 2.8; // Z
const POST = 0.16;
const PLATE = 0.16;
/** Surface entry enclosure: translucent side screens and a lintel over the head frame (DECISIONS S43). */
const CABIN_H = 2.6;

export function LiftPlatform({ cfg, liftId, palette }: { cfg: FacilityConfig; liftId: string; palette: Palette }) {
  const group = useRef<Group>(null);
  const down = useSimStore((s) => (s.resourcesById.get(liftId)?.down ?? false) || (s.snapshot?.failures.power ?? false));
  const color = down ? palette.clay : palette.amber;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { resourcesById, clock } = useSimStore.getState();
    const r = resourcesById.get(liftId);
    if (r) g.position.y = liftY(cfg, liftLevelAt(r, clock.t));
  });
  return (
    <group ref={group} position={[0, 0, 0]}>
      <mesh position={[0, -PLATE / 2, 0]} castShadow>
        <boxGeometry args={[SHAFT_LENGTH - 0.3, PLATE, SHAFT_DEPTH - 0.5]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.2, side * (SHAFT_DEPTH / 2 - 0.3)]} castShadow>
          <boxGeometry args={[SHAFT_LENGTH - 0.3, 0.4, 0.08]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

export function Shaft({ cfg, shaft, palette }: { cfg: FacilityConfig; shaft: ShaftLayout; palette: Palette }) {
  const bottom = bounds(cfg).minY - 0.4;
  const top = CABIN_H;
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
      {/* entry cabin at street level: glazed sides, open towards the transfer lane, a roof with a light */}
      {[-hz, hz].map((pz, i) => (
        <mesh key={`s${i}`} position={[0, CABIN_H / 2, pz]}>
          <planeGeometry args={[SHAFT_LENGTH - POST, CABIN_H - 0.05]} />
          <meshStandardMaterial color="#8fb7c9" transparent opacity={0.16} side={DoubleSide} depthWrite={false} roughness={0.2} metalness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, CABIN_H + POST / 2, 0]}>
        <boxGeometry args={[SHAFT_LENGTH + 0.4, 0.08, SHAFT_DEPTH + 0.4]} />
        <meshStandardMaterial color={palette.slab} roughness={0.8} />
      </mesh>
      <mesh position={[0, CABIN_H - 0.08, 0]}>
        <boxGeometry args={[SHAFT_LENGTH - 1, 0.05, 0.16]} />
        <meshBasicMaterial color="#ffe6b8" />
      </mesh>
      <LiftPlatform cfg={cfg} liftId={`lift-${shaft.id}`} palette={palette} />
    </group>
  );
}
