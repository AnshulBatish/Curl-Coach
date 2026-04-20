// Top-level application for the bicep-curl tracking firmware.
//
// Responsibilities:
//   * Fixed-interval IMU sampling (50 Hz default) via millis() scheduling.
//   * Startup calibration phase that blocks rep detection until complete.
//   * Dispatching each conditioned sample through detection -> features ->
//     scoring -> session aggregation.
//   * Throttled live + summary packet emission over Serial.
//   * Line-buffered host command handling: RESET_REPS, SET <key> <value>,
//     GET TUNING. SET commands re-tune detection thresholds at runtime so
//     the dashboard sliders can drive the firmware without a reflash.
//
// Everything is non-blocking: the loop returns immediately if it is not yet
// time to sample again, so the Particle system thread keeps running.

#include "Particle.h"

#include <stdlib.h>
#include <string.h>

#include "config.h"
#include "feature_extraction.h"
#include "imu_sensor.h"
#include "rep_detection.h"
#include "scoring.h"
#include "serial_protocol.h"
#include "signal_processing.h"
#include "types.h"

SYSTEM_MODE(AUTOMATIC);
SYSTEM_THREAD(ENABLED);

SerialLogHandler logHandler(LOG_LEVEL_INFO);

namespace app {

class CurlApplication {
public:
    CurlApplication()
        : calibrationStartedMs_(0),
          lastSampleMs_(0),
          lastLivePacketMs_(0),
          lastSummaryPacketMs_(0),
          lastCalibrationPacketMs_(0),
          lastErrorPacketMs_(0),
          sensorReady_(false),
          calibrationComplete_(false),
          commandLength_(0) {
        commandBuffer_[0] = '\0';
    }

    void setup() {
        Serial.begin(config::kSerialBaudRate);
        // Wait briefly for the USB host to attach, but don't block forever:
        // the device must still start on battery power with no serial host.
        waitFor(Serial.isConnected, config::kSerialConnectWaitMs);

        protocol_.emitBoot("starting", sensor_.getStatus());
        sensorReady_ = sensor_.begin();

        if (!sensorReady_) {
            protocol_.emitBoot("sensor_init_failed", sensor_.getStatus());
            return;
        }

        // Fresh, deterministic state every boot so we don't carry any stale
        // EMA values or half-completed reps across resets.
        conditioner_.reset();
        calibration_.reset();
        detector_.startCalibration();
        session_.reset();
        calibrationStartedMs_ = millis();
        protocol_.emitBoot("calibrating", sensor_.getStatus());
    }

    void loop() {
        const uint32_t now = millis();

        handleSerialCommands();

        if (!sensorReady_) {
            throttledError(now, "imu_init_failed");
            return;
        }

        // Fixed-interval sampling: return immediately if it isn't time yet.
        // We still service the summary emitter in the quiet time so a workout
        // that pauses mid-session still keeps sending snapshots.
        if ((now - lastSampleMs_) < config::kSampleIntervalMs) {
            maybeEmitSummary(now);
            return;
        }
        lastSampleMs_ = now;

        ImuSample imuSample;
        if (!sensor_.readSample(imuSample) || !imuSample.valid) {
            throttledError(now, "imu_read_failed");
            return;
        }

        if (!calibrationComplete_) {
            runCalibrationStep(imuSample);
            return;
        }

        const ProcessedSample processed = conditioner_.process(imuSample);
        const DetectorUpdate update = detector_.update(processed);

        if (config::kEmitDebugPackets && update.stateChanged) {
            protocol_.emitStateDebug(processed.timestampMs, update.state,
                                     update.transitionReason, processed,
                                     detector_.thresholds());
        }

        if (update.repCompleted && update.rep.valid) {
            // Features read the pre-rep session metrics so "consistency"
            // compares this rep against the running average *excluding*
            // itself.
            const SessionMetrics sessionBefore = session_.metrics();
            const RepFeatures features = extractor_.compute(update.rep, sessionBefore);
            const RepScore score = scorer_.score(features);
            session_.recordRep(features, score);
            protocol_.emitRep(update.rep, features, score);

            if (config::kEmitSummaryAfterRep) {
                protocol_.emitSummary(processed.timestampMs, session_.metrics());
                lastSummaryPacketMs_ = processed.timestampMs;
            }
        }

        // Throttle live stream to kLivePacketIntervalMs even though we sample
        // faster; this keeps the serial line readable.
        if ((processed.timestampMs - lastLivePacketMs_) >= config::kLivePacketIntervalMs) {
            protocol_.emitLive(processed, detector_.state(), detector_.repCount(),
                               detector_.thresholds(), conditioner_.baseline(),
                               calibrationStats_.noiseFloor);
            lastLivePacketMs_ = processed.timestampMs;
        }

        maybeEmitSummary(processed.timestampMs);
    }

private:
    void runCalibrationStep(const ImuSample& imuSample) {
        const float rawPrimary = selectPrimarySignal(imuSample, config::kPrimarySignal);
        calibration_.addSample(rawPrimary);
        maybeEmitCalibrationProgress(imuSample.timestampMs, rawPrimary);

        if ((imuSample.timestampMs - calibrationStartedMs_) < config::kCalibrationDurationMs) {
            return;
        }

        calibrationStats_ = calibration_.finalize();
        const DetectionThresholds thresholds = buildDetectionThresholds(calibrationStats_);
        conditioner_.setCalibration(calibrationStats_.mean, calibrationStats_.noiseFloor);
        detector_.finishCalibration(thresholds);
        calibrationComplete_ = true;
        protocol_.emitCalibrationComplete(imuSample.timestampMs,
                                          calibrationStats_, thresholds);
    }

