#include "Constants.h"
#include "PulseOximeter.h"
#include "heartRate.h"
#include "spo2_algorithm.h"
#include <Wire.h>
#include "Logger.h"
#include <Firebase_ESP_Client.h>

PulseOximeter::PulseOximeter() {
  m_rateSpot = 0;
  m_lastBeat = 0;  //Time at which the last beat occurred
  m_beatsPerMinute = 0.0;
  m_beatAvg = 0;
  m_irValue = 0;

  // Initialize sensor
  if (!m_particleSensor.begin(Wire, I2C_SPEED_FAST))  //Use default I2C port, 400kHz speed
  {
    Serial.println("MAX30105 was not found. Please check wiring/power. ");
  }
  Serial.println("Place your index finger on the sensor with steady pressure.");

  m_particleSensor.setup();                     //Configure sensor with default settings
  m_particleSensor.setPulseAmplitudeRed(0x0A);  //Turn Red LED to low to indicate sensor is running
  m_particleSensor.setPulseAmplitudeGreen(0);   //Turn off Green LED
}

void PulseOximeter::update() {
  uint32_t irValue = m_particleSensor.getIR();
  m_irValue = m_irValue * Constants::PulseOximeter::WEIGHT + irValue * (1 - Constants::PulseOximeter::WEIGHT);

  if (checkForBeat(m_irValue) == true) {
    //We sensed a beat!
    long delta = millis() - m_lastBeat;
    m_lastBeat = millis();

    float beatsPerMinute = 60 / (delta / 1000.0);
    m_beatsPerMinute = m_beatsPerMinute * Constants::PulseOximeter::WEIGHT + beatsPerMinute * (1 - Constants::PulseOximeter::WEIGHT);

    if (m_beatsPerMinute < 255 && m_beatsPerMinute > 20) {
      m_rates[m_rateSpot++] = (uint8_t)m_beatsPerMinute;  //Store this reading in the array
      m_rateSpot %= Constants::PulseOximeter::RATE_SIZE;  //Wrap variable

      //Take average of readings
      m_beatAvg = 0;
      for (uint8_t x = 0; x < Constants::PulseOximeter::RATE_SIZE; x++)
        m_beatAvg += m_rates[x];
      m_beatAvg /= Constants::PulseOximeter::RATE_SIZE;
    }
  }
}

void PulseOximeter::display() {
  Logger::display("IR:", m_irValue);
  Logger::display("BPM:", m_beatsPerMinute);
  Logger::display("ABPM:", m_beatAvg);
}

void PulseOximeter::logging(FirebaseJson* json) {
  // if (m_irValue >= 50000) {
  Logger::record(json, Constants::PulseOximeter::IR_ID, m_irValue);
  Logger::record(json, Constants::PulseOximeter::BPM_ID, m_beatsPerMinute);
  Logger::record(json, Constants::PulseOximeter::AVG_BPM_ID, m_beatAvg);
  // }
}
