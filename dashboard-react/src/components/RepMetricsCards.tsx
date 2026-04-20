import { Award, Gauge } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { MetricTile } from './ui/MetricTile';
import { useDashboardStore } from '../state/useDashboardStore';
import {
  formatDuration,
  formatNumber,
  formatScore,
  scoreBadgeClass,
  scoreColorClass,
} from '../lib/format';

/**
 * The "scorecard" panel for the most recent rep + headline numbers.
 * Sub-scores render as colored progress bars so you can see at a glance
 * which dimension dragged the overall score down.
 */
export function RepMetricsCards() {
  const latestRep = useDashboardStore((s) => s.latestRep);
  const session = useDashboardStore((s) => s.session);

  const score = latestRep?.score;
  const subs = latestRep?.subs;

  return (
    <Card>
      <CardHeader
        title="Latest rep quality"
        subtitle={
          latestRep ? `Rep #${latestRep.rep}` : 'Awaiting first completed rep'
        }
        icon={<Award size={16} />}
        action={
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
              'text-sm font-semibold tabular-nums',
              scoreBadgeClass(score),
            ].join(' ')}
          >
            <Gauge size={14} />
            {formatScore(score)}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricTile
          label="Rep count"
          value={session.reps}
          accent="brand"
          hint="Total this session"
        />
        <MetricTile
          label="Avg score"
          value={formatScore(session.avgScore)}
          unit="/100"
          accent="cyan"
        />
        <MetricTile
          label="Latest score"
          value={
            <span className={scoreColorClass(score)}>{formatScore(score)}</span>
          }
          unit="/100"
          accent={
            score === undefined
              ? 'slate'
              : score >= 80
              ? 'emerald'
              : score >= 60
              ? 'amber'
              : 'rose'
          }
        />
        <MetricTile
          label="Duration"
          value={formatDuration(latestRep?.dur ?? null)}
          accent="slate"
          hint={latestRep ? `Up ${formatDuration(latestRep.up)} / Down ${formatDuration(latestRep.down)}` : undefined}
        />
        <MetricTile
          label="ROM proxy"
          value={formatNumber(latestRep?.rom ?? null, 2)}
          unit="m/s²"
          accent="slate"
          hint="Filtered max − min"
        />
        <MetricTile
          label="Tempo symmetry"
          value={
            latestRep
              ? `${(latestRep.tempoSym * 100).toFixed(0)}%`
              : '—'
          }
          accent="slate"
          hint="0% = perfectly even"
        />
      </div>

      {/* Sub-scores progress bars */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Sub-score breakdown
        </p>
        <div className="space-y-2.5">
          <SubScoreBar label="Range of motion"   value={subs?.rom} color="bg-brand-500" />
          <SubScoreBar label="Tempo"             value={subs?.tempo} color="bg-cyan-500" />
          <SubScoreBar label="Up/Down symmetry"  value={subs?.sym} color="bg-violet-500" />
          <SubScoreBar label="Smoothness"        value={subs?.smooth} color="bg-emerald-500" />
          <SubScoreBar label="Stability"         value={subs?.stable} color="bg-amber-500" />
        </div>
      </div>
    </Card>
  );
}

interface SubScoreBarProps {
  label: string;
  value: number | undefined;
  color: string;
}

function SubScoreBar({ label, value, color }: SubScoreBarProps) {
  const pct = value === undefined ? 0 : Math.max(0, Math.min(100, value * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">
          {value === undefined ? '—' : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={['h-full rounded-full transition-all duration-500', color].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
