import { Sliders } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Section } from './ui/Section';
import { Slider } from './ui/Slider';
import { Toggle } from './ui/Toggle';
import { useDashboardStore } from '../state/useDashboardStore';
import {
  DEFAULT_TUNING,
  PRIMARY_SIGNAL_OPTIONS,
  normaliseWeights,
  type ScoreWeights,
} from '../state/tuningDefaults';
import type { PrimarySignalSource } from '../types/firmware';

/**
 * The tuning panel — every detection threshold, filter coefficient, timing
 * gate and scoring weight from src/config.h is exposed here. Each control
 * writes through useDashboardStore.setTuning(), which (1) re-renders the
 * threshold lines on the live chart, (2) re-shapes the Mock data source
 * detector immediately, and (3) re-applies score weights to the next rep.
 */
export function TuningControlsPanel() {
  const tuning = useDashboardStore((s) => s.tuning);
  const setTuning = useDashboardStore((s) => s.setTuning);

  const updateWeight = (key: keyof ScoreWeights, value: number) => {
    const next = normaliseWeights({ ...tuning.weights, [key]: value });
    setTuning({ weights: next });
  };

  return (
    <Card>
      <CardHeader
        title="Tuning controls"
        subtitle="Live-tunable from the browser"
        icon={<Sliders size={16} />}
        action={
          <button
            type="button"
            onClick={() => setTuning(DEFAULT_TUNING)}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-600 hover:bg-slate-800"
          >
            Reset to defaults
          </button>
        }
      />

      <div className="space-y-3">
        <Section
          title="Detection thresholds"
          description="Direction signal cutoffs that drive the rep state machine."
        >
          <Slider
            label="Up start threshold"
            value={tuning.upStartThreshold}
            min={0.02}
            max={1.0}
            step={0.01}
            onChange={(v) => setTuning({ upStartThreshold: v })}
            unit="m/s²"
            hint="Direction signal must rise above this to enter MOVING_UP."
          />
          <Slider
            label="Down start threshold"
            value={tuning.downStartThreshold}
            min={-1.0}
            max={-0.02}
            step={0.01}
            onChange={(v) => setTuning({ downStartThreshold: v })}
            unit="m/s²"
            hint="Direction signal must fall below this to begin MOVING_DOWN."
          />
          <Slider
            label="Top peak threshold"
            value={tuning.topPeakThreshold}
            min={0.02}
            max={3.0}
            step={0.01}
            onChange={(v) => setTuning({ topPeakThreshold: v })}
            unit="m/s²"
            hint="Filtered primary signal must reach this to count as a top."
          />
          <Slider
            label="Baseline deadband"
            value={tuning.baselineDeadband}
            min={0.0}
            max={1.0}
            step={0.01}
            onChange={(v) => setTuning({ baselineDeadband: v })}
            unit="m/s²"
            hint="Symmetric quiet band around 0 used to detect end-of-rep."
          />
          <Slider
            label="Motion-active threshold"
            value={tuning.motionActiveThreshold}
            min={0.02}
            max={3.0}
            step={0.01}
            onChange={(v) => setTuning({ motionActiveThreshold: v })}
            unit="m/s²"
            hint="Filtered primary must clear this before a new rep can start."
          />
        </Section>

        <Section title="Filtering" description="How the raw signal is conditioned before detection.">
          <Slider
            label="Smoothing α (EMA)"
            value={tuning.smoothingAlpha}
            min={0.01}
            max={1.0}
            step={0.01}
            onChange={(v) => setTuning({ smoothingAlpha: v })}
            hint="Higher = more responsive, lower = smoother."
          />
          <Toggle
            label="Subtract baseline"
            checked={tuning.enableBaselineSubtraction}
            onChange={(v) => setTuning({ enableBaselineSubtraction: v })}
            hint="Recommended on; centres the primary signal around zero."
          />
          <Dropdown
            label="Primary signal"
            value={tuning.primarySignal}
            options={PRIMARY_SIGNAL_OPTIONS}
            onChange={(v) => setTuning({ primarySignal: v })}
          />
          <Dropdown
            label="Directional signal"
            value={tuning.directionalSignal}
            options={PRIMARY_SIGNAL_OPTIONS}
            onChange={(v) => setTuning({ directionalSignal: v })}
          />
        </Section>

        <Section title="Timing" description="Gates that prevent double-counting and reject blips.">
          <Slider
            label="Min rep duration"
            value={tuning.minRepDurationMs}
            min={200}
            max={5000}
            step={50}
            onChange={(v) => setTuning({ minRepDurationMs: v })}
            unit="ms"
          />
          <Slider
            label="Min time between reps"
            value={tuning.minTimeBetweenRepsMs}
            min={0}
            max={3000}
            step={50}
            onChange={(v) => setTuning({ minTimeBetweenRepsMs: v })}
            unit="ms"
          />
          <Slider
            label="Up persistence"
            value={tuning.upPersistenceMs}
            min={0}
            max={500}
            step={5}
            onChange={(v) => setTuning({ upPersistenceMs: v })}
            unit="ms"
          />
          <Slider
            label="Down persistence"
            value={tuning.downPersistenceMs}
            min={0}
            max={500}
            step={5}
            onChange={(v) => setTuning({ downPersistenceMs: v })}
            unit="ms"
          />
        </Section>

        <Section
          title="Scoring weights"
          description="Each weight is automatically renormalised so they always sum to 1.0."
          defaultOpen={false}
        >
          <Slider
            label="ROM weight"
            value={tuning.weights.rom}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateWeight('rom', v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Tempo weight"
            value={tuning.weights.tempo}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateWeight('tempo', v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Symmetry weight"
            value={tuning.weights.symmetry}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateWeight('symmetry', v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Smoothness weight"
            value={tuning.weights.smoothness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateWeight('smoothness', v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Stability weight"
            value={tuning.weights.stability}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateWeight('stability', v)}
            format={(v) => v.toFixed(2)}
          />
          <p className="text-[11px] text-slate-500">
            Sum: {(tuning.weights.rom + tuning.weights.tempo + tuning.weights.symmetry + tuning.weights.smoothness + tuning.weights.stability).toFixed(2)}
          </p>
        </Section>

        <Section
          title="Scoring targets"
          description="Range-of-motion and duration band used by the local scorer."
          defaultOpen={false}
        >
          <Slider
            label="ROM target min"
            value={tuning.romTargetMin}
            min={0.1}
            max={3.0}
            step={0.05}
            onChange={(v) => setTuning({ romTargetMin: v })}
            unit="m/s²"
          />
          <Slider
            label="ROM target max"
            value={tuning.romTargetMax}
            min={0.5}
            max={6.0}
            step={0.05}
            onChange={(v) => setTuning({ romTargetMax: v })}
            unit="m/s²"
          />
          <Slider
            label="Duration target min"
            value={tuning.durationTargetMinMs}
            min={300}
            max={4000}
            step={50}
            onChange={(v) => setTuning({ durationTargetMinMs: v })}
            unit="ms"
          />
          <Slider
            label="Duration target max"
            value={tuning.durationTargetMaxMs}
            min={500}
            max={6000}
            step={50}
            onChange={(v) => setTuning({ durationTargetMaxMs: v })}
            unit="ms"
          />
        </Section>
      </div>
    </Card>
  );
}

interface DropdownProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
}

function Dropdown<T extends string>({ label, value, options, onChange }: DropdownProps<T>) {
  return (
    <label className="block text-xs">
      <span className="font-medium text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={[
          'mt-1 block w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5',
          'text-xs text-slate-200',
          'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
        ].join(' ')}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

// Make TS happy: ensure the dropdown narrows properly for PrimarySignalSource.
// (Generic <T extends string> covers any string-based enum we might pass.)
export type _PrimarySignalDropdownEnsure = PrimarySignalSource;
