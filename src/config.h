#pragma once

// All tunable constants for the bicep-curl firmware live here. Keep this file
// constants-only. Shared types/enums are in types.h.
//
// When first bringing the system up, start by tuning (in this order):
//   1. kPrimarySignal / kDirectionalSignal  - pick axes that best show the curl
//   2. kConfiguredUpStartThreshold / kConfiguredDownStartThreshold /
//      kConfiguredTopPeakThreshold / kConfiguredBaselineDeadband
//      (inspect the "live" packets while doing curls, pick values between
//       the baseline noise and your observed peaks)
//   3. kMinRepDurationMs / kMinTimeBetweenRepsMs /
//      kUpPersistenceMs / kDownPersistenceMs   (avoid double-counting)
//   4. kRomTargetMin/Max / kDurationTargetMinMs/Max / kScoreWeights
//      (shape the 0..100 quality score)

#include "types.h"

namespace app {
namespace config {

// ---- Serial / scheduling ---------------------------------------------------
constexpr uint32_t kSerialBaudRate            = 115200;
constexpr uint32_t kSerialConnectWaitMs       = 3000;
constexpr uint32_t kSampleIntervalMs          = 20;    // 50 Hz
constexpr uint32_t kLivePacketIntervalMs      = 50;    // 20 Hz over Serial
constexpr uint32_t kSummaryIntervalMs         = 5000;  // periodic summary
constexpr uint32_t kErrorPacketIntervalMs     = 1000;  // throttle error spam
constexpr uint32_t kCalibrationPacketIntervalMs = 250;

// ---- Calibration -----------------------------------------------------------
constexpr uint32_t kCalibrationDurationMs     = 2500;
constexpr float    kMinNoiseFloor             = 0.01f;

// ---- Signal conditioning ---------------------------------------------------
constexpr bool                 kEnableBaselineSubtraction = true;
constexpr bool                 kEnableRectification       = false;
constexpr float                kEmaAlpha                  = 0.22f;
constexpr float                kDirectionEmaAlpha         = 0.18f;
constexpr PrimarySignalSource  kPrimarySignal             = PrimarySignalSource::LINEAR_ACCEL_MAG;
constexpr PrimarySignalSource  kDirectionalSignal         = PrimarySignalSource::LINEAR_ACCEL_X;

// ---- Detection thresholds (baseline values before noise-floor scaling) -----
// At runtime these are maxed against noiseFloor * kNoiseMultiplier* so
// tiny noise never trips detection.
constexpr float kConfiguredUpStartThreshold     = 0.10f;
constexpr float kConfiguredTopPeakThreshold     = 0.16f;
constexpr float kConfiguredTopDropThreshold     = 0.06f;
constexpr float kConfiguredDownStartThreshold   = -0.10f;
constexpr float kConfiguredBaselineDeadband     = 0.08f;
constexpr float kConfiguredSpikeDeltaThreshold  = 0.90f;
constexpr float kConfiguredDirectionDeadband    = 0.05f;
constexpr float kConfiguredMotionActiveThreshold = 0.16f;

constexpr float kNoiseMultiplierForThreshold    = 1.6f;
constexpr float kNoiseMultiplierForDeadband     = 1.4f;
constexpr float kNoiseMultiplierForSpikeDelta   = 4.5f;
constexpr float kNoiseMultiplierForMotionActive = 1.2f;
constexpr float kNoiseMultiplierForPeak         = 1.1f;
constexpr float kNoiseMultiplierForTopDrop      = 0.8f;

// ---- Rep timing (debounce / double-count guards) ---------------------------
constexpr uint32_t kUpPersistenceMs       = 60;
constexpr uint32_t kDownPersistenceMs     = 70;
constexpr uint32_t kBaselineSettleMs      = 120;
constexpr uint32_t kTopHoldQuietMs        = 140;
constexpr uint32_t kMinRepDurationMs      = 900;
constexpr uint32_t kMinTimeBetweenRepsMs  = 350;
constexpr uint32_t kMinUpDurationMs       = 150;
constexpr uint32_t kTopHoldTimeoutMs      = 4000;
constexpr uint32_t kMaxRepDurationMs      = 5000;

// ---- Scoring shape ---------------------------------------------------------
// ROM proxy is in units of the filtered primary signal (e.g. m/s^2 for
// linear-accel magnitude). Tune after observing 5-10 reps of "good" form.
constexpr float kRomTargetMin        = 0.75f;
constexpr float kRomTargetMax        = 2.75f;
constexpr float kRomHardMin          = 0.35f;
constexpr float kRomHardMax          = 4.50f;

constexpr float kDurationTargetMinMs = 1000.0f;
constexpr float kDurationTargetMaxMs = 2200.0f;
constexpr float kDurationHardMinMs   = 700.0f;
constexpr float kDurationHardMaxMs   = 3500.0f;

constexpr float    kTempoSymmetryTolerance = 0.35f;
constexpr float    kSmoothnessTarget       = 0.32f;
constexpr float    kStabilityPenaltyLimit  = 3.5f;
constexpr uint32_t kConsistencyWarmupReps  = 3;
constexpr uint8_t  kRollingWindowSize      = 5;

constexpr ScoreWeights kScoreWeights = {
    0.28f,  // ROM
    0.20f,  // tempo
    0.17f,  // symmetry
    0.20f,  // smoothness
    0.15f   // stability
};

// ---- Output / debug --------------------------------------------------------
constexpr bool kEmitDebugPackets     = true;
constexpr bool kEmitSummaryAfterRep  = true;

}  // namespace config
}  // namespace app
