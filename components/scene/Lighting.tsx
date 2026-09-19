'use client';

// SPEC §9: ambient 0.5 + directional key + cold fill from below. The shadow
// map lives only on the key light (1024) and is switched off by
// AdaptiveQuality when the frame rate drops under 50.

import { useEffect, useRef } from 'react';
import type { DirectionalLight } from 'three';
import type { Palette } from './palette';

export function Lighting({ palette, shadows, extent }: { palette: Palette; shadows: boolean; extent: number }) {
  const key = useRef<DirectionalLight>(null);
  useEffect(() => {
    if (key.current) key.current.castShadow = shadows;
  }, [shadows]);
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        ref={key}
        position={[extent * 0.6, extent * 0.9, extent * 0.5]}
        intensity={1.8}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={extent * 4}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-extent * 0.4, -extent, -extent * 0.3]} intensity={0.35} color={palette.data} />
    </>
  );
}
