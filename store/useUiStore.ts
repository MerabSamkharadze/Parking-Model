// UI store — SPEC §1: camera, panel, selection. Nothing here is simulation truth.

import { create } from 'zustand';
import { parseSlotKey } from '@/lib/geometry';

export type CameraPreset = 'isometric' | 'cutaway' | 'shaft' | 'slot' | 'follow' | 'street';
export type Setting = 'none' | 'mall' | 'tower' | 'courtyard';
export const SETTINGS: Setting[] = ['none', 'mall', 'tower', 'courtyard'];

interface UiState {
  cameraPreset: CameraPreset;
  /** Camera animation request counter: bump to re-fly to the current preset. */
  cameraNonce: number;
  /** Level isolation (SPEC §9): the isolated 0-based level, or null for all. */
  selectedLevel: number | null;
  selectedSlotKey: string | null;
  /** Index row selection (SPEC §8.8); "− retrieve" calls this car first (DECISIONS S7). */
  selectedVehicleId: string | null;
  /** Story mode / follow camera: the car the camera tracks. */
  followVehicleId: string | null;
  /** Surface context around the facility (DECISIONS U1). */
  setting: Setting;
  /** Guided tour (DECISIONS U1): active step index, −1 when off. */
  storyStep: number;
  setCameraPreset: (p: CameraPreset) => void;
  toggleLevel: (level: number) => void;
  isolateLevel: (level: number | null) => void;
  clearLevel: () => void;
  /** Select a slot, isolate its level and fly the camera to it. */
  flyTo: (slotKey: string) => void;
  selectSlot: (slotKey: string | null) => void;
  selectVehicle: (vehicleId: string | null) => void;
  follow: (vehicleId: string | null) => void;
  setSetting: (setting: Setting) => void;
  setStoryStep: (step: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  cameraPreset: 'isometric',
  cameraNonce: 0,
  selectedLevel: null,
  selectedSlotKey: null,
  selectedVehicleId: null,
  followVehicleId: null,
  setting: 'none',
  storyStep: -1,
  setCameraPreset: (cameraPreset) => set((s) => ({ cameraPreset, cameraNonce: s.cameraNonce + 1, followVehicleId: cameraPreset === 'follow' ? s.followVehicleId : null })),
  toggleLevel: (level) => set((s) => ({ selectedLevel: s.selectedLevel === level ? null : level })),
  isolateLevel: (selectedLevel) => set({ selectedLevel }),
  clearLevel: () => set({ selectedLevel: null }),
  flyTo: (slotKey) =>
    set((s) => ({ selectedSlotKey: slotKey, selectedLevel: parseSlotKey(slotKey).level, cameraPreset: 'slot', cameraNonce: s.cameraNonce + 1 })),
  selectSlot: (selectedSlotKey) => set({ selectedSlotKey }),
  selectVehicle: (selectedVehicleId) => set({ selectedVehicleId }),
  follow: (vehicleId) => set((s) => (vehicleId ? { followVehicleId: vehicleId, cameraPreset: 'follow', cameraNonce: s.cameraNonce + 1 } : { followVehicleId: null, cameraPreset: 'isometric', cameraNonce: s.cameraNonce + 1 })),
  setSetting: (setting) => set({ setting }),
  setStoryStep: (storyStep) => set({ storyStep }),
}));
