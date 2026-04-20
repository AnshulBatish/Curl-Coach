import { ArrowDown, ArrowUp, Dumbbell, Pause, Sparkles } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { useDashboardStore } from '../state/useDashboardStore';
import { phaseLabel, type RepPhase } from '../types/firmware';

const PHASE_COPY: Record<RepPhase, string> = {
  idle:         'Waiting for the next rep.',
  movingUp:     'Concentric phase — controlled lift.',
  topReached:   'Pause at the top of the curl.',
  movingDown:   'Eccentric phase — controlled descent.',
  repCompleted: 'Nice work — rep just completed!',
};

const PHASE_TONE: Record<RepPhase, 'slate' | 'emerald' | 'cyan' | 'amber' | 'brand'> = {
  idle:         'slate',
  movingUp:     'emerald',
  topReached:   'cyan',
  movingDown:   'amber',
  repCompleted: 'brand',
};

/**
 * Big, glanceable phase indicator: status badge, descriptive copy, and an
 * animated SVG arm icon that bobs in the direction of motion. Also shows
 * a horizontal timeline of the most recent state transitions so you can
 * sanity-check the detector's behaviour.
 */
export function CurlPhaseIndicator() {
  const phase = useDashboardStore((s) => s.currentPhase);
  const phaseHistory = useDashboardStore((s) => s.phaseHistory);

  const Icon = ICON_FOR_PHASE[phase];
  const animation =
    phase === 'movingUp'
      ? 'animate-floatUp'
      : phase === 'movingDown'
      ? 'animate-floatDown'
      : '';

  return (
    <Card>
      <CardHeader
        title="Curl phase"
        subtitle="Live detector state"
        icon={<Dumbbell size={16} />}
        action={
          <Badge tone={PHASE_TONE[phase]} pulse={phase !== 'idle'}>
            {phaseLabel(phase)}
          </Badge>
        }
      />

      <div className="flex items-center gap-5">
        <div
          className={[
            'flex h-24 w-24 items-center justify-center rounded-2xl',
            'bg-gradient-to-br from-brand-500/20 to-accent-500/10',
            'border border-brand-500/30 text-brand-200',
            animation,
          ].join(' ')}
        >
          <Icon size={44} strokeWidth={1.6} />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">
            {phaseLabel(phase)}
          </p>
          <p className="mt-1 text-sm text-slate-400">{PHASE_COPY[phase]}</p>
        </div>
      </div>

      {/* Recent transition timeline */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Recent transitions
        </p>
        {phaseHistory.length === 0 ? (
          <p className="text-xs text-slate-500">
            No transitions yet — the device is warming up.
          </p>
        ) : (
          <ol className="flex flex-wrap items-center gap-1.5">
            {phaseHistory.slice(0, 6).map((event, idx) => (
              <li key={`${event.t}-${idx}`} className="flex items-center gap-1.5">
                <Badge tone={PHASE_TONE[event.phase]}>
                  {phaseLabel(event.phase)}
                </Badge>
                {idx < Math.min(5, phaseHistory.length - 1) ? (
                  <span className="text-slate-600">•</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

const ICON_FOR_PHASE: Record<RepPhase, typeof Dumbbell> = {
  idle:         Pause,
  movingUp:     ArrowUp,
  topReached:   Sparkles,
  movingDown:   ArrowDown,
  repCompleted: Sparkles,
};
