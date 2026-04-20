#pragma once

// Signal conditioning + startup calibration.
//
// The pipeline has two stages:
//   1. CalibrationAccumulator runs only during the CALIBRATING state. It uses
//      Welford's online algorithm so we never have to buffer samples and so
//      noise floor remains numerically stable for any calibration length.
//   2. SignalConditioner runs on every sample after calibration. It subtracts
//      the baseline, optionally rectifies, applies an exponential moving
//      average, and emits a ProcessedSample that downstream components consume.

#include "config.h"
#include "types.h"

namespace app {

class CalibrationAccumulator {
public:
    CalibrationAccumulator();
    void reset();
    void addSample(float value);
    CalibrationStats finalize() const;
    uint32_t sampleCount() const;

private:
    uint32_t sampleCount_;
    float mean_;
    float m2_;
    float minValue_;
    float maxValue_;
};

class SignalConditioner {
public:
    SignalConditioner();
    void reset();

    // Called once calibration completes. Captures the baseline we subtract
    // and the noise floor for downstream diagnostics.
    void setCalibration(float baseline, float noiseFloor);

    // Condition one raw sample. Maintains two EMA filters internally (one for
    // the amplitude signal, one for the directional signal).
    ProcessedSample process(const ImuSample& sample);

    float baseline() const;
    float noiseFloor() const;

private:
    float baseline_;
    float noiseFloor_;
    bool filterInitialized_;
    float filtered_;
    float previousFiltered_;
    bool directionFilterInitialized_;
    float directionFiltered_;
};

// Select a scalar from an IMU sample per the configured signal source enum.
float selectPrimarySignal(const ImuSample& sample, PrimarySignalSource source);

// Build runtime thresholds from calibration stats. Each threshold is the
// larger of its configured value and noise_floor * multiplier so detection
// always sits above the observed sensor noise.
DetectionThresholds buildDetectionThresholds(const CalibrationStats& stats);

}  // namespace app
