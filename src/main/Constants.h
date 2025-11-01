#include <sys/_stdint.h>
#include <cstdint>

class Constants {
public:
  static const uint32_t BAUD_RATE{ 9600 };
  static const bool SERIALDISPLAY{ true };
  static const bool LOGGING{ false };

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

    static const uint16_t ACX_FIELD{ 1 };
    static const uint16_t ACY_FIELD{ 2 };
    static const uint16_t ACZ_FIELD{ 3 };
  };

  class TemperatureSensor {
  public:
    static const uint8_t ADDRESS{ 0x48 };
    static const uint8_t TEMP_OUT{ 0x00 };
    static const uint16_t THRESHOLD{ 30 };
    static const uint16_t TEMP_FIELD{ 4 };
  };

  class PulseOximeter {
  public:
    static const uint16_t RATE_SIZE = 4;  //Increase this for more averaging. 4 is good.
    static const uint16_t IR_FIELD{ 5 };
    static const uint16_t BPM_FIELD{ 6 };
    static const uint16_t AVG_BPM_FIELD{ 7 };
  };
};
