// Small formatting helpers shared by the header, panel and timeline.

/** "07:32" (or "07:32:05") from seconds of day; wraps at 24 h. */
export function clockOf(secondsOfDay: number, withSeconds = false): string {
  const s = ((Math.floor(secondsOfDay) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return withSeconds ? `${hm}:${String(s % 60).padStart(2, '0')}` : hm;
}

/** "54.2s" / "3m 12s" / "2h 05m" for durations. */
export function durationOf(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 100) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
