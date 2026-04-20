#pragma once

// Rep detection state machine. The logic splits each rep into three observable
// events: motion up from baseline, reaching a peak (optionally with a brief
// hold), and returning to baseline on the way down. Every transition uses
// hysteresis (separate enter/exit thresholds) and persistence timers (the
// condition must hold for N ms) to survive noise and small accidental
// movements without double-counting.

#include "config.h"
#include "types.h"

namespace app {

struct DetectorUpdate {
    bool repCompleted;
    bool stateChanged;
    bool repAborted;
    RepState state;
    const char* transitionReason;
    CompletedRep rep;
};

class RepDetector {
public:
    RepDetector();
    void reset();
    void startCalibration();
    void finishCalibration(const DetectionThresholds& thresholds);
    void resetSession(const DetectionThresholds& thresholds);

    DetectorUpdate update(const ProcessedSample& sample);

    // Live-update the detection thresholds without disturbing the active rep
    // or session counters. Used by the host SET commands so the dashboard
    // sliders can re-tune the device on the fly.
    void setThresholds(const DetectionThresholds& thresholds);

    RepState state() const;
    DetectionThresholds thresholds() const;
    uint32_t repCount() const;

private:
    void startNewRep(const ProcessedSample& sample);
    void updateActiveRep(const ProcessedSample& sample);
    void accumulateJerkMetrics(const ProcessedSample& sample);
    void abortRep();
    CompletedRep completeRep(const ProcessedSample& sample);
    void transitionTo(RepState nextState, const char* reason, DetectorUpdate& update);
    void resetPersistenceTimers();

    RepState state_;
    DetectionThresholds thresholds_;

    uint32_t repCount_;
    uint32_t lastRepEndMs_;
    uint32_t stateEnteredMs_;

    // Persistence timers: each one records when we *first* saw a candidate
    // condition. A transition fires only after the condition has held for
    // the required duration (kUpPersistenceMs etc.).
    uint32_t upCandidateStartMs_;
    uint32_t downCandidateStartMs_;
    uint32_t baselineSettleStartMs_;
    uint32_t topQuietStartMs_;

    float peakFiltered_;
    uint32_t peakTimeMs_;

    CompletedRep activeRep_;
    bool activeRepValid_;

    float previousFiltered_;
    float previousAbsDelta_;
    bool previousInitialized_;
};

}  // namespace app
