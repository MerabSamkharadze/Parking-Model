// Small formatting helpers shared by the header, panel and timeline.

/** "07:32" from seconds of day; wraps at 24 h. */
export function clockOf(secondsOfDay: number): string {
  const s = ((Math.floor(secondsOfDay) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "54.2s" / "3m 12s" for durations. */
export function durationOf(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 100) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
