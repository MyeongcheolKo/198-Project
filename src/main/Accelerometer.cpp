#include "Constants.h"
#include "Accelerometer.h"
#include <Wire.h>
#include "Logger.h"
#include <Firebase_ESP_Client.h>

Accelerometer::Accelerometer(uint8_t address) {
  m_address = address;
  m_AcX = 0;
  m_AcY = 0;
  m_AcZ = 0;
  m_temp = 0;
  m_GyX = 0;
  m_GyY = 0;
  m_GyZ = 0;

  Wire.beginTransmission(m_address);
  Wire.write(Constants::Accelerometer::PWR_MGMT_1);
  Wire.write(0x0);
  Wire.endTransmission();
}

void Accelerometer::update() {
  Wire.beginTransmission(m_address);
  Wire.write(Constants::Accelerometer::ACCEL_XOUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom(m_address, (uint8_t)14);
  m_AcX = Wire.read() << 8 | Wire.read();
  m_AcY = Wire.read() << 8 | Wire.read();
  m_AcZ = Wire.read() << 8 | Wire.read();
  m_temp = Wire.read() << 8 | Wire.read();
  m_GyX = Wire.read() << 8 | Wire.read();
  m_GyY = Wire.read() << 8 | Wire.read();
  m_GyZ = Wire.read() << 8 | Wire.read();
}

void Accelerometer::display() {
  Logger::display("AcX:", m_AcX);
  Logger::display("AcY:", m_AcY);
  Logger::display("AcZ:", m_AcZ);
  // Logger::display("Temp:", m_temp / 340.00 + 36.53);
  // Logger::display("GyX:", m_GyX);
  // Logger::display("GyY:", m_GyY);
  // Logger::display("GyZ:", m_GyZ);
}

void Accelerometer::logging(FirebaseJson* json) {
  Logger::record(json, Constants::Accelerometer::ACX_ID, m_AcX);
  Logger::record(json, Constants::Accelerometer::ACY_ID, m_AcY);
  Logger::record(json, Constants::Accelerometer::ACZ_ID, m_AcZ);
}
