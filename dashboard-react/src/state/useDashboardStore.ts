// Zustand store - the single source of truth for everything the UI renders.
//
// The store ingests typed FirmwarePacket values via `ingestPacket`; data
// sources call this from their packet handler. UI components subscribe to
// just the slices they care about, so a slider movement that only updates
// `tuning` doesn't re-render the chart's data buffer.

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  CalibrationCompletePacket,
  FirmwarePacket,
  RepPacket,
  RepPhase,
  RepStateName,
  SummaryPacket,
  TuningAckPacket,
} from '../types/firmware';
import { stateToPhase } from '../types/firmware';
import type { DataSource, DataSourceStatus } from '../data/DataSource';
import type { TuningState } from './tuningDefaults';
import { DEFAULT_TUNING } from './tuningDefaults';

const LIVE_BUFFER_LIMIT = 400;       // ~20 seconds at 20 Hz
const REP_HISTORY_LIMIT = 12;
const PHASE_HISTORY_LIMIT = 8;

export interface LivePoint {
  t: number;
  raw: number;
  filt: number;
  dirFilt: number;
  state: RepStateName;
}

export interface PhaseEvent {
  t: number;
  phase: RepPhase;
  reason: string;
}

export interface ConnectionInfo {
  sourceId: string;
  status: DataSourceStatus;
  detail?: string;
  lastPacketAt?: number;
}

export interface DashboardState {
  source: DataSource | null;
  connection: ConnectionInfo;

  liveBuffer: LivePoint[];
  currentPhase: RepPhase;
  phaseHistory: PhaseEvent[];

  recentReps: RepPacket[];
  latestRep: RepPacket | null;

  session: SummaryPacket;
  calibration: CalibrationCompletePacket | null;

  tuning: TuningState;
  /** Most recent tuning ack (or snapshot) received from the firmware. */
  deviceTuning: TuningAckPacket | null;

  // Actions
  setSource: (source: DataSource) => Promise<void>;
  disconnectSource: () => Promise<void>;
  resetSession: () => Promise<void>;
  ingestPacket: (packet: FirmwarePacket) => void;
  setTuning: (patch: Partial<TuningState>) => void;
  setStatus: (status: DataSourceStatus, detail?: string) => void;
}

const EMPTY_SESSION: SummaryPacket = {
  type: 'summary',
  t: 0,
  reps: 0,
  avgScore: 0,
  best: 0,
  worst: 0,
  avgDur: 0,
  avgRom: 0,
  rollScore: 0,
  rollRom: 0,
};

export const useDashboardStore = create<DashboardState>()(
  subscribeWithSelector((set, get) => ({
    source: null,
    connection: { sourceId: 'none', status: 'disconnected' },

    liveBuffer: [],
    currentPhase: 'idle',
    phaseHistory: [],

    recentReps: [],
    latestRep: null,

    session: EMPTY_SESSION,
    calibration: null,

    tuning: DEFAULT_TUNING,
    deviceTuning: null,

    setSource: async (source: DataSource) => {
      const previous = get().source;
      if (previous) {
        await previous.disconnect().catch(() => undefined);
      }
      set({
        source,
        connection: { sourceId: source.id, status: 'disconnected' },
        liveBuffer: [],
        currentPhase: 'idle',
        phaseHistory: [],
        recentReps: [],
        latestRep: null,
        session: EMPTY_SESSION,
        calibration: null,
        deviceTuning: null,
      });
      source.updateTuning(get().tuning);
      try {
        await source.connect(
          (packet) => get().ingestPacket(packet),
          (status, detail) => get().setStatus(status, detail),
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        set({ connection: { sourceId: source.id, status: 'error', detail } });
      }
    },

    disconnectSource: async () => {
      const source = get().source;
      if (source) {
        await source.disconnect().catch(() => undefined);
      }
      set({ connection: { sourceId: 'none', status: 'disconnected' } });
    },

    resetSession: async () => {
      const source = get().source;
      if (source) {
        await source.sendCommand('RESET_REPS').catch(() => false);
      }
      set({
        liveBuffer: [],
        recentReps: [],
        latestRep: null,
        session: EMPTY_SESSION,
        phaseHistory: [],
        currentPhase: 'idle',
      });
    },

    ingestPacket: (packet: FirmwarePacket) => {
      const now = Date.now();
      switch (packet.type) {
        case 'live': {
          const point: LivePoint = {
            t: packet.t,
            raw: packet.raw,
            filt: packet.filt,
            dirFilt: packet.dirFilt,
            state: packet.state,
          };
          set((s) => {
            const buf = s.liveBuffer.length >= LIVE_BUFFER_LIMIT
              ? s.liveBuffer.slice(-LIVE_BUFFER_LIMIT + 1)
              : s.liveBuffer.slice();
            buf.push(point);
            const phase = stateToPhase(packet.state);
            return {
              liveBuffer: buf,
              currentPhase: phase,
              connection: { ...s.connection, lastPacketAt: now },
            };
          });
          break;
        }
        case 'debug': {
          if (packet.event === 'state_change') {
            const phase = stateToPhase(packet.state);
            set((s) => {
              const history = [
                { t: packet.t, phase, reason: packet.reason },
                ...s.phaseHistory,
              ].slice(0, PHASE_HISTORY_LIMIT);
              return {
                currentPhase: phase,
                phaseHistory: history,
                connection: { ...s.connection, lastPacketAt: now },
              };
            });
          }
          break;
        }
        case 'rep': {
          set((s) => {
            const reps = [packet, ...s.recentReps].slice(0, REP_HISTORY_LIMIT);
            // Trigger a brief "rep completed" pulse before the live stream
            // restores the actual phase.
            return {
              latestRep: packet,
              recentReps: reps,
              currentPhase: 'repCompleted',
              connection: { ...s.connection, lastPacketAt: now },
            };
          });
          break;
        }
        case 'summary': {
          set((s) => ({
            session: packet,
            connection: { ...s.connection, lastPacketAt: now },
          }));
          break;
        }
        case 'calibration': {
          if (packet.phase === 'complete') {
            set((s) => ({
              calibration: packet,
              connection: { ...s.connection, lastPacketAt: now },
            }));
          }
          break;
        }
        case 'tuning': {
          set((s) => ({
            deviceTuning: packet,
            connection: {
              ...s.connection,
              lastPacketAt: now,
              detail: packet.ok
                ? `tuning ${packet.key}=${packet.value.toFixed(3)}`
                : `tuning ${packet.key} rejected (${packet.error || 'error'})`,
            },
          }));
          break;
        }
        case 'boot':
        case 'error':
        default:
          set((s) => ({
            connection: {
              ...s.connection,
              lastPacketAt: now,
              detail: packet.type === 'error' ? packet.msg : s.connection.detail,
            },
          }));
          break;
      }
    },

    setTuning: (patch: Partial<TuningState>) => {
      set((s) => {
        const tuning = { ...s.tuning, ...patch };
        if (patch.weights) {
          tuning.weights = { ...s.tuning.weights, ...patch.weights };
        }
        s.source?.updateTuning(tuning);
        return { tuning };
      });
    },

    setStatus: (status: DataSourceStatus, detail?: string) => {
      set((s) => ({
        connection: { ...s.connection, status, detail },
      }));
    },
  })),
);
