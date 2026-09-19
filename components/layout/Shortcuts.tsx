'use client';

// SPEC §10 M6 keyboard shortcuts: space play/pause, 1–4 camera views,
// `/` focuses the index search, Escape clears the selection. Ignored while
// typing in a field (except `/`, which only acts outside fields anyway).

import { useEffect } from 'react';
import { useSimStore } from '@/store/useSimStore';
import { useUiStore, type CameraPreset } from '@/store/useUiStore';

const VIEWS: CameraPreset[] = ['isometric', 'cutaway', 'shaft', 'slot'];

function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function Shortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inField(e.target)) return;
      if (e.key === ' ') {
        e.preventDefault();
        useSimStore.getState().toggleRunning();
      } else if (e.key >= '1' && e.key <= '4') {
        useUiStore.getState().setCameraPreset(VIEWS[Number(e.key) - 1]);
      } else if (e.key === '/') {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>('input[aria-label="Search plate or ticket"]');
        search?.focus();
        search?.select();
      } else if (e.key === 'Escape') {
        const ui = useUiStore.getState();
        ui.selectSlot(null);
        ui.selectVehicle(null);
        ui.clearLevel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
