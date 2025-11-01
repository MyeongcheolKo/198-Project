#include "HardwareSerial.h"
#include <WiFi.h>
#include "ThingSpeak.h"

static const char *ssid = "Galaxy S10+6d6f";
static const char *password = "mqre3324";
static const uint8_t CHANNEL = 1;
static const char *WRITEKEY = "S21RHR0DGZIX3KXF";

class Logger {
public:
  static void begin(WiFiClient client) {
    ThingSpeak.begin(client);
  }
  static void display(const char str[]) {
    Serial.println(str);
  }
  static void display(const char str[], auto data) {
    Serial.print(str);
    Serial.println(data);
  }
  static void record(uint16_t field, auto data) {
    ThingSpeak.setField(field, data);
  }
  static void send() {
    ThingSpeak.writeFields(CHANNEL, WRITEKEY);
  }
};
