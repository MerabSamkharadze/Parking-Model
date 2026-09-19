'use client';

// Development-only escape hatch. A hidden or headless tab never receives
// requestAnimationFrame, so the frameloop stalls; `window.__avp.frame()`
// renders one frame on demand and returns the canvas as a JPEG data URL, and
// `window.__avp.time(n)` measures the GPU-synchronised cost of n frames.
// Not rendered in production builds (see Viewport.tsx).

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { Camera, Scene } from 'three';
import { PRESETS } from '@/lib/presets';
import type { SimSnapshot } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';

export interface DevHandle {
  render: () => void;
  frame: (width?: number) => string;
  time: (frames?: number) => { frames: number; ms: number; fps: number };
  /** Renderer statistics of the last frame. */
  info: () => { calls: number; triangles: number; geometries: number; textures: number; programs: number };
  snapshot: () => SimSnapshot | null;
  /** The three.js scene graph and camera (for ad-hoc profiling from the headless driver). */
  scene: Scene;
  camera: Camera;
  sim: typeof useSimStore;
  ui: typeof useUiStore;
  presets: typeof PRESETS;
}

declare global {
  interface Window {
    __avp?: DevHandle;
  }
}

export function DevHandle() {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const ctx = gl.getContext();
    const render = () => advance(performance.now());
    const frame = (width = 960): string => {
      render();
      const src = gl.domElement;
      const out = document.createElement('canvas');
      const scale = Math.min(1, width / src.width);
      out.width = Math.round(src.width * scale);
      out.height = Math.round(src.height * scale);
      out.getContext('2d')?.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.8);
    };
    const time = (frames = 60) => {
      const pixel = new Uint8Array(4);
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        advance(performance.now());
        ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel); // forces GPU sync
      }
      const ms = performance.now() - t0;
      return { frames, ms: Math.round(ms), fps: Math.round((frames / ms) * 1000) };
    };
    const info = () => {
      render();
      const r = gl.info.render;
      const m = gl.info.memory;
      return { calls: r.calls, triangles: r.triangles, geometries: m.geometries, textures: m.textures, programs: gl.info.programs?.length ?? 0 };
    };
    window.__avp = { render, frame, time, info, snapshot: () => useSimStore.getState().snapshot, scene, camera, sim: useSimStore, ui: useUiStore, presets: PRESETS };
    return () => {
      delete window.__avp;
    };
  }, [advance, gl, scene, camera]);
  return null;
}
