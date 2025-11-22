#include "Display.h"
#include "Constants.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>

Display::Display(uint8_t address_) : address(address_)
{
    // allocate display object
    display = new Adafruit_SSD1306(Constants::Display::SCREEN_WIDTH, Constants::Display::SCREEN_HEIGHT, &Wire, -1);

    pinMode(Constants::Display::BUTTON_PIN, INPUT_PULLUP);
    pinMode(Constants::Display::BUZZER_PIN, OUTPUT);

    // Attempt to initialize the display. Wire is expected to be initialized by main.
    if (!display->begin(SSD1306_SWITCHCAPVCC, address))
    {
        Serial.println(F("SSD1306 allocation failed"));
        // fail silently; loop() can continue but display operations will be no-ops
    }

    display->clearDisplay();
    display->setTextSize(2);
    display->setTextColor(WHITE);
    display->setCursor(0, 0);
    display->println("Powered On");
    display->display();
}

Display::~Display()
{
    if (display)
    {
        delete display;
        display = nullptr;
    }
}

void Display::displayRealtimeData()
{
    if (!display)
        return;

    display->clearDisplay();
    display->setTextSize(2);
    display->setCursor(0, 0);

    switch (current_display)
    {
    case 0:
        display->println("Realtime");
        display->println("Data mode");
        break;

    case 1:
        display->println("Heart rate:");
        break;

    case 2:
        display->println("SPO2:");
        break;

    case 3:
        display->println("Net Accel:");
        break;

    case 4:
        display->println("Temp:");
        break;
    }

    display->display();
}

void Display::update()
{
    int button = digitalRead(Constants::Display::BUTTON_PIN);

    if (button == 0 && last_button == 1)
    {
        button_press_start = millis();
        long_press_triggered = false;
    }

    if (button == 0 && !long_press_triggered)
    {
        if (millis() - button_press_start >= Constants::Display::LONG_PRESS_TIME)
        {
            // Long press detected - toggle realtime mode
            long_press_triggered = true;

            realtime_mode = !realtime_mode;

            if (display)
            {
                display->clearDisplay();
                display->setCursor(0, 0);

                if (realtime_mode)
                {
                    Serial.println("Entered realtime mode");
                    current_display = 0;
                }
                else
                {
                    display->println("Realtime");
                    display->println("Mode OFF");
                    Serial.println("Exited realtime mode");
                }

                display->display();
            }

            tone(Constants::Display::BUZZER_PIN, 440, 125);
            Serial.println("----------");
        }
    }

    if (button == 1 && last_button == 0)
    {
        unsigned long press_duration = millis() - button_press_start;

        if (!long_press_triggered && press_duration > Constants::Display::BUTTON_DELAY && !realtime_mode)
        {
            stop_program = !stop_program;

            if (display)
            {
                display->clearDisplay();
                display->setCursor(0, 0);

                if (stop_program)
                {
                    display->println("Stopped");
                    Serial.println("Stopped");
                }
                else
                {
                    display->println("Resumed");
                    Serial.println("Resumed");
                }

                display->display();
            }

            tone(Constants::Display::BUZZER_PIN, 523, 250);
            Serial.println("----------");
        }

        else if (!long_press_triggered && realtime_mode)
        {
            current_display++;
            if (current_display > 4)
            {
                current_display = 1;
            }
            tone(Constants::Display::BUZZER_PIN, 523, 250);
            Serial.println(current_display);
        }
    }

    // Display realtime data if in realtime mode
    if (realtime_mode && button == 1)
    {
        displayRealtimeData();
    }

    last_button = button;
}
