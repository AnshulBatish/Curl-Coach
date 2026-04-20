import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible section used inside the tuning panel to keep the right rail
 * compact. Defaults to open so first-time users see all the controls.
 */
export function Section({ title, description, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            {title}
          </p>
          {description ? (
            <p className="text-[11px] text-slate-500">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          size={16}
          className={[
            'text-slate-400 transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-slate-800/70 px-4 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
