#include <sys/_stdint.h>
#include "MAX30105.h"
#include <cstdint>
#include <Firebase_ESP_Client.h>

class PulseOximeter {
public:
  PulseOximeter();

  void update();

  void display();

  void logging(FirebaseJson* json);

private:
  MAX30105 m_particleSensor;
  uint8_t m_rates[Constants::PulseOximeter::RATE_SIZE]{};  //Array of heart rates
  uint8_t m_rateSpot;
  uint32_t m_lastBeat;  //Time at which the last beat occurred
  float m_beatsPerMinute;
  uint8_t m_beatAvg;
  uint32_t m_irValue;
};
