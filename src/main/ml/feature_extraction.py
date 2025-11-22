#!/usr/bin/env python3
"""
feature_extraction.py

Load sensor data (JSON or CSV), slice into 5-minute windows, compute HRV/accel/temp features, save features.npy.

Usage:
  # From JSON
  python3 feature_extraction.py data.json --out features.npy
  
  # From CSV
  python3 feature_extraction.py data.csv --out features.npy
  
  # From CSV, also save intermediate raw data to CSV
  python3 feature_extraction.py data.csv --out features.npy --save-csv raw_data.csv

Assumptions:
- JSON: list of records or dict with top-level array (data/records/values)
- CSV: columns for timestamp, hr, temp, ax, ay, az (case-insensitive, auto-detected)
- Timestamp: seconds or milliseconds (auto-normalized)
- Heart: 'hr'/'bpm' (bpm) or 'rr'/'rr_ms' (milliseconds)
- Accel: 'ax','ay','az' or variants
- Temp: 'temp'/'temperature'

Outputs:
- features.npy : (n_windows, 10 features) float32
- features_header.json : feature names
- features_windows.json : window start timestamps
- [optional] raw_data.csv : extracted & normalized raw sensor data

"""

import argparse
import csv
import json
import math
import os

import numpy as np
import pandas as pd

WINDOW_SECONDS = 5 * 60  # 5 minutes
MIN_SAMPLES_PER_WINDOW = 10

FEATURE_NAMES = [
    "hr_mean_bpm",
    "hrv_sdnn_ms",
    "hrv_rmssd_ms",
    "hrv_pnn50",
    "accel_mean_mag",
    "accel_std_mag",
    "accel_activity_frac",
    "temp_mean",
    "temp_std",
    "temp_slope_per_min",
]


def load_json(path):
    """Load JSON file, return list of records."""
    with open(path, 'r') as f:
        j = json.load(f)
    # If top-level is dict containing a list
    if isinstance(j, dict):
        for k in ("data", "records", "values", "rows"):
            if k in j and isinstance(j[k], list):
                return j[k]
        # if dict of timestamp->value, convert
        if all(isinstance(v, dict) for v in j.values()):
            return list(j.values())
        raise ValueError("Unsupported JSON structure: top-level dict without a list of records")
    if isinstance(j, list):
        return j
    raise ValueError("Unsupported JSON structure")


def load_csv(path):
    """Load CSV file, return list of dicts (records)."""
    df = pd.read_csv(path)
    # Convert to list of dicts
    return df.to_dict('records')


def load_data(path):
    """Auto-detect file type and load data."""
    if path.endswith('.json'):
        return load_json(path)
    elif path.endswith('.csv'):
        return load_csv(path)
    else:
        # Try JSON first, then CSV
        try:
            return load_json(path)
        except:
            try:
                return load_csv(path)
            except:
                raise ValueError(f"Could not load {path} as JSON or CSV")


def find_key(rec, candidates):
    """Find a key in record matching any of the candidates (case-insensitive)."""
    rec_lower = {k.lower(): k for k in rec.keys()}
    for c in candidates:
        if c.lower() in rec_lower:
            return rec_lower[c.lower()]
    return None


def extract_fields(records):
    """Extract timestamp, HR, RR, accel, temp from records."""
    ts_list = []
    hr_list = []
    rr_list = []
    accel_x = []
    accel_y = []
    accel_z = []
    temp_list = []

    for rec in records:
        # timestamp
        tkey = find_key(rec, ["ts", "timestamp", "time", "t"])
        if tkey is None:
            continue
        
        t = rec[tkey]
        # normalize ms->s
        if isinstance(t, (int, float)) and t > 1e12:
            t = t / 1000.0
        ts_list.append(float(t))

        # heart rate / RR
        if find_key(rec, ["rr_ms", "rr"]):
            rrk = find_key(rec, ["rr_ms", "rr"])
            rr_val = rec.get(rrk)
            if isinstance(rr_val, list):
                rr_list.append(float(np.mean(rr_val)))
            else:
                rr_list.append(float(rr_val))
            hr_list.append(60000.0 / rr_list[-1] if rr_list[-1] > 0 else np.nan)
        elif find_key(rec, ["hr", "bpm"]):
            hrk = find_key(rec, ["hr", "bpm"])
            hr_val = float(rec.get(hrk))
            hr_list.append(hr_val)
            rr_list.append(60000.0 / hr_val if hr_val > 0 else np.nan)
        else:
            hr_list.append(np.nan)
            rr_list.append(np.nan)

        # accel
        ax_key = find_key(rec, ["ax", "accel_x", "accelx", "x"])
        ay_key = find_key(rec, ["ay", "accel_y", "accely", "y"])
        az_key = find_key(rec, ["az", "accel_z", "accelz", "z"])
        
        accel_x.append(float(rec.get(ax_key)) if ax_key else np.nan)
        accel_y.append(float(rec.get(ay_key)) if ay_key else np.nan)
        accel_z.append(float(rec.get(az_key)) if az_key else np.nan)

        # temp
        temp_key = find_key(rec, ["temp", "temperature"])
        temp_list.append(float(rec.get(temp_key)) if temp_key else np.nan)

    return {
        'ts': np.array(ts_list, dtype=float),
        'hr': np.array(hr_list, dtype=float),
        'rr_ms': np.array(rr_list, dtype=float),
        'ax': np.array(accel_x, dtype=float),
        'ay': np.array(accel_y, dtype=float),
        'az': np.array(accel_z, dtype=float),
        'temp': np.array(temp_list, dtype=float),
    }


