Feature extraction for 198-Project

Usage

1. Install dependencies:

   python3 -m pip install -r requirements.txt

2. Run on a JSON dump (Firebase or serial capture):

   python3 feature_extraction.py sample_data.json --out features.npy

Outputs

- features.npy: numpy array with shape (n_windows, n_features)
- features_header.json: list of feature names in order
- features_windows.json: JSON with window start timestamps (seconds)

Notes

- The script slices data into 5-minute windows and requires at least 10 samples per window.
- Heart rate (HR) can be provided as 'hr' or 'bpm' or RR in ms as 'rr' or 'rr_ms'.
- Accel fields: 'ax','ay','az' or nested 'accel':{'x','y','z'}.
- Temperature fields: 'temp' or 'temperature'.
