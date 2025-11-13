# Delirium Monitor (Nurse UI) — Firestore: SensorData/<docId> arrays

This build reads **Firestore** collection **`SensorData`**, where **each document** has arrays like `IR`, `BPM`, `ABPM`, `AcX`, `AcY`, `AcZ`, `Temp`. It flattens arrays to a live time series and renders a nurse-friendly UI.

## Configure

1. Copy `firebase-config.sample.js` → `firebase-config.js` and paste your web app config from Firebase Console.
2. If you want the big number to reflect a different channel, edit `SCORE_CHANNEL` in `app_firestore.js` (e.g., `'BPM'`).
3. Tune `SCORE_MINMAX` and `INTRA_PACKET_INTERVAL_MS` to your data.

## Run

```bash
python -m http.server 8080
# open http://localhost:8080
```

## Deploy just this folder (no hardware code)

```bash
npm i -g firebase-tools
firebase login
firebase init hosting   # public dir: "."
firebase deploy --only hosting
```

## Data expectations

- Path: `SensorData/<docId>` (docId can be numeric/increasing for good ordering)
- Fields (arrays): `IR`, `BPM`, `ABPM`, `AcX`, `AcY`, `AcZ`, `Temp`

If your docId is not monotonic, add a `ts` field to each doc and change the query to `orderBy('ts','desc')` in `app_firestore.js`.
