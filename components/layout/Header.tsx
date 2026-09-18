// SPEC §7: facility name · version · sim clock. Static placeholders until M3/M4.
export function Header() {
  return (
    <header className="shell-header flex items-center gap-3 border-b border-line bg-panel px-4 text-sm">
      <h1 className="text-base">AVP Simulator</h1>
      <span aria-hidden className="text-ink-soft">
        ·
      </span>
      <span className="text-ink-soft">B · Recommended</span>
      <span aria-hidden className="text-ink-soft">
        ·
      </span>
      <time className="font-mono text-ink-soft">00:00</time>
    </header>
  );
}
