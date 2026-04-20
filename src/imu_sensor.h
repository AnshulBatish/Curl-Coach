#pragma once

// IMU abstraction. The rest of the pipeline only ever talks to the
// ImuSensor interface, so swapping to a different IMU later is a matter
// of adding a new concrete implementation and instantiating it in
// muscle_activation.cpp.

#include "Particle.h"
#include "types.h"
#include <Adafruit_BNO055_Photon.h>

namespace app {

class ImuSensor {
public:
    virtual ~ImuSensor() {}
    virtual bool begin() = 0;
    virtual bool readSample(ImuSample& sample) = 0;
    virtual bool isGyroAvailable() const = 0;
    // Human-readable status string. For BNO055 this encodes the fusion
    // calibration bytes so they can be streamed as part of error packets.
    virtual const char* getStatus() const = 0;
};

class Bno055Sensor : public ImuSensor {
public:
    Bno055Sensor();
    bool begin() override;
    bool readSample(ImuSample& sample) override;
    bool isGyroAvailable() const override;
    const char* getStatus() const override;

private:
    Adafruit_BNO055 sensor_;
    bool initialized_;
    char status_[64];
};

}  // namespace app
