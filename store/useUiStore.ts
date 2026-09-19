// UI store — SPEC §1: camera, panel, selection. Nothing here is simulation truth.

import { create } from 'zustand';

export type CameraPreset = 'isometric' | 'cutaway' | 'shaft' | 'slot';

interface UiState {
  cameraPreset: CameraPreset;
  /** Camera animation request counter: bump to re-fly to the current preset. */
  cameraNonce: number;
  /** Level isolation (SPEC §9): the isolated 0-based level, or null for all. */
  selectedLevel: number | null;
  selectedSlotKey: string | null;
  setCameraPreset: (p: CameraPreset) => void;
  toggleLevel: (level: number) => void;
  clearLevel: () => void;
  /** Select a slot and fly the camera to it. */
  flyTo: (slotKey: string) => void;
  selectSlot: (slotKey: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  cameraPreset: 'isometric',
  cameraNonce: 0,
  selectedLevel: null,
  selectedSlotKey: null,
  setCameraPreset: (cameraPreset) => set((s) => ({ cameraPreset, cameraNonce: s.cameraNonce + 1 })),
  toggleLevel: (level) => set((s) => ({ selectedLevel: s.selectedLevel === level ? null : level })),
  clearLevel: () => set({ selectedLevel: null }),
  flyTo: (slotKey) => set((s) => ({ selectedSlotKey: slotKey, cameraPreset: 'slot', cameraNonce: s.cameraNonce + 1 })),
  selectSlot: (selectedSlotKey) => set({ selectedSlotKey }),
}));
