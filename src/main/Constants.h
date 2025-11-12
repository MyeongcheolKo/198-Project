#include <sys/_stdint.h>
#include <cstdint>

class Constants {
public:
  static const uint32_t BAUD_RATE{ 115200 };
  static const bool SERIALDISPLAY{ false };
  static const bool LOGGING{ true };
  static const uint16_t RECORDING_PERIOD{ 100 };
  static const uint16_t LOGGING_PERIOD{ 2000 };

  static const uint16_t SDA{ 21 };
  static const uint16_t SCL{ 22 };

  class Accelerometer {
  public:
    static const uint8_t ADDRESS{ 0x68 };
    static const uint8_t PWR_MGMT_1{ 0x6B };

    static const uint8_t ACCEL_XOUT_H{ 0x3B };
    static const uint8_t ACCEL_XOUT_L{ 0x3C };
    static const uint8_t ACCEL_YOUT_H{ 0x3D };
    static const uint8_t ACCEL_YOUT_L{ 0x3E };
    static const uint8_t ACCEL_ZOUT_H{ 0x3F };
    static const uint8_t ACCEL_ZOUT_L{ 0x40 };

    static constexpr const char *ACX_ID{ "fields/AcX/arrayValue/values" };
    static constexpr const char *ACY_ID{ "fields/AcY/arrayValue/values" };
    static constexpr const char *ACZ_ID{ "fields/AcZ/arrayValue/values" };
  };

  class TemperatureSensor {
  public:
    static const uint8_t ADDRESS{ 0x48 };
    static const uint8_t TEMP_OUT{ 0x00 };
    static const uint16_t THRESHOLD{ 30 };
    static constexpr const char *TEMP_ID{ "fields/Temp/arrayValue/values" };
  };

  class PulseOximeter {
  public:
    static const uint16_t RATE_SIZE{ 4 };  //Increase this for more averaging. 4 is good.
    static constexpr float WEIGHT{ 0.9 };
    static constexpr const char *IR_ID{ "fields/IR/arrayValue/values" };
    static constexpr const char *BPM_ID{ "fields/BPM/arrayValue/values" };
    static constexpr const char *AVG_BPM_ID{ "fields/ABPM/arrayValue/values" };
  };
};
