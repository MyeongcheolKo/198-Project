#!/usr/bin/env python3
"""
ml_example.py

Simple machine learning examples using extracted features.

Usage:
  python3 ml_example.py --features features.npy [--example classification|regression|clustering]

Examples:
  # Run default (classification)
  python3 ml_example.py --features features.npy
  
  # Regression example (predict HR from accel/temp)
  python3 ml_example.py --features features.npy --example regression
  
  # Clustering example
  python3 ml_example.py --features features.npy --example clustering

"""

import argparse
import json
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.metrics import classification_report, mean_squared_error, silhouette_score
import matplotlib.pyplot as plt


def load_features(features_path, header_path=None):
    """Load features and optional header."""
    features = np.load(features_path)
    
    if header_path is None:
        # Try to find header
        base = features_path.rsplit('.', 1)[0]
        header_path = f"{base}_header.json"
    
    try:
        with open(header_path) as f:
            feature_names = json.load(f)
    except:
        feature_names = [f"Feature_{i}" for i in range(features.shape[1])]
    
    return features, feature_names


def example_classification(features, feature_names):
    """Simple classification: high activity vs low activity based on accel features."""
    print("\n=== Classification Example ===")
    print("Task: Classify high vs low activity periods")
    
    # Simple heuristic: high activity if accel_std_mag > median
    accel_std_idx = feature_names.index('accel_std_mag') if 'accel_std_mag' in feature_names else 5
    
    # Remove NaN rows
    mask = ~np.isnan(features).any(axis=1)
    X = features[mask]
    y = (X[:, accel_std_idx] > np.median(X[:, accel_std_idx])).astype(int)
    
    print(f"Samples: {X.shape[0]}, Features: {X.shape[1]}")
    print(f"Class distribution: {np.bincount(y)}")
    
    if X.shape[0] < 5:
        print("\n⚠️  Too few samples for classification (need at least 5)")
        return
    
    # Train/test split (use larger test size for small datasets)
    test_size = max(0.2, 2/X.shape[0])
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train classifier
    clf = RandomForestClassifier(n_estimators=5, max_depth=3, random_state=42)
    clf.fit(X_train_scaled, y_train)
    
    # Evaluate
    score = clf.score(X_test_scaled, y_test)
    print(f"\nAccuracy: {score:.3f}")
    
    y_pred = clf.predict(X_test_scaled)
    
    # Only print classification report if we have both classes in test set
    if len(np.unique(y_test)) > 1:
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred, target_names=['Low Activity', 'High Activity']))
    else:
        print(f"\nTest set has only 1 class, accuracy: {score:.3f}")
    
    # Feature importance
    print("\nFeature Importance:")
    importances = clf.feature_importances_
    for i, (name, imp) in enumerate(sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)[:5]):
        print(f"  {i+1}. {name}: {imp:.4f}")


def example_regression(features, feature_names):
    """Regression: predict HR from accel and temp features."""
    print("\n=== Regression Example ===")
    print("Task: Predict HR from acceleration and temperature")
    
    hr_idx = feature_names.index('hr_mean_bpm') if 'hr_mean_bpm' in feature_names else 0
    accel_indices = [i for i, n in enumerate(feature_names) if 'accel' in n]
    temp_indices = [i for i, n in enumerate(feature_names) if 'temp' in n]
    
    feature_indices = accel_indices + temp_indices
    
    # Remove NaN rows
    mask = ~np.isnan(features).any(axis=1)
    X = features[mask, feature_indices]
    y = features[mask, hr_idx]
    
    # Remove NaN targets
    mask2 = ~np.isnan(y)
    X = X[mask2]
    y = y[mask2]
    
    print(f"Samples: {X.shape[0]}, Features: {X.shape[1]} (accel + temp)")
    print(f"Target (HR) range: {y.min():.1f} - {y.max():.1f} bpm")
    
    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Scale
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train regressor
    reg = RandomForestRegressor(n_estimators=10, random_state=42)
    reg.fit(X_train_scaled, y_train)
    
    # Evaluate
    score = reg.score(X_test_scaled, y_test)
    y_pred = reg.predict(X_test_scaled)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    
    print(f"\nR² Score: {score:.3f}")
    print(f"RMSE: {rmse:.2f} bpm")
    
    # Feature importance
    print("\nFeature Importance:")
    importances = reg.feature_importances_
    used_names = [feature_names[i] for i in feature_indices]
    for i, (name, imp) in enumerate(sorted(zip(used_names, importances), key=lambda x: x[1], reverse=True)[:5]):
        print(f"  {i+1}. {name}: {imp:.4f}")


def example_clustering(features, feature_names):
    """Clustering: segment 5-min windows into activity patterns."""
    print("\n=== Clustering Example ===")
    print("Task: Cluster windows into activity patterns")
    
    # Remove NaN rows
    mask = ~np.isnan(features).any(axis=1)
    X = features[mask]
    
    print(f"Samples: {X.shape[0]}, Features: {X.shape[1]}")
    
    # Scale
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Cluster (try k=3)
    k = 3
    kmeans = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = kmeans.fit_predict(X_scaled)
    
    silhouette = silhouette_score(X_scaled, labels)
    print(f"\nClusters: {k}")
    print(f"Silhouette Score: {silhouette:.3f}")
    print(f"Cluster sizes: {np.bincount(labels)}")
    
    # Cluster characteristics
    print("\nCluster Characteristics (mean values):")
    for cluster_id in range(k):
        cluster_data = X[labels == cluster_id]
        print(f"\n  Cluster {cluster_id} ({len(cluster_data)} windows):")
        for i in range(min(5, len(feature_names))):
            print(f"    {feature_names[i]}: {cluster_data[:, i].mean():.2f}")


def main():
    parser = argparse.ArgumentParser(description='ML examples using extracted sensor features')
    parser.add_argument('--features', required=True, help='Path to features.npy')
    parser.add_argument('--header', help='Path to features_header.json (auto-detect if not provided)')
    parser.add_argument('--example', choices=['classification', 'regression', 'clustering'], 
                        default='classification', help='Which example to run')
    args = parser.parse_args()

    # Load features
    features, feature_names = load_features(args.features, args.header)
    print(f"Loaded features: shape {features.shape}")
    print(f"Feature names: {', '.join(feature_names)}")
    
    # Run example
    if args.example == 'classification':
        example_classification(features, feature_names)
    elif args.example == 'regression':
        example_regression(features, feature_names)
    elif args.example == 'clustering':
        example_clustering(features, feature_names)


if __name__ == '__main__':
    main()
