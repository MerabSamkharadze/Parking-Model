'use client';

// Loads and bakes the CC0 car models once (R3F caches the GLTF by URL, the
// bake is memoised per loaded set). The moving pool uses the full models; the
// parked field and the street kerb, hundreds of cars seen from afar, use the
// reduced-detail set (about half the triangles, same silhouette).

import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_MODELS, bakeCar, type BakedCar } from './carModels';

export type Detail = 'full' | 'lod';

const withMeshopt = (loader: GLTFLoader) => loader.setMeshoptDecoder(MeshoptDecoder);
const FILES: Record<Detail, string[]> = { full: CAR_MODELS.map((m) => m.file), lod: CAR_MODELS.map((m) => m.lod) };
const bakedCache = new WeakMap<object, BakedCar[]>();

export function useCarModels(detail: Detail = 'full'): BakedCar[] {
  const gltfs = useLoader(GLTFLoader, FILES[detail], withMeshopt);
  return useMemo(() => {
    const key = gltfs[0];
    let baked = bakedCache.get(key);
    if (!baked) {
      baked = CAR_MODELS.map((spec, i) => bakeCar(spec, gltfs[i].scene));
      bakedCache.set(key, baked);
    }
    return baked;
  }, [gltfs]);
}
