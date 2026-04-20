// Common interface every data source implements. The dashboard never speaks
// directly to a transport (Mock generator, Web Serial, future WebSocket, etc.);
// it only consumes FirmwarePacket values via this interface and sends a
// handful of named commands back through `sendCommand`.

import type { FirmwarePacket } from '../types/firmware';
import type { TuningState } from '../state/tuningDefaults';

export type PacketHandler = (packet: FirmwarePacket) => void;

export type DataSourceStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface DataSource {
  /** Stable identifier used by the source-picker dropdown. */
  readonly id: string;
  /** Human-readable label shown in the UI. */
  readonly label: string;
  /** Returns false if the host environment can't run this source. */
  isSupported(): boolean;

  /**
   * Begin pushing packets through `onPacket`. Resolves once the source is
   * actively producing data (Mock starts immediately, WebSerial resolves once
   * the user picks a port and the stream is open).
   */
  connect(onPacket: PacketHandler, onStatus: (s: DataSourceStatus, info?: string) => void): Promise<void>;

  /** Stop streaming and release any handles. Idempotent. */
  disconnect(): Promise<void>;

  /**
   * Send a raw command to the device. Resolves true on a successful write.
   * The firmware understands "RESET_REPS", "GET_TUNING", and
   * "SET <key> <value>" for the eight detection thresholds (see
   * applyTuningSet in ../../../src/muscle_activation.cpp).
   */
  sendCommand(command: string): Promise<boolean>;

  /**
   * Notify the source that the user changed tuning values. Mock uses this to
   * re-shape the synthetic detector live; WebSerial debounces it and pushes
   * SET <key> <value> commands for any threshold that actually changed.
   */
  updateTuning(tuning: TuningState): void;
}
