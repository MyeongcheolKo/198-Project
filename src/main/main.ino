#include "Constants.h"
#include "Accelerometer.h"
#include "TemperatureSensor.h"
#include "PulseOximeter.h"
#include <Wire.h>
#include <WiFi.h>
#include "Logger.h"

Accelerometer accelerometer(Constants::Accelerometer::ADDRESS);
TemperatureSensor temperatureSensor(Constants::TemperatureSensor::ADDRESS);
PulseOximeter pulseOximeter;
WiFiClient client;

void setup_wifi() {
  delay(10);
  // We start by connecting to a WiFi network
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
}

void setup() {
  Serial.begin(Constants::BAUD_RATE);
  Wire.begin(Constants::SDA, Constants::SCL);

  if (Constants::LOGGING) {
    setup_wifi();
    Logger::begin(client);
  }
}

void loop() {
  accelerometer.update();
  temperatureSensor.update();
  pulseOximeter.update();

  if (Constants::SERIALDISPLAY) {
    accelerometer.display();
    temperatureSensor.display();
    pulseOximeter.display();
  }

  if (Constants::LOGGING) {
    accelerometer.logging();
    temperatureSensor.logging();
    pulseOximeter.logging();
    Logger::send();
  }

  delay(100);
}