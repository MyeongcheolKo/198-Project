// app_firestore.js
// Firestore realtime for collection: SensorData/<docId> with arrays per doc

import { firebaseConfig } from './firebase-config.js';
import {
  setConnected,
  setScore,
  setHistory,
  setRawValues,
  onScoringModeChange,
} from './ui.js';
import { RecursiveAnalyzer } from './recursive_analyzer.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ================== CONFIG ==================
const COLLECTION_NAME = 'SensorData';            // Firestore collection name
const SCORE_CHANNEL  = 'IR';                     // Field to normalize for the big number
const SCORE_MINMAX   = { min: 2600, max: 3200 }; // Tune this to your IR range
const INTRA_PACKET_INTERVAL_MS = 200;            // Time between samples inside a packet
const PACKETS_FETCH = 8;                         // How many latest docs to flatten
const MAX_POINTS    = 600;                       // Max points kept for the chart

// NEW: Make SCORING_MODE mutable
let SCORING_MODE = 'blend'; // options: 'weighted' | 'recursive' | 'blend'
const BLEND_ALPHA = 0.5;      // if 'blend': 0.5 = equal weight, 0.7 = favor recursive
// ============================================

// Firebase setup
console.log('[firestore] init app with config:', firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Initialize recursive analyzer (only used if SCORING_MODE includes recursive)
const analyzer = new RecursiveAnalyzer({
  longWindow: 1500,   // ~5 min at 200ms/sample
  shortWindow: 150,   // ~30 sec
  minSamples: 100,
});

// ------------- utilities -------------

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function normalize(v) {
  const range = Math.max(1e-9, SCORE_MINMAX.max - SCORE_MINMAX.min);
  return clamp01((v - SCORE_MINMAX.min) / range);
}

function riskFromScore(score) {
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'moderate';
  return 'low';
}

// enhance toNumArr to accept comma-separated strings and other iterables
function toNumArr(value) {
  if (value == null) return [];
  if (typeof value === 'string') {
    // allow "1,2,3" style strings
    value = value.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) {
    // try to handle other iterable-like structures by converting to array
    try {
      if (typeof value[Symbol.iterator] === 'function') {
        value = Array.from(value);
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }
  return value.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
}

// candidate names for each sensor channel
const FIELD_CANDIDATES = {
  hr: ['HR', 'hr', 'heart_rate', 'bpm'],
  spo2: ['SPO2', 'spo2', 'SpO2'],
  temp: ['Temp', 'temp', 'temperature'],
  magnitude: ['Magnitude', 'magnitude', 'mag'],
  acx: ['AcX','acx','accel_x','ax'],
  acy: ['AcY','acy','accel_y','ay'],
  acz: ['AcZ','acz','accel_z','az'],
};

// sensible normalization ranges (tweak to your sensor ranges)
const NORMALS = {
  HR_DIFF_MAX: 30,         // beats difference used as HRV proxy normalization
  SPO2_MIN: 85, SPO2_MAX: 100,
  ACCEL_MAX: 30,           // magnitude range expected (tweak)
  TEMP_BASE: 37.0, TEMP_DEV_MAX: 3.0, // degrees deviation normalization
};

// weights for combining component risks (sum should be 1)
const WEIGHTS = {
  hrv: 0.35,
  spo2: 0.30,
  accel: 0.20,
  temp: 0.15,
};

// find the first field present in data from an array of candidates
function findField(data, candidates) {
  for (const k of candidates) {
    if (k in data && data[k] != null) return k;
  }
  return null;
}

// extract numeric arrays for all sensors (best-effort)
function extractSensorArrays(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};

  // find magnitude or compute from accels
  const hrKey = findField(data, FIELD_CANDIDATES.hr);
  const spo2Key = findField(data, FIELD_CANDIDATES.spo2);
  const tempKey = findField(data, FIELD_CANDIDATES.temp);
  const magKey = findField(data, FIELD_CANDIDATES.magnitude);
  const axKey = findField(data, FIELD_CANDIDATES.acx);
  const ayKey = findField(data, FIELD_CANDIDATES.acy);
  const azKey = findField(data, FIELD_CANDIDATES.acz);

  if (hrKey) out.hr = toNumArr(data[hrKey]);
  if (spo2Key) out.spo2 = toNumArr(data[spo2Key]);
  if (tempKey) out.temp = toNumArr(data[tempKey]);

  if (magKey) {
    out.mag = toNumArr(data[magKey]);
  } else if (axKey && ayKey && azKey) {
    const ax = toNumArr(data[axKey]);
    const ay = toNumArr(data[ayKey]);
    const az = toNumArr(data[azKey]);
    const L = Math.min(ax.length, ay.length, az.length);
    out.mag = [];
    for (let i = 0; i < L; i++) {
      const v = Math.sqrt(ax[i]*ax[i] + ay[i]*ay[i] + az[i]*az[i]);
      out.mag.push(Number.isFinite(v) ? v : 0);
    }
  }

  return out;
}

function normalizeSpo2Risk(spo2) {
  if (spo2 == null) return 0; // assume normal if missing
  const { SPO2_MIN, SPO2_MAX } = NORMALS;
  const clamped = Math.max(SPO2_MIN, Math.min(SPO2_MAX, Number(spo2)));
  // lower spo2 => higher risk
  return clamp01((SPO2_MAX - clamped) / (SPO2_MAX - SPO2_MIN));
}

function normalizeHRVProxy(hrArr, idx) {
  if (!Array.isArray(hrArr) || hrArr.length === 0) return 0;
  const prev = idx > 0 ? Number(hrArr[idx - 1]) : Number(hrArr[idx] || 0);
  const curr = Number(hrArr[idx] || 0);
  const diff = Math.abs(curr - prev);
  return clamp01(diff / NORMALS.HR_DIFF_MAX);
}

function normalizeAccelRisk(mag) {
  if (mag == null) return 0;
  return clamp01(Number(mag) / NORMALS.ACCEL_MAX);
}

function normalizeTempRisk(temp) {
  if (temp == null) return 0;
  const dev = Math.abs(Number(temp) - NORMALS.TEMP_BASE);
  return clamp01(dev / NORMALS.TEMP_DEV_MAX);
}

// ===== OLD METHOD: Weighted combination of sensor deviations =====
function computeCombinedScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  const hrv = normalizeHRVProxy(hrArr, idx);
  const spo2 = normalizeSpo2Risk(spo2Arr && spo2Arr[idx] != null ? spo2Arr[idx] : null);
  const accel = normalizeAccelRisk(magArr && magArr[idx] != null ? magArr[idx] : null);
  const temp = normalizeTempRisk(tempArr && tempArr[idx] != null ? tempArr[idx] : null);

  const score =
    WEIGHTS.hrv * hrv +
    WEIGHTS.spo2 * spo2 +
    WEIGHTS.accel * accel +
    WEIGHTS.temp * temp;

  return { score: clamp01(score), components: { hrv, spo2, accel, temp }, method: 'weighted' };
}

// ===== NEW METHOD: Recursive variance/trend analysis =====
function computeRiskRecursive({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  // Feed current sample to analyzer
  if (hrArr && hrArr[idx] != null) {
    analyzer.addSample('hr', hrArr[idx]);
  }
  if (spo2Arr && spo2Arr[idx] != null) {
    analyzer.addSample('spo2', spo2Arr[idx]);
  }
  if (magArr && magArr[idx] != null) {
    analyzer.addSample('accel', magArr[idx]);
  }
  if (tempArr && tempArr[idx] != null) {
    analyzer.addSample('temp', tempArr[idx]);
  }

  // Get the current risk from recursive analysis
  const result = analyzer.computeRisk();
  return { score: result.score, components: result.components, method: 'recursive' };
}

// ===== BLENDED METHOD: Combine both for robustness =====
function computeBlendedScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  const weighted = computeCombinedScore({ hrArr, spo2Arr, magArr, tempArr }, idx);
  const recursive = computeRiskRecursive({ hrArr, spo2Arr, magArr, tempArr }, idx);

  // Blend: alpha favors recursive, (1-alpha) favors weighted
  const blended = BLEND_ALPHA * recursive.score + (1 - BLEND_ALPHA) * weighted.score;

  return {
    score: clamp01(blended),
    components: { weighted: weighted.score, recursive: recursive.score, blended },
    method: 'blend',
  };
}

// ===== CLUSTERING METHOD: ML-based anomaly detection =====
let clusterModel = null;  // Will be loaded from Firestore

// Load cluster model from Firestore (call once on app start)
async function loadClusterModel() {
  try {
    const centroidsDoc = await db.collection('ClusterModel').document('centroids').get();
    const metadataDoc = await db.collection('ClusterModel').document('metadata').get();
    
    if (centroidsDoc.exists && metadataDoc.exists) {
      clusterModel = {
        centroids: centroidsDoc.data().centroids.map(c => ({
          cluster_id: c.cluster_id,
          centroid: c.centroid,
          risk_level: c.risk_level,
        })),
        metadata: metadataDoc.data(),
      };
      console.log('[firestore] Loaded cluster model with', clusterModel.centroids.length, 'clusters');
    }
  } catch (err) {
    console.warn('[firestore] Could not load cluster model:', err.message);
  }
}

// Normalize a 10-feature vector using stored scaler params
function normalizeFeature(feature, metadata) {
  if (!metadata || !metadata.scaler_mean || !metadata.scaler_scale) return feature;
  return feature.map((v, i) => (v - metadata.scaler_mean[i]) / metadata.scaler_scale[i]);
}

// Compute Euclidean distance between two vectors
function euclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < Math.min(v1.length, v2.length); i++) {
    sum += Math.pow(v1[i] - v2[i], 2);
  }
  return Math.sqrt(sum);
}

