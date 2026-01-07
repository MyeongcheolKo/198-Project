# Delirium Monitor

A real-time patient monitoring system that detects early signs of delirium using multi-sensor data analysis. The system combines wearable hardware with cloud-based analytics and a web dashboard for continuous risk assessment.

## Overview

Delirium is a serious medical condition characterized by sudden confusion and rapid changes in brain function. Early detection is critical for patient outcomes. This system monitors physiological signals—heart rate variability (HRV), blood oxygen saturation (SpO2), body temperature, and movement patterns—to calculate a real-time delirium risk score.

The project consists of three main components:

1. **Wearable Sensor Device** — ESP32-based hardware collecting data
2. **Cloud Backend** — Firestore for real-time data storage and synchronization
3. **Web Dashboard** — Browser-based monitoring interface with live visualizations

## Hardware Components

| Component | Model | Purpose |
|-----------|-------|---------|
| Microcontroller | ESP32-C6 | Main processing unit with WiFi connectivity |
| Accelerometer | MPU6050 | Movement and activity detection |
| Pulse Oximeter | MAX30105 | Heart rate and SpO2 measurement |
| Temperature Sensor | TMP102 | Body temperature monitoring |
| Display | SSD1306 OLED (128×64) | Local data display and status |
| Buzzer | Piezo | Audio alerts |

### Wiring

All sensors communicate via I2C on pins:
- **SDA**: GPIO 21
- **SCL**: GPIO 22
- **Button**: GPIO 2 (input with pull-up)
- **Buzzer**: GPIO 4

## Software Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   ESP32 Device      │────▶│  Firebase        │◀────│   Web Dashboard     │
│                     │     │  Firestore       │     │                     │
│ • Accelerometer     │     │                  │     │ • Real-time scores  │
│ • Pulse Oximeter    │     │  Collection:     │     │ • Risk visualization│
│ • Temperature       │     │  SensorData      │     │ • Event history     │
│ • OLED Display      │     │  ClusterModel    │     │ • Sensor readings   │
└─────────────────────┘     └──────────────────┘     └─────────────────────┘
```

## Data Flow

1. **Sampling** (50ms interval): Sensors are read and buffered
2. **Logging** (1000ms interval): Buffered data is sent to Firestore as array fields
3. **Dashboard** (real-time): Firestore listener receives updates, computes risk scores
4. **Visualization**: Chart updates with rolling 600-point history

## Device Controls

The wearable device has a single button for control:

| Action | Function |
|--------|----------|
| Short press | Pause/Resume data logging |
| Long press (1s) | Toggle real-time display mode |
| Short press (in real-time mode) | Cycle through sensor readings |

Real-time display modes show: Heart Rate → SpO2 → Acceleration → Temperature

## Risk Scoring Methods

The system supports three scoring algorithms, selectable from the dashboard:

### 1. Weighted Clinical Rules

Uses established clinical thresholds with weighted contributions:

| Signal | Weight | Risk Indicators |
|--------|--------|-----------------|
| HRV (RMSSD + SDNN) | 55% | Low variability indicates autonomic dysfunction |
| SpO2 | 25% | Values below 95% increase risk |
| Acceleration | 12% | Abnormal movement patterns |
| Temperature | 8% | Deviation from 37°C baseline |

### 2. ML-Based Clustering (K-Means)

Uses pre-trained cluster centroids stored in Firestore to classify physiological states. Features extracted include:
- Heart rate mean and HRV metrics (SDNN, RMSSD, pNN50)
- Acceleration statistics (mean, std, activity level)
- Temperature trends (mean, std, slope)

### 3. Blended Mode (Default)

Combines both methods with configurable weighting (default 50/50) for robust predictions that leverage both clinical knowledge and data-driven patterns.

## Risk Levels

| Score Range | Level | Indicator Color |
|-------------|-------|-----------------|
| 0.00 – 0.29 | Low | Green |
| 0.30 – 0.59 | Moderate | Yellow |
| 0.60 – 1.00 | High | Red |




## Acknowledgments

- SparkFun MAX30105 library for pulse oximetry algorithms
- Adafruit for display libraries
- Firebase for real-time infrastructure
