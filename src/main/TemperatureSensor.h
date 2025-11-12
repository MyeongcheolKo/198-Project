#include <cstdint>
#include <Firebase_ESP_Client.h>

class TemperatureSensor {
public:
  TemperatureSensor(uint8_t address);

  void update();

  void display();

  void logging(FirebaseJson* json);

private:
  uint8_t m_address;
  uint8_t m_temp;
};
