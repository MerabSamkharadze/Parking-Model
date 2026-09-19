'use client';

// SPEC §4.1: the host steps the engine from frame time. Runs first in the
// frame (negative priority keeps R3F's automatic render) so every other
// useFrame reads the same render clock.

import { useFrame } from '@react-three/fiber';
import { useSimStore } from '@/store/useSimStore';

export function SimDriver() {
  const advance = useSimStore((s) => s.advance);
  useFrame((_, dt) => {
    advance(dt, performance.now());
  }, -10);
  return null;
}
