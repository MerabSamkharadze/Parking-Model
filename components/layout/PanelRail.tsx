// SPEC §8 control-panel blocks. Headings only at M0; each block is filled in
// M4 (1–9), M5 (compare) and M6 (failures).
const BLOCKS = [
  'Run control',
  'Version',
  'Facility',
  'Strategy',
  'Demand',
  'Live state',
  'Telemetry',
  'Index',
  'Event log',
  'Failures',
] as const;

export function PanelRail() {
  return (
    <aside
      aria-label="Control panel"
      className="shell-panel overflow-y-auto border-line bg-panel max-lg:border-t lg:border-l"
    >
      {BLOCKS.map((title) => (
        <section key={title} className="border-b border-line px-4 py-3">
          <h2 className="text-sm">{title}</h2>
        </section>
      ))}
    </aside>
  );
}
