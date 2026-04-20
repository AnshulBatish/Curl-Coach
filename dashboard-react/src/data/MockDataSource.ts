// Synthetic IMU stream that produces believable bicep-curl data without any
// hardware attached. Generates `live`/`debug`/`rep`/`summary` packets in the
// same shape the firmware emits and respects the current TuningState so the
// sliders in the dashboard feel responsive immediately.
//
// The synthetic waveform is a half-sine bump per rep with a small amount of
// gaussian noise, plus randomised dwell time at the top and the bottom. We
// run a tiny in-line state machine that mirrors the firmware's design so
// state-change debug events look realistic.

import type {
  DataSource,
  DataSourceStatus,
  PacketHandler,
} from './DataSource';
import type {
  DebugPacket,
  LivePacket,
  RepPacket,
  RepStateName,
  SummaryPacket,
} from '../types/firmware';
import type { TuningState } from '../state/tuningDefaults';
import { DEFAULT_TUNING } from '../state/tuningDefaults';

const SAMPLE_INTERVAL_MS = 20;        // 50 Hz sampling, matches firmware
const LIVE_PACKET_INTERVAL_MS = 50;   // 20 Hz live emission

export class MockDataSource implements DataSource {
  readonly id = 'mock';
  readonly label = 'Mock data (synthetic curls)';

  private tuning: TuningState = DEFAULT_TUNING;
  private timer: number | null = null;
  private onPacket: PacketHandler | null = null;
  private onStatus: ((s: DataSourceStatus, info?: string) => void) | null = null;

  private startedAt = 0;
  private lastSampleMs = 0;
  private lastLiveMs = 0;
  private state: RepStateName = 'READY';

  // Per-rep accumulators (mirror the firmware's CompletedRep)
  private repIndex = 0;
  private repStartMs = 0;
  private repPeakMs = 0;
  private repPeakValue = 0;
  private repFilteredMin = 0;
  private repFilteredMax = 0;
  private repAbsDeltaSum = 0;
  private repAbsSecondDiffSum = 0;
  private repSampleCount = 0;
  private prevFiltered = 0;
  private prevAbsDelta = 0;

  // Session running averages (for the local Mock summary packets)
  private sessionRepCount = 0;
  private sessionScoreSum = 0;
  private sessionDurSum = 0;
  private sessionRomSum = 0;
  private sessionBest = 0;
  private sessionWorst = 100;

  // Synthetic waveform schedule. Generates a bump every "cycleMs" with a
  // brief settle in between.
  private cycleStartMs = 0;
  private cycleDurationMs = 1800;     // randomised per rep
  private targetPeakAmplitude = 1.6;  // randomised per rep
  private filtered = 0;
  private dirFiltered = 0;

  isSupported(): boolean {
    return true;
  }

  async connect(onPacket: PacketHandler, onStatus: (s: DataSourceStatus, info?: string) => void): Promise<void> {
    this.onPacket = onPacket;
    this.onStatus = onStatus;
    onStatus('connected', 'Mock stream running');
    this.startedAt = performance.now();
    this.lastSampleMs = 0;
    this.lastLiveMs = 0;
    this.state = 'READY';
    this.cycleStartMs = 600;
    this.scheduleNextCycle();
    // Use setInterval rather than rAF: we want consistent 50 Hz regardless
    // of whether the tab is in the foreground.
    this.timer = window.setInterval(() => this.tick(), SAMPLE_INTERVAL_MS);
  }

  async disconnect(): Promise<void> {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.onStatus?.('disconnected');
    this.onPacket = null;
    this.onStatus = null;
  }

  async sendCommand(command: string): Promise<boolean> {
    if (command === 'RESET_REPS') {
      this.resetSession();
      return true;
    }
    return false;
  }

  updateTuning(tuning: TuningState): void {
    this.tuning = tuning;
  }

  // -------------------------------------------------------------------------

