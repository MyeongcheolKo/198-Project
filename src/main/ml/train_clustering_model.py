#!/usr/bin/env python3
"""
train_clustering_model.py

Train a clustering model on features.npy to detect delirium risk patterns.
Saves cluster centroids and risk levels to Firestore for use on the website.

Usage:
  python3 train_clustering_model.py --features features.npy --n-clusters 3

Outputs to Firestore collection: ClusterModel
- Document 'centroids': cluster centers and their associated delirium risk levels
- Document 'metadata': training info

"""

import argparse
import json
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import firebase_admin
from firebase_admin import credentials, firestore

# Configuration
DEFAULT_N_CLUSTERS = 3
HIGH_RISK_THRESHOLD = 0.67  # Clusters above this are "high risk"
MODERATE_RISK_THRESHOLD = 0.33  # Clusters below this are "low risk"


def load_features(features_path):
    """Load features from .npy file."""
    features = np.load(features_path)
    print(f"Loaded features: shape {features.shape}")
    return features


def train_clustering_model(features, n_clusters=DEFAULT_N_CLUSTERS):
    """Train K-means clustering model."""
    print(f"\nTraining K-means clustering with {n_clusters} clusters...")
    
    # Remove NaN rows
    mask = ~np.isnan(features).any(axis=1)
    X = features[mask]
    
    if X.shape[0] < n_clusters:
        print(f"⚠️  Only {X.shape[0]} valid samples, using {min(X.shape[0], n_clusters)} clusters")
        n_clusters = min(X.shape[0], n_clusters)
    
    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Train clustering
    kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    labels = kmeans.fit_predict(X_scaled)
    
    print(f"✓ Trained model with {n_clusters} clusters")
    print(f"  Cluster distribution: {np.bincount(labels)}")
    print(f"  Inertia: {kmeans.inertia_:.2f}")
    
    # Compute risk level for each cluster based on HRV and activity
    # Clusters with high HRV variance and activity = high delirium risk
    risk_levels = compute_cluster_risk_levels(X, labels, n_clusters)
    
    return {
        'kmeans': kmeans,
        'scaler': scaler,
        'centroids': kmeans.cluster_centers_,
        'labels': labels,
        'risk_levels': risk_levels,
        'n_clusters': n_clusters,
        'scaler_mean': scaler.mean_.tolist(),
        'scaler_scale': scaler.scale_.tolist(),
    }


def compute_cluster_risk_levels(X, labels, n_clusters):
    """
    Compute delirium risk level for each cluster.
    
    Risk factors:
    - High HRV variability (SDNN, RMSSD) -> increased risk
    - High activity (accel_std) -> increased risk
    - Abnormal temp deviation -> increased risk
    """
    FEATURE_NAMES = [
        "hr_mean_bpm",           # 0
        "hrv_sdnn_ms",           # 1
        "hrv_rmssd_ms",          # 2
        "hrv_pnn50",             # 3
        "accel_mean_mag",        # 4
        "accel_std_mag",         # 5
        "accel_activity_frac",   # 6
        "temp_mean",             # 7
        "temp_std",              # 8
        "temp_slope_per_min",    # 9
    ]
    
    risk_levels = {}
    
    for cluster_id in range(n_clusters):
        cluster_mask = labels == cluster_id
        cluster_data = X[cluster_mask]
        
        if len(cluster_data) == 0:
            risk_levels[cluster_id] = 0.5
            continue
        
        # Compute cluster characteristics
        hrv_sdnn_mean = np.nanmean(cluster_data[:, 1])  # SDNN
        hrv_rmssd_mean = np.nanmean(cluster_data[:, 2]) # RMSSD
        accel_activity_mean = np.nanmean(cluster_data[:, 6]) # Activity frac
        temp_std_mean = np.nanmean(cluster_data[:, 8])  # Temp variation
        
        # Normalize to 0-1 scale
        # High SDNN (>50ms) indicates high variability = risk
        hrv_sdnn_risk = min(1.0, hrv_sdnn_mean / 100.0)
        # High RMSSD (>50ms) indicates high variability = risk
        hrv_rmssd_risk = min(1.0, hrv_rmssd_mean / 100.0)
        # High activity fraction = risk
        activity_risk = accel_activity_mean
        # High temp variation = risk
        temp_risk = min(1.0, temp_std_mean / 2.0)
        
        # Weighted combination of risk factors
        risk_score = (
            0.40 * hrv_sdnn_risk +      # HRV stability is key indicator
            0.30 * hrv_rmssd_risk +      # RMSSD variation
            0.20 * activity_risk +       # Activity level
            0.10 * temp_risk             # Temperature stability
        )
        
        risk_levels[cluster_id] = float(np.clip(risk_score, 0.0, 1.0))
        
        print(f"Cluster {cluster_id}: risk={risk_levels[cluster_id]:.3f}")
        print(f"  SDNN={hrv_sdnn_mean:.1f}ms, RMSSD={hrv_rmssd_mean:.1f}ms, Activity={accel_activity_mean:.2f}, TempStd={temp_std_mean:.2f}")
    
    return risk_levels


