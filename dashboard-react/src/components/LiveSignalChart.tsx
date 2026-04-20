import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { useDashboardStore } from '../state/useDashboardStore';
import { phaseLabel } from '../types/firmware';

const PHASE_TINT: Record<string, string> = {
  idle:         'border-slate-800',
  movingUp:     'border-emerald-500/50',
  topReached:   'border-cyan-500/50',
  movingDown:   'border-amber-500/50',
  repCompleted: 'border-brand-500/60',
};

/**
 * Real-time chart of the primary motion signal. Renders the raw and filtered
 * traces plus reference lines for the user-tunable thresholds, so the user
 * can visually align thresholds against the actual waveform.
 */
export function LiveSignalChart() {
  const liveBuffer = useDashboardStore((s) => s.liveBuffer);
  const tuning = useDashboardStore((s) => s.tuning);
  const currentPhase = useDashboardStore((s) => s.currentPhase);

  const data = useMemo(() => {
    if (liveBuffer.length === 0) return [];
    // Use the most recent timestamp as the "0 mark" so the X axis reads as
    // "seconds ago" - much easier to interpret than absolute millis().
    const latest = liveBuffer[liveBuffer.length - 1].t;
    return liveBuffer.map((p) => ({
      tSec: (p.t - latest) / 1000,
      raw: p.raw,
      filt: p.filt,
      dirFilt: p.dirFilt,
    }));
  }, [liveBuffer]);

  return (
    <Card className={['border', PHASE_TINT[currentPhase] ?? ''].join(' ')}>
      <CardHeader
        title="Live motion signal"
        subtitle={`${tuning.primarySignal} (filtered + raw) over the last ~20 s`}
        icon={<Activity size={16} />}
        action={
          <Badge tone={phaseTone(currentPhase)} pulse={currentPhase !== 'idle'}>
            {phaseLabel(currentPhase)}
          </Badge>
        }
      />
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="tSec"
              type="number"
              domain={['dataMin', 0]}
              tickFormatter={(v) => `${v.toFixed(1)}s`}
              stroke="#64748b"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              width={48}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderRadius: 8,
                border: '1px solid #1e293b',
                fontSize: 12,
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v: number, name: string) => [v.toFixed(3), name]}
              labelFormatter={(v: number) => `${v.toFixed(2)} s`}
            />

            <ReferenceLine
              y={tuning.upStartThreshold}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{ value: 'up', fill: '#10b981', fontSize: 10, position: 'right' }}
            />
            <ReferenceLine
              y={tuning.downStartThreshold}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: 'down', fill: '#f59e0b', fontSize: 10, position: 'right' }}
            />
            <ReferenceLine
              y={tuning.topPeakThreshold}
              stroke="#22d3ee"
              strokeDasharray="2 6"
              label={{ value: 'peak', fill: '#22d3ee', fontSize: 10, position: 'right' }}
            />
            <ReferenceLine
              y={tuning.baselineDeadband}
              stroke="#475569"
              strokeDasharray="1 4"
            />
            <ReferenceLine
              y={-tuning.baselineDeadband}
              stroke="#475569"
              strokeDasharray="1 4"
            />

            <Line
              type="monotone"
              dataKey="raw"
              stroke="#475569"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              name="raw"
            />
            <Line
              type="monotone"
              dataKey="filt"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="filtered"
            />
            <Line
              type="monotone"
              dataKey="dirFilt"
              stroke="#22d3ee"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="direction"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <LegendDot color="#a78bfa" label="filtered" />
        <LegendDot color="#22d3ee" label="direction" />
        <LegendDot color="#475569" label="raw" />
        <span className="ml-auto">
          {liveBuffer.length} samples buffered
        </span>
      </div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function phaseTone(phase: string): 'brand' | 'cyan' | 'emerald' | 'amber' | 'slate' {
  switch (phase) {
    case 'movingUp':     return 'emerald';
    case 'topReached':   return 'cyan';
    case 'movingDown':   return 'amber';
    case 'repCompleted': return 'brand';
    default:             return 'slate';
  }
}