  private resetSession(): void {
    this.repIndex = 0;
    this.sessionRepCount = 0;
    this.sessionScoreSum = 0;
    this.sessionDurSum = 0;
    this.sessionRomSum = 0;
    this.sessionBest = 0;
    this.sessionWorst = 100;
    this.state = 'READY';
    this.cycleStartMs = (performance.now() - this.startedAt) + 600;
    this.scheduleNextCycle();
    // Push a synthetic boot/reset event so the UI clears.
    this.emit({
      type: 'summary',
      t: this.now(),
      reps: 0,
      avgScore: 0,
      best: 0,
      worst: 0,
      avgDur: 0,
      avgRom: 0,
      rollScore: 0,
      rollRom: 0,
    });
  }

  private now(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  private scheduleNextCycle(): void {
    // 1.4 - 2.4 s per rep cycle; peak between 1.0 and 2.4 g.
    this.cycleDurationMs = 1400 + Math.random() * 1000;
    this.targetPeakAmplitude = 1.0 + Math.random() * 1.4;
  }

  private synthesise(now: number): { raw: number; dir: number } {
    const phaseT = now - this.cycleStartMs;
    if (phaseT < 0) {
      return { raw: gaussianNoise(0.015), dir: gaussianNoise(0.01) };
    }
    if (phaseT > this.cycleDurationMs) {
      // Brief rest between reps, then schedule the next one.
      const rest = 500 + Math.random() * 700;
      if (phaseT > this.cycleDurationMs + rest) {
        this.cycleStartMs = now;
        this.scheduleNextCycle();
      }
      return { raw: gaussianNoise(0.02), dir: gaussianNoise(0.01) };
    }
    // Half-sine "concentric+eccentric" bump in amplitude. Direction signal
    // is the derivative of that bump (positive going up, negative coming back).
    const u = phaseT / this.cycleDurationMs;
    const amp = Math.sin(Math.PI * u) * this.targetPeakAmplitude;
    const dir = Math.cos(Math.PI * u) * this.targetPeakAmplitude * 0.9;
    return {
      raw: amp + gaussianNoise(0.04),
      dir: dir + gaussianNoise(0.03),
    };
  }

  private tick(): void {
    if (!this.onPacket) return;
    const now = this.now();
    if (now - this.lastSampleMs < SAMPLE_INTERVAL_MS - 1) return;
    this.lastSampleMs = now;

    const { raw, dir } = this.synthesise(now);

    // EMA filter on both signals.
    const a = clamp(this.tuning.smoothingAlpha, 0.01, 1.0);
    this.filtered = this.filtered + a * (raw - this.filtered);
    this.dirFiltered = this.dirFiltered + a * 0.8 * (dir - this.dirFiltered);

    // Per-rep accumulation while a rep is in progress.
    if (this.state === 'MOVING_UP' || this.state === 'TOP_HOLD' || this.state === 'MOVING_DOWN') {
      this.repSampleCount++;
      if (this.filtered < this.repFilteredMin) this.repFilteredMin = this.filtered;
      if (this.filtered > this.repFilteredMax) {
        this.repFilteredMax = this.filtered;
        this.repPeakValue = this.filtered;
        this.repPeakMs = now;
      }
      const absDelta = Math.abs(this.filtered - this.prevFiltered);
      const secondDiff = Math.abs(absDelta - this.prevAbsDelta);
      this.repAbsDeltaSum += absDelta;
      this.repAbsSecondDiffSum += secondDiff;
      this.prevAbsDelta = absDelta;
    }
    this.prevFiltered = this.filtered;

    // State machine - simplified mirror of src/rep_detection.cpp.
    this.advanceState(now);

    // Throttle LivePacket emission to ~20 Hz.
    if (now - this.lastLiveMs >= LIVE_PACKET_INTERVAL_MS) {
      this.lastLiveMs = now;
      this.emitLive(now, raw);
    }
  }

  private advanceState(now: number): void {
    const t = this.tuning;
    switch (this.state) {
      case 'READY': {
        if (this.dirFiltered >= t.upStartThreshold &&
            this.filtered >= t.motionActiveThreshold) {
          this.startNewRep(now);
          this.transition('MOVING_UP', 'up_direction_threshold', now);
        }
        break;
      }
      case 'MOVING_UP': {
        const repAge = now - this.repStartMs;
        if (repAge >= 250 && Math.abs(this.dirFiltered) <= 0.05) {
          this.transition('TOP_HOLD', 'top_quiet_hold', now);
          break;
        }
        if (repAge >= 250 && this.dirFiltered <= t.downStartThreshold) {
          this.transition('MOVING_DOWN', 'down_direction_after_up', now);
        }
        break;
      }
      case 'TOP_HOLD': {
        if (this.dirFiltered <= t.downStartThreshold) {
          this.transition('MOVING_DOWN', 'down_direction_from_hold', now);
        }
        break;
      }
      case 'MOVING_DOWN': {
        if (Math.abs(this.dirFiltered) <= 0.05 &&
            Math.abs(this.filtered) <= t.baselineDeadband) {
          this.completeRep(now);
          this.transition('READY', 'returned_to_baseline', now);
        }
        break;
      }
      case 'CALIBRATING':
        break;
    }
  }

  private startNewRep(now: number): void {
    this.repIndex++;
    this.repStartMs = now;
    this.repPeakMs = now;
    this.repPeakValue = this.filtered;
    this.repFilteredMin = this.filtered;
    this.repFilteredMax = this.filtered;
    this.repAbsDeltaSum = 0;
    this.repAbsSecondDiffSum = 0;
    this.repSampleCount = 1;
    this.prevAbsDelta = 0;
  }

  private completeRep(now: number): void {
    const t = this.tuning;
    const dur = now - this.repStartMs;
    const up = Math.max(0, this.repPeakMs - this.repStartMs);
    const down = Math.max(0, now - this.repPeakMs);
    const rom = Math.max(0, this.repFilteredMax - this.repFilteredMin);

    if (dur < t.minRepDurationMs || rom < t.topPeakThreshold * 0.8) {
      // Drop reps that are too short / too shallow, mirroring firmware.
      return;
    }

    const tempoSym = dur > 0 ? Math.abs(up - down) / dur : 1.0;
    const romDen = Math.max(0.05, rom);
    const sampleDen = Math.max(1, this.repSampleCount);
    const smoothness = this.repAbsSecondDiffSum / (romDen * sampleDen);
    const spike = Math.min(5, this.repAbsSecondDiffSum / romDen);
    const returnErr = Math.abs(this.filtered);

    const subs = computeSubScores({
      rom,
      durationMs: dur,
      tempoSym,
      smoothness,
      spike,
      returnErr,
      tuning: t,
    });

    const w = t.weights;
    const finalScore =
      Math.max(0, Math.min(1,
        subs.rom * w.rom +
        subs.tempo * w.tempo +
        subs.sym * w.symmetry +
        subs.smooth * w.smoothness +
        subs.stable * w.stability
      )) * 100;

    const repPacket: RepPacket = {
      type: 'rep',
      rep: this.repIndex,
      start: this.repStartMs,
      peak: this.repPeakMs,
      end: now,
      dur,
      up,
      down,
      rom,
      peakSig: this.repPeakValue,
      tempoSym,
      smooth: smoothness,
      spike,
      returnErr,
      consistency: 0,
      score: finalScore,
      subs,
    };
    this.emit(repPacket);

    // Update local session totals + emit a summary packet.
    this.sessionRepCount++;
    this.sessionScoreSum += finalScore;
    this.sessionDurSum += dur;
    this.sessionRomSum += rom;
    if (this.sessionRepCount === 1) {
      this.sessionBest = finalScore;
      this.sessionWorst = finalScore;
    } else {
      if (finalScore > this.sessionBest) this.sessionBest = finalScore;
      if (finalScore < this.sessionWorst) this.sessionWorst = finalScore;
    }

    const summary: SummaryPacket = {
      type: 'summary',
      t: now,
      reps: this.sessionRepCount,
      avgScore: this.sessionScoreSum / this.sessionRepCount,
      best: this.sessionBest,
      worst: this.sessionWorst,
      avgDur: this.sessionDurSum / this.sessionRepCount,
      avgRom: this.sessionRomSum / this.sessionRepCount,
      rollScore: finalScore,
      rollRom: rom,
    };
    this.emit(summary);
  }

  private transition(next: RepStateName, reason: string, now: number): void {
    this.state = next;
    const debug: DebugPacket = {
      type: 'debug',
      t: now,
      event: 'state_change',
      state: next,
      reason,
      filt: this.filtered,
      raw: this.filtered,
      dirFilt: this.dirFiltered,
      upTh: this.tuning.upStartThreshold,
      downTh: this.tuning.downStartThreshold,
    };
    this.emit(debug);
  }

  private emitLive(now: number, raw: number): void {
    const t = this.tuning;
    const live: LivePacket = {
      type: 'live',
      t: now,
      raw,
      cond: t.enableBaselineSubtraction ? raw : raw,
      filt: this.filtered,
      dirRaw: this.dirFiltered,
      dirFilt: this.dirFiltered,
      source: t.primarySignal,
      dirSource: t.directionalSignal,
      accel: { x: 0.1, y: 9.78 + this.filtered * 0.1, z: 0.05 },
      lin: { x: this.dirFiltered, y: 0, z: this.filtered * 0.5 },
      gyro: { x: 0, y: 0, z: 0, valid: true },
      state: this.state,
      reps: this.sessionRepCount,
      upTh: t.upStartThreshold,
      downTh: t.downStartThreshold,
      peakTh: t.topPeakThreshold,
      deadband: t.baselineDeadband,
      dirDeadband: 0.05,
      motionTh: t.motionActiveThreshold,
      baseline: 0,
      noise: 0.04,
    };
    this.emit(live);
  }

  private emit(packet: any): void {
    this.onPacket?.(packet);
  }
}

// -- helpers ------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Box-Muller transform; we only need cheap symmetric noise.
function gaussianNoise(sigma: number): number {
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

interface SubScoreInput {
  rom: number;
  durationMs: number;
  tempoSym: number;
  smoothness: number;
  spike: number;
  returnErr: number;
  tuning: TuningState;
}

function computeSubScores(i: SubScoreInput) {
  const t = i.tuning;
  const romHardMin = Math.max(0.05, t.romTargetMin * 0.5);
  const romHardMax = t.romTargetMax * 1.6;
  const durHardMin = Math.max(200, t.durationTargetMinMs * 0.7);
  const durHardMax = t.durationTargetMaxMs * 1.6;

  const rom        = bandScore(i.rom,         romHardMin,  t.romTargetMin,         t.romTargetMax,         romHardMax);
  const tempo      = bandScore(i.durationMs,  durHardMin,  t.durationTargetMinMs,  t.durationTargetMaxMs,  durHardMax);
  const sym        = 1 - Math.min(1, Math.max(0, i.tempoSym / 0.35));
  const smooth     = 1 - Math.min(1, Math.max(0, i.smoothness / 0.32));
  const stability  = 1 - Math.min(1, Math.max(0,
    (0.65 * i.spike + 1.8 * i.returnErr) / 3.5
  ));
  return { rom, tempo, sym, smooth, stable: stability };
}

function bandScore(value: number, hardMin: number, targetMin: number, targetMax: number, hardMax: number): number {
  if (value <= hardMin || value >= hardMax) return 0;
  if (value >= targetMin && value <= targetMax) return 1;
  if (value < targetMin) {
    return clamp((value - hardMin) / (targetMin - hardMin), 0, 1);
  }
  return clamp((hardMax - value) / (hardMax - targetMax), 0, 1);
}
