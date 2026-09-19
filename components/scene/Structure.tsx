'use client';

// Steel rack detail (DECISIONS U1): posts at every column boundary on both
// slot rows, shuttle guide rails along each corridor, a light strip under
// every slab and a warm point light per level. All instanced — three draw
// calls for the whole rack plus the lamps. Every point light is evaluated by
// every lit fragment, so deep facilities get at most MAX_LEVEL_LIGHTS of
// them, spread over the levels (a light reaches its neighbours anyway).

import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D } from 'three';
import { layout, levelY } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import type { Palette } from './palette';

const POST = 0.14;
const RAIL_W = 0.1;
const RAIL_H = 0.07;
const MAX_LEVEL_LIGHTS = 3;
const _obj = new Object3D();

/** Levels that get a point light: all of them up to the cap, else evenly spread top to bottom. */
export function litLevelsOf(levels: number, max = MAX_LEVEL_LIGHTS): Set<number> {
  const out = new Set<number>();
  if (levels <= max) {
    for (let i = 0; i < levels; i++) out.add(i);
    return out;
  }
  for (let i = 0; i < max; i++) out.add(Math.round((i * (levels - 1)) / (max - 1)));
  return out;
}

export function Structure({ cfg, palette }: { cfg: FacilityConfig; palette: Palette }) {
  const l = useMemo(() => layout(cfg), [cfg]);
  const litLevels = useMemo(() => litLevelsOf(cfg.levels), [cfg.levels]);
  const posts = useRef<InstancedMesh>(null);
  const rails = useRef<InstancedMesh>(null);
  const depth = -cfg.levels * cfg.levelHeight;
  const zInner = cfg.corridorWidth / 2;
  const zOuter = cfg.corridorWidth / 2 + cfg.slotDepth;
  const postList = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let z = 0; z < l.zones; z++) {
      for (let k = 0; k <= l.colsPerZone[z]; k++) {
        const x = l.zoneStartX[z] + k * cfg.pitch;
        out.push([x, -zInner - 0.12], [x, zInner + 0.12], [x, -zOuter + 0.1], [x, zOuter - 0.1]);
      }
    }
    return out;
  }, [l, cfg.pitch, zInner, zOuter]);
  const railList = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; len: number }> = [];
    for (let level = 0; level < cfg.levels; level++) {
      const y = levelY(cfg, level) + RAIL_H / 2;
      for (let z = 0; z < l.zones; z++) {
        const len = l.colsPerZone[z] * cfg.pitch;
        const cx = l.zoneStartX[z] + len / 2;
        out.push({ x: cx, y, z: -zInner + 0.35, len }, { x: cx, y, z: zInner - 0.35, len });
      }
    }
    return out;
  }, [cfg, l, zInner]);

  useLayoutEffect(() => {
    const p = posts.current;
    const r = rails.current;
    if (!p || !r) return;
    postList.forEach(([x, z], i) => {
      _obj.position.set(x, depth / 2, z);
      _obj.scale.set(1, -depth, 1);
      _obj.rotation.set(0, 0, 0);
      _obj.updateMatrix();
      p.setMatrixAt(i, _obj.matrix);
    });
    p.count = postList.length;
    p.instanceMatrix.needsUpdate = true;
    railList.forEach((rail, i) => {
      _obj.position.set(rail.x, rail.y, rail.z);
      _obj.scale.set(rail.len, 1, 1);
      _obj.updateMatrix();
      r.setMatrixAt(i, _obj.matrix);
    });
    r.count = railList.length;
    r.instanceMatrix.needsUpdate = true;
  }, [postList, railList, depth]);

  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, postList.length]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[POST, 1, POST]} />
        <meshStandardMaterial color={palette.slabEdge} roughness={0.6} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={rails} args={[undefined, undefined, railList.length]} frustumCulled={false}>
        <boxGeometry args={[1, RAIL_H, RAIL_W]} />
        <meshStandardMaterial color="#6b7a84" roughness={0.35} metalness={0.8} />
      </instancedMesh>
      {/* light strips under each slab and a warm point light on every lit level */}
      {Array.from({ length: cfg.levels }, (_, level) => {
        const y = levelY(cfg, level) + cfg.levelHeight - 0.32;
        return (
          <group key={level}>
            {l.zoneStartX.map((x0, z) => {
              const len = l.colsPerZone[z] * cfg.pitch;
              return (
                <mesh key={z} position={[x0 + len / 2, y, 0]}>
                  <boxGeometry args={[len - 1, 0.05, 0.16]} />
                  <meshBasicMaterial color="#ffe6b8" />
                </mesh>
              );
            })}
            {litLevels.has(level) && (
              <pointLight position={[(l.fieldMinX + l.fieldMaxX) / 2, y - 0.2, 0]} color="#ffd9a0" intensity={60} distance={l.fieldMaxX - l.fieldMinX} decay={2} />
            )}
          </group>
        );
      })}
    </group>
  );
}
