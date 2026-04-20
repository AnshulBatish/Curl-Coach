import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Trophy } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { MetricTile } from './ui/MetricTile';
import { useDashboardStore } from '../state/useDashboardStore';
import { formatDuration, formatNumber, formatScore } from '../lib/format';

/**
 * Session-level rollup with a tiny sparkline of the recent rep scores so
 * users can see if their reps are trending up or falling off.
 */
export function SessionSummary() {
  const session = useDashboardStore((s) => s.session);
  const recentReps = useDashboardStore((s) => s.recentReps);

  const sparkData = useMemo(
    () =>
      recentReps
        .slice()
        .reverse()
        .map((r) => ({ rep: r.rep, score: r.score })),
    [recentReps],
  );

  return (
    <Card>
      <CardHeader
        title="Session summary"
        subtitle="Aggregated workout metrics"
        icon={<Trophy size={16} />}
      />

      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Total reps"  value={session.reps} accent="brand" />
        <MetricTile label="Best score"  value={formatScore(session.best)}  accent="emerald" unit="/100" />
        <MetricTile label="Avg score"   value={formatScore(session.avgScore)} accent="cyan"  unit="/100" />
        <MetricTile label="Worst score" value={formatScore(session.worst)} accent="rose" unit="/100" />
        <MetricTile label="Avg duration" value={formatDuration(session.avgDur)} accent="slate" />
        <MetricTile label="Avg ROM proxy" value={formatNumber(session.avgRom, 2)} unit="m/s²" accent="slate" />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Recent rep score trend
          </p>
          <span className="text-[11px] text-slate-500">
            last {sparkData.length} reps
          </span>
        </div>
        <div className="h-20 w-full">
          {sparkData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
              Complete a rep to populate the trend.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: 8,
                    border: '1px solid #1e293b',
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [v.toFixed(1), 'score']}
                  labelFormatter={(_v, payload) =>
                    payload && payload[0] ? `Rep #${payload[0].payload.rep}` : ''
                  }
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={{ r: 2.5, stroke: '#a78bfa', fill: '#0f172a' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  );
}
