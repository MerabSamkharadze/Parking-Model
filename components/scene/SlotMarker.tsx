'use client';

// Amber ring on the floor of the selected slot (flyTo / index click) so the
// focused slot is unambiguous even among identical occupied blocks.

import { parseSlotKey, slotPosition } from '@/lib/geometry';
import type { FacilityConfig } from '@/lib/sim/types';
import { RectOutline } from './RectOutline';
import type { Palette } from './palette';

export function SlotMarker({ cfg, slotKey, palette }: { cfg: FacilityConfig; slotKey: string | null; palette: Palette }) {
  if (!slotKey) return null;
  const p = slotPosition(cfg, parseSlotKey(slotKey));
  return <RectOutline x={p.x} y={p.y + 0.03} z={p.z} width={cfg.pitch} depth={cfg.slotDepth} color={palette.amber} />;
}
