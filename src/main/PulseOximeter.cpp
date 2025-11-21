#include "esp32-hal.h"
#include "HardwareSerial.h"
#include "Constants.h"
#include "PulseOximeter.h"
#include "spo2_algorithm.h"
#include "heartRate.h"
#include <Wire.h>
#include "Logger.h"
#include <Firebase_ESP_Client.h>

PulseOximeter::PulseOximeter() {
  // Initialize sensor
  if (!m_particleSensor.begin(Wire, I2C_SPEED_FAST))  //Use default I2C port, 400kHz speed
  {
    Serial.println("MAX30105 was not found. Please check wiring/power. ");
  }

  // Configure sensor
  m_particleSensor.setup(
    Constants::PulseOximeter::POWER_LEVEL,
    Constants::PulseOximeter::SAMPLE_AVERAGE,
    Constants::PulseOximeter::LED_MODE,
    Constants::PulseOximeter::SAMPLE_RATE,
    Constants::PulseOximeter::PULSE_WIDTH,
    Constants::PulseOximeter::ADC_RANGE);
  m_startUp = true;
}

void PulseOximeter::update() {
  if (m_startUp) {
    //read the first 100 samples, and determine the signal range
    for (uint32_t i{ 0 }; i < Constants::PulseOximeter::BUFFER_LENGTH; i++) {
      m_particleSensor.check();
      if (m_particleSensor.available()) {
        m_redBuffer[i] = m_particleSensor.getRed();
        m_irBuffer[i] = m_particleSensor.getIR();
        m_particleSensor.nextSample();  //We're finished with this sample so move to next sample
      }
    }

    //calculate heart rate and SpO2 after first 100 samples (first 4 seconds of samples)
    maxim_heart_rate_and_oxygen_saturation(m_irBuffer, Constants::PulseOximeter::BUFFER_LENGTH, m_redBuffer, &m_spo2, &m_validSPO2, &m_heartRate, &m_validHeartRate);
    m_startUp = false;
  }

  //dumping the first sets of samples in the memory and shift the last sets of samples to the top
  for (uint32_t i{ Constants::PulseOximeter::WINDOW_LENGTH }; i < Constants::PulseOximeter::BUFFER_LENGTH; i++) {
    m_redBuffer[i - Constants::PulseOximeter::WINDOW_LENGTH] = m_redBuffer[i];
    m_irBuffer[i - Constants::PulseOximeter::WINDOW_LENGTH] = m_irBuffer[i];
  }

  //take 25 sets of samples before calculating the heart rate.
  for (uint32_t i{ Constants::PulseOximeter::BUFFER_LENGTH - Constants::PulseOximeter::WINDOW_LENGTH }; i < Constants::PulseOximeter::BUFFER_LENGTH; i++) {
    m_particleSensor.check();
    if (m_particleSensor.available()) {
      m_redBuffer[i] = m_particleSensor.getRed();
      m_irBuffer[i] = m_particleSensor.getIR();
      m_particleSensor.nextSample();  //We're finished with this sample so move to next sample
    }
  }

  //After gathering 25 new samples recalculate HR and SP02
  maxim_heart_rate_and_oxygen_saturation(m_irBuffer, Constants::PulseOximeter::BUFFER_LENGTH, m_redBuffer, &m_spo2, &m_validSPO2, &m_heartRate, &m_validHeartRate);
  m_heartRate /= 2;
}

void PulseOximeter::display() {
  //send samples and calculation result to terminal program through UART
  for (uint32_t i{ Constants::PulseOximeter::BUFFER_LENGTH - Constants::PulseOximeter::WINDOW_LENGTH }; i < Constants::PulseOximeter::BUFFER_LENGTH; i++) {
    Logger::display("red:", m_redBuffer[i]);
    Logger::display("ir:", m_irBuffer[i]);
  }
  Logger::display("HR:", m_heartRate);
  Logger::display("SPO2:", m_spo2);
}

void PulseOximeter::logging(FirebaseJson* json) {
  if (m_validHeartRate) {
    Logger::record(json, Constants::PulseOximeter::HR_ID, m_heartRate);
  }
  if (m_validSPO2) {
    Logger::record(json, Constants::PulseOximeter::SPO2_ID, m_spo2);
  }
}
