import { ChangeEvent } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  unit?: string;
  format?: (v: number) => string;
  hint?: string;
}

/**
 * Polished slider with paired numeric input and inline value readout.
 * Both controls write the same value so users can either drag for
 * exploration or type for precision.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
  format,
  hint,
}: SliderProps) {
  const handleSlider = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };
  const handleNumber = (e: ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(e.target.value);
    if (!Number.isNaN(next)) onChange(next);
  };
  const display = format ? format(value) : value.toString();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <label className="font-medium text-slate-300">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={Number.isFinite(value) ? value : 0}
            onChange={handleNumber}
            min={min}
            max={max}
            step={step}
            className={[
              'w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5',
              'text-right text-xs text-slate-200 tabular-nums',
              'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            ].join(' ')}
          />
          {unit ? <span className="text-xs text-slate-500">{unit}</span> : null}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSlider}
        className={[
          'h-1.5 w-full cursor-pointer appearance-none rounded-full',
          'bg-slate-800 accent-brand-500',
        ].join(' ')}
      />
      {hint ? (
        <p className="text-[11px] text-slate-500">{hint}</p>
      ) : (
        <p className="sr-only">Current value: {display}</p>
      )}
    </div>
  );
}
