#include <Wire.h>
#include <WiFi.h>
#include "ThingSpeak.h"

const bool enable_IoT = true;
const int MPU_addr = 0x68;   // I2C address of the MPU-6050
const int TEMP_addr = 0x48;  // I2C address of the MAX30205(TEMP)

// WIFI Connection
const char* ssid = "Galaxy S10+6d6f";  //Keep your own SSID here
const char* password = "mqre3324";     //Your WIFI's password
unsigned long monitorChannel = 1;
const char* channelWriteKey = "S21RHR0DGZIX3KXF";
WiFiClient espClient;

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
  Serial.begin(9600);
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x6B);  // PWR_MGMT_1 register
  Wire.write(0);     // Set to zero (wakes up the MPU-6050)
  Wire.endTransmission(true);

  if (enable_IoT) {
    setup_wifi();
    ThingSpeak.begin(espClient);  // Initialize ThingSpeak
  }
}

void loop() {
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x3B);  // Starting with register 0x3B (ACCEL_XOUT_H)
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_addr, 14, true);  // Request a total of 14 registers
  int16_t AcX = Wire.read() << 8 | Wire.read();
  int16_t AcY = Wire.read() << 8 | Wire.read();
  int16_t AcZ = Wire.read() << 8 | Wire.read();
  int16_t Tmp = Wire.read() << 8 | Wire.read();
  int16_t GyX = Wire.read() << 8 | Wire.read();
  int16_t GyY = Wire.read() << 8 | Wire.read();
  int16_t GyZ = Wire.read() << 8 | Wire.read();
  Wire.endTransmission();

  Serial.print("AcX:");
  Serial.println(AcX);
  Serial.print("AcY:");
  Serial.println(AcY);
  Serial.print("AcZ:");
  Serial.println(AcZ);
  // Serial.print("Tmp:");
  // Serial.println(Tmp / 340.00 + 36.53);  // Convert to Celsius
  Serial.print("GyX:");
  Serial.println(GyX);
  Serial.print("GyY:");
  Serial.println(GyY);
  Serial.print("GyZ:");
  Serial.println(GyZ);

  Wire.beginTransmission(TEMP_addr);
  Wire.write(0x00);
  Wire.requestFrom(TEMP_addr, 2);
  // uint16_t temp = ~(Wire.read() << 8 | Wire.read()) * 0.00390625;
  uint8_t temp = ~Wire.read();
  Wire.read();
  Wire.endTransmission();

  if (temp > 30) {
    Serial.print("Temp:");
    Serial.println(temp);
  }

  if (enable_IoT) {
    // define the fields with their relative sensor data reading
    ThingSpeak.setField(1, AcX);
    ThingSpeak.setField(2, AcY);
    ThingSpeak.setField(3, AcZ);
    if (temp > 30) {
      ThingSpeak.setField(4, temp);
    }
    ThingSpeak.writeFields(monitorChannel, channelWriteKey);
  }

  delay(100);
}