#include "scoring.h"

namespace app {

float RepScorer::bandScore(float value, float hardMin, float targetMin,
                           float targetMax, float hardMax) const {
    if (value <= hardMin || value >= hardMax) {
        return 0.0f;
    }
    if (value >= targetMin && value <= targetMax) {
        return 1.0f;
    }
    if (value < targetMin) {
        // Linear ramp from 0 at hardMin up to 1 at targetMin.
        return clampFloat((value - hardMin) / (targetMin - hardMin), 0.0f, 1.0f);
    }
    // value between targetMax and hardMax: ramp back down to 0.
    return clampFloat((hardMax - value) / (hardMax - targetMax), 0.0f, 1.0f);
}

RepScore RepScorer::score(const RepFeatures& features) const {
    RepScore s;

    s.romSubscore = bandScore(features.romProxy,
                              config::kRomHardMin, config::kRomTargetMin,
                              config::kRomTargetMax, config::kRomHardMax);

    s.tempoSubscore = bandScore(features.repDurationMs,
                                config::kDurationHardMinMs,
                                config::kDurationTargetMinMs,
                                config::kDurationTargetMaxMs,
                                config::kDurationHardMaxMs);

    // Symmetry and smoothness are "lower is better" features, so we invert
    // them against a configured tolerance to get a 0..1 score.
    s.symmetrySubscore = 1.0f - clampFloat(
        features.tempoSymmetry / config::kTempoSymmetryTolerance, 0.0f, 1.0f);
    s.smoothnessSubscore = 1.0f - clampFloat(
        features.smoothnessProxy / config::kSmoothnessTarget, 0.0f, 1.0f);

    // Stability lumps together "how much did the signal misbehave".
    // Each term is a soft penalty; the weights below (0.65 / 1.8 / 0.5) were
    // chosen so any single misbehaviour can fully deplete the budget.
    const float stabilityPenalty =
        (0.65f * features.spikePenaltyProxy) +
        (1.80f * features.baselineReturnError) +
        (0.50f * features.consistencyProxy);
    s.stabilitySubscore = 1.0f - clampFloat(
        stabilityPenalty / config::kStabilityPenaltyLimit, 0.0f, 1.0f);

    const ScoreWeights& w = config::kScoreWeights;
    const float weighted =
        (s.romSubscore        * w.romWeight) +
        (s.tempoSubscore      * w.tempoWeight) +
        (s.symmetrySubscore   * w.symmetryWeight) +
        (s.smoothnessSubscore * w.smoothnessWeight) +
        (s.stabilitySubscore  * w.stabilityWeight);

    s.finalScore = clampFloat(weighted * 100.0f, 0.0f, 100.0f);
    return s;
}

SessionTracker::SessionTracker() {
    reset();
}

void SessionTracker::reset() {
    metrics_.repCount = 0;
    metrics_.averageScore = 0.0f;
    metrics_.bestScore = 0.0f;
    metrics_.worstScore = 0.0f;
    metrics_.averageDurationMs = 0.0f;
    metrics_.averageRomProxy = 0.0f;
    metrics_.rollingAverageScore = 0.0f;
    metrics_.rollingAverageRomProxy = 0.0f;
    rollingCount_ = 0;
    rollingIndex_ = 0;
    for (uint8_t i = 0; i < config::kRollingWindowSize; ++i) {
        rollingScores_[i] = 0.0f;
        rollingRoms_[i] = 0.0f;
    }
}

SessionMetrics SessionTracker::metrics() const {
    return metrics_;
}

void SessionTracker::recordRep(const RepFeatures& features, const RepScore& score) {
    const uint32_t nextCount = metrics_.repCount + 1U;
    const float nextCountF = static_cast<float>(nextCount);

    // Running averages via incremental update: avg' = (avg*n + x) / (n+1).
    metrics_.averageScore =
        ((metrics_.averageScore * metrics_.repCount) + score.finalScore) / nextCountF;
    metrics_.averageDurationMs =
        ((metrics_.averageDurationMs * metrics_.repCount) + features.repDurationMs) / nextCountF;
    metrics_.averageRomProxy =
        ((metrics_.averageRomProxy * metrics_.repCount) + features.romProxy) / nextCountF;

    if (metrics_.repCount == 0) {
        metrics_.bestScore = score.finalScore;
        metrics_.worstScore = score.finalScore;
    } else {
        if (score.finalScore > metrics_.bestScore) metrics_.bestScore = score.finalScore;
        if (score.finalScore < metrics_.worstScore) metrics_.worstScore = score.finalScore;
    }
    metrics_.repCount = nextCount;

    // Rolling window: most-recent-N average. Useful for the dashboard to show
    // the user if their form is trending down without waiting for session end.
    rollingScores_[rollingIndex_] = score.finalScore;
    rollingRoms_[rollingIndex_] = features.romProxy;
    if (rollingCount_ < config::kRollingWindowSize) rollingCount_++;
    rollingIndex_ = (rollingIndex_ + 1U) % config::kRollingWindowSize;

    float rollingScoreSum = 0.0f;
    float rollingRomSum = 0.0f;
    for (uint8_t i = 0; i < rollingCount_; ++i) {
        rollingScoreSum += rollingScores_[i];
        rollingRomSum += rollingRoms_[i];
    }
    const float divisor = rollingCount_ > 0
        ? static_cast<float>(rollingCount_) : 1.0f;
    metrics_.rollingAverageScore = rollingScoreSum / divisor;
    metrics_.rollingAverageRomProxy = rollingRomSum / divisor;
}

}  // namespace app
