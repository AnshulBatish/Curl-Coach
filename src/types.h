#pragma once

// Shared data types, enums, and small inline helpers for the bicep-curl
// firmware pipeline. Keep this file free of tunable constants; those live in
// config.h so scoring/thresholds can be adjusted without touching data layouts.

#include "Particle.h"
#include <math.h>

namespace app {

struct Vector3f {
    float x;
    float y;
    float z;
};

// Which signal from the IMU drives detection and scoring. LINEAR_ACCEL_* uses
// the BNO055's gravity-compensated vector, which is usually the most stable
// source for repetition motion.
enum class PrimarySignalSource {
    ACCEL_X,
    ACCEL_Y,
    ACCEL_Z,
    ACCEL_MAG,
    LINEAR_ACCEL_X,
    LINEAR_ACCEL_Y,
    LINEAR_ACCEL_Z,
    LINEAR_ACCEL_MAG,
    GYRO_X,
    GYRO_Y,
    GYRO_Z,
    GYRO_MAG
};

// Rep detection state machine. A rep progresses CALIBRATING -> READY ->
// MOVING_UP -> TOP_HOLD -> MOVING_DOWN -> READY. TOP_HOLD is optional: if the
// user flips direction immediately at the top, we skip it.
enum class RepState {
    CALIBRATING,
    READY,
    MOVING_UP,
    TOP_HOLD,
    MOVING_DOWN
};

// One raw IMU reading plus a wall-clock timestamp (millis() based).
struct ImuSample {
    uint32_t timestampMs;
    Vector3f accel;        // m/s^2, includes gravity
    Vector3f linearAccel;  // m/s^2, gravity removed by BNO055 fusion
    Vector3f gyro;         // deg/s
    bool gyroValid;
    bool valid;
};

// Output of the calibration phase. noiseFloor is used to auto-scale detection
// thresholds so the firmware still works if the mounting orientation changes.
struct CalibrationStats {
    bool complete;
    uint32_t sampleCount;
    float mean;
    float variance;
    float stddev;
    float minValue;
    float maxValue;
    float noiseFloor;
};

// Runtime thresholds. Some are copied from config, others are scaled up from
// the calibration noise floor so the thresholds sit safely above sensor noise.
struct DetectionThresholds {
    float upStartThreshold;       // directional signal to begin a rep
    float topPeakThreshold;       // minimum peak amplitude for a valid rep
    float topDropThreshold;       // amplitude drop needed to accept TOP_HOLD
    float downStartThreshold;     // directional signal to begin descent
    float baselineDeadband;       // amplitude band considered "at rest"
    float spikeDeltaThreshold;    // |dx/dt| above this counts as a spike
    float directionDeadband;      // directional signal considered "quiet"
    float motionActiveThreshold;  // min filtered amplitude to consider moving
};

// One sample after conditioning: the primary amplitude signal, the directional
// signal, their filtered forms, and the raw vectors for downstream logging.
struct ProcessedSample {
    uint32_t timestampMs;
    float rawPrimary;
    float conditionedPrimary;
    float filteredPrimary;
    float deltaFiltered;
    float directionRaw;
    float directionConditioned;
    float directionFiltered;
    Vector3f accel;
    Vector3f linearAccel;
    Vector3f gyro;
    bool gyroValid;
    bool valid;
};

// Data accumulated for a single rep while it is in progress; when the rep
// closes successfully we hand this struct to the feature extractor.
struct CompletedRep {
    bool valid;
    uint32_t repIndex;
    uint32_t startTimeMs;
    uint32_t peakTimeMs;
    uint32_t endTimeMs;
    uint32_t durationMs;
    uint32_t upDurationMs;
    uint32_t downDurationMs;
    uint32_t sampleCount;
    float rawMin;
    float rawMax;
    float filteredMin;
    float filteredMax;
    float peakFiltered;
    float endFiltered;
    float absDeltaSum;       // sum of |filt[n] - filt[n-1]|
    float absSecondDiffSum;  // sum of |abs(delta[n]) - abs(delta[n-1])| (jerk proxy)
    float maxAbsDelta;
    float maxAbsSecondDiff;
    uint16_t spikeCount;
};

// Derived quality features. Anything here is an IMU-only proxy; names call out
// that they are not direct joint-angle measurements.
struct RepFeatures {
    float romProxy;             // filteredMax - filteredMin
    float repDurationMs;
    float upDurationMs;
    float downDurationMs;
    float tempoSymmetry;        // |up - down| / total, 0 = perfectly symmetric
    float peakFilteredSignal;
    float smoothnessProxy;      // jerk integral normalised by ROM
    float spikePenaltyProxy;    // combined spike count + worst delta
    float baselineReturnError;  // how far from 0 the signal ended
    float consistencyProxy;     // deviation from session average (>= 3 reps)
};

// Per-rep score breakdown, 0..1 for each sub-score, 0..100 for the final.
struct RepScore {
    float romSubscore;
    float tempoSubscore;
    float symmetrySubscore;
    float smoothnessSubscore;
    float stabilitySubscore;
    float finalScore;
};

struct SessionMetrics {
    uint32_t repCount;
    float averageScore;
    float bestScore;
    float worstScore;
    float averageDurationMs;
    float averageRomProxy;
    float rollingAverageScore;
    float rollingAverageRomProxy;
};

struct ScoreWeights {
    float romWeight;
    float tempoWeight;
    float symmetryWeight;
    float smoothnessWeight;
    float stabilityWeight;
};

inline float clampFloat(float value, float minValue, float maxValue) {
    if (value < minValue) return minValue;
    if (value > maxValue) return maxValue;
    return value;
}

inline float safeAbs(float value) {
    return value >= 0.0f ? value : -value;
}

inline float vectorMagnitude(const Vector3f& v) {
    return sqrtf(v.x * v.x + v.y * v.y + v.z * v.z);
}

inline bool isMagnitudeSignalSource(PrimarySignalSource source) {
    return source == PrimarySignalSource::LINEAR_ACCEL_MAG ||
           source == PrimarySignalSource::ACCEL_MAG ||
           source == PrimarySignalSource::GYRO_MAG;
}

inline const char* primarySignalSourceToString(PrimarySignalSource source) {
    switch (source) {
        case PrimarySignalSource::ACCEL_X:          return "ACCEL_X";
        case PrimarySignalSource::ACCEL_Y:          return "ACCEL_Y";
        case PrimarySignalSource::ACCEL_Z:          return "ACCEL_Z";
        case PrimarySignalSource::ACCEL_MAG:        return "ACCEL_MAG";
        case PrimarySignalSource::LINEAR_ACCEL_X:   return "LINEAR_ACCEL_X";
        case PrimarySignalSource::LINEAR_ACCEL_Y:   return "LINEAR_ACCEL_Y";
        case PrimarySignalSource::LINEAR_ACCEL_Z:   return "LINEAR_ACCEL_Z";
        case PrimarySignalSource::LINEAR_ACCEL_MAG: return "LINEAR_ACCEL_MAG";
        case PrimarySignalSource::GYRO_X:           return "GYRO_X";
        case PrimarySignalSource::GYRO_Y:           return "GYRO_Y";
        case PrimarySignalSource::GYRO_Z:           return "GYRO_Z";
        case PrimarySignalSource::GYRO_MAG:         return "GYRO_MAG";
        default:                                    return "UNKNOWN";
    }
}

inline const char* repStateToString(RepState state) {
    switch (state) {
        case RepState::CALIBRATING: return "CALIBRATING";
        case RepState::READY:       return "READY";
        case RepState::MOVING_UP:   return "MOVING_UP";
        case RepState::TOP_HOLD:    return "TOP_HOLD";
        case RepState::MOVING_DOWN: return "MOVING_DOWN";
        default:                    return "UNKNOWN";
    }
}

}  // namespace app
