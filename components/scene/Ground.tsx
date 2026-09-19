'use client';

// The city around the pit (DECISIONS U1): asphalt ground, a two-lane street
// along the entry side with lane marks and kerbs, and the surface "lid" over
// the facility. The lid is see-through from above (the dollhouse view the
// simulator needs) and turns opaque as the camera comes down to eye level,
// so the street scenes read as a real street. These planes cover the whole
// frame in every view, so they use the cheap Lambert model: matte asphalt
// gains nothing from the PBR path, and every point light would otherwise be
// evaluated per pixel twice over (the frame and the lid are both drawn).

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { BufferGeometry, Float32BufferAttribute, type Material, type MeshLambertMaterial, type Vector3 } from 'three';
import { bounds, layout } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useUiStore } from '@/store/useUiStore';
import { followed } from './VehiclePool';
import type { Palette } from './palette';
import { noiseTexture } from './textures';

export const GROUND_SIZE = 420;
export const STREET_NEAR = 12; // z where the pavement meets the road
export const STREET_FAR = 24;
export const KERB_LANE_Z = 21.4; // parked cars along the far kerb
const LID_MIN = 0.12;
/** The ground around the pit never gets thinner than this in the dollhouse view, so
 *  street cars stand on asphalt instead of floating (DECISIONS S44). */
const FRAME_MIN = 0.55;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How solid the surface is: see-through from above, opaque at eye level — unless
 *  the camera is looking at something underground (the orbit target below the
 *  surface), when the ground opens up whatever the height (DECISIONS S43). */
export function surfaceOpacity(cameraY: number, targetY = 0): number {
  const low = clamp01((8 - cameraY) / 4.5);
  const above = clamp01((targetY + 0.4) / 1.0);
  return LID_MIN + (1 - LID_MIN) * low * above;
}

/** This frame's lid opacity (written by Ground, read by everything that sits on the
 *  surface and must fade with it: bay pads, lamp pools, the lawn, the mall canopy). */
export const surface = {
  opacity: LID_MIN,
  get k() {
    return (this.opacity - LID_MIN) / (1 - LID_MIN);
  },
};

/** Fade a material between `min` (dollhouse view) and `max` (street level) with the lid. */
export function useSurfaceFade(ref: RefObject<Material | null>, min: number, max: number): void {
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const o = min + (max - min) * surface.k;
    if (Math.abs(m.opacity - o) < 0.002) return;
    m.opacity = o;
    m.transparent = o < 0.999;
    m.depthWrite = o > 0.6;
  });
}

/**
 * The lid's target opacity this frame (DECISIONS S44): the camera-height rule, except
 * that a camera looking at something underground — the follow camera on a car below the
 * surface, the slot view — sees through the lid whatever its height. Section views
 * (cutaway, shaft) look through the surface too.
 */
export function lidTarget(cameraY: number, preset: string, targetBelowGround: boolean, targetY = 0): number {
  if (preset === 'cutaway' || preset === 'shaft') return LID_MIN;
  if (preset === 'slot' || (preset === 'follow' && targetBelowGround)) return LID_MIN;
  return surfaceOpacity(cameraY, targetY);
}

