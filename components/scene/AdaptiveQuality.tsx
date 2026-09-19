'use client';

// SPEC §9: 60 FPS target. If the average frame rate drops under 50, drop the
// shadow map first, then the device pixel ratio. Measured over 2 s windows; a
// stalled frame (hidden tab, debugger, manual frame) restarts the window
// instead of counting as a slow one.

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

const WINDOW_SECONDS = 2;
const MIN_FPS = 50;
const STALL_SECONDS = 0.5;

export function AdaptiveQuality({ onShadows, onFps }: { onShadows: (on: boolean) => void; onFps?: (fps: number) => void }) {
  const setDpr = useThree((s) => s.setDpr);
  const frames = useRef(0);
  const elapsed = useRef(0);
  const stage = useRef(0);
  useFrame((_, dt) => {
    if (dt > STALL_SECONDS) {
      frames.current = 0;
      elapsed.current = 0;
      return;
    }
    frames.current++;
    elapsed.current += dt;
    if (elapsed.current < WINDOW_SECONDS) return;
    const fps = frames.current / elapsed.current;
    frames.current = 0;
    elapsed.current = 0;
    onFps?.(fps);
    if (fps >= MIN_FPS) return;
    if (stage.current === 0) {
      onShadows(false);
      stage.current = 1;
    } else if (stage.current === 1) {
      setDpr(1);
      stage.current = 2;
    }
  });
  return null;
}
