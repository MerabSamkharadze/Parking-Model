// Procedural surface detail without downloads: a tileable noise texture for
// concrete and asphalt (subtle value noise, generated once per session).

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

let cached: CanvasTexture | null = null;
let cachedGlow: CanvasTexture | null = null;

/** 128² radial falloff, white centre to transparent edge — pools of lamp light. */
export function glowTexture(): CanvasTexture {
  if (cachedGlow) return cachedGlow;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  cachedGlow = tex;
  return tex;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 256² grey noise around mid-grey; multiply it with a material colour. */
export function noiseTexture(): CanvasTexture {
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = mulberry(7);
  // two octaves of value noise, tileable by construction (wrapping lookups)
  const coarse = new Float32Array(16 * 16);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd();
  const fine = new Float32Array(64 * 64);
  for (let i = 0; i < fine.length; i++) fine[i] = rnd();
  const sample = (grid: Float32Array, n: number, u: number, v: number) => {
    const x = u * n;
    const y = v * n;
    const x0 = Math.floor(x) % n;
    const y0 = Math.floor(y) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const a = grid[y0 * n + x0] * (1 - fx) + grid[y0 * n + x1] * fx;
    const b = grid[y1 * n + x0] * (1 - fx) + grid[y1 * n + x1] * fx;
    return a * (1 - fy) + b * fy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = 0.6 * sample(coarse, 16, u, v) + 0.4 * sample(fine, 64, u, v) + 0.06 * (rnd() - 0.5);
      const g = Math.round(200 + (n - 0.5) * 70); // 165..235
      const i = (y * size + x) * 4;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  cached = tex;
  return tex;
}
