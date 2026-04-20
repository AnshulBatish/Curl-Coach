import { ConnectionBar } from './ConnectionBar';
import { LiveSignalChart } from './LiveSignalChart';
import { CurlPhaseIndicator } from './CurlPhaseIndicator';
import { RepMetricsCards } from './RepMetricsCards';
import { SessionSummary } from './SessionSummary';
import { RepHistoryList } from './RepHistoryList';
import { TuningControlsPanel } from './TuningControlsPanel';

/**
 * Top-level page layout. Two-column on lg screens (chart + analytics on the
 * left, tuning + summary on the right), single-column on small screens so
 * everything still reads cleanly on a phone.
 */
export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <ConnectionBar />

      <main className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 md:px-6">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Bicep curl analytics
          </h1>
          <p className="text-sm text-slate-400">
            Live IMU motion, rep quality scoring and on-the-fly threshold tuning.
            Switch the data source above to read the device directly via Web Serial.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left column: live + analytics */}
          <section className="space-y-6 lg:col-span-8">
            <LiveSignalChart />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <CurlPhaseIndicator />
              <SessionSummary />
            </div>
            <RepMetricsCards />
            <RepHistoryList />
          </section>

          {/* Right rail: tuning */}
          <aside className="space-y-6 lg:col-span-4">
            <TuningControlsPanel />
          </aside>
        </div>
      </main>

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        Mock data is synthesised in the browser. Connect via Web Serial for live
        readings from the Particle device firmware in <code className="text-slate-400">../src/</code>.
      </footer>
    </div>
  );
}
