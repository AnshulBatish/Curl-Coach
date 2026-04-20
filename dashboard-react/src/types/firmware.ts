// TypeScript shapes for the JSON packets the firmware emits over Serial.
// These mirror the formatters in ../../src/serial_protocol.cpp so the
// dashboard can consume real device output and mock output identically.

export type RepStateName =
  | 'CALIBRATING'
  | 'READY'
  | 'MOVING_UP'
  | 'TOP_HOLD'
  | 'MOVING_DOWN';

// User-facing phase labels. "repCompleted" is a transient pulse the dashboard
// uses for ~1 second after a rep ends; the firmware itself only ever reports
// the five RepStateName values above.
export type RepPhase =
  | 'idle'
  | 'movingUp'
  | 'topReached'
  | 'movingDown'
  | 'repCompleted';

export type PrimarySignalSource =
  | 'LINEAR_ACCEL_MAG'
  | 'LINEAR_ACCEL_X'
  | 'LINEAR_ACCEL_Y'
  | 'LINEAR_ACCEL_Z'
  | 'ACCEL_MAG'
  | 'ACCEL_X'
  | 'ACCEL_Y'
  | 'ACCEL_Z'
  | 'GYRO_MAG'
  | 'GYRO_X'
  | 'GYRO_Y'
  | 'GYRO_Z';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BootPacket {
  type: 'boot';
  status: string;
  sensor: string;
}

export interface ErrorPacket {
  type: 'error';
  t: number;
  msg: string;
  sensor: string;
}

export interface CalibrationProgressPacket {
  type: 'calibration';
  phase: 'progress';
  t: number;
  elapsed: number;
  total: number;
  samples: number;
  raw: number;
}

export interface CalibrationCompletePacket {
  type: 'calibration';
  phase: 'complete';
  t: number;
  baseline: number;
  noise: number;
  std: number;
  min: number;
  max: number;
  upTh: number;
  downTh: number;
  peakTh: number;
  deadband: number;
  motionTh: number;
}

export type CalibrationPacket =
  | CalibrationProgressPacket
  | CalibrationCompletePacket;

export interface LivePacket {
  type: 'live';
  t: number;
  raw: number;
  cond: number;
  filt: number;
  dirRaw: number;
  dirFilt: number;
  source: PrimarySignalSource;
  dirSource: PrimarySignalSource;
  accel: Vector3;
  lin: Vector3;
  gyro: Vector3 & { valid: boolean };
  state: RepStateName;
  reps: number;
  upTh: number;
  downTh: number;
  peakTh: number;
  deadband: number;
  dirDeadband: number;
  motionTh: number;
  baseline: number;
  noise: number;
}

export interface DebugPacket {
  type: 'debug';
  t: number;
  event: 'state_change';
  state: RepStateName;
  reason: string;
  filt: number;
  raw: number;
  dirFilt: number;
  upTh: number;
  downTh: number;
}

export interface RepSubScores {
  rom: number;
  tempo: number;
  sym: number;
  smooth: number;
  stable: number;
}

export interface RepPacket {
  type: 'rep';
  rep: number;
  start: number;
  peak: number;
  end: number;
  dur: number;
  up: number;
  down: number;
  rom: number;
  peakSig: number;
  tempoSym: number;
  smooth: number;
  spike: number;
  returnErr: number;
  consistency: number;
  score: number;
  subs: RepSubScores;
}

export interface TuningAckPacket {
  type: 'tuning';
  t: number;
  key: string;
  value: number;
  ok: boolean;
  error: string;
  thresholds: {
    upTh: number;
    downTh: number;
    peakTh: number;
    topDrop: number;
    deadband: number;
    dirDeadband: number;
    motionTh: number;
    spikeDelta: number;
  };
}

export interface SummaryPacket {
  type: 'summary';
  t: number;
  reps: number;
  avgScore: number;
  best: number;
  worst: number;
  avgDur: number;
  avgRom: number;
  rollScore: number;
  rollRom: number;
}

export type FirmwarePacket =
  | BootPacket
  | ErrorPacket
  | CalibrationPacket
  | LivePacket
  | DebugPacket
  | RepPacket
  | SummaryPacket
  | TuningAckPacket;

// Map firmware state names to user-facing phase labels.
export function stateToPhase(state: RepStateName): RepPhase {
  switch (state) {
    case 'CALIBRATING':
    case 'READY':
      return 'idle';
    case 'MOVING_UP':
      return 'movingUp';
    case 'TOP_HOLD':
      return 'topReached';
    case 'MOVING_DOWN':
      return 'movingDown';
    default:
      return 'idle';
  }
}

export function phaseLabel(phase: RepPhase): string {
  switch (phase) {
    case 'idle':         return 'Idle';
    case 'movingUp':     return 'Moving up';
    case 'topReached':   return 'Top reached';
    case 'movingDown':   return 'Moving down';
    case 'repCompleted': return 'Rep completed';
  }
}
