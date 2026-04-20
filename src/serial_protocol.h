#pragma once

// Serial output protocol.
//
// Every message is a single line of compact JSON terminated by '\n'. All
// messages include a "type" discriminator so downstream parsers can dispatch
// without guessing. Floating-point fields are printed with fixed precision to
// keep the output deterministic for diffing and to stay lightweight on
// embedded serial buffers.

#include "rep_detection.h"
#include "types.h"

namespace app {

class SerialProtocol {
public:
    void emitBoot(const char* status, const char* sensorStatus) const;
    void emitError(uint32_t timestampMs, const char* message,
                   const char* sensorStatus) const;

    void emitCalibrationProgress(uint32_t timestampMs, uint32_t elapsedMs,
                                 uint32_t totalMs, uint32_t sampleCount,
                                 float latestRaw) const;
    void emitCalibrationComplete(uint32_t timestampMs,
                                 const CalibrationStats& stats,
                                 const DetectionThresholds& thresholds) const;

    void emitLive(const ProcessedSample& sample, RepState state,
                  uint32_t repCount, const DetectionThresholds& thresholds,
                  float baseline, float noiseFloor) const;

    void emitStateDebug(uint32_t timestampMs, RepState state,
                        const char* reason, const ProcessedSample& sample,
                        const DetectionThresholds& thresholds) const;

    void emitRep(const CompletedRep& rep, const RepFeatures& features,
                 const RepScore& score) const;

    void emitSummary(uint32_t timestampMs, const SessionMetrics& metrics) const;

    // Acknowledge a host-issued SET / GET TUNING command. `key` and `value`
    // describe the most recent change (key="*" for a snapshot/dump).
    // Includes the full current threshold set so the dashboard can re-sync
    // even if it missed earlier acks.
    void emitTuningAck(uint32_t timestampMs, const char* key, float value,
                       bool ok, const char* error,
                       const DetectionThresholds& thresholds) const;
};

}  // namespace app
