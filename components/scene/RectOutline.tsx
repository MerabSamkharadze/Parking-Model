'use client';

// Thin outlined rectangle on a horizontal plane — bay and shaft markings.
// Built from raw three primitives (drei's Line is outside the allowed set).

import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';

export function RectOutline({
  x,
  y,
  z,
  width,
  depth,
  color,
  opacity = 1,
}: {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const w = width / 2;
    const d = depth / 2;
    const pts = [-w, 0, -d, w, 0, -d, w, 0, -d, w, 0, d, w, 0, d, -w, 0, d, -w, 0, d, -w, 0, -d];
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }, [width, depth]);
  return (
    <lineSegments geometry={geometry} position={[x, y, z]}>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </lineSegments>
  );
}
