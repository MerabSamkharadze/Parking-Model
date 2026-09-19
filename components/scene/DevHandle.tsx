'use client';

// Development-only escape hatch. A hidden or headless tab never receives
// requestAnimationFrame, so the frameloop stalls; `window.__avp.frame()`
// renders one frame on demand and returns the canvas as a JPEG data URL, and
// `window.__avp.time(n)` measures the GPU-synchronised cost of n frames.
// Not rendered in production builds (see Viewport.tsx).

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { SimSnapshot } from '@/lib/sim/types';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore } from '@/store/useUiStore';

export interface DevHandle {
  render: () => void;
  frame: (width?: number) => string;
  time: (frames?: number) => { frames: number; ms: number; fps: number };
  snapshot: () => SimSnapshot | null;
  sim: typeof useSimStore;
  ui: typeof useUiStore;
}

declare global {
  interface Window {
    __avp?: DevHandle;
  }
}

export function DevHandle() {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
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
    window.__avp = { render, frame, time, snapshot: () => useSimStore.getState().snapshot, sim: useSimStore, ui: useUiStore };
    return () => {
      delete window.__avp;
    };
  }, [advance, gl]);
  return null;
}
