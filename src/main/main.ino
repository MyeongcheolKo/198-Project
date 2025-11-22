#include "Constants.h"
#include "Accelerometer.h"
#include "TemperatureSensor.h"
#include "PulseOximeter.h"
#include "Display.h"
#include <Wire.h>
#include "Logger.h"
#include <Firebase_ESP_Client.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Accelerometer *accelerometer;
TemperatureSensor *temperatureSensor;
PulseOximeter *pulseOximeter;
FirebaseJson *json;
Display *display;

uint32_t lastTime{ 0 };

void setup() {
  Serial.begin(Constants::BAUD_RATE);
  Wire.begin(Constants::SDA, Constants::SCL);

  accelerometer = new Accelerometer(Constants::Accelerometer::ADDRESS);
  temperatureSensor = new TemperatureSensor(Constants::TemperatureSensor::ADDRESS);
  pulseOximeter = new PulseOximeter();

  display = new Display(Constants::Display::SCREEN_ADDRESS);

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

  if (display) {
    display->update();
  }
}
