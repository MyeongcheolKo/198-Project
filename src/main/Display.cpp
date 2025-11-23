#include "Display.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>

Display::Display(uint8_t address, Accelerometer* accel, 
            TemperatureSensor* temp, PulseOximeter* pulse){
    // allocate display object
    m_display = new Adafruit_SSD1306(Constants::Display::SCREEN_WIDTH, Constants::Display::SCREEN_HEIGHT, &Wire, -1);

    pinMode(Constants::Display::BUTTON_PIN, INPUT_PULLUP);
    pinMode(Constants::Display::BUZZER_PIN, OUTPUT);

    m_accelerometer = accel;
    m_tempSensor = temp;
    m_pulseOx = pulse;

    // Attempt to initialize the display. Wire is expected to be initialized by main.
    if (!m_display->begin(SSD1306_SWITCHCAPVCC, address))
    {
        Serial.println(F("SSD1306 allocation failed"));
        // fail silently; loop() can continue but display operations will be no-ops
    }

    m_display->clearDisplay();
    m_display->setTextSize(2);
    m_display->setTextColor(WHITE);
    m_display->setCursor(0, 0);
    m_display->println("Powered On");
    m_display->println("Connecting wifi...");

    m_display->display();
    Serial.println("powered on");
}

Display::~Display()
{
    if (m_display)
    {
        delete m_display;
        m_display = nullptr;
    }
}

void Display::displayRealtimeData()
{
    m_display->clearDisplay();
    m_display->setTextSize(2);
    m_display->setCursor(0, 0);

    switch (current_display)
    {
    case 0:
        m_display->println("Realtime");
        m_display->println("Data mode");
        break;

    case 1:
        m_display->println("Heart rate:");
        m_display->println(m_pulseOx->getHeartRate());
        // Serial.println(m_pulseOx->getHeartRate());
        break;
    case 2:
        m_display->println("SPO2:");
        m_display->println(m_pulseOx->getSPO2());
        // Serial.println(m_pulseOx->getSPO2());
        break;

    case 3:
        m_display->println("Net Accel:");
        m_display->println(m_accelerometer->getMagnitude());
        // Serial.println(m_accelerometer->getMagnitude());
        break;

    case 4:
        m_display->println("Temp:");
        m_display->println(m_tempSensor->getTemp());
        // Serial.println(m_tempSensor->getTemp());
        break;
    }

    m_display->display();
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

            if (m_display)
            {
                m_display->clearDisplay();
                m_display->setCursor(0, 0);

                if (realtime_mode)
                {
                    // Serial.println("Entered realtime mode");
                    current_display = 0;
                }
                else
                {
                    m_display->println("Realtime");
                    m_display->println("Mode OFF");
                    // Serial.println("Exited realtime mode");
                }

                m_display->display();
            }

            tone(Constants::Display::BUZZER_PIN, 440, 125);
            // Serial.println("----------");
        }
    }

    if (button == 1 && last_button == 0)
    {
        unsigned long press_duration = millis() - button_press_start;

        if (!long_press_triggered && press_duration > Constants::Display::BUTTON_DELAY && !realtime_mode)
        {
            stop_program = !stop_program;

            if (m_display)
            {
                m_display->clearDisplay();
                m_display->setCursor(0, 0);

                if (stop_program)
                {
                    m_display->println("Stopped");
                    // Serial.println("Stopped");
                }
                else
                {
                    m_display->println("Resumed");
                    // Serial.println("Resumed");
                }

                m_display->display();
            }

            tone(Constants::Display::BUZZER_PIN, 523, 250);
            // Serial.println("----------");
        }

        else if (!long_press_triggered && realtime_mode)
        {
            current_display++;
            if (current_display > 4)
            {
                current_display = 1;
            }
            tone(Constants::Display::BUZZER_PIN, 523, 250);
            // Serial.println(current_display);
        }
    }
    unsigned long now = millis();

    

    // Display realtime data if in realtime mode
    if (realtime_mode && button == 1)
    {
        displayRealtimeData();
    }
    //display time if programmed not stopped and not in realtime data mode
    else if (!stop_program && button == 1){
        // Only update once per second
        if (now - lastUpdate >= UPDATE_INTERVAL) {
            lastUpdate = now;

            struct tm timeinfo;
            if (getLocalTime(&timeinfo)) {
            strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
            }
            // Serial.println(timeStr);
            m_display->clearDisplay();
            m_display->setCursor(0, 0);
            m_display->println(timeStr);
            m_display->display();
        }
        
    }

    last_button = button;
}

