#include "imu_sensor.h"

#include <Wire.h>

namespace app {

namespace {

Vector3f toVector3f(const imu::Vector<3>& v) {
    Vector3f r;
    r.x = static_cast<float>(v.x());
    r.y = static_cast<float>(v.y());
    r.z = static_cast<float>(v.z());
    return r;
}

}  // namespace

Bno055Sensor::Bno055Sensor() : sensor_(55), initialized_(false) {
    snprintf(status_, sizeof(status_), "not_started");
}

bool Bno055Sensor::begin() {
    Wire.begin();

    if (!sensor_.begin()) {
        snprintf(status_, sizeof(status_), "begin_failed");
        initialized_ = false;
        return false;
    }

    // External 32 kHz crystal gives noticeably better fusion output.
    sensor_.setExtCrystalUse(true);
    initialized_ = true;
    snprintf(status_, sizeof(status_), "ready");
    return true;
}

bool Bno055Sensor::readSample(ImuSample& sample) {
    sample.timestampMs = millis();
    sample.valid = false;
    sample.gyroValid = false;

    if (!initialized_) {
        snprintf(status_, sizeof(status_), "not_initialized");
        return false;
    }

    // All three vectors come from the same BNO055 fusion engine and are
    // guaranteed to be time-coherent. linearAccel has gravity removed.
    sample.accel       = toVector3f(sensor_.getVector(Adafruit_BNO055::VECTOR_ACCELEROMETER));
    sample.linearAccel = toVector3f(sensor_.getVector(Adafruit_BNO055::VECTOR_LINEARACCEL));
    sample.gyro        = toVector3f(sensor_.getVector(Adafruit_BNO055::VECTOR_GYROSCOPE));
    sample.gyroValid   = true;
    sample.valid       = true;

    // Publish calibration bytes so the dashboard can warn users to wiggle the
    // device until fusion is stable.
    uint8_t system = 0, gyro = 0, accel = 0, mag = 0;
    sensor_.getCalibration(&system, &gyro, &accel, &mag);
    snprintf(status_, sizeof(status_), "sys:%u gyro:%u accel:%u mag:%u",
             static_cast<unsigned>(system),
             static_cast<unsigned>(gyro),
             static_cast<unsigned>(accel),
             static_cast<unsigned>(mag));

    return true;
}

bool Bno055Sensor::isGyroAvailable() const {
    return true;
}

const char* Bno055Sensor::getStatus() const {
    return status_;
}

}  // namespace app