def save_to_firestore(model_data, firebase_key_path='firebase-admin-key.json'):
    """Save cluster model to Firestore."""
    print(f"\nSaving model to Firestore...")
    
    try:
        # Initialize Firebase
        cred = credentials.Certificate(firebase_key_path)
        firebase_admin.initialize_app(cred, options={'projectId': 'ece198-d2f99'})
    except Exception as e:
        print(f"⚠️  Could not initialize Firebase: {e}")
        print("Saving to local JSON instead...")
        save_to_local_json(model_data)
        return
    
    db = firestore.client()
    
    # Prepare data for Firestore (convert numpy types to Python types)
    centroids_data = []
    for i, centroid in enumerate(model_data['centroids']):
        centroids_data.append({
            'cluster_id': int(i),
            'centroid': centroid.tolist(),
            'risk_level': float(model_data['risk_levels'][i]),
        })
    
    # Save centroids
    try:
        db.collection('ClusterModel').document('centroids').set({
            'centroids': centroids_data,
            'n_clusters': int(model_data['n_clusters']),
            'timestamp': firestore.SERVER_TIMESTAMP,
        })
        print("✓ Saved centroids to Firestore")
    except Exception as e:
        print(f"Error saving centroids: {e}")
    
    # Save metadata
    try:
        db.collection('ClusterModel').document('metadata').set({
            'scaler_mean': model_data['scaler_mean'],
            'scaler_scale': model_data['scaler_scale'],
            'feature_names': [
                "hr_mean_bpm", "hrv_sdnn_ms", "hrv_rmssd_ms", "hrv_pnn50",
                "accel_mean_mag", "accel_std_mag", "accel_activity_frac",
                "temp_mean", "temp_std", "temp_slope_per_min"
            ],
            'high_risk_threshold': HIGH_RISK_THRESHOLD,
            'moderate_risk_threshold': MODERATE_RISK_THRESHOLD,
            'timestamp': firestore.SERVER_TIMESTAMP,
        })
        print("✓ Saved metadata to Firestore")
    except Exception as e:
        print(f"Error saving metadata: {e}")
    
    firebase_admin.delete_app(firebase_admin.get_app())


def save_to_local_json(model_data):
    """Save cluster model to local JSON for testing."""
    data = {
        'n_clusters': int(model_data['n_clusters']),
        'centroids': [c.tolist() for c in model_data['centroids']],
        'risk_levels': {int(k): float(v) for k, v in model_data['risk_levels'].items()},
        'scaler_mean': model_data['scaler_mean'],
        'scaler_scale': model_data['scaler_scale'],
        'feature_names': [
            "hr_mean_bpm", "hrv_sdnn_ms", "hrv_rmssd_ms", "hrv_pnn50",
            "accel_mean_mag", "accel_std_mag", "accel_activity_frac",
            "temp_mean", "temp_std", "temp_slope_per_min"
        ],
        'high_risk_threshold': HIGH_RISK_THRESHOLD,
        'moderate_risk_threshold': MODERATE_RISK_THRESHOLD,
    }
    
    with open('cluster_model.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print("✓ Saved model to cluster_model.json")


def main():
    parser = argparse.ArgumentParser(description='Train clustering model for delirium risk')
    parser.add_argument('--features', required=True, help='Path to features.npy')
    parser.add_argument('--n-clusters', type=int, default=DEFAULT_N_CLUSTERS, help='Number of clusters')
    parser.add_argument('--firebase-key', default='firebase-admin-key.json', help='Firebase admin key')
    args = parser.parse_args()

    # Load and train
    features = load_features(args.features)
    model_data = train_clustering_model(features, args.n_clusters)
    
    # Save to Firestore or JSON
    save_to_firestore(model_data, args.firebase_key)


if __name__ == '__main__':
    main()
