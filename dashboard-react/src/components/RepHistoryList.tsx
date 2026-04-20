import { ListOrdered } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { useDashboardStore } from '../state/useDashboardStore';
import { formatDuration, formatNumber, scoreBadgeClass } from '../lib/format';

/**
 * Compact list of the most recent reps. Each row shows the rep number, a
 * colour-coded score chip and the headline movement metrics so users can
 * scroll back through their set quickly.
 */
export function RepHistoryList() {
  const recentReps = useDashboardStore((s) => s.recentReps);

  return (
    <Card>
      <CardHeader
        title="Rep history"
        subtitle="Most recent first"
        icon={<ListOrdered size={16} />}
      />

      {recentReps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
          No completed reps yet. Once a rep finishes it will appear here with
          its score and timing.
        </div>
      ) : (
        <ul className="divide-y divide-slate-800/70 overflow-hidden rounded-lg border border-slate-800/70">
          {recentReps.map((rep) => (
            <li
              key={`${rep.rep}-${rep.end}`}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold tabular-nums text-slate-200">
                  {rep.rep}
                </span>
                <div>
                  <p className="text-sm text-slate-200">
                    {formatDuration(rep.dur)}
                    <span className="ml-2 text-xs text-slate-500">
                      ↑ {formatDuration(rep.up)} · ↓ {formatDuration(rep.down)}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    ROM {formatNumber(rep.rom, 2)} m/s² · sym {(rep.tempoSym * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              <span
                className={[
                  'inline-flex min-w-[3.25rem] items-center justify-center',
                  'rounded-md border px-2 py-1 text-sm font-semibold tabular-nums',
                  scoreBadgeClass(rep.score),
                ].join(' ')}
              >
                {rep.score.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
