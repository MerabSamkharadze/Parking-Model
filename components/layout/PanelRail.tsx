// SPEC §8 control-panel blocks. Block 1 (run control) is live from M3; the
// rest are filled in M4 (2–9), M5 (compare) and M6 (failures).

import type { ComponentType } from 'react';
import { RunControl } from '@/components/panel/RunControl';

const BLOCKS = ['Run control', 'Version', 'Facility', 'Strategy', 'Demand', 'Live state', 'Telemetry', 'Index', 'Event log', 'Failures'] as const;

const CONTENT: Partial<Record<(typeof BLOCKS)[number], ComponentType>> = {
  'Run control': RunControl,
};

export function PanelRail() {
  return (
    <aside aria-label="Control panel" className="shell-panel overflow-y-auto border-line bg-panel max-lg:border-t lg:border-l">
      {BLOCKS.map((title) => {
        const Block = CONTENT[title];
        return (
          <section key={title} className="border-b border-line px-4 py-3">
            <h2 className="text-sm">{title}</h2>
            {Block && (
              <div className="mt-2">
                <Block />
              </div>
            )}
          </section>
        );
      })}
    </aside>
  );
}
