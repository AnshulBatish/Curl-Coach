import { ReactNode } from 'react';

interface MetricTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  trend?: 'up' | 'down' | 'flat';
  accent?: 'brand' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
}

const ACCENT_BG: Record<NonNullable<MetricTileProps['accent']>, string> = {
  brand:   'from-brand-500/15 to-transparent',
  cyan:    'from-cyan-500/15 to-transparent',
  emerald: 'from-emerald-500/15 to-transparent',
  amber:   'from-amber-500/15 to-transparent',
  rose:    'from-rose-500/15 to-transparent',
  slate:   'from-slate-700/30 to-transparent',
};

/**
 * Compact stat tile used inside metric grids. Keeps the value large and the
 * label small so a row of these reads at a glance.
 */
export function MetricTile({
  label,
  value,
  unit,
  hint,
  accent = 'brand',
}: MetricTileProps) {
  return (
    <div
      className={[
        'rounded-xl border border-slate-800/80 bg-gradient-to-b p-4',
        ACCENT_BG[accent],
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-slate-100 tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-xs text-slate-400">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
