// Share links and saved versions — SPEC §5. A share is the exact running
// setup (config, demand profile + residents, seed) as JSON → base64url in
// `?v=`; a bare preset id (`?v=C`) is the short form. Saved versions live in
// localStorage (max 12, newest first), every access wrapped in try/catch
// (private mode, quota, disabled storage). Pure TypeScript: the storage is
// injected so the logic is testable in Node.

import { PRESETS, presetById } from './presets.ts';
import { PROFILES } from './sim/demand.ts';
import type { DemandProfile, FacilityConfig } from './sim/types.ts';

export const SHARE_PARAM = 'v';
export const MAX_VERSIONS = 12;
export const VERSIONS_KEY = 'avp.versions.v1';

export interface Setup {
  config: FacilityConfig;
  demandName: DemandProfile['name'];
  residents: number;
  seed: number;
}

export interface SavedVersion extends Setup {
  id: string;
  label: string;
  savedAt: number; // epoch ms
}

interface SharePayload {
  v: 1;
  config: FacilityConfig;
  demand: DemandProfile['name'];
  residents: number;
  seed: number;
}

// --- base64url of UTF-8 JSON, available in browsers and Node ------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The `?v=` value for a setup: a preset id when nothing else changed, else the full payload. */
export function encodeSetup(setup: Setup): string {
  const preset = presetById(setup.config.id);
  const plain = preset !== undefined && preset === setup.config && setup.demandName === 'weekday' && setup.residents === PROFILES.weekday.residents && setup.seed === 42;
  if (plain) return setup.config.id;
  const payload: SharePayload = { v: 1, config: setup.config, demand: setup.demandName, residents: setup.residents, seed: setup.seed };
  return toBase64Url(JSON.stringify(payload));
}

const NUMERIC: Array<keyof FacilityConfig> = ['levels', 'cols', 'levelHeight', 'pitch', 'slotDepth', 'corridorWidth', 'lifts', 'baysIn', 'baysOut', 'shuttlesPerLevel', 'prefetchLeadMinutes'];

function validConfig(c: unknown): c is FacilityConfig {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.label !== 'string') return false;
  for (const k of NUMERIC) if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number)) return false;
  if (o.rows !== 2) return false;
  const mix = o.slotMix as Record<string, unknown> | undefined;
  if (!mix || typeof mix.ev !== 'number' || typeof mix.oversize !== 'number') return false;
  const t = o.timings as Record<string, unknown> | undefined;
  if (!t || typeof t.dropOff !== 'number' || typeof t.liftPerLevel !== 'number') return false;
  if (!['nearest', 'zoned', 'balanced', 'dwell-aware'].includes(o.allocator as string)) return false;
  return typeof o.nightDefrag === 'boolean';
}

/** Parses a `?v=` value; null when it is missing, malformed or not ours. */
export function decodeSetup(value: string | null | undefined): Setup | null {
  if (!value) return null;
  const preset = presetById(value);
  if (preset) return { config: preset, demandName: 'weekday', residents: PROFILES.weekday.residents, seed: 42 };
  const text = fromBase64Url(value);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Partial<SharePayload>;
    if (p.v !== 1 || !validConfig(p.config)) return null;
    const demandName = (['weekday', 'saturday', 'stress'] as const).includes(p.demand as DemandProfile['name']) ? (p.demand as DemandProfile['name']) : 'weekday';
    const residents = typeof p.residents === 'number' && p.residents >= 0 ? Math.round(p.residents) : PROFILES[demandName].residents;
    const seed = typeof p.seed === 'number' && Number.isFinite(p.seed) ? Math.round(p.seed) : 42;
    // presets are canonical objects: a shared preset id maps back to the built-in
    const config = !p.config.derivedFrom && presetById(p.config.id) ? PRESETS[p.config.id as keyof typeof PRESETS] : p.config;
    return { config, demandName, residents, seed };
  } catch {
    return null;
  }
}

export function shareUrl(setup: Setup, base: string): string {
  const url = new URL(base);
  url.search = '';
  url.searchParams.set(SHARE_PARAM, encodeSetup(setup));
  return url.toString();
}

// --- saved versions -----------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadVersions(storage: StorageLike | null): SavedVersion[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(VERSIONS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((v): v is SavedVersion => !!v && typeof v === 'object' && typeof (v as SavedVersion).id === 'string' && validConfig((v as SavedVersion).config)).slice(0, MAX_VERSIONS);
  } catch {
    return [];
  }
}

function persist(storage: StorageLike | null, list: SavedVersion[]): void {
  if (!storage) return;
  try {
    storage.setItem(VERSIONS_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode: the in-memory list still works for this session */
  }
}

/** Adds (or replaces, by label) a version; newest first; keeps MAX_VERSIONS. */
export function saveVersion(storage: StorageLike | null, list: SavedVersion[], setup: Setup, label: string, now = Date.now()): SavedVersion[] {
  const name = label.trim() || `Version ${list.length + 1}`;
  const id = `v-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const config: FacilityConfig = { ...setup.config, label: name };
  const entry: SavedVersion = { id, label: name, savedAt: now, config, demandName: setup.demandName, residents: setup.residents, seed: setup.seed };
  const next = [entry, ...list.filter((v) => v.label !== name)].slice(0, MAX_VERSIONS);
  persist(storage, next);
  return next;
}

export function deleteVersion(storage: StorageLike | null, list: SavedVersion[], id: string): SavedVersion[] {
  const next = list.filter((v) => v.id !== id);
  persist(storage, next);
  return next;
}
