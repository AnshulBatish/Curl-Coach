import { ReactNode } from 'react';

type BadgeTone = 'brand' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  pulse?: boolean;
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  brand:   'bg-brand-500/15 text-brand-300 border-brand-500/40',
  cyan:    'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  amber:   'bg-amber-500/15 text-amber-300 border-amber-500/40',
  rose:    'bg-rose-500/15 text-rose-300 border-rose-500/40',
  slate:   'bg-slate-800/60 text-slate-300 border-slate-700',
};

export function Badge({ children, tone = 'slate', pulse, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-xs font-medium tracking-wide',
        TONES[tone],
        pulse ? 'animate-pulseGlow' : '',
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
