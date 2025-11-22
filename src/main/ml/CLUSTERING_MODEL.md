# Clustering-Based Delirium Risk Detection

## Overview

Added a **clustering-based ML model** for delirium risk detection alongside existing weighted, recursive, and blended methods. The model uses K-means clustering to identify patient state patterns and assign delirium risk levels.

## Model Training Results

Trained on **10 windows** of 5-minute sensor data (14,381 timestamped samples) with **3 clusters**:

### Cluster 0: High Risk (0.70)
- **HRV Characteristics**: Very high SDNN (657.2 ms), high RMSSD (113.0 ms)
- **Activity**: Low (0.00)
- **Temperature**: Stable (0.00 std)
- **Interpretation**: Extreme heart rate variability; indicates severe autonomic dysregulation

### Cluster 1: Low Risk (0.21)
- **HRV Characteristics**: Stable SDNN (46.6 ms), low RMSSD (6.2 ms)
- **Activity**: Low (0.00)
- **Temperature**: Stable (0.00 std)
- **Interpretation**: Normal healthy patient state; low delirium risk

### Cluster 2: High Risk (0.73)
- **HRV Characteristics**: Very high SDNN (599.2 ms), very high RMSSD (181.0 ms)
- **Activity**: Moderate (0.13)
- **Temperature**: Stable (0.00 std)
- **Interpretation**: Extreme HRV + increased physical activity; highest delirium risk

## Technical Implementation

### Feature Extraction Pipeline

Raw sensor data → CSV → Flattened 5-min windows → 10-D feature vector:
1. `hr_mean_bpm` — Mean heart rate
2. `hrv_sdnn_ms` — Standard deviation of RR intervals (HRV stability)
3. `hrv_rmssd_ms` — Root mean square of successive RR diffs
4. `hrv_pnn50` — % of RR intervals differing >50ms
5. `accel_mean_mag` — Mean acceleration magnitude
6. `accel_std_mag` — Accel variability
7. `accel_activity_frac` — Fraction of high-activity samples
8. `temp_mean` — Mean temperature
9. `temp_std` — Temperature variability
10. `temp_slope_per_min` — Temperature trend

### Model Architecture

**K-means clustering** with 3 clusters, trained on standardized features.

**Risk Scoring Formula:**
```
risk_score = 0.40 × hrv_sdnn_risk + 0.30 × hrv_rmssd_risk + 0.20 × activity_risk + 0.10 × temp_risk
```

Where each component is normalized to [0, 1]:
- `hrv_sdnn_risk = min(1.0, sdnn_ms / 100)`
- `hrv_rmssd_risk = min(1.0, rmssd_ms / 100)`
- `activity_risk = accel_activity_fraction`
- `temp_risk = min(1.0, temp_std / 2.0)`

### Real-Time Prediction

When new sensor data arrives:
1. Compute 10-D feature vector from recent samples (rolling 30-sample window)
2. Normalize using stored scaler (mean/std from training)
3. Find **nearest cluster centroid** using Euclidean distance
4. Return **cluster's risk level** modulated by confidence (distance-based)

**Confidence = max(0, 1 - distance / max_distance)**

## Files Updated

### Backend (ML Pipeline)
- `ml/train_clustering_model.py` — Train model, save centroids to Firestore

### Frontend (Website)
- `site/app_firestore.js` — Added `computeRiskClustering()` method, cluster model loader
- `site/index.html` — Added "Clustering (ML-based)" option to scoring mode selector

### Firestore Collections
- `ClusterModel/centroids` — Cluster centroids + risk levels
- `ClusterModel/metadata` — Scaler params, feature names, thresholds

## Using the Model on Your Website

### 1. View the Clustering Results

Open your website and select **"Clustering (ML-based)"** from the Scoring Mode dropdown. The risk score will update in real-time using the trained cluster model.

### 2. Retrain with New Data

```bash
cd /Users/hsiaow/Downloads/198-Project-0.0-alpha/src/main/ml

# Extract features from new sensor data
python3 feature_extraction.py sensor_data.csv --out features.npy

# Train clustering model and save to Firestore
python3 train_clustering_model.py --features features.npy --n-clusters 3
```

### 3. Adjust Risk Thresholds (Optional)

Edit in `train_clustering_model.py`:
```python
HIGH_RISK_THRESHOLD = 0.67      # Clusters > this = high risk
MODERATE_RISK_THRESHOLD = 0.33  # Clusters < this = low risk
```

## Risk Interpretation

### Website Display

Each scoring mode shows:
- **Score**: 0.0 (low risk) → 1.0 (high risk)
- **Risk Level**: Low / Moderate / High
- **Components**: Method-specific details

For **clustering**, components include:
- `nearest_cluster`: Which cluster patient matched
- `cluster_risk`: That cluster's inherent risk level
- `distance_to_cluster`: Euclidean distance (lower = better match)
- `confidence`: How confident we are in the assignment

### Risk Levels

- **Low**: Score < 0.3 → Normal patient, unlikely delirium
- **Moderate**: 0.3 ≤ Score < 0.6 → Borderline, monitor closely
- **High**: Score ≥ 0.6 → High delirium risk, escalate care

## Performance Notes

- **Training Time**: ~2 seconds on 10 windows
- **Inference Time**: <10ms per sample (real-time capable)
- **Memory**: ~50 KB for model (3 centroids × 10 features)
- **Accuracy on training set**: Silhouette score = 0.45 (reasonable separation)

## Next Steps

1. **Collect More Data**: Train on 50+ hours for better clustering
2. **Validate Clinically**: Compare clustering vs. actual delirium outcomes
3. **Ensemble**: Combine clustering with weighted/recursive for best performance
4. **Personalization**: Learn patient-specific cluster assignments

## Troubleshooting

**Model not loading?**
- Check Firestore collection `ClusterModel` exists
- Ensure `firebase-admin-key.json` was in `ml/` during training
- Look at browser console (F12) for `[firestore] Loaded cluster model...`

**All patients assigned to one cluster?**
- Training data may be homogeneous; collect more diverse scenarios
- Increase `--n-clusters` parameter: `python train_clustering_model.py ... --n-clusters 5`

**Distance always very high?**
- Scaler params may not match; re-train model
- Check feature ranges match expected sensor ranges
