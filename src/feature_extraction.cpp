#include "feature_extraction.h"

#include "config.h"

namespace app {

RepFeatures FeatureExtractor::compute(const CompletedRep& rep,
                                      const SessionMetrics& session) const {
    RepFeatures f;

    // ROM proxy: peak-to-trough swing of the filtered primary signal. Named
    // "proxy" because without true joint angles this is just an IMU-derived
    // stand-in. Larger is generally "more range of motion".
    f.romProxy = rep.filteredMax - rep.filteredMin;

    f.repDurationMs  = static_cast<float>(rep.durationMs);
    f.upDurationMs   = static_cast<float>(rep.upDurationMs);
    f.downDurationMs = static_cast<float>(rep.downDurationMs);

    // Tempo symmetry: 0 means up and down took equal time, 1 means one
    // phase dominated completely. A controlled curl should be well under 0.3.
    if (rep.durationMs > 0) {
        f.tempoSymmetry = safeAbs(f.upDurationMs - f.downDurationMs) /
                          static_cast<float>(rep.durationMs);
    } else {
        f.tempoSymmetry = 1.0f;
    }

    f.peakFilteredSignal = rep.peakFiltered;

    // Smoothness proxy: total jerk-like energy, normalised by ROM and sample
    // count so bigger/longer reps aren't unfairly penalised. Lower is smoother.
    const float romDenominator    = f.romProxy > 0.05f ? f.romProxy : 0.05f;
    const float sampleDenominator = rep.sampleCount > 0
        ? static_cast<float>(rep.sampleCount) : 1.0f;
    f.smoothnessProxy = rep.absSecondDiffSum / (romDenominator * sampleDenominator);

    // Spike penalty: combine how many individual spikes occurred with the
    // worst Δ observed, normalised against ROM. Captures "jerky" reps even
    // when the total jerk integral looks okay.
    f.spikePenaltyProxy = static_cast<float>(rep.spikeCount) +
                          (rep.maxAbsDelta / (romDenominator + 0.05f));

    // How far from baseline did the signal end? Large values suggest the user
    // did not return to the start position.
    f.baselineReturnError = safeAbs(rep.endFiltered);

    // Consistency proxy: deviation of this rep from the running session
    // average, averaged across duration and ROM. Only meaningful after a
    // short warm-up so the early reps don't skew themselves.
    if (session.repCount >= config::kConsistencyWarmupReps) {
        const float durationBase = session.averageDurationMs > 1.0f
            ? session.averageDurationMs : 1.0f;
        const float romBase = session.averageRomProxy > 0.05f
            ? session.averageRomProxy : 0.05f;
        const float durationDeviation =
            safeAbs(f.repDurationMs - session.averageDurationMs) / durationBase;
        const float romDeviation =
            safeAbs(f.romProxy - session.averageRomProxy) / romBase;
        f.consistencyProxy = 0.5f * (durationDeviation + romDeviation);
    } else {
        f.consistencyProxy = 0.0f;
    }

    return f;
}

}  // namespace app
