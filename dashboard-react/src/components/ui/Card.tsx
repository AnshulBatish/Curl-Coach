import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}

/**
 * Glassy dashboard card with subtle border + shadow. Use as the building
 * block for every panel so the whole UI feels consistent.
 */
export function Card({ children, className = '', padded = true }: CardProps) {
  return (
    <div
      className={[
        'rounded-xl2 border border-slate-800/80 bg-slate-900/60 shadow-card',
        'backdrop-blur-sm',
        padded ? 'p-5' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
            {icon}
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-xs text-slate-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
