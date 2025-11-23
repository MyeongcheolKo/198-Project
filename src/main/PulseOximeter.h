#ifndef SRC_MAIN_PULSEOXIMETER_H
#define SRC_MAIN_PULSEOXIMETER_H

#include <sys/_stdint.h>
#include "MAX30105.h"
#include <cstdint>
#include <Firebase_ESP_Client.h>

class PulseOximeter
{
public:
  PulseOximeter();

  void update();

  void display();

  void logging(FirebaseJson *json);

  uint8_t getHeartRate();

  uint8_t getSPO2();

private:
  MAX30105 m_particleSensor;
  uint32_t m_irBuffer[100];  // infrared LED sensor data
  uint32_t m_redBuffer[100]; // red LED sensor data
  int32_t m_spo2;            // SPO2 value
  int8_t m_validSPO2;        // indicator to show if the SPO2 calculation is valid
  int32_t m_heartRate;       // heart rate value
  int8_t m_validHeartRate;   // indicator to show if the heart rate calculation is valid
  bool m_startUp;
};

#endif // SRC_MAIN_PULSEOXIMETER_H
