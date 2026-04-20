#pragma once

// Per-rep quality scoring + session-level aggregation.
//
// The scorer converts each RepFeatures into five 0..1 sub-scores and combines
// them with kScoreWeights into a final 0..100 quality score. The shape of
// every sub-score is a "band": full credit inside a target range, linearly
// falling off to zero at hard limits. This keeps the scoring transparent and
// trivially tunable from config.h.

#include "config.h"
#include "types.h"

namespace app {

class RepScorer {
public:
    RepScore score(const RepFeatures& features) const;

private:
    // 1.0 inside [targetMin, targetMax], 0.0 outside [hardMin, hardMax],
    // linearly interpolated in the transition bands.
    float bandScore(float value, float hardMin, float targetMin,
                    float targetMax, float hardMax) const;
};

class SessionTracker {
public:
    SessionTracker();
    void reset();
    SessionMetrics metrics() const;
    void recordRep(const RepFeatures& features, const RepScore& score);

private:
    SessionMetrics metrics_;
    float rollingScores_[config::kRollingWindowSize];
    float rollingRoms_[config::kRollingWindowSize];
    uint8_t rollingCount_;
    uint8_t rollingIndex_;
};

}  // namespace app
