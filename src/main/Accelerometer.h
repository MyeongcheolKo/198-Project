#ifndef SRC_MAIN_ACCELEROMETER_H
#define SRC_MAIN_ACCELEROMETER_H

#include <cstdint>
#include <Firebase_ESP_Client.h>

class Accelerometer
{
public:
  Accelerometer(uint8_t address);

  void update();

  void display();

  void logging(FirebaseJson *json);

  uint16_t getMagnitude();

private:
  uint8_t m_address;
  int16_t m_AcX;
  int16_t m_AcY;
  int16_t m_AcZ;
  int16_t m_magnitude;
  int16_t m_temp;
  int16_t m_GyX;
  int16_t m_GyY;
  int16_t m_GyZ;
};

#endif // SRC_MAIN_ACCELEROMETER_H
