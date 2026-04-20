#include "signal_processing.h"

#include <float.h>

namespace app {

CalibrationAccumulator::CalibrationAccumulator() {
    reset();
}

void CalibrationAccumulator::reset() {
    sampleCount_ = 0;
    mean_ = 0.0f;
    m2_ = 0.0f;
    minValue_ = FLT_MAX;
    maxValue_ = -FLT_MAX;
}

void CalibrationAccumulator::addSample(float value) {
    // Welford online mean/variance: numerically stable, one pass.
    sampleCount_++;
    const float delta = value - mean_;
    mean_ += delta / static_cast<float>(sampleCount_);
    const float delta2 = value - mean_;
    m2_ += delta * delta2;

    if (value < minValue_) minValue_ = value;
    if (value > maxValue_) maxValue_ = value;
}

CalibrationStats CalibrationAccumulator::finalize() const {
    CalibrationStats stats;
    stats.complete = sampleCount_ > 0;
    stats.sampleCount = sampleCount_;
    stats.mean = mean_;
    stats.variance = sampleCount_ > 1
        ? (m2_ / static_cast<float>(sampleCount_ - 1U))
        : 0.0f;
    stats.stddev = sqrtf(stats.variance);
    stats.minValue = sampleCount_ > 0 ? minValue_ : 0.0f;
    stats.maxValue = sampleCount_ > 0 ? maxValue_ : 0.0f;
    // Clamp to a small positive noise floor so we never divide by zero and
    // never treat a noise-free signal as perfectly quiet.
    stats.noiseFloor = stats.stddev > config::kMinNoiseFloor
        ? stats.stddev
        : config::kMinNoiseFloor;
    return stats;
}

uint32_t CalibrationAccumulator::sampleCount() const {
    return sampleCount_;
}

SignalConditioner::SignalConditioner() {
    reset();
}

void SignalConditioner::reset() {
    baseline_ = 0.0f;
    noiseFloor_ = config::kMinNoiseFloor;
    filterInitialized_ = false;
    filtered_ = 0.0f;
    previousFiltered_ = 0.0f;
    directionFilterInitialized_ = false;
    directionFiltered_ = 0.0f;
}

void SignalConditioner::setCalibration(float baseline, float noiseFloor) {
    baseline_ = baseline;
    noiseFloor_ = noiseFloor > config::kMinNoiseFloor
        ? noiseFloor
        : config::kMinNoiseFloor;
    // Force the EMA filters to warm-start from the first post-calibration
    // sample so they don't carry stale state.
    filterInitialized_ = false;
    filtered_ = 0.0f;
    previousFiltered_ = 0.0f;
    directionFilterInitialized_ = false;
    directionFiltered_ = 0.0f;
}

ProcessedSample SignalConditioner::process(const ImuSample& sample) {
    ProcessedSample frame;
    frame.timestampMs = sample.timestampMs;
    frame.valid = sample.valid;
    frame.accel = sample.accel;
    frame.linearAccel = sample.linearAccel;
    frame.gyro = sample.gyro;
    frame.gyroValid = sample.gyroValid;

    frame.rawPrimary = sample.valid
        ? selectPrimarySignal(sample, config::kPrimarySignal)
        : 0.0f;
    frame.directionRaw = sample.valid
        ? selectPrimarySignal(sample, config::kDirectionalSignal)
        : 0.0f;

    // Baseline subtraction only makes sense for signals expected to sit near
    // zero at rest. For magnitude signals the raw signal already sits near 0
    // once gravity is removed (linear accel) so this is still valid.
    float conditioned = frame.rawPrimary;
    if (config::kEnableBaselineSubtraction) {
        conditioned -= baseline_;
    }
    if (config::kEnableRectification) {
        conditioned = safeAbs(conditioned);
    }
    frame.conditionedPrimary = conditioned;
    frame.directionConditioned = frame.directionRaw;

    // Exponential moving average: y[n] = y[n-1] + alpha * (x[n] - y[n-1]).
    // Smaller alpha -> smoother, more lag; larger alpha -> more responsive,
    // more noise. kEmaAlpha of ~0.2 gives a ~100 ms time constant at 50 Hz.
    if (!filterInitialized_) {
        filtered_ = conditioned;
        previousFiltered_ = conditioned;
        filterInitialized_ = true;
        frame.deltaFiltered = 0.0f;
    } else {
        previousFiltered_ = filtered_;
        filtered_ += config::kEmaAlpha * (conditioned - filtered_);
        frame.deltaFiltered = filtered_ - previousFiltered_;
    }
    frame.filteredPrimary = filtered_;

    if (!directionFilterInitialized_) {
        directionFiltered_ = frame.directionConditioned;
        directionFilterInitialized_ = true;
    } else {
        directionFiltered_ += config::kDirectionEmaAlpha *
                              (frame.directionConditioned - directionFiltered_);
    }
    frame.directionFiltered = directionFiltered_;

    return frame;
}

float SignalConditioner::baseline() const      { return baseline_; }
float SignalConditioner::noiseFloor() const    { return noiseFloor_; }

float selectPrimarySignal(const ImuSample& sample, PrimarySignalSource source) {
    switch (source) {
        case PrimarySignalSource::ACCEL_X:          return sample.accel.x;
        case PrimarySignalSource::ACCEL_Y:          return sample.accel.y;
        case PrimarySignalSource::ACCEL_Z:          return sample.accel.z;
        case PrimarySignalSource::ACCEL_MAG:        return vectorMagnitude(sample.accel);
        case PrimarySignalSource::LINEAR_ACCEL_X:   return sample.linearAccel.x;
        case PrimarySignalSource::LINEAR_ACCEL_Y:   return sample.linearAccel.y;
        case PrimarySignalSource::LINEAR_ACCEL_Z:   return sample.linearAccel.z;
        case PrimarySignalSource::LINEAR_ACCEL_MAG: return vectorMagnitude(sample.linearAccel);
        case PrimarySignalSource::GYRO_X:           return sample.gyro.x;
        case PrimarySignalSource::GYRO_Y:           return sample.gyro.y;
        case PrimarySignalSource::GYRO_Z:           return sample.gyro.z;
        case PrimarySignalSource::GYRO_MAG:         return vectorMagnitude(sample.gyro);
        default:                                    return sample.linearAccel.y;
    }
}

DetectionThresholds buildDetectionThresholds(const CalibrationStats& stats) {
    const float noise = stats.noiseFloor > config::kMinNoiseFloor
        ? stats.noiseFloor
        : config::kMinNoiseFloor;

    DetectionThresholds t;
    t.upStartThreshold   = max(config::kConfiguredUpStartThreshold,
                               noise * config::kNoiseMultiplierForThreshold);
    t.topPeakThreshold   = max(config::kConfiguredTopPeakThreshold,
                               noise * config::kNoiseMultiplierForPeak);
    t.topDropThreshold   = max(config::kConfiguredTopDropThreshold,
                               noise * config::kNoiseMultiplierForTopDrop);
    t.downStartThreshold = min(config::kConfiguredDownStartThreshold,
                               -noise * config::kNoiseMultiplierForThreshold);
    t.baselineDeadband   = max(config::kConfiguredBaselineDeadband,
                               noise * config::kNoiseMultiplierForDeadband);
    t.spikeDeltaThreshold = max(config::kConfiguredSpikeDeltaThreshold,
                                noise * config::kNoiseMultiplierForSpikeDelta);
    t.directionDeadband  = config::kConfiguredDirectionDeadband;
    t.motionActiveThreshold = max(config::kConfiguredMotionActiveThreshold,
                                  noise * config::kNoiseMultiplierForMotionActive);
    return t;
}

}  // namespace app
