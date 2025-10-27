#include <Wire.h>

const int MPU_addr = 0x68;  // I2C address of the MPU-6050

void setup() {
  Serial.begin(38400);
  Wire.begin();
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x6B);  // PWR_MGMT_1 register
  Wire.write(0);     // Set to zero (wakes up the MPU-6050)
  Wire.endTransmission(true);
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
  Wire.endTransmission(true);
  Serial.print("AcX:");
  Serial.println(AcX);
  Serial.print("AcY:");
  Serial.println(AcY);
  Serial.print("AcZ:");
  Serial.println(AcZ);
  Serial.print("Tmp:");
  Serial.println(Tmp / 340.00 + 36.53);  // Convert to Celsius
  Serial.print("GyX:");
  Serial.println(GyX);
  Serial.print("GyY:");
  Serial.println(GyY);
  Serial.print("GyZ:");
  Serial.println(GyZ);
  delay(500);
}