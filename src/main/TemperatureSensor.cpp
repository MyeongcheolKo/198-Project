#include "Constants.h"
#include "TemperatureSensor.h"
#include <Wire.h>
#include "Logger.h"

TemperatureSensor::TemperatureSensor(uint8_t address) {
  m_address = address;
  m_temp = 0;
}

void TemperatureSensor::update() {
  Wire.beginTransmission(m_address);
  Wire.write(Constants::TemperatureSensor::TEMP_OUT);
  Wire.requestFrom(m_address, (uint8_t)2);
  // m_temp = ~(Wire.read() << 8 | Wire.read()) * 0.00390625;
  m_temp = ~Wire.read();
  Wire.read();
  Wire.endTransmission();
}

void TemperatureSensor::display() {
  if (m_temp > Constants::TemperatureSensor::THRESHOLD) {
    Logger::display("Temp:", m_temp);
  }
}

void TemperatureSensor::logging() {
  if (m_temp > Constants::TemperatureSensor::THRESHOLD) {
    Logger::record(Constants::TemperatureSensor::TEMP_FIELD, m_temp);
  }
}
