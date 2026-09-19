'use client';

// The city around the facility (DECISIONS U1): street lamps, cars parked
// nose to tail along the far kerb (the problem the machine solves), and one
// of three settings drawn as night-time massing with lit windows — a
// shopping mall, an office tower on a podium, or residential blocks around a
// courtyard with trees on the lawn that covers the facility. Everything is
// instanced boxes and cones; the buildings sit north of the pit so no
// camera preset is blocked.

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, Color, InstancedMesh, type MeshBasicMaterial, type MeshStandardMaterial, Object3D } from 'three';
import { bounds, layout } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { type Setting, useUiStore } from '@/store/useUiStore';
import { KERB_LANE_Z, STREET_FAR, STREET_NEAR, surface, useSurfaceFade } from './Ground';
import { CAR_MATERIALS } from './VehiclePool';
import { PAINTS } from './carModels';
import type { Palette } from './palette';
import { glowTexture } from './textures';
import { useCarModels } from './useCarModels';

const _obj = new Object3D();
const _col = new Color();

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- cars parked along the kerb ------------------------------------------------

function KerbCars({ from, to, gapEvery = 5 }: { from: number; to: number; gapEvery?: number }) {
  const baked = useCarModels('lod');
  const refs = useRef<Array<[InstancedMesh | null, InstancedMesh | null]>>(baked.map(() => [null, null]));
  const slots = useMemo(() => {
    const rnd = seeded(11);
    const out: Array<{ x: number; model: number; paint: number; yaw: number }> = [];
    let i = 0;
    for (let x = from; x < to; x += 6.2) {
      i++;
      if (i % gapEvery === 0) continue; // the one gap everyone is circling for
      out.push({ x: x + (rnd() - 0.5) * 0.6, model: Math.floor(rnd() * baked.length), paint: Math.floor(rnd() * PAINTS.length), yaw: rnd() < 0.5 ? 0 : Math.PI });
    }
    return out;
  }, [from, to, gapEvery, baked.length]);
  useLayoutEffect(() => {
    baked.forEach((_, m) => {
      const [paint, rest] = refs.current[m];
      if (!paint || !rest) return;
      let k = 0;
      for (const s of slots) {
        if (s.model !== m) continue;
        _obj.position.set(s.x, 0, KERB_LANE_Z);
        _obj.rotation.set(0, s.yaw, 0);
        _obj.scale.set(1, 1, 1);
        _obj.updateMatrix();
        paint.setMatrixAt(k, _obj.matrix);
        rest.setMatrixAt(k, _obj.matrix);
        paint.setColorAt(k, PAINTS[s.paint]);
        k++;
      }
      paint.count = k;
      rest.count = k;
      paint.instanceMatrix.needsUpdate = true;
      rest.instanceMatrix.needsUpdate = true;
      if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
    });
  }, [baked, slots]);
  return (
    <group>
      {baked.map((b, m) => (
        <group key={b.id}>
          <instancedMesh
            ref={(el) => {
              refs.current[m][0] = el;
            }}
            args={[b.paint, CAR_MATERIALS.paint, slots.length]}
            castShadow
            frustumCulled={false}
          />
          <instancedMesh
            ref={(el) => {
              refs.current[m][1] = el;
            }}
            args={[b.rest, CAR_MATERIALS.rest, slots.length]}
            frustumCulled={false}
          />
        </group>
      ))}
    </group>
  );
}

// ---- street lamps ----------------------------------------------------------------

// ---- cars passing on the street ----------------------------------------------------

const TRAFFIC_LOOP = 260; // m of road the cars circulate on, centred on the pit
const TRAFFIC_LANES: Array<{ z: number; dir: 1 | -1 }> = [
  { z: STREET_NEAR + 3, dir: 1 },
  { z: STREET_NEAR + 6.6, dir: -1 },
];

