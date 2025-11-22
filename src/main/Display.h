#ifndef SRC_MAIN_DISPLAY_H
#define SRC_MAIN_DISPLAY_H

#include <cstdint>
#include <Adafruit_SSD1306.h>

class Display {
public:
    Display(uint8_t address);
    ~Display();
    void update();
    void displayRealtimeData();

private:
    int last_pressed_time{};
    bool stop_program{false};
    int last_button{1};
    bool realtime_mode{false};
    unsigned long button_press_start{0};
    bool long_press_triggered{false};
    int current_display{0};

    uint8_t address{0};
    Adafruit_SSD1306 *display{nullptr};
};

#endif // SRC_MAIN_DISPLAY_H