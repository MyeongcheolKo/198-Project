#include <Wire.h>
#include "Logger.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>

Accelerometer *accelerometer;
TemperatureSensor *temperatureSensor;
PulseOximeter *pulseOximeter;
FirebaseJson *json;
Display *oled;

uint32_t lastTime{ 0 };


void setup() {
  Serial.begin(Constants::BAUD_RATE);
  Wire.begin(Constants::SDA, Constants::SCL);

  accelerometer = new Accelerometer(Constants::Accelerometer::ADDRESS);
  temperatureSensor = new TemperatureSensor(Constants::TemperatureSensor::ADDRESS);
  pulseOximeter = new PulseOximeter();

  oled = new Display(Constants::Display::SCREEN_ADDRESS, accelerometer, 
            temperatureSensor, pulseOximeter);

  if (Constants::LOGGING) {
    Logger::begin();
    json = Logger::getJson();
    lastTime = millis();
  }

  configTime(Constants::gmtOffset_sec, Constants::daylightOffset_sec, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return;
  }
  Serial.println("Time synchronized!");
}

void loop() {
  accelerometer->update();
  temperatureSensor->update();
  pulseOximeter->update();

  


  // if (Constants::SERIALDISPLAY) {
  //   pulseOximeter->display();
  //   accelerometer->display();
  //   temperatureSensor->display();
  // }

  if (Constants::LOGGING && oled->isRunning()) {
    uint32_t time{ millis() };
    if (time - lastTime > Constants::RECORDING_PERIOD) {
      accelerometer->logging(json);
      temperatureSensor->logging(json);
      pulseOximeter->logging(json);
      lastTime = time;
    }
    Logger::send(json);
  }

  oled->update();
}
