// Mirrors the tunable constants in ../../../src/config.h. Keeping the names
// and defaults aligned with the firmware means the same numbers shown in the
// UI can be pasted straight into config.h once the user is happy with them.

import type { PrimarySignalSource } from '../types/firmware';

export interface ScoreWeights {
  rom: number;
  tempo: number;
  symmetry: number;
  smoothness: number;
  stability: number;
}

export interface TuningState {
  // Detection thresholds (units = filtered primary signal, e.g. m/s^2)
  upStartThreshold: number;
  downStartThreshold: number;
  topPeakThreshold: number;
  baselineDeadband: number;
  motionActiveThreshold: number;

  // Filtering
  smoothingAlpha: number;          // 0..1 EMA coefficient
  enableBaselineSubtraction: boolean;
  primarySignal: PrimarySignalSource;
  directionalSignal: PrimarySignalSource;

  // Rep timing (ms)
  minRepDurationMs: number;
  minTimeBetweenRepsMs: number;
  upPersistenceMs: number;
  downPersistenceMs: number;

  // Scoring shape
  romTargetMin: number;
  romTargetMax: number;
  durationTargetMinMs: number;
  durationTargetMaxMs: number;

  // Score weights (sum normalised to 1.0 in the UI)
  weights: ScoreWeights;
}

export const DEFAULT_TUNING: TuningState = {
  upStartThreshold: 0.10,
  downStartThreshold: -0.10,
  topPeakThreshold: 0.16,
  baselineDeadband: 0.08,
  motionActiveThreshold: 0.16,

  smoothingAlpha: 0.22,
  enableBaselineSubtraction: true,
  primarySignal: 'LINEAR_ACCEL_MAG',
  directionalSignal: 'LINEAR_ACCEL_X',

  minRepDurationMs: 900,
  minTimeBetweenRepsMs: 350,
  upPersistenceMs: 60,
  downPersistenceMs: 70,

  romTargetMin: 0.75,
  romTargetMax: 2.75,
  durationTargetMinMs: 1000,
  durationTargetMaxMs: 2200,

  weights: {
    rom: 0.28,
    tempo: 0.20,
    symmetry: 0.17,
    smoothness: 0.20,
    stability: 0.15,
  },
};

export const PRIMARY_SIGNAL_OPTIONS: PrimarySignalSource[] = [
  'LINEAR_ACCEL_MAG',
  'LINEAR_ACCEL_X',
  'LINEAR_ACCEL_Y',
  'LINEAR_ACCEL_Z',
  'ACCEL_MAG',
  'ACCEL_X',
  'ACCEL_Y',
  'ACCEL_Z',
  'GYRO_MAG',
  'GYRO_X',
  'GYRO_Y',
  'GYRO_Z',
];

/** Normalise the five score weights so they always sum to 1.0. */
export function normaliseWeights(w: ScoreWeights): ScoreWeights {
  const total = w.rom + w.tempo + w.symmetry + w.smoothness + w.stability;
  if (total <= 0) {
    return { rom: 0.2, tempo: 0.2, symmetry: 0.2, smoothness: 0.2, stability: 0.2 };
  }
  return {
    rom:        w.rom / total,
    tempo:      w.tempo / total,
    symmetry:   w.symmetry / total,
    smoothness: w.smoothness / total,
    stability:  w.stability / total,
  };
}
