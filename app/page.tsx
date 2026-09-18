import { Header } from '@/components/layout/Header';
import { PanelRail } from '@/components/layout/PanelRail';
import { TimelineStrip } from '@/components/layout/TimelineStrip';

export default function Page() {
  return (
    <div className="shell">
      <Header />
      {/* M2 replaces this placeholder with components/scene/Viewport.tsx */}
      <section
        aria-label="3D viewport"
        className="shell-viewport flex items-center justify-center bg-void"
      >
        <p className="text-sm text-ink-soft">3D viewport — M2</p>
      </section>
      <TimelineStrip />
      <PanelRail />
    </div>
  );
}