    void handleSerialCommands() {
        // Line-buffered: read up to a newline, then dispatch. Any command
        // longer than the buffer is truncated harmlessly; commands are tiny.
        while (Serial.available() > 0) {
            const char incoming = static_cast<char>(Serial.read());
            if (incoming == '\r') {
                continue;
            }
            if (incoming == '\n') {
                commandBuffer_[commandLength_] = '\0';
                processCommand(commandBuffer_);
                commandLength_ = 0;
                commandBuffer_[0] = '\0';
                continue;
            }
            if (commandLength_ < (sizeof(commandBuffer_) - 1U)) {
                commandBuffer_[commandLength_++] = incoming;
                commandBuffer_[commandLength_] = '\0';
            }
        }
    }

    void processCommand(char* command) {
        // Trim trailing whitespace so cosmetic spaces from the host don't
        // break exact-match comparisons.
        char* end = command + strlen(command);
        while (end > command && (end[-1] == ' ' || end[-1] == '\t')) {
            *(--end) = '\0';
        }
        // Skip leading whitespace too.
        while (*command == ' ' || *command == '\t') command++;
        if (*command == '\0') return;

        if (strcmp(command, "RESET_REPS") == 0) {
            session_.reset();
            detector_.resetSession(detector_.thresholds());
            protocol_.emitBoot("session_reset", sensor_.getStatus());
            protocol_.emitSummary(millis(), session_.metrics());
            return;
        }

        if (strcmp(command, "GET_TUNING") == 0 ||
            strcmp(command, "GET TUNING") == 0) {
            protocol_.emitTuningAck(millis(), "*", 0.0f, true, "",
                                    detector_.thresholds());
            return;
        }

        // SET <key> <value>
        // Tokenise in-place: command is null-terminated and writeable.
        if (strncmp(command, "SET ", 4) == 0 || strncmp(command, "SET\t", 4) == 0) {
            char* cursor = command + 4;
            while (*cursor == ' ' || *cursor == '\t') cursor++;
            char* key = cursor;
            while (*cursor != '\0' && *cursor != ' ' && *cursor != '\t') cursor++;
            if (*cursor == '\0') {
                protocol_.emitTuningAck(millis(), key, 0.0f, false,
                                        "missing_value", detector_.thresholds());
                return;
            }
            *cursor++ = '\0';
            while (*cursor == ' ' || *cursor == '\t') cursor++;
            if (*cursor == '\0') {
                protocol_.emitTuningAck(millis(), key, 0.0f, false,
                                        "missing_value", detector_.thresholds());
                return;
            }

            char* parseEnd = nullptr;
            const float value = strtof(cursor, &parseEnd);
            if (parseEnd == cursor) {
                protocol_.emitTuningAck(millis(), key, 0.0f, false,
                                        "bad_number", detector_.thresholds());
                return;
            }

            applyTuningSet(key, value);
            return;
        }

        // Anything else: ack with an error so the host can see it bounced.
        protocol_.emitTuningAck(millis(), command, 0.0f, false,
                                "unknown_command", detector_.thresholds());
    }

