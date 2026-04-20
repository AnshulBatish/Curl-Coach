interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}

/** Accessible labelled switch that matches the slider/dropdown look. */
export function Toggle({ label, checked, onChange, hint }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'group flex w-full items-center justify-between gap-3 rounded-lg',
        'border border-slate-800 bg-slate-900/60 px-3 py-2 text-left',
        'transition hover:border-slate-700 hover:bg-slate-900',
      ].join(' ')}
    >
      <div>
        <p className="text-xs font-medium text-slate-300">{label}</p>
        {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
      </div>
      <span
        className={[
          'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full',
          'transition-colors',
          checked ? 'bg-brand-500' : 'bg-slate-700',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  );
}
