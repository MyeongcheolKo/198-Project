# ML Pipeline: Firebase → CSV → Features → ML Models

Complete pipeline for converting raw sensor data from Firebase into engineered features and machine learning models.

## Files

**Data Processing:**
- `firestore_to_csv.js` — Export Firestore `SensorData` collection → CSV
- `feature_extraction.py` — Load JSON/CSV, slice into 5-min windows, compute HRV/accel/temp features

**Machine Learning:**
- `ml_example.py` — Example scripts for classification, regression, and clustering

**Reference:**
- `sample_data.json` — Example input format
- `requirements.txt` — Python + Node.js dependencies
- `README_FEATURES.md` — Detailed feature documentation

## Complete Pipeline: 3 Steps

### Step 1: Export Firestore → CSV

```bash
# Install Node.js dependencies (one-time)
npm install firebase-admin csv-writer

# Get your Firebase service account key:
#   1. Firebase Console > Project Settings > Service Accounts
#   2. Generate new private key
#   3. Save as firebase-admin-key.json in this folder

# Export Firestore to CSV
node firestore_to_csv.js --output=sensor_data.csv
```

This creates `sensor_data.csv` with columns like:
- `timestamp`, `ts`, `time` — Unix timestamp
- `hr`, `HR`, `bpm` — Heart rate
- `temp`, `Temp`, `temperature` — Temperature
- `ax`, `AcX`, `accel_x` — X acceleration
- `ay`, `AcY`, `accel_y` — Y acceleration  
- `az`, `AcZ`, `accel_z` — Z acceleration

### Step 2: Extract Features from CSV

```bash
# Install Python dependencies
python3 -m pip install -r requirements.txt

# Extract features (JSON or CSV input)
python3 feature_extraction.py sensor_data.csv --out features.npy --save-csv raw_extracted.csv
```

Outputs:
- **`features.npy`** — shape (n_windows, 10), ready for ML
- **`features_header.json`** — feature names
- **`features_windows.json`** — window timestamps & metadata
- **`raw_extracted.csv`** — (optional) normalized raw sensor data

### Step 3: Train ML Models

```bash
# Classification: high vs low activity
python3 ml_example.py --features features.npy --example classification

# Regression: predict HR from accel + temp
python3 ml_example.py --features features.npy --example regression

# Clustering: segment windows into activity patterns
python3 ml_example.py --features features.npy --example clustering
```

## Load & Use Features in Python

```python
import numpy as np
import json

# Load features
features = np.load('features.npy')
with open('features_header.json') as f:
    feature_names = json.load(f)

print(f"Shape: {features.shape}")  # (n_windows, 10)
print(f"Features: {feature_names}")

# Example: get HR feature column
hr_idx = feature_names.index('hr_mean_bpm')
hr_values = features[:, hr_idx]
print(f"Mean HR: {np.nanmean(hr_values):.1f} bpm")
```

## Data Format

### Input (Firestore JSON)

Each document in `SensorData` collection should contain:
- `timestamp` or `ts` — Unix timestamp (seconds or ms)
- `HR`, `hr`, or `bpm` — Heart rate in beats per minute
- `Temp`, `temp`, or `temperature` — Temperature in °C
- `AcX`, `acx`, or `accel_x` — X acceleration
- `AcY`, `acy`, or `accel_y` — Y acceleration
- `AcZ`, `acz`, or `accel_z` — Z acceleration

### Output Features (10 per window)

1. **HR Mean (bpm)** — Mean heart rate over 5-min window
2. **SDNN (ms)** — Standard deviation of RR intervals
3. **RMSSD (ms)** — Root mean square of successive RR differences
4. **pNN50 (%)** — Percent of RR intervals differing by >50ms
5. **Accel Mean Mag** — Mean acceleration magnitude
6. **Accel Std Mag** — Std dev of acceleration magnitude
7. **Accel Activity Frac** — Fraction of high-activity samples
8. **Temp Mean (°C)** — Mean temperature
9. **Temp Std (°C)** — Std dev of temperature
10. **Temp Slope (/min)** — Temperature trend per minute

## Notes

- Windows require at least 10 samples; skipped otherwise
- Missing data handled as NaN
- Timestamps normalized to seconds
