// Share links and saved versions — SPEC §5. A share is the exact running
// setup (config, demand profile + residents, seed) as JSON → base64url in
// `?v=`; a bare preset id (`?v=C`) is the short form. Saved versions live in
// localStorage (max 12, newest first), every access wrapped in try/catch
// (private mode, quota, disabled storage). Pure TypeScript: the storage is
// injected so the logic is testable in Node.

import { normalizeConfig, presetById } from './presets.ts';
import { PROFILES } from './sim/demand.ts';
import type { DemandProfile, FacilityConfig } from './sim/types.ts';

export const SHARE_PARAM = 'v';
/** More residents than any supported facility holds (10 levels × 2 × 24 = 480 slots). */
export const MAX_RESIDENTS = 1000;
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

const DEMANDS: DemandProfile['name'][] = ['weekday', 'saturday', 'stress'];

/** A config from outside (share link, storage): a preset id maps back to the
 *  built-in object, anything else is clamped field by field (`normalizeConfig`),
 *  so nothing that reaches the engine or the layout is out of range. */
function sanitizeConfig(c: unknown): FacilityConfig | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Partial<FacilityConfig>;
  if (typeof o.id !== 'string') return null;
  const preset = presetById(o.id);
  if (preset && !o.derivedFrom) return preset; // presets are canonical objects
  // garbage (no facility in it) is rejected; a facility out of range is clamped
  for (const k of ['levels', 'cols', 'lifts', 'baysIn', 'baysOut', 'shuttlesPerLevel'] as const) if (typeof o[k] !== 'number') return null;
  if (!o.timings || typeof o.timings !== 'object' || !o.slotMix || typeof o.slotMix !== 'object') return null;
  const origin = typeof o.derivedFrom === 'string' ? presetById(o.derivedFrom) : undefined;
  return normalizeConfig(o, origin);
}

/** Parses a `?v=` value; null when it is missing, malformed or not ours. */
export function decodeSetup(value: string | null | undefined): Setup | null {
  if (!value) return null;
  const preset = presetById(value);
  if (preset) return { config: preset, demandName: 'weekday', residents: PROFILES.weekday.residents, seed: 42 };
  const text = fromBase64Url(value);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Partial<SharePayload> | null;
    if (!p || typeof p !== 'object' || p.v !== 1) return null;
    const config = sanitizeConfig(p.config);
    if (!config) return null;
    const demandName = DEMANDS.includes(p.demand as DemandProfile['name']) ? (p.demand as DemandProfile['name']) : 'weekday';
    const residents = typeof p.residents === 'number' && Number.isFinite(p.residents) ? Math.min(MAX_RESIDENTS, Math.max(0, Math.round(p.residents))) : PROFILES[demandName].residents;
    const seed = typeof p.seed === 'number' && Number.isFinite(p.seed) ? Math.max(0, Math.round(p.seed)) >>> 0 : 42;
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
    const out: SavedVersion[] = [];
    for (const v of list) {
      if (!v || typeof v !== 'object') continue;
      const s = v as SavedVersion;
      const config = sanitizeConfig(s.config);
      if (typeof s.id !== 'string' || typeof s.label !== 'string' || !config) continue;
      out.push({ ...s, config, demandName: DEMANDS.includes(s.demandName) ? s.demandName : 'weekday', residents: typeof s.residents === 'number' ? Math.min(MAX_RESIDENTS, Math.max(0, Math.round(s.residents))) : PROFILES.weekday.residents, seed: typeof s.seed === 'number' ? Math.max(0, Math.round(s.seed)) >>> 0 : 42 });
      if (out.length >= MAX_VERSIONS) break;
    }
    return out;
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
