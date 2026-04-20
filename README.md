# Curl-Coach

A Particle-microcontroller firmware paired with a React dashboard that uses an IMU to detect bicep curl reps in real time, score each rep's quality from 0–100 on ROM, tempo, symmetry, smoothness, and stability, and stream the results to a live-tunable web UI over Serial.

All detection and scoring runs on the microcontroller. The dashboard is purely a visualization and live-tuning client — no backend required.

---

## Hardware

- **Microcontroller:** SparkFun Photon RedBoard (Particle Photon-compatible, P0 module)
- **IMU:** Adafruit BNO055 (9-DOF, I²C). Linear acceleration + gyroscope are used for motion analysis; no force sensor is required.
- **Connection to host:** USB Serial at 115200 baud.

## Repository layout
rc/ Particle firmware (C++) muscle_activation.cpp Top-level app + serial command parser (RESET_REPS, SET, GET_TUNING) imu_sensor.* BNO055 wrapper signal_processing.* Calibration (Welford) + EMA filtering + baseline subtraction rep_detection.* 5-state rep detection state machine feature_extraction.* Per-rep ROM / tempo / smoothness proxies scoring.* 0–100 rep quality score + session aggregates serial_protocol.* JSON-per-line packet emitter config.h / types.h Tunable constants + shared data types

lib/ Vendored Particle libraries (BNO055, Adafruit_Sensor, OneWire) project.properties Particle project descriptor .github/workflows/ GitHub Actions CI: compiles for the Photon on every push to main

dashboard-react/ React + TypeScript dashboard (Vite, Tailwind, Recharts, Zustand) src/components/ UI components (chart, curl-phase indicator, tuning panel, ...) src/data/ Pluggable DataSource (Mock + Web Serial) src/state/ Zustand store + default tuning src/types/firmware.ts Packet type definitions


## Firmware pipeline

The loop runs non-blocking at 50 Hz:

1. **Sample** — read linear acceleration and gyro from the BNO055.
2. **Calibrate** — on startup, collect a few seconds of samples to estimate baseline and noise floor using Welford's online algorithm. Rep detection is gated until calibration completes.
3. **Condition** — subtract baseline, optionally rectify, then apply an exponential moving average for both the primary and directional signals.
4. **Detect** — run a 5-state rep state machine:
   `CALIBRATING → READY → MOVING_UP → TOP_HOLD → MOVING_DOWN → READY`
   Transitions use hysteresis, persistence timers, and min/max rep-duration gates to avoid double-counting.
5. **Extract features** — ROM proxy, rep duration, up/down durations, tempo symmetry, peak signal, smoothness/jerk proxy, spike penalty, baseline-return error, consistency.
6. **Score** — combine weighted sub-scores (ROM, tempo, symmetry, smoothness, stability) into a single 0–100 rep quality score.
7. **Aggregate** — session-level totals: rep count, average/best/worst score, avg duration, avg ROM, rolling-window metrics.
8. **Emit** — stream JSON packets over Serial.

## Serial protocol

Every message is a single line of compact JSON terminated by `\n`, discriminated by a `type` field.

| Type          | When                             | Purpose                                           |
| ------------- | -------------------------------- | ------------------------------------------------- |
| `boot`        | Startup / session reset          | Lifecycle + sensor status                         |
| `error`       | Throttled on failure             | IMU init/read errors                              |
| `calibration` | During + end of startup          | Calibration progress and final baseline/noise     |
| `live`        | ~20 Hz while streaming           | Raw + filtered signal, state, thresholds, reps    |
| `debug`       | On every state transition (opt.) | Which transition fired and why                    |
| `rep`         | On each completed rep            | Timing, features, and score (with sub-scores)     |
| `summary`     | Periodic + after each rep        | Session aggregates                                |
| `tuning`      | Ack for SET/GET_TUNING           | Confirms current detection thresholds             |

### Host → device commands

| Command                 | Effect                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| `RESET_REPS`            | Clear session metrics and restart the detector (keeps calibration).       |
| `GET_TUNING`            | Dump the current detection thresholds as a `tuning` packet.               |
| `SET <key> <value>`     | Live-tune a detection threshold. Validated and range-checked on device.   |

Supported `SET` keys: `upTh`, `downTh`, `peakTh`, `topDrop`, `deadband`, `dirDeadband`, `motionTh`, `spikeDelta`.

Other tuning controls (EMA smoothing, primary-signal choice, timing constants, score weights) are currently compile-time `constexpr` in `src/config.h` and only re-shape the dashboard's local view.

## Building the firmware

### Option A: GitHub Actions

Every push to `main` triggers the `Particle Compile` workflow, which builds for the Photon and uploads the resulting `.bin` as a run artifact. Download it from the workflow run and flash with `particle flash --usb <firmware>.bin`.

### Option B: Particle Workbench (local)

1. Open this repository in [Particle Workbench](https://www.particle.io/workbench/).
2. Target device: **Photon**, Device OS: default.
3. Use **Particle: Compile application (local)** to build, then **Particle: Flash application (local)** over USB.

## Running the dashboard

Requirements: Node 18+ and a Chromium-based browser (Chrome, Edge) for Web Serial support.

```
bash
cd dashboard-react
npm install
npm run dev
```

Open the printed URL. The dashboard starts on a synthetic mock source out of the box so you can demo everything without hardware. Switch to Web Serial (live device) in the connection bar and pick the Photon's serial port to stream live data.

Dashboard features
Live signal chart — raw, filtered, and directional signals with threshold reference lines (Recharts).
Curl phase indicator — animated state with a recent-transition timeline.
Rep metrics cards — per-rep score + sub-score breakdown.
Session summary — totals, averages, and recent score trend sparkline.
Tuning panel — sliders/toggles/dropdowns that reshape local visualization and, on Web Serial, push SET commands to the device (debounced, diff-only).
Reset button — clears the local session and issues RESET_REPS to the firmware.
Tuning tips
Start with calibration working correctly — check the calibration packet's noise floor is small and stable (keep the arm still for the first few seconds after power-up). Then tune in this order:

upTh, peakTh — raise until spurious small motions don't trigger reps.
downTh — lower (more negative) until the eccentric phase is cleanly detected.
deadband, motionTh — widen to suppress noisy "idle" chatter.
topDrop — controls the secondary path out of TOP_HOLD; increase if the top phase lingers too long.
