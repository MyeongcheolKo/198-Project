#include <cstdint>

class TemperatureSensor {
public:
  TemperatureSensor(uint8_t address);

  void update();

  void display();

  void logging();

private:
  uint8_t m_address;
  uint8_t m_temp;
};
