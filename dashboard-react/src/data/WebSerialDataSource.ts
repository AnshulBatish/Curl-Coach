// Reads the firmware's JSON-per-line Serial output directly from the browser
// via the Web Serial API. Works in Chromium-based browsers on desktop.
// The firmware emits one JSON object per line at 115200 baud (see
// ../../../src/serial_protocol.cpp), so this class is purely a transport:
// it splits the byte stream on '\n', parses each line as JSON, and forwards
// the typed packet to the dashboard.
//
// On the write side, this source can also push tuning changes to the device.
// The firmware understands `SET <key> <value>\n` for the eight detection
// thresholds defined in DetectionThresholds (see processCommand /
// applyTuningSet in ../../../src/muscle_activation.cpp). updateTuning() is
// debounced and only sends the keys whose value has actually changed since
// the last write, so dragging a slider doesn't flood the serial line.

import type {
  DataSource,
  DataSourceStatus,
  PacketHandler,
} from './DataSource';
import type { FirmwarePacket } from '../types/firmware';
import type { TuningState } from '../state/tuningDefaults';

const BAUD_RATE = 115200;
const TUNING_DEBOUNCE_MS = 120;
const TUNING_EPSILON = 1e-4;

// Map TuningState fields to the firmware SET keys the device accepts.
// Anything not in this list (smoothing alpha, primary signal pick, score
// weights, timing constants, ...) is currently constexpr in src/config.h and
// can't be retuned at runtime - those sliders still re-shape only the local
// dashboard state.
const FIRMWARE_TUNING_KEYS: Array<{
  store: keyof TuningState;
  firmware: string;
}> = [
  { store: 'upStartThreshold',      firmware: 'upTh' },
  { store: 'downStartThreshold',    firmware: 'downTh' },
  { store: 'topPeakThreshold',      firmware: 'peakTh' },
  { store: 'baselineDeadband',      firmware: 'deadband' },
  { store: 'motionActiveThreshold', firmware: 'motionTh' },
];

export class WebSerialDataSource implements DataSource {
  readonly id = 'webserial';
  readonly label = 'Web Serial (live device)';

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private buffer = '';
  private onPacket: PacketHandler | null = null;
  private onStatus: ((s: DataSourceStatus, info?: string) => void) | null = null;
  private readLoopRunning = false;

  // Last tuning we successfully sent to the device, so we only push diffs.
  private lastSentTuning: Partial<Record<keyof TuningState, number>> = {};
  private pendingTuning: TuningState | null = null;
  private tuningTimer: number | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect(onPacket: PacketHandler, onStatus: (s: DataSourceStatus, info?: string) => void): Promise<void> {
    this.onPacket = onPacket;
    this.onStatus = onStatus;

    if (!this.isSupported()) {
      onStatus('error', 'Web Serial is not available in this browser. Use Chrome or Edge.');
      throw new Error('web_serial_unsupported');
    }

    try {
      onStatus('connecting', 'Choose the Particle device in the browser prompt.');
      // requestPort() must be called from a user gesture; that is enforced
      // by the UI - the Connect button click triggers this.
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: BAUD_RATE });
      onStatus('connected', `Connected at ${BAUD_RATE} baud`);

      this.reader = this.port.readable!.getReader();
      this.writer = this.port.writable!.getWriter();
      this.readLoopRunning = true;
      this.runReadLoop();

      // Reset our diff baseline so the first updateTuning() after connect
      // pushes the dashboard's current values to the device, and ask the
      // firmware for its current tuning so the dashboard can sync up.
      this.lastSentTuning = {};
      this.sendCommand('GET_TUNING').catch(() => undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onStatus('error', message);
      await this.disconnect();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.readLoopRunning = false;
    if (this.tuningTimer !== null) {
      window.clearTimeout(this.tuningTimer);
      this.tuningTimer = null;
    }
    this.pendingTuning = null;
    this.lastSentTuning = {};
    try {
      this.reader?.releaseLock();
    } catch {
      // ignore
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    try {
      await this.port?.close();
    } catch {
      // ignore
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.buffer = '';
    this.onStatus?.('disconnected');
    this.onPacket = null;
    this.onStatus = null;
  }

  async sendCommand(command: string): Promise<boolean> {
    if (!this.writer) return false;
    const encoder = new TextEncoder();
    try {
      await this.writer.write(encoder.encode(command + '\n'));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onStatus?.('error', `Write failed: ${message}`);
      return false;
    }
  }

  updateTuning(tuning: TuningState): void {
    if (!this.writer) return;
    // Coalesce rapid slider movements into one flush; only the most recent
    // tuning value matters when the timer fires.
    this.pendingTuning = tuning;
    if (this.tuningTimer !== null) return;
    this.tuningTimer = window.setTimeout(() => {
      this.tuningTimer = null;
      const next = this.pendingTuning;
      this.pendingTuning = null;
      if (next) void this.flushTuningDiff(next);
    }, TUNING_DEBOUNCE_MS);
  }

  private async flushTuningDiff(tuning: TuningState): Promise<void> {
    if (!this.writer) return;
    for (const { store, firmware } of FIRMWARE_TUNING_KEYS) {
      const next = tuning[store] as number;
      const prev = this.lastSentTuning[store];
      if (typeof next !== 'number' || !Number.isFinite(next)) continue;
      if (prev !== undefined && Math.abs(prev - next) < TUNING_EPSILON) continue;
      // 4 decimals matches the firmware's printf precision; more digits
      // would be wasted.
      const ok = await this.sendCommand(`SET ${firmware} ${next.toFixed(4)}`);
      if (ok) {
        this.lastSentTuning[store] = next;
      }
    }
  }

  // ---------------------------------------------------------------------------

  private async runReadLoop(): Promise<void> {
    if (!this.reader) return;
    try {
      while (this.readLoopRunning) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;
        this.buffer += this.decoder.decode(value, { stream: true });
        this.flushLines();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onStatus?.('error', `Read failed: ${message}`);
    }
  }

  private flushLines(): void {
    let newlineIdx = this.buffer.indexOf('\n');
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (line.length > 0) {
        this.tryDispatch(line);
      }
      newlineIdx = this.buffer.indexOf('\n');
    }
  }

  private tryDispatch(line: string): void {
    try {
      const packet = JSON.parse(line) as FirmwarePacket;
      if (packet && typeof packet === 'object' && 'type' in packet) {
        this.onPacket?.(packet);
      }
    } catch {
      // Ignore lines that aren't JSON - the firmware mostly emits clean
      // JSON, but bootloader noise on the very first connection is normal.
    }
  }
}
