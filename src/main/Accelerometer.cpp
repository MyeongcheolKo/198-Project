#include "HardwareSerial.h"
#include <cmath>
#include "Constants.h"
#include "Accelerometer.h"
#include <Wire.h>
#include "Logger.h"
#include <Firebase_ESP_Client.h>

// File-scoped gravity estimate state (per-axis low-pass filter)
static float g_gravityX = 0.0f;
static float g_gravityY = 0.0f;
static float g_gravityZ = 0.0f;
static bool g_gravityInitialized = false;
static const float GRAVITY_ALPHA = 0.95f;  // Low-pass filter alpha (higher = slower update)

Accelerometer::Accelerometer(uint8_t address) {
  m_address = address;

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

  float AcX = (int16_t)(Wire.read() << 8 | Wire.read()) / 16384.0f * 9.8f;
  float AcY = (int16_t)(Wire.read() << 8 | Wire.read()) / 16384.0f * 9.8f;
  float AcZ = (int16_t)(Wire.read() << 8 | Wire.read()) / 16384.0f * 9.8f;

  // Initialize gravity to first reading
  if (!g_gravityInitialized) {
    g_gravityX = AcX;
    g_gravityY = AcY;
    g_gravityZ = AcZ;
    g_gravityInitialized = true;
  }

  // Update gravity estimate with low-pass filter
  g_gravityX = GRAVITY_ALPHA * g_gravityX + (1.0f - GRAVITY_ALPHA) * AcX;
  g_gravityY = GRAVITY_ALPHA * g_gravityY + (1.0f - GRAVITY_ALPHA) * AcY;
  g_gravityZ = GRAVITY_ALPHA * g_gravityZ + (1.0f - GRAVITY_ALPHA) * AcZ;

  // Linear acceleration = measured - gravity estimate
  float linX = AcX - g_gravityX;
  float linY = AcY - g_gravityY;
  float linZ = AcZ - g_gravityZ;

  // Magnitude of linear acceleration (device movement, gravity removed)
  float magnitude = std::sqrt(linX * linX + linY * linY + linZ * linZ);

  m_temp = Wire.read() << 8 | Wire.read();
  m_GyX = Wire.read() << 8 | Wire.read();
  m_GyY = Wire.read() << 8 | Wire.read();
  m_GyZ = Wire.read() << 8 | Wire.read();

  m_AcX = AcX;
  m_AcY = AcY;
  m_AcZ = AcZ;
  m_magnitude = magnitude;
}

void Accelerometer::display() {
  Logger::display("AcX:", m_AcX);
  Logger::display("AcY:", m_AcY);
  Logger::display("AcZ:", m_AcZ);
  Logger::display("magnitude:", m_magnitude);
  // Logger::display("Temp:", m_temp / 340.00 + 36.53);
  // Logger::display("GyX:", m_GyX);
  // Logger::display("GyY:", m_GyY);
  // Logger::display("GyZ:", m_GyZ);
}

void Accelerometer::logging(FirebaseJson* json) {
  Logger::record(json, Constants::Accelerometer::ACX_ID, m_AcX);
  Logger::record(json, Constants::Accelerometer::ACY_ID, m_AcY);
  Logger::record(json, Constants::Accelerometer::ACZ_ID, m_AcZ);
  Logger::record(json, Constants::Accelerometer::MAGNITUDE_ID, m_magnitude);
}

uint16_t Accelerometer::getMagnitude(){
  return m_magnitude;
}