function dashes(x0: number, x1: number, z: number, dash = 3, gap = 3): BufferGeometry {
  const pts: number[] = [];
  for (let x = x0; x < x1; x += dash + gap) pts.push(x, 0, z, Math.min(x + dash, x1), 0, z);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

export function Ground({ cfg, palette }: { cfg: FacilityConfig; palette: Palette }) {
  const b = useMemo(() => bounds(cfg), [cfg]);
  const l = useMemo(() => layout(cfg), [cfg]);
  const lid = useRef<MeshLambertMaterial>(null);
  const fading = useRef<MeshLambertMaterial[]>([]);
  const register = (i: number) => (m: MeshLambertMaterial | null) => {
    if (m) fading.current[i] = m;
  };
  const noise = useMemo(() => noiseTexture(), []);
  const lidW = b.maxX - b.minX + 10;
  const lidD = b.maxZ - b.minZ + 6;
  const lidX = (b.minX + b.maxX) / 2;
  const frame = useMemo(() => {
    const G = GROUND_SIZE;
    const x0 = lidX - lidW / 2;
    const x1 = lidX + lidW / 2;
    const z0 = -lidD / 2;
    const z1 = lidD / 2;
    return [
      { x: 0, z: (z0 - G / 2) / 2, w: G, d: z0 + G / 2 }, // north strip (−z)
      { x: 0, z: (z1 + G / 2) / 2, w: G, d: G / 2 - z1 }, // south strip (+z)
      { x: (x0 - G / 2) / 2, z: 0, w: x0 + G / 2, d: lidD }, // west
      { x: (x1 + G / 2) / 2, z: 0, w: G / 2 - x1, d: lidD }, // east
    ];
  }, [lidX, lidW, lidD]);
  const centre = dashes(-GROUND_SIZE / 2, GROUND_SIZE / 2, (STREET_NEAR + STREET_FAR) / 2);
  const kerbs = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-GROUND_SIZE / 2, 0, STREET_NEAR, GROUND_SIZE / 2, 0, STREET_NEAR, -GROUND_SIZE / 2, 0, STREET_FAR, GROUND_SIZE / 2, 0, STREET_FAR], 3));
    return g;
  }, []);

  // the whole surface fades in as the camera drops towards the street, so the
  // dollhouse view from above keeps every level readable; the lid clears whenever
  // the camera is meant to look underground (follow / slot / section views)
  useFrame(({ camera, controls }, dt) => {
    const { cameraPreset, selectedSlotKey } = useUiStore.getState();
    const below = (cameraPreset === 'follow' && followed.active && followed.y < -0.3) || (cameraPreset === 'slot' && selectedSlotKey !== null);
    const target = (controls as { target?: Vector3 } | null)?.target;
    const o = lidTarget(camera.position.y, cameraPreset, below, target ? target.y : 0);
    const section = cameraPreset === 'cutaway' || cameraPreset === 'shaft';
    const frame = section ? LID_MIN : Math.max(FRAME_MIN, Math.min(1, o + 0.08));
    const rate = 1 - Math.exp(-Math.min(dt, 0.1) * 6); // ~0.5 s ease, no pops
    const apply = (m: MeshLambertMaterial | null, target: number) => {
      if (!m) return;
      const next = Math.abs(m.opacity - target) < 0.002 ? target : m.opacity + (target - m.opacity) * rate;
      if (next === m.opacity) return;
      m.opacity = next;
      m.transparent = next < 0.999;
      m.depthWrite = next > 0.6;
    };
    apply(lid.current, o);
    surface.opacity = lid.current ? lid.current.opacity : o;
    for (const m of fading.current) apply(m, frame);
  });

  return (
    <group>
      {/* asphalt everywhere except over the pit (the lid handles that): four planes around the lid */}
      {frame.map((f, i) => (
        <mesh key={i} position={[f.x, -0.03, f.z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[f.w, f.d]} />
          <meshLambertMaterial ref={register(i)} color="#1b2226" emissive="#06080a" map={noise} map-repeat={[f.w / 10, f.d / 10]} transparent opacity={LID_MIN} depthWrite={false} />
        </mesh>
      ))}
      {/* the lid over the facility: see-through from above, solid from the street */}
      <mesh position={[lidX, -0.005, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[lidW, lidD]} />
        <meshLambertMaterial ref={lid} color={palette.slab} map={noise} map-repeat={[6, 2]} transparent opacity={LID_MIN} depthWrite={false} />
      </mesh>
      {/* road */}
      <mesh position={[0, -0.02, (STREET_NEAR + STREET_FAR) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, STREET_FAR - STREET_NEAR]} />
        <meshLambertMaterial ref={register(4)} color="#232b30" emissive="#06080a" map={noise} map-repeat={[40, 2]} transparent opacity={LID_MIN} depthWrite={false} />
      </mesh>
      <lineSegments geometry={centre} position={[0, 0.005, 0]}>
        <lineBasicMaterial color="#8a8f8c" transparent opacity={0.55} />
      </lineSegments>
      <lineSegments geometry={kerbs} position={[0, 0.005, 0]}>
        <lineBasicMaterial color={palette.slabEdge} />
      </lineSegments>
      {/* pavement strip between the pit and the road */}
      <mesh position={[0, -0.01, (b.maxZ + STREET_NEAR) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[GROUND_SIZE, STREET_NEAR - b.maxZ]} />
        <meshLambertMaterial ref={register(5)} color="#262e33" emissive="#06080a" map={noise} map-repeat={[40, 1]} transparent opacity={LID_MIN} depthWrite={false} />
      </mesh>
      {/* driveways from the road to the bays */}
      {(['bay_in', 'bay_out'] as const).map((kind, i) => {
        const x = kind === 'bay_in' ? l.minX - 7 : l.maxX + 7;
        return (
          <mesh key={kind} position={[x, -0.004, (b.maxZ + STREET_NEAR) / 2]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[7, STREET_NEAR - b.maxZ + 0.5]} />
            <meshLambertMaterial ref={register(6 + i)} color="#222a2f" emissive="#06080a" transparent opacity={LID_MIN} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
