#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128 
#define SCREEN_HEIGHT 64 
#define SCREEN_ADDRESS 0x3D 
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

int last_pressed_time{};
bool stop_program{false};
int last_button{1};

const int button_pin{2};
const int led_pin{12};
const int button_delay{100};
const int buzzer_pin{4};

bool realtime_mode{false};
unsigned long button_press_start{0};
bool long_press_triggered{false};
const unsigned long LONG_PRESS_TIME = 1000;  // 1 second


void setup() {
  pinMode(button_pin, INPUT_PULLUP);
  pinMode(buzzer_pin, OUTPUT);
  Serial.begin(9600);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    while(1);
  }

  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(WHITE);
  display.setCursor(0, 10);
  display.println("Ready");
  display.display();
}

void loop() {
  int button = digitalRead(button_pin);

  // Button just pressed (falling edge)
  if(button == 0 && last_button == 1) {
    button_press_start = millis();
    long_press_triggered = false;
  }
  
  // Button is being held down - check for long press
  if(button == 0 && !long_press_triggered) {
    if(millis() - button_press_start >= LONG_PRESS_TIME) {
      // Long press detected - toggle realtime mode
      long_press_triggered = true;
      
      realtime_mode = !realtime_mode;
      
      display.clearDisplay();
      display.setCursor(0, 0);
      
      if(realtime_mode) {
        display.println("Realtime");
        display.println("Mode ON");
        Serial.println("Entered realtime mode");
      } else {
        display.println("Realtime");
        display.println("Mode OFF");
        Serial.println("Exited realtime mode");
      }
      
      display.display();
      
      // Double beep for long press
      tone(buzzer_pin, 440, 125);
      delay(125);
      tone(buzzer_pin, 440, 125);
      
      Serial.println("----------");
    }
  }
  
  // Button released (rising edge)
  if(button == 1 && last_button == 0) {
    unsigned long press_duration = millis() - button_press_start;
    
    // Short press only works in NORMAL mode (not realtime)
    if(!long_press_triggered && press_duration > button_delay && !realtime_mode) {
      stop_program = !stop_program;
      
      display.clearDisplay();
      display.setCursor(0, 0);
      
      if(stop_program) {
        display.println("Stopped");
        Serial.println("Stopped");
      } else {
        display.println("Resumed");
        Serial.println("Resumed");
      }
      
      display.display();
      tone(buzzer_pin, 523, 250);
      Serial.println("----------");
    }
    // If in realtime mode and short press, ignore it
    else if(!long_press_triggered && realtime_mode) {

      Serial.println("Short press ignored in realtime mode");
    }
  }
  
  // Display realtime data if in realtime mode
  if(realtime_mode && button == 1) {  // Only update when button not pressed
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("Realtime");
    display.setCursor(0, 20);
    display.print("Time:");
    display.println(millis() / 1000);
    display.display();
  }
  
  last_button = button;
}