#include "serial_protocol.h"

#include "config.h"

namespace app {

void SerialProtocol::emitBoot(const char* status, const char* sensorStatus) const {
    Serial.printf(
        "{\"type\":\"boot\",\"status\":\"%s\",\"sensor\":\"%s\"}\n",
        status, sensorStatus);
}

void SerialProtocol::emitError(uint32_t timestampMs, const char* message,
                               const char* sensorStatus) const {
    Serial.printf(
        "{\"type\":\"error\",\"t\":%lu,\"msg\":\"%s\",\"sensor\":\"%s\"}\n",
        static_cast<unsigned long>(timestampMs), message, sensorStatus);
}

void SerialProtocol::emitCalibrationProgress(uint32_t timestampMs, uint32_t elapsedMs,
                                             uint32_t totalMs, uint32_t sampleCount,
                                             float latestRaw) const {
    Serial.printf(
        "{\"type\":\"calibration\",\"phase\":\"progress\",\"t\":%lu,\"elapsed\":%lu,"
        "\"total\":%lu,\"samples\":%lu,\"raw\":%.4f}\n",
        static_cast<unsigned long>(timestampMs),
        static_cast<unsigned long>(elapsedMs),
        static_cast<unsigned long>(totalMs),
        static_cast<unsigned long>(sampleCount),
        static_cast<double>(latestRaw));
}

void SerialProtocol::emitCalibrationComplete(uint32_t timestampMs,
                                             const CalibrationStats& stats,
                                             const DetectionThresholds& thresholds) const {
    Serial.printf(
        "{\"type\":\"calibration\",\"phase\":\"complete\",\"t\":%lu,"
        "\"baseline\":%.5f,\"noise\":%.5f,\"std\":%.5f,\"min\":%.5f,\"max\":%.5f,"
        "\"upTh\":%.4f,\"downTh\":%.4f,\"peakTh\":%.4f,\"deadband\":%.4f,"
        "\"motionTh\":%.4f}\n",
        static_cast<unsigned long>(timestampMs),
        static_cast<double>(stats.mean),
        static_cast<double>(stats.noiseFloor),
        static_cast<double>(stats.stddev),
        static_cast<double>(stats.minValue),
        static_cast<double>(stats.maxValue),
        static_cast<double>(thresholds.upStartThreshold),
        static_cast<double>(thresholds.downStartThreshold),
        static_cast<double>(thresholds.topPeakThreshold),
        static_cast<double>(thresholds.baselineDeadband),
        static_cast<double>(thresholds.motionActiveThreshold));
}

void SerialProtocol::emitLive(const ProcessedSample& sample, RepState state,
                              uint32_t repCount,
                              const DetectionThresholds& thresholds,
                              float baseline, float noiseFloor) const {
    // One big line keeps the packet atomic for serial readers on the host
    // side. Formatting is ordered by importance so quick visual inspection
    // in the Particle Serial Monitor is still readable.
    Serial.printf(
        "{\"type\":\"live\",\"t\":%lu,"
        "\"raw\":%.4f,\"cond\":%.4f,\"filt\":%.4f,"
        "\"dirRaw\":%.4f,\"dirFilt\":%.4f,"
        "\"source\":\"%s\",\"dirSource\":\"%s\","
        "\"accel\":{\"x\":%.4f,\"y\":%.4f,\"z\":%.4f},"
        "\"lin\":{\"x\":%.4f,\"y\":%.4f,\"z\":%.4f},"
        "\"gyro\":{\"x\":%.4f,\"y\":%.4f,\"z\":%.4f,\"valid\":%s},"
        "\"state\":\"%s\",\"reps\":%lu,"
        "\"upTh\":%.4f,\"downTh\":%.4f,\"peakTh\":%.4f,"
        "\"deadband\":%.4f,\"dirDeadband\":%.4f,\"motionTh\":%.4f,"
        "\"baseline\":%.5f,\"noise\":%.5f}\n",
        static_cast<unsigned long>(sample.timestampMs),
        static_cast<double>(sample.rawPrimary),
        static_cast<double>(sample.conditionedPrimary),
        static_cast<double>(sample.filteredPrimary),
        static_cast<double>(sample.directionRaw),
        static_cast<double>(sample.directionFiltered),
        primarySignalSourceToString(config::kPrimarySignal),
        primarySignalSourceToString(config::kDirectionalSignal),
        static_cast<double>(sample.accel.x),
        static_cast<double>(sample.accel.y),
        static_cast<double>(sample.accel.z),
        static_cast<double>(sample.linearAccel.x),
        static_cast<double>(sample.linearAccel.y),
        static_cast<double>(sample.linearAccel.z),
        static_cast<double>(sample.gyro.x),
        static_cast<double>(sample.gyro.y),
        static_cast<double>(sample.gyro.z),
        sample.gyroValid ? "true" : "false",
        repStateToString(state),
        static_cast<unsigned long>(repCount),
        static_cast<double>(thresholds.upStartThreshold),
        static_cast<double>(thresholds.downStartThreshold),
        static_cast<double>(thresholds.topPeakThreshold),
        static_cast<double>(thresholds.baselineDeadband),
        static_cast<double>(thresholds.directionDeadband),
        static_cast<double>(thresholds.motionActiveThreshold),
        static_cast<double>(baseline),
        static_cast<double>(noiseFloor));
}

void SerialProtocol::emitStateDebug(uint32_t timestampMs, RepState state,
                                    const char* reason,
                                    const ProcessedSample& sample,
                                    const DetectionThresholds& thresholds) const {
    Serial.printf(
        "{\"type\":\"debug\",\"t\":%lu,\"event\":\"state_change\","
        "\"state\":\"%s\",\"reason\":\"%s\",\"filt\":%.4f,\"raw\":%.4f,"
        "\"dirFilt\":%.4f,\"upTh\":%.4f,\"downTh\":%.4f}\n",
        static_cast<unsigned long>(timestampMs),
        repStateToString(state),
        reason,
        static_cast<double>(sample.filteredPrimary),
        static_cast<double>(sample.rawPrimary),
        static_cast<double>(sample.directionFiltered),
        static_cast<double>(thresholds.upStartThreshold),
        static_cast<double>(thresholds.downStartThreshold));
}

void SerialProtocol::emitRep(const CompletedRep& rep, const RepFeatures& features,
                             const RepScore& score) const {
    Serial.printf(
        "{\"type\":\"rep\",\"rep\":%lu,"
        "\"start\":%lu,\"peak\":%lu,\"end\":%lu,"
        "\"dur\":%lu,\"up\":%lu,\"down\":%lu,"
        "\"rom\":%.4f,\"peakSig\":%.4f,\"tempoSym\":%.4f,"
        "\"smooth\":%.4f,\"spike\":%.4f,\"returnErr\":%.4f,"
        "\"consistency\":%.4f,\"score\":%.1f,"
        "\"subs\":{\"rom\":%.3f,\"tempo\":%.3f,\"sym\":%.3f,"
        "\"smooth\":%.3f,\"stable\":%.3f}}\n",
        static_cast<unsigned long>(rep.repIndex),
        static_cast<unsigned long>(rep.startTimeMs),
        static_cast<unsigned long>(rep.peakTimeMs),
        static_cast<unsigned long>(rep.endTimeMs),
        static_cast<unsigned long>(rep.durationMs),
        static_cast<unsigned long>(rep.upDurationMs),
        static_cast<unsigned long>(rep.downDurationMs),
        static_cast<double>(features.romProxy),
        static_cast<double>(features.peakFilteredSignal),
        static_cast<double>(features.tempoSymmetry),
        static_cast<double>(features.smoothnessProxy),
        static_cast<double>(features.spikePenaltyProxy),
        static_cast<double>(features.baselineReturnError),
        static_cast<double>(features.consistencyProxy),
        static_cast<double>(score.finalScore),
        static_cast<double>(score.romSubscore),
        static_cast<double>(score.tempoSubscore),
        static_cast<double>(score.symmetrySubscore),
        static_cast<double>(score.smoothnessSubscore),
        static_cast<double>(score.stabilitySubscore));
}

void SerialProtocol::emitTuningAck(uint32_t timestampMs, const char* key, float value,
                                   bool ok, const char* error,
                                   const DetectionThresholds& thresholds) const {
    Serial.printf(
        "{\"type\":\"tuning\",\"t\":%lu,\"key\":\"%s\",\"value\":%.5f,"
        "\"ok\":%s,\"error\":\"%s\","
        "\"thresholds\":{"
        "\"upTh\":%.4f,\"downTh\":%.4f,\"peakTh\":%.4f,\"topDrop\":%.4f,"
        "\"deadband\":%.4f,\"dirDeadband\":%.4f,\"motionTh\":%.4f,"
        "\"spikeDelta\":%.4f}}\n",
        static_cast<unsigned long>(timestampMs),
        key,
        static_cast<double>(value),
        ok ? "true" : "false",
        error ? error : "",
        static_cast<double>(thresholds.upStartThreshold),
        static_cast<double>(thresholds.downStartThreshold),
        static_cast<double>(thresholds.topPeakThreshold),
        static_cast<double>(thresholds.topDropThreshold),
        static_cast<double>(thresholds.baselineDeadband),
        static_cast<double>(thresholds.directionDeadband),
        static_cast<double>(thresholds.motionActiveThreshold),
        static_cast<double>(thresholds.spikeDeltaThreshold));
}

void SerialProtocol::emitSummary(uint32_t timestampMs,
                                 const SessionMetrics& metrics) const {
    Serial.printf(
        "{\"type\":\"summary\",\"t\":%lu,\"reps\":%lu,\"avgScore\":%.2f,"
        "\"best\":%.2f,\"worst\":%.2f,\"avgDur\":%.2f,\"avgRom\":%.4f,"
        "\"rollScore\":%.2f,\"rollRom\":%.4f}\n",
        static_cast<unsigned long>(timestampMs),
        static_cast<unsigned long>(metrics.repCount),
        static_cast<double>(metrics.averageScore),
        static_cast<double>(metrics.bestScore),
        static_cast<double>(metrics.worstScore),
        static_cast<double>(metrics.averageDurationMs),
        static_cast<double>(metrics.averageRomProxy),
        static_cast<double>(metrics.rollingAverageScore),
        static_cast<double>(metrics.rollingAverageRomProxy));
}

}  // namespace app
