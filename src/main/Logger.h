#include "HardwareSerial.h"
#include <string>
#include "esp32-hal.h"
#include <sys/stat.h>
#include <sys/_stdint.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>

#define WIFI_SSID "WMenglin2025UWaterloo"
#define WIFI_PASSWORD "20070124Double!"

#define API_KEY "AIzaSyAz-ZVd--bf83eo1OcUALI4KtXt_kXKCPQ"
#define PROJECT_ID "ece198-d2f99"

#define USER_EMAIL "m636wang@uwaterloo.ca"
#define USER_PASS "20070124Double!"

#define PATH "SensorData"

static FirebaseConfig firebaseConfig;
static FirebaseAuth firebaseAuth;
static FirebaseData fbdo;
static FirebaseJson content;

class Logger {
private:
  inline static uint32_t m_lastTime{ 0 };
  inline static uint32_t m_index{ 0 };
public:
  static void begin() {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to Wi-Fi...");
    while (WiFi.status() != WL_CONNECTED) {
      Serial.print(".");
      delay(1000);
    }
    Serial.println("\nConnected to Wi-Fi.");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    firebaseConfig.api_key = API_KEY;
    firebaseAuth.user.email = USER_EMAIL;
    firebaseAuth.user.password = USER_PASS;

    Firebase.begin(&firebaseConfig, &firebaseAuth);
    Firebase.reconnectWiFi(true);
    Logger::m_lastTime = millis();

    Serial.println("Firebase Client Initialized.");
  }
  static FirebaseJson* getJson() {
    return &content;
  }
  static void record(FirebaseJson* content, const char id[], auto data) {
    if (Firebase.ready()) {
      content->set((std::string(id) + "/[" + std::to_string(Logger::m_index) + "]/stringValue").c_str(), std::to_string(data).c_str());
    } else {
      Serial.println("Firebase is not ready.");
    }
  }
  static void send(FirebaseJson* content) {
    uint32_t time{ millis() };
    Logger::m_index++;
    if (time - Logger::m_lastTime >= Constants::LOGGING_PERIOD) {
      if (Firebase.Firestore.createDocument(&fbdo, PROJECT_ID, "", PATH, std::to_string(~time).c_str(), content->raw(), "")) {
        Logger::m_lastTime = time;
        content->clear();
        Logger::m_index = 0;
        Serial.println("Data Sent Successfully");
      } else {
        Serial.println(fbdo.errorReason());
      }
    }
  }
  static void display(const char str[]) {
    Serial.println(str);
  }
  static void display(const char str[], auto data) {
    Serial.print(str);
    Serial.println(data);
  }
};