/** Ambient traffic: scenery on wall-clock time, never engine state (SPEC §0.3). Frozen under reduced motion. */
function Traffic({ perLane = 5, reduced }: { perLane?: number; reduced: boolean }) {
  const baked = useCarModels('lod');
  const refs = useRef<Array<[InstancedMesh | null, InstancedMesh | null]>>(baked.map(() => [null, null]));
  const cars = useMemo(() => {
    const rnd = seeded(23);
    const out: Array<{ lane: number; x0: number; v: number; model: number; paint: number }> = [];
    TRAFFIC_LANES.forEach((_, lane) => {
      for (let i = 0; i < perLane; i++) {
        out.push({ lane, x0: (i + rnd() * 0.6) * (TRAFFIC_LOOP / perLane), v: 8 + rnd() * 3, model: Math.floor(rnd() * baked.length), paint: Math.floor(rnd() * PAINTS.length) });
      }
    });
    return out;
  }, [perLane, baked.length]);
  const time = useRef(0);
  useFrame(({ camera }, dt) => {
    // scenery on wall-clock time (S38), but a paused sim is a frozen picture (SPEC §9)
    if (!reduced && useSimStore.getState().running) time.current += Math.min(dt, 0.1);
    const t = time.current;
    // from above, the near lane runs right under the camera: a car there
    // fills a quarter of the frame, so it is skipped until it has passed
    const cullSq = camera.position.y > 6 ? 30 * 30 : 0;
    baked.forEach((_, m) => {
      const [paint, rest] = refs.current[m];
      if (!paint || !rest) return;
      let k = 0;
      for (const c of cars) {
        if (c.model !== m) continue;
        const lane = TRAFFIC_LANES[c.lane];
        const along = (c.x0 + c.v * t) % TRAFFIC_LOOP;
        const x = lane.dir === 1 ? along - TRAFFIC_LOOP / 2 : TRAFFIC_LOOP / 2 - along;
        _obj.position.set(x, 0, lane.z);
        if (cullSq && _obj.position.distanceToSquared(camera.position) < cullSq) continue;
        _obj.rotation.set(0, lane.dir === 1 ? 0 : Math.PI, 0);
        _obj.scale.set(1, 1, 1);
        _obj.updateMatrix();
        paint.setMatrixAt(k, _obj.matrix);
        rest.setMatrixAt(k, _obj.matrix);
        paint.setColorAt(k, PAINTS[c.paint]);
        k++;
      }
      paint.count = k;
      rest.count = k;
      paint.instanceMatrix.needsUpdate = true;
      rest.instanceMatrix.needsUpdate = true;
      if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
    });
  });
  return (
    <group>
      {baked.map((b, m) => (
        <group key={b.id}>
          <instancedMesh
            ref={(el) => {
              refs.current[m][0] = el;
            }}
            args={[b.paint, CAR_MATERIALS.paint, cars.length]}
            castShadow
            frustumCulled={false}
          />
          <instancedMesh
            ref={(el) => {
              refs.current[m][1] = el;
            }}
            args={[b.rest, CAR_MATERIALS.rest, cars.length]}
            frustumCulled={false}
          />
        </group>
      ))}
    </group>
  );
}

