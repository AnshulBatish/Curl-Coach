import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CircleDashed,
  Plug,
  PlugZap,
  RotateCcw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { useDashboardStore } from '../state/useDashboardStore';
import { MockDataSource } from '../data/MockDataSource';
import { WebSerialDataSource } from '../data/WebSerialDataSource';

const SOURCE_FACTORIES = {
  mock: () => new MockDataSource(),
  webserial: () => new WebSerialDataSource(),
} as const;

type SourceKey = keyof typeof SOURCE_FACTORIES;

/**
 * Top utility bar: brand, data-source picker, calibration chip, packet-age
 * indicator, and the RESET REPS button.
 */
export function ConnectionBar() {
  const connection = useDashboardStore((s) => s.connection);
  const calibration = useDashboardStore((s) => s.calibration);
  const setSource = useDashboardStore((s) => s.setSource);
  const disconnectSource = useDashboardStore((s) => s.disconnectSource);
  const resetSession = useDashboardStore((s) => s.resetSession);
  const source = useDashboardStore((s) => s.source);

  const [selected, setSelected] = useState<SourceKey>('mock');
  const [now, setNow] = useState(Date.now());

  // Web Serial isn't available everywhere; check once.
  const webSerialSupported = useMemo(
    () => typeof navigator !== 'undefined' && 'serial' in navigator,
    [],
  );

  // Auto-start the Mock source on first paint so the dashboard never looks
  // empty, then keep a 500 ms ticker for the "last packet age" indicator.
  useEffect(() => {
    if (!source) {
      void setSource(SOURCE_FACTORIES.mock());
    }
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    const factory = SOURCE_FACTORIES[selected];
    if (!factory) return;
    if (selected === 'webserial' && !webSerialSupported) return;
    await setSource(factory());
  };

  const lastPacketAgeMs =
    connection.lastPacketAt ? Math.max(0, now - connection.lastPacketAt) : null;
  const isStale = lastPacketAgeMs !== null && lastPacketAgeMs > 1500;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow">
            <Activity size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">Curl Coach</p>
            <p className="text-[11px] text-slate-500">
              Bicep curl IMU analytics
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Calibration chip */}
          {calibration ? (
            <Badge tone="emerald">
              <CircleDashed size={12} />
              Calibrated
            </Badge>
          ) : (
            <Badge tone="amber">
              <CircleDashed size={12} className="animate-spin" />
              Awaiting calibration
            </Badge>
          )}

          {/* Status + last packet age */}
          <Badge tone={statusTone(connection.status, isStale)}>
            {connection.status === 'connected' ? (
              <Wifi size={12} />
            ) : connection.status === 'error' ? (
              <AlertTriangle size={12} />
            ) : (
              <WifiOff size={12} />
            )}
            {connection.status}
            {lastPacketAgeMs !== null && connection.status === 'connected' ? (
              <span className="text-[10px] opacity-80">
                · {(lastPacketAgeMs / 1000).toFixed(1)}s ago
              </span>
            ) : null}
          </Badge>

          {/* Source selector */}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as SourceKey)}
            className={[
              'rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5',
              'text-xs text-slate-200',
              'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            ].join(' ')}
          >
            <option value="mock">Mock data</option>
            <option value="webserial" disabled={!webSerialSupported}>
              Web Serial {webSerialSupported ? '(live device)' : '(unsupported)'}
            </option>
          </select>

          <button
            type="button"
            onClick={handleConnect}
            className={[
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
              'border-brand-500/50 bg-brand-500/15 text-brand-200',
              'hover:bg-brand-500/25 hover:border-brand-500',
            ].join(' ')}
          >
            <PlugZap size={14} />
            Connect
          </button>

          <button
            type="button"
            onClick={() => disconnectSource()}
            className={[
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
              'border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-800',
            ].join(' ')}
          >
            <Plug size={14} />
            Disconnect
          </button>

          <button
            type="button"
            onClick={() => resetSession()}
            className={[
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
              'border-rose-500/40 bg-rose-500/10 text-rose-200',
              'hover:bg-rose-500/20 hover:border-rose-500',
            ].join(' ')}
          >
            <RotateCcw size={14} />
            Reset reps
          </button>
        </div>
      </div>

      {connection.detail ? (
        <div className="mx-auto max-w-[1400px] px-4 pb-2 text-[11px] text-slate-500 md:px-6">
          {connection.detail}
        </div>
      ) : null}
    </header>
  );
}

function statusTone(
  status: string,
  isStale: boolean,
): 'brand' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate' {
  if (status === 'error') return 'rose';
  if (status === 'connecting') return 'amber';
  if (status === 'connected') return isStale ? 'amber' : 'emerald';
  return 'slate';
}
