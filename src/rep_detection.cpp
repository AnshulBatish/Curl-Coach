#include "rep_detection.h"

#include <float.h>

namespace app {

namespace {

CompletedRep makeEmptyRep() {
    CompletedRep r;
    r.valid = false;
    r.repIndex = 0;
    r.startTimeMs = 0;
    r.peakTimeMs = 0;
    r.endTimeMs = 0;
    r.durationMs = 0;
    r.upDurationMs = 0;
    r.downDurationMs = 0;
    r.sampleCount = 0;
    r.rawMin = FLT_MAX;
    r.rawMax = -FLT_MAX;
    r.filteredMin = FLT_MAX;
    r.filteredMax = -FLT_MAX;
    r.peakFiltered = 0.0f;
    r.endFiltered = 0.0f;
    r.absDeltaSum = 0.0f;
    r.absSecondDiffSum = 0.0f;
    r.maxAbsDelta = 0.0f;
    r.maxAbsSecondDiff = 0.0f;
    r.spikeCount = 0;
    return r;
}

}  // namespace

RepDetector::RepDetector() {
    reset();
}

void RepDetector::reset() {
    // Seed thresholds from config; these get overwritten with calibration-scaled
    // values once finishCalibration() is called.
    thresholds_.upStartThreshold     = config::kConfiguredUpStartThreshold;
    thresholds_.topPeakThreshold     = config::kConfiguredTopPeakThreshold;
    thresholds_.topDropThreshold     = config::kConfiguredTopDropThreshold;
    thresholds_.downStartThreshold   = config::kConfiguredDownStartThreshold;
    thresholds_.baselineDeadband     = config::kConfiguredBaselineDeadband;
    thresholds_.spikeDeltaThreshold  = config::kConfiguredSpikeDeltaThreshold;
    thresholds_.directionDeadband    = config::kConfiguredDirectionDeadband;
    thresholds_.motionActiveThreshold = config::kConfiguredMotionActiveThreshold;

    repCount_ = 0;
    lastRepEndMs_ = 0;
    stateEnteredMs_ = 0;
    peakFiltered_ = 0.0f;
    peakTimeMs_ = 0;

    activeRep_ = makeEmptyRep();
    activeRepValid_ = false;

    previousFiltered_ = 0.0f;
    previousAbsDelta_ = 0.0f;
    previousInitialized_ = false;

    resetPersistenceTimers();

    state_ = RepState::CALIBRATING;
}

void RepDetector::startCalibration() {
    reset();
    state_ = RepState::CALIBRATING;
}

void RepDetector::finishCalibration(const DetectionThresholds& thresholds) {
    thresholds_ = thresholds;
    state_ = RepState::READY;
    stateEnteredMs_ = millis();
    resetPersistenceTimers();
}

void RepDetector::resetSession(const DetectionThresholds& thresholds) {
    thresholds_ = thresholds;
    repCount_ = 0;
    lastRepEndMs_ = 0;
    state_ = RepState::READY;
    stateEnteredMs_ = millis();
    activeRep_ = makeEmptyRep();
    activeRepValid_ = false;
    previousFiltered_ = 0.0f;
    previousAbsDelta_ = 0.0f;
    previousInitialized_ = false;
    resetPersistenceTimers();
}

DetectorUpdate RepDetector::update(const ProcessedSample& sample) {
    DetectorUpdate update;
    update.repCompleted = false;
    update.stateChanged = false;
    update.repAborted = false;
    update.state = state_;
    update.transitionReason = "";
    update.rep = makeEmptyRep();

    if (!sample.valid || state_ == RepState::CALIBRATING) {
        return update;
    }

    // Any active rep running longer than the hard cap is suspect (likely the
    // user set the device down mid-rep). Drop it and go back to READY.
    const uint32_t now = sample.timestampMs;
    if (activeRepValid_ && (now - activeRep_.startTimeMs) > config::kMaxRepDurationMs) {
        abortRep();
        update.repAborted = true;
        transitionTo(RepState::READY, "rep_timeout", update);
        update.state = state_;
        return update;
    }

    // Continuously track per-rep min/max/peak and jerk metrics while a rep is
    // in progress, regardless of which motion state we're in.
    if (activeRepValid_) {
        updateActiveRep(sample);
        accumulateJerkMetrics(sample);
        previousFiltered_ = sample.filteredPrimary;
        previousInitialized_ = true;
    }

    switch (state_) {
        case RepState::READY: {
            // Enforce minimum time between reps to avoid double-counting the
            // same physical motion if the filter briefly dips and rises again.
            if ((now - lastRepEndMs_) < config::kMinTimeBetweenRepsMs) {
                upCandidateStartMs_ = 0;
                break;
            }

            const bool upDirection = sample.directionFiltered >= thresholds_.upStartThreshold;
            const bool amplitudeActive = sample.filteredPrimary >= thresholds_.motionActiveThreshold;

            if (upDirection && amplitudeActive) {
                // Start the persistence timer on the first sample that passes
                // the threshold; only commit to a new rep once the condition
                // has held for kUpPersistenceMs.
                if (upCandidateStartMs_ == 0) {
                    upCandidateStartMs_ = now;
                }
                if ((now - upCandidateStartMs_) >= config::kUpPersistenceMs) {
                    startNewRep(sample);
                    transitionTo(RepState::MOVING_UP, "up_direction_threshold", update);
                }
            } else {
                upCandidateStartMs_ = 0;
            }
            break;
        }

        case RepState::MOVING_UP: {
            if (sample.filteredPrimary > peakFiltered_) {
                peakFiltered_ = sample.filteredPrimary;
                peakTimeMs_ = now;
                activeRep_.peakFiltered = peakFiltered_;
                activeRep_.peakTimeMs = peakTimeMs_;
            }

            // Option A: direction goes quiet near the top - enter TOP_HOLD.
            // Only allowed once (a) we've committed to the rep for at least
            // kMinUpDurationMs, AND (b) the rep has actually reached the peak
            // amplitude threshold. Without (b), a brief mid-lift quiet patch
            // in the direction signal could latch us into TOP_HOLD before the
            // user has actually peaked.
            const bool reachedPeak = peakFiltered_ >= thresholds_.topPeakThreshold;
            if ((now - activeRep_.startTimeMs) >= config::kMinUpDurationMs &&
                reachedPeak &&
                safeAbs(sample.directionFiltered) <= thresholds_.directionDeadband) {
                if (topQuietStartMs_ == 0) {
                    topQuietStartMs_ = now;
                }
                if ((now - topQuietStartMs_) >= config::kTopHoldQuietMs) {
                    transitionTo(RepState::TOP_HOLD, "top_quiet_hold", update);
                    break;
                }
            } else {
                topQuietStartMs_ = 0;
            }

            // Option B: fast reversal - skip TOP_HOLD and go straight down.
            // We deliberately do NOT require filteredPrimary >= motionActiveThreshold
            // here: gravity-assisted descents have very small linear-accel
            // magnitude even when the direction signal kicks negative cleanly.
            // The kDownPersistenceMs debounce + reachedPeak gate are enough.
            if ((now - activeRep_.startTimeMs) >= config::kMinUpDurationMs &&
                reachedPeak &&
                sample.directionFiltered <= thresholds_.downStartThreshold) {
                if (downCandidateStartMs_ == 0) {
                    downCandidateStartMs_ = now;
                }
                if ((now - downCandidateStartMs_) >= config::kDownPersistenceMs) {
                    transitionTo(RepState::MOVING_DOWN, "down_direction_after_up", update);
                }
            } else {
                downCandidateStartMs_ = 0;
            }
            break;
        }

        case RepState::TOP_HOLD: {
            // Primary path: direction signal goes negative for kDownPersistenceMs.
            // The amplitude gate from the previous version was removed because
            // an eccentric (gravity-assisted) descent of a bicep curl has very
            // small linear-acceleration magnitude - only the *direction* of
            // acceleration changes meaningfully. Requiring magnitude here was
            // the reason TOP_HOLD often timed out instead of progressing.
            const bool downDirection =
                sample.directionFiltered <= thresholds_.downStartThreshold;

            // Secondary path: even if the direction signal stays soft (e.g.,
            // the descent is so smooth the X-axis kick is small), accept the
            // descent if the amplitude has clearly dropped from the peak.
            // topDropThreshold is the existing knob designed for this case.
            const float dropFromPeak = peakFiltered_ - sample.filteredPrimary;
            const bool ampDroppedFromPeak =
                dropFromPeak >= thresholds_.topDropThreshold;

            if (downDirection || ampDroppedFromPeak) {
                if (downCandidateStartMs_ == 0) {
                    downCandidateStartMs_ = now;
                }
                if ((now - downCandidateStartMs_) >= config::kDownPersistenceMs) {
                    const char* reason = downDirection
                        ? "down_direction_from_hold"
                        : "amplitude_drop_from_peak";
                    transitionTo(RepState::MOVING_DOWN, reason, update);
                    break;
                }
            } else {
                downCandidateStartMs_ = 0;
            }

            // Safety: if we sit at the top forever (user paused, set device
            // down), bail out so we never falsely complete a rep later.
            if ((now - stateEnteredMs_) > config::kTopHoldTimeoutMs) {
                abortRep();
                update.repAborted = true;
                transitionTo(RepState::READY, "top_hold_timeout", update);
            }
            break;
        }

        case RepState::MOVING_DOWN: {
            // Complete the rep only after the signal is quiet on BOTH axes
            // (directional and amplitude) for long enough. This is what
            // prevents double-counting: an oscillation at the bottom still
            // has to settle fully before the next up-motion is recognised.
            const bool directionQuiet = safeAbs(sample.directionFiltered) <= thresholds_.directionDeadband;
            const bool amplitudeQuiet = sample.filteredPrimary <= thresholds_.baselineDeadband;

            if (directionQuiet && amplitudeQuiet) {
                if (baselineSettleStartMs_ == 0) {
                    baselineSettleStartMs_ = now;
                }
                if ((now - baselineSettleStartMs_) >= config::kBaselineSettleMs) {
                    CompletedRep rep = completeRep(sample);
                    if (rep.valid) {
                        update.rep = rep;
                        update.repCompleted = true;
                    }
                    transitionTo(RepState::READY, "returned_to_baseline", update);
                }
            } else {
                baselineSettleStartMs_ = 0;
            }
            break;
        }

        case RepState::CALIBRATING:
        default:
            break;
    }

    update.state = state_;
    return update;
}

RepState RepDetector::state() const                 { return state_; }
DetectionThresholds RepDetector::thresholds() const { return thresholds_; }
uint32_t RepDetector::repCount() const              { return repCount_; }

void RepDetector::setThresholds(const DetectionThresholds& thresholds) {
    // Just swap the values - persistence timers and the active rep stay
    // intact. If the user yanks a threshold across the current sample value
    // the next update() call will resolve the new condition naturally.
    thresholds_ = thresholds;
}

void RepDetector::startNewRep(const ProcessedSample& sample) {
    activeRep_ = makeEmptyRep();
    activeRepValid_ = true;
    activeRep_.repIndex = repCount_ + 1U;
    activeRep_.startTimeMs = sample.timestampMs;
    activeRep_.peakTimeMs = sample.timestampMs;
    activeRep_.rawMin = sample.rawPrimary;
    activeRep_.rawMax = sample.rawPrimary;
    activeRep_.filteredMin = sample.filteredPrimary;
    activeRep_.filteredMax = sample.filteredPrimary;
    activeRep_.peakFiltered = sample.filteredPrimary;
    activeRep_.sampleCount = 1;

    peakFiltered_ = sample.filteredPrimary;
    peakTimeMs_ = sample.timestampMs;

    previousFiltered_ = sample.filteredPrimary;
    previousAbsDelta_ = 0.0f;
    previousInitialized_ = true;

    resetPersistenceTimers();
}

void RepDetector::updateActiveRep(const ProcessedSample& sample) {
    activeRep_.sampleCount++;
    if (sample.rawPrimary < activeRep_.rawMin) activeRep_.rawMin = sample.rawPrimary;
    if (sample.rawPrimary > activeRep_.rawMax) activeRep_.rawMax = sample.rawPrimary;
    if (sample.filteredPrimary < activeRep_.filteredMin) activeRep_.filteredMin = sample.filteredPrimary;
    if (sample.filteredPrimary > activeRep_.filteredMax) activeRep_.filteredMax = sample.filteredPrimary;
    if (sample.filteredPrimary > activeRep_.peakFiltered) {
        activeRep_.peakFiltered = sample.filteredPrimary;
        activeRep_.peakTimeMs = sample.timestampMs;
    }
}

void RepDetector::accumulateJerkMetrics(const ProcessedSample& sample) {
    if (!previousInitialized_) {
        return;
    }
    const float absDelta = safeAbs(sample.filteredPrimary - previousFiltered_);
    const float secondDiff = safeAbs(absDelta - previousAbsDelta_);

    activeRep_.absDeltaSum += absDelta;
    activeRep_.absSecondDiffSum += secondDiff;

    if (absDelta > activeRep_.maxAbsDelta) activeRep_.maxAbsDelta = absDelta;
    if (secondDiff > activeRep_.maxAbsSecondDiff) activeRep_.maxAbsSecondDiff = secondDiff;
    if (absDelta > thresholds_.spikeDeltaThreshold) activeRep_.spikeCount++;

    previousAbsDelta_ = absDelta;
}

void RepDetector::abortRep() {
    activeRep_ = makeEmptyRep();
    activeRepValid_ = false;
    previousInitialized_ = false;
    resetPersistenceTimers();
}

CompletedRep RepDetector::completeRep(const ProcessedSample& sample) {
    CompletedRep rep = activeRep_;
    rep.endTimeMs = sample.timestampMs;
    rep.endFiltered = sample.filteredPrimary;
    rep.durationMs = rep.endTimeMs - rep.startTimeMs;
    rep.upDurationMs = rep.peakTimeMs > rep.startTimeMs
        ? (rep.peakTimeMs - rep.startTimeMs) : 0;
    rep.downDurationMs = rep.endTimeMs > rep.peakTimeMs
        ? (rep.endTimeMs - rep.peakTimeMs) : 0;

    // Final sanity checks - drop reps that are too short or too shallow.
    // This is the last line of defense against false positives.
    rep.valid = rep.durationMs >= config::kMinRepDurationMs &&
                rep.upDurationMs >= config::kMinUpDurationMs &&
                rep.filteredMax >= thresholds_.topPeakThreshold;

    activeRep_ = makeEmptyRep();
    activeRepValid_ = false;
    previousInitialized_ = false;

    if (rep.valid) {
        repCount_++;
        lastRepEndMs_ = rep.endTimeMs;
    }
    resetPersistenceTimers();
    return rep;
}

void RepDetector::transitionTo(RepState nextState, const char* reason, DetectorUpdate& update) {
    state_ = nextState;
    stateEnteredMs_ = millis();
    update.stateChanged = true;
    update.transitionReason = reason;
    update.state = state_;

    // Each transition clears only the timers that are meaningful for the new
    // state. Others remain zero from resetPersistenceTimers() during entry
    // transitions.
    if (nextState == RepState::READY) {
        resetPersistenceTimers();
    } else if (nextState == RepState::TOP_HOLD) {
        downCandidateStartMs_ = 0;
    } else if (nextState == RepState::MOVING_DOWN) {
        baselineSettleStartMs_ = 0;
    }
}

void RepDetector::resetPersistenceTimers() {
    upCandidateStartMs_ = 0;
    downCandidateStartMs_ = 0;
    baselineSettleStartMs_ = 0;
    topQuietStartMs_ = 0;
}

}  // namespace app