function Lamps({ xs, z }: { xs: number[]; z: number }) {
  // pools of light on the asphalt: additive discs, no light sources (each
  // real point light is paid for by every lit pixel), faded with the surface
  const pools = useRef<InstancedMesh>(null);
  const glow = useMemo(() => glowTexture(), []);
  useLayoutEffect(() => {
    const m = pools.current;
    if (!m) return;
    xs.forEach((x, i) => {
      _obj.position.set(x, 0.04, z + 2.3);
      _obj.rotation.set(-Math.PI / 2, 0, 0);
      _obj.scale.set(1, 1, 1);
      _obj.updateMatrix();
      m.setMatrixAt(i, _obj.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [xs, z]);
  useFrame(() => {
    const m = pools.current;
    if (m) (m.material as MeshBasicMaterial).opacity = 0.42 * surface.opacity;
  });
  return (
    <group>
      <instancedMesh ref={pools} args={[undefined, undefined, xs.length]} frustumCulled={false}>
        <circleGeometry args={[7.5, 24]} />
        <meshBasicMaterial color="#ffc978" map={glow} transparent opacity={0.42} depthWrite={false} blending={AdditiveBlending} />
      </instancedMesh>
      {xs.map((x) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position={[0, 3.5, 0]}>
            <cylinderGeometry args={[0.07, 0.1, 7, 8]} />
            <meshStandardMaterial color="#3d474d" roughness={0.6} metalness={0.6} />
          </mesh>
          <mesh position={[0, 6.9, 1.2]}>
            <boxGeometry args={[0.16, 0.1, 2.4]} />
            <meshStandardMaterial color="#3d474d" roughness={0.6} metalness={0.6} />
          </mesh>
          <mesh position={[0, 6.8, 2.3]}>
            <boxGeometry args={[0.5, 0.14, 0.9]} />
            <meshBasicMaterial color="#ffe3b0" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---- lit windows on a façade ------------------------------------------------------

function Windows({
  x0,
  x1,
  y0,
  y1,
  z,
  facing,
  seed,
  litShare = 0.45,
  pitchX = 3,
  pitchY = 3.4,
}: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
  facing: 1 | -1;
  seed: number;
  litShare?: number;
  pitchX?: number;
  pitchY?: number;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const cells = useMemo(() => {
    const rnd = seeded(seed);
    const out: Array<{ x: number; y: number; lit: number }> = [];
    for (let y = y0 + 1.2; y < y1 - 1; y += pitchY) for (let x = x0 + 1.5; x < x1 - 1; x += pitchX) out.push({ x, y, lit: rnd() < litShare ? 0.6 + rnd() * 0.4 : 0.05 });
    return out;
  }, [x0, x1, y0, y1, seed, litShare, pitchX, pitchY]);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    cells.forEach((c, i) => {
      _obj.position.set(c.x, c.y, z + facing * 0.03);
      _obj.rotation.set(0, facing === 1 ? 0 : Math.PI, 0);
      _obj.scale.set(1, 1, 1);
      _obj.updateMatrix();
      m.setMatrixAt(i, _obj.matrix);
      _col.setRGB(1.0 * c.lit, 0.86 * c.lit, 0.62 * c.lit);
      m.setColorAt(i, _col);
    });
    m.count = cells.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cells, z, facing]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]} frustumCulled={false}>
      <planeGeometry args={[1.6, 1.9]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
}

function Block({ x, y, z, w, h, d, color }: { x: number; y: number; z: number; w: number; h: number; d: number; color: string }) {
  return (
    <mesh position={[x, y + h / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

// ---- settings -----------------------------------------------------------------

/**
 * The part of a building that stands over the pit (DECISIONS S46): drawn as a
 * ghosted volume with its edges, so the pitch "under a shopping centre / tower"
 * is literally true on screen while every level stays readable through it.
 */
function OverPit({ cfg, h, zFront, color }: { cfg: FacilityConfig; h: number; zFront: number; color: string }) {
  const b = bounds(cfg);
  const w = b.maxX - b.minX + 12;
  const d = zFront - (b.minZ - 3);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (zFront + b.minZ - 3) / 2;
  const geometry = useMemo(() => new BoxGeometry(w, h, d), [w, h, d]);
  return (
    <group position={[cx, h / 2 + 0.05, cz]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} transparent opacity={0.1} depthWrite={false} roughness={0.9} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color="#3a4a53" transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

function Mall({ cfg, palette, minX, maxX }: { cfg: FacilityConfig; palette: Palette; minX: number; maxX: number }) {
  const x0 = minX - 30;
  const x1 = maxX + 30;
  // the solid block starts behind the pit; its front wing over the pit is ghosted
  const zFront = -STREET_NEAR - 12;
  // the canopy hangs over the pavement: it fades with the lid so the slot and
  // follow cameras can look under it
  const canopy = useRef<MeshStandardMaterial>(null);
  useSurfaceFade(canopy, 0.15, 1);
  return (
    <group>
      <OverPit cfg={cfg} h={11} zFront={zFront} color="#151d22" />
      <Block x={(x0 + x1) / 2} y={0} z={zFront - 26} w={x1 - x0} h={11} d={52} color="#151d22" />
      {/* glass ground floor + a lit sign band */}
      <mesh position={[(x0 + x1) / 2, 2.6, zFront + 0.04]}>
        <planeGeometry args={[x1 - x0 - 4, 4.4]} />
        <meshBasicMaterial color="#8fb7c9" transparent opacity={0.18} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, 9.2, zFront + 0.05]}>
        <planeGeometry args={[Math.min(40, x1 - x0 - 8), 1.6]} />
        <meshBasicMaterial color={palette.amber} />
      </mesh>
      <Windows x0={x0} x1={x1} y0={5.2} y1={11} z={zFront} facing={1} seed={21} litShare={0.3} pitchX={4} pitchY={3} />
      {/* entrance canopy over the pavement */}
      <mesh position={[(x0 + x1) / 2, 4.6, zFront + 4]} castShadow>
        <boxGeometry args={[18, 0.35, 8]} />
        <meshStandardMaterial ref={canopy} color="#232e34" roughness={0.6} transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Tower({ cfg, minX, maxX }: { cfg: FacilityConfig; minX: number; maxX: number }) {
  const cx = (minX + maxX) / 2;
  const zFront = -STREET_NEAR - 12;
  return (
    <group>
      <OverPit cfg={cfg} h={6} zFront={zFront} color="#151d22" />
      <Block x={cx} y={0} z={zFront - 22} w={maxX - minX + 20} h={6} d={44} color="#151d22" />
      <Block x={cx} y={6} z={zFront - 24} w={28} h={64} d={28} color="#121a1f" />
      <Windows x0={cx - 14} x1={cx + 14} y0={6} y1={70} z={zFront - 10} facing={1} seed={31} litShare={0.4} pitchX={2.4} pitchY={3.2} />
      <Windows x0={cx - 14} x1={cx + 14} y0={0} y1={6} z={zFront} facing={1} seed={32} litShare={0.6} pitchX={3} pitchY={3} />
    </group>
  );
}

function Trees({ count, xRange, zRange, seed, avoid }: { count: number; xRange: [number, number]; zRange: [number, number]; seed: number; avoid: (x: number, z: number) => boolean }) {
  const canopy = useRef<InstancedMesh>(null);
  const trunk = useRef<InstancedMesh>(null);
  const trees = useMemo(() => {
    const rnd = seeded(seed);
    const out: Array<{ x: number; z: number; s: number }> = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 20) {
      const x = xRange[0] + rnd() * (xRange[1] - xRange[0]);
      const z = zRange[0] + rnd() * (zRange[1] - zRange[0]);
      if (avoid(x, z)) continue;
      out.push({ x, z, s: 0.8 + rnd() * 0.6 });
    }
    return out;
  }, [count, xRange, zRange, seed, avoid]);
  useLayoutEffect(() => {
    const c = canopy.current;
    const t = trunk.current;
    if (!c || !t) return;
    trees.forEach((tr, i) => {
      _obj.position.set(tr.x, 3.2 * tr.s + 1.6, tr.z);
      _obj.scale.set(tr.s, tr.s, tr.s);
      _obj.rotation.set(0, 0, 0);
      _obj.updateMatrix();
      c.setMatrixAt(i, _obj.matrix);
      _obj.position.set(tr.x, 0.9 * tr.s, tr.z);
      _obj.updateMatrix();
      t.setMatrixAt(i, _obj.matrix);
    });
    c.count = trees.length;
    t.count = trees.length;
    c.instanceMatrix.needsUpdate = true;
    t.instanceMatrix.needsUpdate = true;
  }, [trees]);
  return (
    <group>
      <instancedMesh ref={canopy} args={[undefined, undefined, trees.length]} castShadow frustumCulled={false}>
        <coneGeometry args={[2.2, 5.2, 7]} />
        <meshStandardMaterial color="#1f3a2c" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.16, 0.22, 1.8, 6]} />
        <meshStandardMaterial color="#2b2320" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function Courtyard({ cfg, minX, maxX }: { cfg: FacilityConfig; minX: number; maxX: number }) {
  const b = bounds(cfg);
  const lawn = useRef<MeshStandardMaterial>(null);
  useSurfaceFade(lawn, 0.1, 0.9); // the lawn lies over the pit: it opens with the lid
  const zFront = -STREET_NEAR - 10;
  const west = minX - 12;
  const east = maxX + 12;
  const avoid = useMemo(() => {
    const l = layout(cfg);
    // trees line the far side of the pit only: never over the slot field or in
    // front of it (the dollhouse view stays readable), never on the bay approaches
    return (x: number, z: number) => z > -(b.maxZ + 1.5) || x < l.minX - 1 || x > l.maxX + 1;
  }, [cfg, b.maxZ]);
  return (
    <group>
      {/* lawn over the facility, between the blocks */}
      <mesh position={[(west + east) / 2, 0.012, (zFront + b.maxZ) / 2 - 2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[east - west - 24, b.maxZ + 6 - zFront - 4]} />
        <meshStandardMaterial ref={lawn} color="#182e22" roughness={1} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <Block x={(west + east) / 2} y={0} z={zFront - 8} w={east - west} h={17} d={16} color="#161e23" />
      <Windows x0={west} x1={east} y0={0} y1={17} z={zFront} facing={1} seed={41} litShare={0.5} pitchX={3.2} pitchY={3.3} />
      <Block x={west - 8} y={0} z={-6} w={16} h={17} d={44} color="#161e23" />
      <Windows x0={-28} x1={16} y0={0} y1={17} z={west} facing={-1} seed={42} litShare={0.45} pitchX={3.2} pitchY={3.3} />
      <Block x={east + 8} y={0} z={-6} w={16} h={17} d={44} color="#161e23" />
      <Trees count={18} xRange={[minX - 4, maxX + 4]} zRange={[-STREET_NEAR - 2, -(b.maxZ + 1.5)]} seed={43} avoid={avoid} />
    </group>
  );
}

export function Context({ cfg, palette, setting, reduced }: { cfg: FacilityConfig; palette: Palette; setting: Setting; reduced: boolean }) {
  const b = useMemo(() => bounds(cfg), [cfg]);
  const lampXs = useMemo(() => {
    const out: number[] = [];
    for (let x = -90; x <= 90; x += 18) out.push(x);
    return out;
  }, []);
  // The section views look through a mostly transparent surface at a low
  // angle, where cars on the kerb would seem to float in front of the pit:
  // the near street is dropped there.
  const preset = useUiStore((s) => s.cameraPreset);
  const street = preset !== 'cutaway' && preset !== 'shaft';
  return (
    <group>
      <group visible={street}>
        <Lamps xs={lampXs} z={STREET_NEAR - 1} />
        <KerbCars from={-96} to={96} />
        <Traffic reduced={reduced} />
      </group>
      {/* a couple of warm lights over the bays for the street scenes */}
      <pointLight position={[b.minX + 4, 6.5, 0]} color="#ffd9a0" intensity={70} distance={40} decay={2} />
      <pointLight position={[b.maxX - 4, 6.5, 0]} color="#ffd9a0" intensity={70} distance={40} decay={2} />
      {setting === 'mall' && <Mall cfg={cfg} palette={palette} minX={b.minX} maxX={b.maxX} />}
      {setting === 'tower' && <Tower cfg={cfg} minX={b.minX} maxX={b.maxX} />}
      {setting === 'courtyard' && <Courtyard cfg={cfg} minX={b.minX} maxX={b.maxX} />}
      {/* the far side of the street: a low wall of city so the horizon is not empty */}
      <Block x={0} y={0} z={STREET_FAR + 40} w={260} h={9} d={30} color="#121a1f" />
      <Windows x0={-120} x1={120} y0={0} y1={9} z={STREET_FAR + 25} facing={-1} seed={51} litShare={0.35} pitchX={3.6} pitchY={3} />
    </group>
  );
}
