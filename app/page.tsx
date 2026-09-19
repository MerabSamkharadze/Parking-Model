import { Header } from '@/components/layout/Header';
import { PanelRail } from '@/components/layout/PanelRail';
import { Shortcuts } from '@/components/layout/Shortcuts';
import { TimelineStrip } from '@/components/layout/TimelineStrip';
import { ViewportFrame } from '@/components/scene/ViewportFrame';

export default function Page() {
  return (
    <div className="shell">
      <Header />
      <ViewportFrame />
      <TimelineStrip />
      <PanelRail />
      <Shortcuts />
    </div>
  );
}
