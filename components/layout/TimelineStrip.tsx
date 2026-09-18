// SPEC §7: 24 h timeline strip (throughput + queue). Empty at M0.
export function TimelineStrip() {
  return (
    <footer
      aria-label="Timeline"
      className="shell-timeline flex items-center border-t border-line bg-void px-4"
    >
      <span className="text-xs text-ink-soft">Timeline · 24 h</span>
    </footer>
  );
}