def save_raw_csv(fields, output_path):
    """Save extracted raw fields to CSV."""
    df = pd.DataFrame({
        'timestamp': fields['ts'],
        'hr_bpm': fields['hr'],
        'rr_ms': fields['rr_ms'],
        'ax': fields['ax'],
        'ay': fields['ay'],
        'az': fields['az'],
        'temp': fields['temp'],
    })
    df.to_csv(output_path, index=False)
    print(f"Saved raw data to: {output_path}")


def compute_hrv_metrics(rr_ms_arr):
    """Compute HRV metrics from RR intervals (in ms)."""
    if len(rr_ms_arr) < 2 or np.all(np.isnan(rr_ms_arr)):
        return (np.nan, np.nan, np.nan, np.nan)
    rr = rr_ms_arr[~np.isnan(rr_ms_arr)]
    if len(rr) < 2:
        return (np.nan, np.nan, np.nan, np.nan)
    
    hr_mean = 60000.0 / np.mean(rr) if np.mean(rr) > 0 else np.nan
    sdnn = float(np.std(rr, ddof=1)) if len(rr) > 1 else float(np.std(rr))
    diff = np.diff(rr)
    rmssd = float(np.sqrt(np.mean(diff ** 2)))
    pnn50 = float(np.sum(np.abs(diff) > 50) / len(diff))
    
    return (hr_mean, sdnn, rmssd, pnn50)


def compute_accel_features(ax, ay, az):
    """Compute acceleration features (mean, std, activity)."""
    mask = ~np.isnan(ax) & ~np.isnan(ay) & ~np.isnan(az)
    if np.sum(mask) < 1:
        return (np.nan, np.nan, np.nan)
    
    mags = np.sqrt(ax[mask] ** 2 + ay[mask] ** 2 + az[mask] ** 2)
    mean_mag = float(np.mean(mags))
    std_mag = float(np.std(mags, ddof=1)) if mags.size > 1 else 0.0
    thresh = mean_mag + std_mag
    activity_frac = float(np.sum(mags > thresh) / mags.size)
    
    return (mean_mag, std_mag, activity_frac)


def compute_temp_features(ts_rel, temps):
    """Compute temperature features (mean, std, slope)."""
    mask = ~np.isnan(temps)
    if np.sum(mask) < 1:
        return (np.nan, np.nan, np.nan)
    
    tvals = temps[mask]
    tts = ts_rel[mask]
    mean_t = float(np.mean(tvals))
    std_t = float(np.std(tvals, ddof=1)) if tvals.size > 1 else 0.0
    
    if tvals.size > 1 and np.unique(tts).size > 1:
        p = np.polyfit(tts, tvals, 1)
        slope_per_min = float(p[0] * 60.0)
    else:
        slope_per_min = 0.0
    
    return (mean_t, std_t, slope_per_min)


def slice_windows_and_extract(fields, window_seconds=WINDOW_SECONDS):
    """Slice into 5-min windows and compute features."""
    ts = fields['ts']
    if ts.size == 0:
        return np.zeros((0, len(FEATURE_NAMES)), dtype=np.float32), []
    
    tmin = float(np.min(ts))
    tmax = float(np.max(ts))
    start = math.floor(tmin / window_seconds) * window_seconds
    
    features = []
    window_starts = []
    w = start
    
    while w <= tmax:
        mask = (ts >= w) & (ts < w + window_seconds)
        if np.sum(mask) >= MIN_SAMPLES_PER_WINDOW:
            rr_win = fields['rr_ms'][mask]
            ax = fields['ax'][mask]
            ay = fields['ay'][mask]
            az = fields['az'][mask]
            temps = fields['temp'][mask]
            ts_rel = ts[mask] - w

            hr_mean, sdnn, rmssd, pnn50 = compute_hrv_metrics(rr_win)
            accel_mean, accel_std, accel_activity = compute_accel_features(ax, ay, az)
            temp_mean, temp_std, temp_slope = compute_temp_features(ts_rel, temps)

            feat = [
                hr_mean, sdnn, rmssd, pnn50,
                accel_mean, accel_std, accel_activity,
                temp_mean, temp_std, temp_slope,
            ]
            features.append(feat)
            window_starts.append(w)
        
        w += window_seconds
    
    if len(features) == 0:
        return np.zeros((0, len(FEATURE_NAMES)), dtype=np.float32), window_starts
    
    return np.array(features, dtype=np.float32), window_starts


def main():
    parser = argparse.ArgumentParser(description='Extract features from sensor data (JSON or CSV)')
    parser.add_argument('input', help='Input file (JSON or CSV)')
    parser.add_argument('--out', help='Output .npy file', default='features.npy')
    parser.add_argument('--save-csv', help='Also save raw extracted data to CSV', default=None)
    args = parser.parse_args()

    print(f"Loading data from {args.input}...")
    records = load_data(args.input)
    print(f"Loaded {len(records)} records")
    
    fields = extract_fields(records)
    print(f"Extracted {len(fields['ts'])} timestamped samples")
    
    if args.save_csv:
        save_raw_csv(fields, args.save_csv)
    
    feats, window_starts = slice_windows_and_extract(fields)
    print(f"Created {len(window_starts)} windows")

    # Save outputs
    np.save(args.out, feats)
    hdr_path = os.path.splitext(args.out)[0] + '_header.json'
    meta_path = os.path.splitext(args.out)[0] + '_windows.json'
    
    with open(hdr_path, 'w') as f:
        json.dump(FEATURE_NAMES, f, indent=2)
    
    with open(meta_path, 'w') as f:
        json.dump({"window_starts": window_starts, "window_duration_seconds": WINDOW_SECONDS}, f, indent=2)

    print(f"✓ Saved {args.out} ({feats.shape[0]} windows × {feats.shape[1]} features)")


if __name__ == '__main__':
    main()
