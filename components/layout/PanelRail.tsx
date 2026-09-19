// SPEC §8 control-panel blocks 1–9 (M3/M4); compare (M5) and failures (M6)
// are still to come.

import type { ComponentType } from 'react';
import { DemandForm } from '@/components/panel/DemandForm';
import { EventLog } from '@/components/panel/EventLog';
import { FacilityForm } from '@/components/panel/FacilityForm';
import { IndexTable } from '@/components/panel/IndexTable';
import { LiveState } from '@/components/panel/LiveState';
import { RunControl } from '@/components/panel/RunControl';
import { StrategyForm } from '@/components/panel/StrategyForm';
import { Telemetry } from '@/components/panel/Telemetry';
import { VersionPicker } from '@/components/panel/VersionPicker';

const BLOCKS = ['Run control', 'Version', 'Facility', 'Strategy', 'Demand', 'Live state', 'Telemetry', 'Index', 'Event log', 'Failures'] as const;

const CONTENT: Partial<Record<(typeof BLOCKS)[number], ComponentType>> = {
  'Run control': RunControl,
  Version: VersionPicker,
  Facility: FacilityForm,
  Strategy: StrategyForm,
  Demand: DemandForm,
  'Live state': LiveState,
  Telemetry: Telemetry,
  Index: IndexTable,
  'Event log': EventLog,
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
