#pragma once

// Converts a CompletedRep into a set of IMU-only quality features. The class
// is stateless (aside from reading current SessionMetrics) so it can be
// freely reused across reps and unit-tested in isolation.

#include "types.h"

namespace app {

class FeatureExtractor {
public:
    // `session` is the metrics *before* this rep is recorded; the consistency
    // proxy uses those running averages as the baseline for deviation.
    RepFeatures compute(const CompletedRep& rep, const SessionMetrics& session) const;
};

}  // namespace app
