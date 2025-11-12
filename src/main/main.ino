#include "Constants.h"
#include "Accelerometer.h"
#include "TemperatureSensor.h"
#include "PulseOximeter.h"
#include <Wire.h>
#include "Logger.h"
#include <Firebase_ESP_Client.h>

Accelerometer *accelerometer;
TemperatureSensor *temperatureSensor;
PulseOximeter *pulseOximeter;
FirebaseJson *json;

uint32_t lastTime{ 0 };

void setup() {
  Serial.begin(Constants::BAUD_RATE);
  Wire.begin(Constants::SDA, Constants::SCL);

  accelerometer = new Accelerometer(Constants::Accelerometer::ADDRESS);
  temperatureSensor = new TemperatureSensor(Constants::TemperatureSensor::ADDRESS);
  pulseOximeter = new PulseOximeter();

  if (Constants::LOGGING) {
    Logger::begin();
    json = Logger::getJson();
    lastTime = millis();
  }
}

void loop() {
  accelerometer->update();
  temperatureSensor->update();
  pulseOximeter->update();

  if (Constants::SERIALDISPLAY) {
    accelerometer->display();
    temperatureSensor->display();
    pulseOximeter->display();
  }

  if (Constants::LOGGING) {
    uint32_t time{ millis() };
    if (time - lastTime > Constants::RECORDING_PERIOD) {
      accelerometer->logging(json);
      temperatureSensor->logging(json);
      pulseOximeter->logging(json);
      lastTime = time;
    }
    Logger::send(json);
  }
}
