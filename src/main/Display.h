#ifndef SRC_MAIN_DISPLAY_H
#define SRC_MAIN_DISPLAY_H

#include <cstdint>
#include <Adafruit_SSD1306.h>
#include "Constants.h"
#include "Accelerometer.h"
#include "PulseOximeter.h"
#include "TemperatureSensor.h"

class Display {
public:
  Display(uint8_t address, Accelerometer* accel,
          TemperatureSensor* temp, PulseOximeter* pulse);
  ~Display();
  void update();
  void displayRealtimeData();

private:
  int last_pressed_time{};
  bool stop_program{ false };
  int last_button{ 1 };
  bool realtime_mode{ false };
  unsigned long button_press_start{ 0 };
  bool long_press_triggered{ false };
  int current_display{ 0 };

  uint8_t address{ 0 };
  Adafruit_SSD1306* m_display{ nullptr };
  Accelerometer* m_accelerometer;
  TemperatureSensor* m_tempSensor;
  PulseOximeter* m_pulseOx;

char timeStr[10];
  unsigned long lastUpdate = 0;
  const unsigned long UPDATE_INTERVAL = 1000;

};

#endif  // SRC_MAIN_DISPLAY_H