// Compute clustering-based delirium risk
function computeRiskClustering({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  if (!clusterModel) {
    // Model not loaded; return neutral score
    return { score: 0.5, components: { cluster_distance: 0.5 }, method: 'clustering' };
  }

  // Compute 5-minute rolling window features
  // For simplicity, compute over available data
  const windowFeatures = computeWindowFeatures({ hrArr, spo2Arr, magArr, tempArr }, idx);
  
  if (!windowFeatures) {
    return { score: 0.5, components: { cluster_distance: 0.5 }, method: 'clustering' };
  }

  // Normalize feature vector using stored scaler
  const normalized = normalizeFeature(windowFeatures, clusterModel.metadata);

  // Find nearest cluster centroid
  let minDistance = Infinity;
  let nearestClusterId = 0;
  let nearestRisk = 0.5;

  for (const clusterData of clusterModel.centroids) {
    const dist = euclideanDistance(normalized, clusterData.centroid);
    if (dist < minDistance) {
      minDistance = dist;
      nearestClusterId = clusterData.cluster_id;
      nearestRisk = clusterData.risk_level;
    }
  }

  // Convert distance to confidence (closer = higher confidence in the risk level)
  const maxDist = 10;  // Empirical max expected distance
  const confidence = Math.max(0, 1 - minDistance / maxDist);
  
  // Risk score = cluster's risk level, modulated by confidence
  const score = nearestRisk * confidence + 0.5 * (1 - confidence);

  return {
    score: clamp01(score),
    components: {
      nearest_cluster: nearestClusterId,
      cluster_risk: nearestRisk,
      distance_to_cluster: minDistance.toFixed(2),
      confidence,
    },
    method: 'clustering',
  };
}

// Compute 10-dimensional feature vector from sensor arrays
function computeWindowFeatures({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  // This is a simplified version; in production you'd compute proper 5-min window features
  // For now, use recent samples (e.g., last 30 samples)
  const windowSize = Math.min(30, idx + 1);
  const startIdx = Math.max(0, idx - windowSize + 1);

  // Extract HR variability
  let hrv_sdnn = 0, hrv_rmssd = 0, hrv_pnn50 = 0, hr_mean = 0;
  if (hrArr && hrArr.length > 0) {
    const hrWindow = hrArr.slice(startIdx, idx + 1).filter(v => v != null && Number.isFinite(v));
    if (hrWindow.length > 1) {
      hr_mean = hrWindow.reduce((a, b) => a + b, 0) / hrWindow.length;
      // Convert HR to RR intervals (ms)
      const rrIntervals = hrWindow.map(hr => hr > 0 ? 60000 / hr : null).filter(v => v != null);
      if (rrIntervals.length > 1) {
        // SDNN: std of RR intervals
        const rrMean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
        hrv_sdnn = Math.sqrt(rrIntervals.reduce((sum, v) => sum + Math.pow(v - rrMean, 2), 0) / rrIntervals.length);
        // RMSSD: RMS of successive RR differences
        let sumSqDiff = 0;
        for (let i = 1; i < rrIntervals.length; i++) {
          sumSqDiff += Math.pow(rrIntervals[i] - rrIntervals[i - 1], 2);
        }
        hrv_rmssd = Math.sqrt(sumSqDiff / (rrIntervals.length - 1));
        // pNN50: percentage of successive RR intervals differing > 50ms
        let countDiff50 = 0;
        for (let i = 1; i < rrIntervals.length; i++) {
          if (Math.abs(rrIntervals[i] - rrIntervals[i - 1]) > 50) countDiff50++;
        }
        hrv_pnn50 = (countDiff50 / (rrIntervals.length - 1)) * 100;
      }
    }
  }

  // Extract accel features
  let accel_mean_mag = 0, accel_std_mag = 0, accel_activity = 0;
  if (magArr && magArr.length > 0) {
    const magWindow = magArr.slice(startIdx, idx + 1).filter(v => v != null && Number.isFinite(v));
    if (magWindow.length > 0) {
      accel_mean_mag = magWindow.reduce((a, b) => a + b, 0) / magWindow.length;
      const variance = magWindow.reduce((sum, v) => sum + Math.pow(v - accel_mean_mag, 2), 0) / magWindow.length;
      accel_std_mag = Math.sqrt(variance);
      const threshold = accel_mean_mag + accel_std_mag;
      accel_activity = magWindow.filter(v => v > threshold).length / magWindow.length;
    }
  }

  // Extract temp features
  let temp_mean = 0, temp_std = 0, temp_slope = 0;
  if (tempArr && tempArr.length > 0) {
    const tempWindow = tempArr.slice(startIdx, idx + 1).filter(v => v != null && Number.isFinite(v));
    if (tempWindow.length > 0) {
      temp_mean = tempWindow.reduce((a, b) => a + b, 0) / tempWindow.length;
      const variance = tempWindow.reduce((sum, v) => sum + Math.pow(v - temp_mean, 2), 0) / tempWindow.length;
      temp_std = Math.sqrt(variance);
      // Simple linear slope
      if (tempWindow.length > 1) {
        let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0;
        for (let i = 0; i < tempWindow.length; i++) {
          sumX += i;
          sumY += tempWindow[i];
          sumXY += i * tempWindow[i];
          sumX2 += i * i;
        }
        const n = tempWindow.length;
        temp_slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        temp_slope *= 60 / (windowSize * 0.2);  // Convert to per-minute, assuming 200ms intervals
      }
    }
  }

  return [
    hr_mean,
    hrv_sdnn,
    hrv_rmssd,
    hrv_pnn50,
    accel_mean_mag,
    accel_std_mag,
    accel_activity,
    temp_mean,
    temp_std,
    temp_slope,
  ];
}

// ===== UNIFIED DISPATCHER =====
function computeRiskScore(sensors, idx) {
  switch (SCORING_MODE) {
    case 'weighted':
      return computeCombinedScore(sensors, idx);
    case 'recursive':
      return computeRiskRecursive(sensors, idx);
    case 'blend':
      return computeBlendedScore(sensors, idx);
    case 'clustering':
      return computeRiskClustering(sensors, idx);
    default:
      console.warn('[firestore] unknown SCORING_MODE:', SCORING_MODE, 'defaulting to weighted');
      return computeCombinedScore(sensors, idx);
  }
}

/**
 * Flatten packets from Firestore docs into a time series using selected scoring method.
 */
function flattenPacketDocs(packetDocs) {
  if (!packetDocs.length) return [];

  const docs = [...packetDocs]; // copy
  const now  = Date.now();
  const series = [];

  const docsCount = docs.length;

  for (let dIdx = 0; dIdx < docsCount; dIdx++) {
    const doc = docs[dIdx];
    const data = doc.data() || {};
    const sensors = extractSensorArrays(data);

    // determine how many samples we can produce from this doc:
    // use the max available length among sensor arrays, but we will fill missing values as null/default
    const lengths = [
      sensors.hr ? sensors.hr.length : 0,
      sensors.spo2 ? sensors.spo2.length : 0,
      sensors.temp ? sensors.temp.length : 0,
      sensors.mag ? sensors.mag.length : 0,
    ].filter(Boolean);

    const L = lengths.length ? Math.max(...lengths) : 0;
    if (!L) {
      console.log('[firestore] doc', doc.id, 'no sensor arrays detected; keys:', Object.keys(data));
      continue;
    }

    console.log('[firestore] doc', doc.id, 'detected sensor arrays lengths:', {
      hr: sensors.hr ? sensors.hr.length : 0,
      spo2: sensors.spo2 ? sensors.spo2.length : 0,
      temp: sensors.temp ? sensors.temp.length : 0,
      mag: sensors.mag ? sensors.mag.length : 0,
    });

    // For each sample index in this doc produce a timestamped point
    for (let i = 0; i < L; i++) {
      // Dispatch to the appropriate scoring method
      const { score } = computeRiskScore({
        hrArr: sensors.hr || [],
        spo2Arr: sensors.spo2 || [],
        magArr: sensors.mag || [],
        tempArr: sensors.temp || [],
      }, i);

      const samplesFromEnd =
        (docsCount - 1 - dIdx) * L + (L - 1 - i); // 0 newest, grows into past

      const ts = new Date(
        now - samplesFromEnd * INTRA_PACKET_INTERVAL_MS
      ).toISOString();

      series.push({
        timestamp: ts,
        score,
        risk: riskFromScore(score),
      });
    }
  }

  return series.slice(-MAX_POINTS);
}

function lastOf(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[arr.length - 1];
}

function tryGetTimestampMsFromDoc(doc) {
  // Try several common fields that might contain timestamps
  try {
    const data = doc.data ? doc.data() : {};
    const candidates = ['ts', 'timestamp', 'time', 'createdAt', 'created_at'];
    for (const k of candidates) {
      if (k in data && data[k] != null) {
        const v = data[k];
        // Firestore Timestamp objects have toMillis()
        if (v && typeof v.toMillis === 'function') return v.toMillis();
        if (typeof v === 'number') return Number(v);
        if (typeof v === 'string') {
          const p = Date.parse(v);
          if (!Number.isNaN(p)) return p;
        }
      }
    }
    // Some SDK snapshots expose createTime/updateTime (QueryDocumentSnapshot)
    if (doc.createTime && typeof doc.createTime.toMillis === 'function') {
      return doc.createTime.toMillis();
    }
    if (doc.updateTime && typeof doc.updateTime.toMillis === 'function') {
      return doc.updateTime.toMillis();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function sortDocsByDetectedTimestamp(docs) {
  const docsWithTs = docs.map((d) => ({ doc: d, ts: tryGetTimestampMsFromDoc(d) }));
  const anyTs = docsWithTs.some(x => x.ts !== null && Number.isFinite(x.ts));
  if (!anyTs) return docs; // keep original order
  // sort ascending (oldest first)
  docsWithTs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return docsWithTs.map(x => x.doc);
}

// ------------- realtime subscription -------------

let unsubscribe = null;

function startSensorStream() {
  console.log('[firestore] starting listener on collection:', COLLECTION_NAME, 'with mode:', SCORING_MODE);

  const colRef = collection(db, COLLECTION_NAME);
  const qRef = query(colRef, limit(PACKETS_FETCH));

  unsubscribe = onSnapshot(
    qRef,
    (snapshot) => {
      try {
        console.log('[firestore] snapshot size:', snapshot.size);
        if (snapshot.empty) {
          console.log('[firestore] no documents found in SensorData');
          setConnected(true);
          return;
        }

        setConnected(true);

        // Debug: show doc ids and a small preview of data
        console.log('[firestore] raw doc ids:', snapshot.docs.map(d => d.id));
        try {
          console.log('[firestore] raw doc data preview:', snapshot.docs.map(d => {
            const data = d.data ? d.data() : {};
            return {
              id: d.id,
              // only pick a few fields for preview
              ts: data.ts || data.timestamp || data.createdAt || null,
              sampleCount: Array.isArray(data[SCORE_CHANNEL]) ? data[SCORE_CHANNEL].length : undefined,
            };
          }));
        } catch (previewErr) {
          console.log('[firestore] preview error', previewErr);
        }

        // Try to sort docs deterministically by any detected timestamp before flattening
        const docsForSeries = sortDocsByDetectedTimestamp(snapshot.docs);

        const series = flattenPacketDocs(docsForSeries);

        if (!series.length) {
          console.log('[firestore] no samples in series yet');
          return;
        }

        const last = series[series.length - 1];
        console.log('[firestore] last point:', last);

        setScore(last.score, last.risk, last.timestamp);
        setHistory(series);

        // Use best-effort "latest" doc (after sorting) for raw readings
        const latestDoc = docsForSeries[docsForSeries.length - 1];
        const latestDocData = (latestDoc && latestDoc.data) ? latestDoc.data() || {} : {};
        setRawValues({
          AcX:  lastOf(latestDocData.AcX) ?? '—',
          AcY:  lastOf(latestDocData.AcY) ?? '—',
          AcZ:  lastOf(latestDocData.AcZ) ?? '—',
          HR:   lastOf(latestDocData.HR) ?? '—',
          Magnitude: lastOf(latestDocData.Magnitude) ?? '—',
          SPO2:  lastOf(latestDocData.SPO2) ?? '—',
          Temp: lastOf(latestDocData.Temp) ?? '—',
        });
      } catch (err) {
        console.error('[firestore] processing snapshot error:', err);
      }
    },
    (error) => {
      console.error('[firestore] listener error:', error);
      setConnected(false);
    }
  );
}

// NEW: Function to handle scoring mode changes
function handleScoringModeChange(newMode) {
  SCORING_MODE = newMode;
  console.log('[firestore] SCORING_MODE updated to:', SCORING_MODE);
  
  // Reset analyzer when switching modes (fresh baseline)
  analyzer.reset();
  
  // Re-subscribe to stream with new mode (will recalculate all scores)
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }
  startSensorStream();
}

// Start once at load
startSensorStream();

// Load clustering model asynchronously
loadClusterModel();

// NEW: Register UI callback
onScoringModeChange(handleScoringModeChange);

export function stopSensorStream() {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
    unsubscribe = null;
  }
}