// Scene colours come from the CSS tokens in app/globals.css (SPEC §7) so the
// 3D scene and the panel can never drift apart. Read once on the client;
// the fallbacks only matter before the stylesheet is available.

const FALLBACK = {
  void: '#0A1013',
  slab: '#1B252A',
  slabEdge: '#3A4A53',
  amber: '#F2A615',
  data: '#3AA2CC',
  clay: '#D4573A',
  lime: '#A9C23F',
  ink: '#E8EBEA',
  inkSoft: '#8C9A9F',
  panel: '#121A1E',
  line: '#26323A',
} as const;

export type Palette = { -readonly [K in keyof typeof FALLBACK]: string };

const VAR_NAMES: Record<keyof Palette, string> = {
  void: '--void',
  slab: '--slab',
  slabEdge: '--slab-edge',
  amber: '--amber',
  data: '--data',
  clay: '--clay',
  lime: '--lime',
  ink: '--ink',
  inkSoft: '--ink-soft',
  panel: '--panel',
  line: '--line',
};

let cached: Palette | null = null;

export function readPalette(): Palette {
  if (cached) return cached;
  if (typeof window === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const out: Palette = { ...FALLBACK };
  for (const key of Object.keys(VAR_NAMES) as Array<keyof Palette>) {
    const v = style.getPropertyValue(VAR_NAMES[key]).trim();
    if (v) out[key] = v;
  }
  cached = out;
  return out;
}
