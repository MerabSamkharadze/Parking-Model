// Real car models (CC0, Quaternius — public/models/LICENSE.txt) baked for
// instancing: every model becomes two geometries, "paint" (the body colour,
// tinted per instance) and "rest" (windows, wheels, lights, trim with baked
// vertex colours). Forward is +X and the wheels touch y = 0, matching the
// placement rules in motion.ts. DECISIONS U1.

import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Matrix4, Mesh, type Group, type Material, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface CarModelSpec {
  id: 'sedan' | 'hatchback' | 'coupe' | 'suv';
  file: string;
  /** Reduced-detail twin (scripts/models/lod.mjs) for parked and kerb cars. */
  lod: string;
  paint: string; // material name of the body colour
  /** Share of the fleet (standard cars); oversize cars always use the suv, scaled. */
  share: number;
}

export const CAR_MODELS: CarModelSpec[] = [
  { id: 'sedan', file: '/models/sedan.glb', lod: '/models/lod/sedan.glb', paint: 'Blue', share: 0.38 },
  { id: 'hatchback', file: '/models/hatchback.glb', lod: '/models/lod/hatchback.glb', paint: 'LightBlue', share: 0.3 },
  { id: 'coupe', file: '/models/coupe.glb', lod: '/models/lod/coupe.glb', paint: 'White', share: 0.12 },
  { id: 'suv', file: '/models/suv.glb', lod: '/models/lod/suv.glb', paint: 'White', share: 0.2 },
];

/** Oversize cars are the SUV a little larger; 1.06 keeps their quarter turn inside the slot mouths (DECISIONS S40). */
export const OVERSIZE_SCALE = 1.06;

/** Realistic paint colours, muted for a dark scene (linear sRGB via Color). */
export const PAINTS = ['#e6e7e4', '#b9bec2', '#4b5157', '#202428', '#22406e', '#8d2b2b', '#c7b184', '#31543e', '#6f7f8f', '#3a2f2a'].map((c) => new Color(c));

export interface BakedCar {
  id: CarModelSpec['id'];
  paint: BufferGeometry;
  rest: BufferGeometry;
  length: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Stable model + paint choice per ticket. */
export function pickModel(vehicleId: string, oversize: boolean): { model: number; paint: number } {
  const h = hash(vehicleId);
  const paint = (h >>> 8) % PAINTS.length;
  if (oversize) return { model: CAR_MODELS.findIndex((m) => m.id === 'suv'), paint };
  let r = (h % 1000) / 1000;
  for (let i = 0; i < CAR_MODELS.length; i++) {
    r -= CAR_MODELS[i].share;
    if (r <= 0) return { model: i, paint };
  }
  return { model: 0, paint };
}

/** Float32 position + normal + (optional) colour, with the mesh transform applied. */
function flatten(mesh: Mesh, color: Color | null): BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const n = src.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const p = src.attributes.position;
  const nm = src.attributes.normal;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = p.getX(i);
    pos[i * 3 + 1] = p.getY(i);
    pos[i * 3 + 2] = p.getZ(i);
    if (nm) {
      nor[i * 3] = nm.getX(i);
      nor[i * 3 + 1] = nm.getY(i);
      nor[i * 3 + 2] = nm.getZ(i);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  if (!nm) g.computeVertexNormals();
  if (color) {
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
  }
  mesh.updateWorldMatrix(true, false);
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

function materialColor(m: Material): Color {
  // the models' lenses are amber/red flat colours; make them read as lights in the dark
  if (/headlight/i.test(m.name)) return new Color('#f4ecd2');
  if (/taillight/i.test(m.name)) return new Color('#c8201a');
  const std = m as MeshStandardMaterial;
  const c = std.color ? std.color.clone() : new Color('#888888');
  if (std.emissive && std.emissiveIntensity) c.add(std.emissive.clone().multiplyScalar(std.emissiveIntensity));
  return c;
}

/** Bakes a loaded glTF scene into paint / rest geometries oriented +X forward on y = 0. */
export function bakeCar(spec: CarModelSpec, scene: Group): BakedCar {
  const paints: BufferGeometry[] = [];
  const rests: BufferGeometry[] = [];
  let headlightZ = 0;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    for (const grp of groups) {
      const mat = materials[grp.materialIndex ?? 0];
      if (!mat) continue;
      // isolate the group into its own mesh so flatten() sees one material
      const sub = new Mesh(sliceGeometry(mesh.geometry, grp.start, grp.count), mat);
      sub.matrixWorld.copy(mesh.matrixWorld);
      sub.matrixAutoUpdate = false;
      const g = flatten(sub, mat.name === spec.paint ? null : materialColor(mat));
      if (/headlight/i.test(mat.name)) {
        g.computeBoundingBox();
        headlightZ = (g.boundingBox!.min.z + g.boundingBox!.max.z) / 2;
      }
      (mat.name === spec.paint ? paints : rests).push(g);
    }
  });
  const paint = mergeGeometries(paints, false)!;
  const rest = mergeGeometries(rests, false)!;
  // orient +X forward, wheels on the ground
  const rot = new Matrix4().makeRotationY(headlightZ >= 0 ? Math.PI / 2 : -Math.PI / 2);
  paint.applyMatrix4(rot);
  rest.applyMatrix4(rot);
  paint.computeBoundingBox();
  rest.computeBoundingBox();
  const minY = Math.min(paint.boundingBox!.min.y, rest.boundingBox!.min.y);
  const lift = new Matrix4().makeTranslation(0, -minY, 0);
  paint.applyMatrix4(lift);
  rest.applyMatrix4(lift);
  paint.computeBoundingSphere();
  rest.computeBoundingSphere();
  const length = Math.max(paint.boundingBox!.max.x, rest.boundingBox!.max.x) - Math.min(paint.boundingBox!.min.x, rest.boundingBox!.min.x);
  return { id: spec.id, paint, rest, length };
}

function sliceGeometry(geometry: BufferGeometry, start: number, count: number): BufferGeometry {
  if (!Number.isFinite(count)) return geometry;
  const g = new BufferGeometry();
  const index = geometry.index;
  if (index) {
    const ids = Array.from(index.array.slice(start, start + count));
    g.setAttribute('position', geometry.attributes.position);
    if (geometry.attributes.normal) g.setAttribute('normal', geometry.attributes.normal);
    g.setIndex(ids);
    return g;
  }
  const slice = (name: string) => {
    const a = geometry.attributes[name];
    if (!a) return;
    const arr = a.array.slice(start * a.itemSize, (start + count) * a.itemSize);
    g.setAttribute(name, new BufferAttribute(arr, a.itemSize, a.normalized));
  };
  slice('position');
  slice('normal');
  return g;
}