    void applyTuningSet(const char* key, float value) {
        DetectionThresholds t = detector_.thresholds();
        bool ok = true;
        const char* err = "";

        // Each branch validates the value before writing. Detection thresholds
        // are real-valued and unitless to this layer; we just enforce sign /
        // sanity bounds. The dashboard does its own sanity-clamping too.
        if (strcmp(key, "upTh") == 0) {
            if (value <= 0.0f || value > 5.0f) { ok = false; err = "out_of_range"; }
            else t.upStartThreshold = value;
        } else if (strcmp(key, "downTh") == 0) {
            if (value >= 0.0f || value < -5.0f) { ok = false; err = "must_be_negative"; }
            else t.downStartThreshold = value;
        } else if (strcmp(key, "peakTh") == 0) {
            if (value <= 0.0f || value > 10.0f) { ok = false; err = "out_of_range"; }
            else t.topPeakThreshold = value;
        } else if (strcmp(key, "topDrop") == 0) {
            if (value <= 0.0f || value > 10.0f) { ok = false; err = "out_of_range"; }
            else t.topDropThreshold = value;
        } else if (strcmp(key, "deadband") == 0) {
            if (value < 0.0f || value > 5.0f)  { ok = false; err = "out_of_range"; }
            else t.baselineDeadband = value;
        } else if (strcmp(key, "dirDeadband") == 0) {
            if (value < 0.0f || value > 5.0f)  { ok = false; err = "out_of_range"; }
            else t.directionDeadband = value;
        } else if (strcmp(key, "motionTh") == 0) {
            if (value < 0.0f || value > 10.0f) { ok = false; err = "out_of_range"; }
            else t.motionActiveThreshold = value;
        } else if (strcmp(key, "spikeDelta") == 0) {
            if (value <= 0.0f || value > 20.0f) { ok = false; err = "out_of_range"; }
            else t.spikeDeltaThreshold = value;
        } else {
            ok = false;
            err = "unknown_key";
        }

        if (ok) {
            detector_.setThresholds(t);
        }
        protocol_.emitTuningAck(millis(), key, value, ok, err,
                                detector_.thresholds());
    }

    void maybeEmitCalibrationProgress(uint32_t timestampMs, float latestRaw) {
        if ((timestampMs - lastCalibrationPacketMs_) < config::kCalibrationPacketIntervalMs) {
            return;
        }
        const uint32_t elapsed = timestampMs - calibrationStartedMs_;
        protocol_.emitCalibrationProgress(timestampMs, elapsed,
                                          config::kCalibrationDurationMs,
                                          calibration_.sampleCount(), latestRaw);
        lastCalibrationPacketMs_ = timestampMs;
    }

    void maybeEmitSummary(uint32_t timestampMs) {
        if (!calibrationComplete_ || session_.metrics().repCount == 0) {
            return;
        }
        if ((timestampMs - lastSummaryPacketMs_) >= config::kSummaryIntervalMs) {
            protocol_.emitSummary(timestampMs, session_.metrics());
            lastSummaryPacketMs_ = timestampMs;
        }
    }

    void throttledError(uint32_t now, const char* msg) {
        if ((now - lastErrorPacketMs_) >= config::kErrorPacketIntervalMs) {
            protocol_.emitError(now, msg, sensor_.getStatus());
            lastErrorPacketMs_ = now;
        }
    }

    Bno055Sensor             sensor_;
    CalibrationAccumulator   calibration_;
    SignalConditioner        conditioner_;
    RepDetector              detector_;
    FeatureExtractor         extractor_;
    RepScorer                scorer_;
    SessionTracker           session_;
    SerialProtocol           protocol_;

    CalibrationStats calibrationStats_;
    uint32_t calibrationStartedMs_;
    uint32_t lastSampleMs_;
    uint32_t lastLivePacketMs_;
    uint32_t lastSummaryPacketMs_;
    uint32_t lastCalibrationPacketMs_;
    uint32_t lastErrorPacketMs_;
    bool sensorReady_;
    bool calibrationComplete_;

    char   commandBuffer_[32];
    size_t commandLength_;
};

CurlApplication appInstance;

}  // namespace app

void setup() {
    app::appInstance.setup();
}

void loop() {
    app::appInstance.loop();
}
