#ifndef SRC_MAIN_CONSTANTS_H
#define SRC_MAIN_CONSTANTS_H

#include <sys/_stdint.h>
#include <cstdint>

class Constants
{
public:
  static const uint32_t BAUD_RATE{115200};
  static const bool SERIALDISPLAY{true};
  static const bool LOGGING{true};
  static const uint16_t RECORDING_PERIOD{50};
  static const uint16_t LOGGING_PERIOD{1000};

  static const uint16_t SDA{21};
  static const uint16_t SCL{22};

  static const long gmtOffset_sec = -5 * 3600;
  static const int daylightOffset_sec = 0;

  class Accelerometer
  {
  public:
    static const uint8_t ADDRESS{0x68};
    static const uint8_t PWR_MGMT_1{0x6B};

    static const uint8_t ACCEL_XOUT_H{0x3B};
    static const uint8_t ACCEL_XOUT_L{0x3C};
    static const uint8_t ACCEL_YOUT_H{0x3D};
    static const uint8_t ACCEL_YOUT_L{0x3E};
    static const uint8_t ACCEL_ZOUT_H{0x3F};
    static const uint8_t ACCEL_ZOUT_L{0x40};

    static constexpr const char *ACX_ID{"fields/AcX/arrayValue/values"};
    static constexpr const char *ACY_ID{"fields/AcY/arrayValue/values"};
    static constexpr const char *ACZ_ID{"fields/AcZ/arrayValue/values"};
    static constexpr const char *MAGNITUDE_ID{"fields/Magnitude/arrayValue/values"};
  };

  class TemperatureSensor
  {
  public:
    static const uint8_t ADDRESS{0x48};
    static const uint8_t TEMP_OUT{0x00};
    static const uint16_t THRESHOLD{30};
    static constexpr const char *TEMP_ID{"fields/Temp/arrayValue/values"};
  };

  class PulseOximeter
  {
  public:
    static const int8_t POWER_LEVEL = 60;
    static const int8_t SAMPLE_AVERAGE = 4;
    static const int8_t LED_MODE = 2;
    static const int SAMPLE_RATE = 100;
    static const int PULSE_WIDTH = 411;
    static const int ADC_RANGE = 4096;
    static const uint32_t BUFFER_LENGTH{100};
    static const uint32_t WINDOW_LENGTH{BUFFER_LENGTH / 4};
    static constexpr const char *HR_ID{"fields/HR/arrayValue/values"};
    static constexpr const char *SPO2_ID{"fields/SPO2/arrayValue/values"};
  };

  class Display
  {
  public:
    static const int SCREEN_WIDTH{128};
    static const int SCREEN_HEIGHT{64};
    static const int SCREEN_ADDRESS{0x3C};
    static const int BUTTON_PIN{2};
    static const int LED_PIN{12};
    static const int BUZZER_PIN{4};
    static const int BUTTON_DELAY{100};
    static const unsigned long LONG_PRESS_TIME = 1000;
  };
};

#endif // SRC_MAIN_CONSTANTS_H
