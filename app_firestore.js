// app_firestore.js — Firestore realtime listener for SensorData collection
// Computes delirium risk from multi-sensor data using weighted/clustering/blended scoring

import { firebaseConfig } from './firebase-config.js';
import { setConnected, setScore, setHistory, setRawValues, onScoringModeChange } from './ui.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';


// ================== CONFIG ==================
const CONFIG = {
  COLLECTION_NAME: 'SensorData',
  INTRA_PACKET_INTERVAL_MS: 200,
  PACKETS_FETCH: 8,
  MAX_POINTS: 600,
  scoringMode: 'blend',
  BLEND_ALPHA: 0.5, // 0.5 = 50/50 weighted + clustering
};
// ============================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== Utilities =====
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function riskFromScore(score) {
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'moderate';
  return 'low';
}

function toNumArr(value) {
  if (value == null) return [];
  if (typeof value === 'string') value = value.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(value)) {
    try { value = typeof value[Symbol.iterator] === 'function' ? Array.from(value) : []; } catch { return []; }
  }
  return value.map((v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; });
}

// ===== Sensor field aliases =====
const FIELD_CANDIDATES = {
  hr: ['HR', 'hr', 'heart_rate', 'bpm'],
  spo2: ['SPO2', 'spo2', 'SpO2'],
  temp: ['Temp', 'temp', 'temperature'],
  magnitude: ['Magnitude', 'magnitude', 'mag'],
  acx: ['AcX','acx','accel_x','ax'],
  acy: ['AcY','acy','accel_y','ay'],
  acz: ['AcZ','acz','accel_z','az'],
};

// ===== Clinical thresholds =====
const NORMALS = {
  RMSSD_LOW: 50, RMSSD_HIGH: 150,
  SDNN_LOW: 60, SDNN_HIGH: 130,
  SPO2_MIN: 85, SPO2_MAX: 100,
  ACCEL_MAX: 30,
  TEMP_BASE: 37.0, TEMP_DEV_MAX: 3.0,
};

const WEIGHTS = { hrv: 0.55, spo2: 0.25, accel: 0.12, temp: 0.08 };

// ===== Helpers =====
function findField(data, candidates) {
  for (const k of candidates) if (k in data && data[k] != null) return k;
  return null;
}

function extractSensorArrays(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
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
    const ax = toNumArr(data[axKey]), ay = toNumArr(data[ayKey]), az = toNumArr(data[azKey]);
    const L = Math.min(ax.length, ay.length, az.length);
    out.mag = [];
    for (let i = 0; i < L; i++) {
      const v = Math.sqrt(ax[i]*ax[i] + ay[i]*ay[i] + az[i]*az[i]);
      out.mag.push(Number.isFinite(v) ? v : 0);
    }
  }
  return out;
}

// ===== HRV Calculations =====
function calculateRRIntervals(hrArr) {
  if (!Array.isArray(hrArr) || hrArr.length < 2) return null;
  const rr = [];
  for (let i = 0; i < hrArr.length; i++) {
    const hr = Number(hrArr[i]);
    if (hr > 0 && hr < 300) rr.push(60000 / hr);
  }
  return rr.length >= 2 ? rr : null;
}

function calculateSDNN(hrArr) {
  const rrIntervals = calculateRRIntervals(hrArr);
  if (!rrIntervals) return null;
  const mean = rrIntervals.reduce((a,b) => a+b, 0) / rrIntervals.length;
  const variance = rrIntervals.reduce((a,b) => a + (b-mean)*(b-mean), 0) / rrIntervals.length;
  return Math.sqrt(variance);
}

function calculateRMSSD(hrArr) {
  const rrIntervals = calculateRRIntervals(hrArr);
  if (!rrIntervals) return null;
  const diffs = [];
  for (let i = 1; i < rrIntervals.length; i++) diffs.push(Math.abs(rrIntervals[i] - rrIntervals[i-1]));
  const sumSq = diffs.reduce((a,b) => a + b*b, 0);
  return Math.sqrt(sumSq / diffs.length);
}

function normalizeRisk(value, min, max) {
  if (value == null) return 0.5;
  const clamped = Math.max(min, Math.min(max, Number(value)));
  return clamp01((clamped - min) / (max - min));
}

function normalizeSpo2Risk(spo2) {
  if (spo2 == null) return 0;
  const { SPO2_MIN, SPO2_MAX } = NORMALS;
  const clamped = Math.max(SPO2_MIN, Math.min(SPO2_MAX, Number(spo2)));
  return clamp01((SPO2_MAX - clamped) / (SPO2_MAX - SPO2_MIN));
}

function normalizeRMSSDRisk(rmssd) {
  return normalizeRisk(rmssd, NORMALS.RMSSD_LOW, NORMALS.RMSSD_HIGH);
}

function normalizeSDNNRisk(sdnn) {
  return normalizeRisk(sdnn, NORMALS.SDNN_LOW, NORMALS.SDNN_HIGH);
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

// ===== WEIGHTED METHOD =====
function computeWeightedScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  const windowSize = Math.min(20, hrArr.length);
  const hrWindow = hrArr.slice(Math.max(0, idx + 1 - windowSize), idx + 1);
  const rmssd = calculateRMSSD(hrWindow);
  const sdnn = calculateSDNN(hrWindow);
  
  const rmssdRisk = normalizeRMSSDRisk(rmssd);
  const sdnnRisk = normalizeSDNNRisk(sdnn);
  const hrvRisk = 0.5 * rmssdRisk + 0.5 * sdnnRisk;

  const spo2 = normalizeSpo2Risk(spo2Arr && spo2Arr[idx] != null ? spo2Arr[idx] : null);
  const accel = normalizeAccelRisk(magArr && magArr[idx] != null ? magArr[idx] : null);
  const temp = normalizeTempRisk(tempArr && tempArr[idx] != null ? tempArr[idx] : null);

  const score = WEIGHTS.hrv * hrvRisk + WEIGHTS.spo2 * spo2 + WEIGHTS.accel * accel + WEIGHTS.temp * temp;
  return { score: clamp01(score), method: 'weighted' };
}

// ===== CLUSTERING METHOD (ML-based) =====
let clusterModel = null;
async function loadClusterModel() {
  try {
    const centroidsRef = doc(db, 'ClusterModel', 'centroids');
    const metadataRef = doc(db, 'ClusterModel', 'metadata');

    const [centroidsSnap, metadataSnap] = await Promise.all([
      getDoc(centroidsRef),
      getDoc(metadataRef)
    ]);

    if (!centroidsSnap.exists()) {
      console.warn('[clustering] centroids document not found');
      return;
    }
    if (!metadataSnap.exists()) {
      console.warn('[clustering] metadata document not found');
      return;
    }

    const centroidsData = centroidsSnap.data();
    const metadataData  = metadataSnap.data();

    clusterModel = {
      centroids: centroidsData.centroids,
      nClusters: centroidsData.n_clusters,
      featureNames: metadataData.feature_names,
      scalerMean: metadataData.scaler_mean,
      scalerScale: metadataData.scaler_scale,
      highRisk: metadataData.high_risk_threshold,
      moderateRisk: metadataData.moderate_risk_threshold,
    };

    console.log(
      `[clustering] Model loaded: ${clusterModel.nClusters} clusters, ${clusterModel.featureNames.length} features`
    );

  } catch (err) {
    console.warn('[clustering] Could not load model:', err.message);
  }
}

function euclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < Math.min(v1.length, v2.length); i++) {
    sum += Math.pow(v1[i] - v2[i], 2);
  }
  return Math.sqrt(sum);
}

function normalizeFeatureVector(features, metadata) {
  if (!metadata?.scaler_mean || !metadata?.scaler_scale) return features;
  return features.map((v, i) => (v - metadata.scaler_mean[i]) / metadata.scaler_scale[i]);
}

function computeFeatureVector({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  const windowSize = Math.min(30, idx + 1);
  const startIdx = Math.max(0, idx - windowSize + 1);

  let hrv_sdnn = 0, hrv_rmssd = 0, hrv_pnn50 = 0, hr_mean = 0;
  if (hrArr && hrArr.length > 0) {
    const hrWindow = hrArr.slice(startIdx, idx + 1).filter(v => v != null && Number.isFinite(v));
    if (hrWindow.length > 1) {
      hr_mean = hrWindow.reduce((a, b) => a + b, 0) / hrWindow.length;
      const rrIntervals = hrWindow.map(hr => hr > 0 ? 60000 / hr : null).filter(v => v != null);
      if (rrIntervals.length > 1) {
        const rrMean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
        hrv_sdnn = Math.sqrt(rrIntervals.reduce((sum, v) => sum + Math.pow(v - rrMean, 2), 0) / rrIntervals.length);
        let sumSqDiff = 0;
        for (let i = 1; i < rrIntervals.length; i++) {
          sumSqDiff += Math.pow(rrIntervals[i] - rrIntervals[i - 1], 2);
        }
        hrv_rmssd = Math.sqrt(sumSqDiff / (rrIntervals.length - 1));
        let countDiff50 = 0;
        for (let i = 1; i < rrIntervals.length; i++) {
          if (Math.abs(rrIntervals[i] - rrIntervals[i - 1]) > 50) countDiff50++;
        }
        hrv_pnn50 = (countDiff50 / (rrIntervals.length - 1)) * 100;
      }
    }
  }

  let accel_mean = 0, accel_std = 0, accel_activity = 0;
  if (magArr && magArr.length > 0) {
    const magWindow = magArr.slice(startIdx, idx + 1).filter(v => v != null && Number.isFinite(v));
    if (magWindow.length > 0) {
      accel_mean = magWindow.reduce((a, b) => a + b, 0) / magWindow.length;
      const variance = magWindow.reduce((sum, v) => sum + Math.pow(v - accel_mean, 2), 0) / magWindow.length;
      accel_std = Math.sqrt(variance);
      const threshold = accel_mean + accel_std;
      accel_activity = magWindow.filter(v => v > threshold).length / magWindow.length;
    }
  }

  let temp_mean = 0, temp_std = 0, temp_slope = 0;
  if (tempArr && tempArr.length > 0) {
    const tempWindow = tempArr.slice(startIdx, idx + 1).filter(v => v != null && Number.isFinite(v));
    if (tempWindow.length > 0) {
      temp_mean = tempWindow.reduce((a, b) => a + b, 0) / tempWindow.length;
      const variance = tempWindow.reduce((sum, v) => sum + Math.pow(v - temp_mean, 2), 0) / tempWindow.length;
      temp_std = Math.sqrt(variance);
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
        temp_slope *= 60 / (windowSize * 0.2);
      }
    }
  }

  return [hr_mean, hrv_sdnn, hrv_rmssd, hrv_pnn50, accel_mean, accel_std, accel_activity, temp_mean, temp_std, temp_slope];
}

function computeClusteringScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  if (!clusterModel) {
    return { score: 0.5, method: 'clustering' };
  }

  const features = computeFeatureVector({ hrArr, spo2Arr, magArr, tempArr }, idx);
  const normalized = normalizeFeatureVector(features, clusterModel.metadata);

  let minDistance = Infinity;
  let nearestRisk = 0.5;

  for (const cluster of clusterModel.centroids) {
    const dist = euclideanDistance(normalized, cluster.centroid);
    if (dist < minDistance) {
      minDistance = dist;
      nearestRisk = cluster.risk_level || 0.5;
    }
  }

  const maxDist = 10;
  const confidence = Math.max(0, 1 - minDistance / maxDist);
  const score = nearestRisk * confidence + 0.5 * (1 - confidence);

  return { score: clamp01(score), method: 'clustering' };
}

// ===== BLENDED METHOD: Weighted + Clustering =====
function computeBlendedScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  const weighted = computeWeightedScore({ hrArr, spo2Arr, magArr, tempArr }, idx);
  const clustering = computeClusteringScore({ hrArr, spo2Arr, magArr, tempArr }, idx);

  const blended = CONFIG.BLEND_ALPHA * clustering.score + (1 - CONFIG.BLEND_ALPHA) * weighted.score;
  return { score: clamp01(blended), method: 'blend' };
}

// ===== UNIFIED DISPATCHER =====
function computeRiskScore(sensors, idx) {
  switch (CONFIG.scoringMode) {
    case 'weighted': return computeWeightedScore(sensors, idx);
    case 'clustering': return computeClusteringScore(sensors, idx);
    case 'blend': return computeBlendedScore(sensors, idx);
    default: return computeWeightedScore(sensors, idx);
  }
}

// ===== Data Processing =====
function flattenPacketDocs(packetDocs) {
  if (!packetDocs.length) return [];
  const docs = [...packetDocs];
  const now = Date.now();
  const series = [];
  const docsCount = docs.length;

  for (let dIdx = 0; dIdx < docsCount; dIdx++) {
    const doc = docs[dIdx];
    const data = doc.data() || {};
    const sensors = extractSensorArrays(data);

    const lengths = [sensors.hr?.length, sensors.spo2?.length, sensors.temp?.length, sensors.mag?.length].filter(Boolean);
    const L = lengths.length ? Math.max(...lengths) : 0;
    if (!L) continue;

    for (let i = 0; i < L; i++) {
      const { score } = computeRiskScore({
        hrArr: sensors.hr || [],
        spo2Arr: sensors.spo2 || [],
        magArr: sensors.mag || [],
        tempArr: sensors.temp || [],
      }, i);

      const samplesFromEnd = (docsCount - 1 - dIdx) * L + (L - 1 - i);
      const ts = new Date(now - samplesFromEnd * CONFIG.INTRA_PACKET_INTERVAL_MS).toISOString();
      series.push({ timestamp: ts, score, risk: riskFromScore(score) });
    }
  }
  return series.slice(-CONFIG.MAX_POINTS);
}

function lastOf(arr) {
  return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null;
}

function tryGetTimestampMsFromDoc(doc) {
  try {
    const data = doc.data ? doc.data() : {};
    const candidates = ['ts', 'timestamp', 'time', 'createdAt', 'created_at'];
    for (const k of candidates) {
      if (k in data && data[k] != null) {
        const v = data[k];
        if (v && typeof v.toMillis === 'function') return v.toMillis();
        if (typeof v === 'number') return Number(v);
        if (typeof v === 'string') {
          const p = Date.parse(v);
          if (!Number.isNaN(p)) return p;
        }
      }
    }
    if (doc.createTime && typeof doc.createTime.toMillis === 'function') return doc.createTime.toMillis();
    if (doc.updateTime && typeof doc.updateTime.toMillis === 'function') return doc.updateTime.toMillis();
  } catch (e) {}
  return null;
}

function sortDocsByTimestamp(docs) {
  const docsWithTs = docs.map((d) => ({ doc: d, ts: tryGetTimestampMsFromDoc(d) }));
  const anyTs = docsWithTs.some(x => x.ts !== null && Number.isFinite(x.ts));
  if (!anyTs) return docs;
  docsWithTs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return docsWithTs.map(x => x.doc);
}

// ===== Realtime Stream =====
let unsubscribe = null;
let lastRMSSD = null, lastSDNN = null;

function startSensorStream() {
  const qRef = query(collection(db, CONFIG.COLLECTION_NAME), limit(CONFIG.PACKETS_FETCH));

  unsubscribe = onSnapshot(qRef, (snapshot) => {
    try {
      if (snapshot.empty) { setConnected(true); return; }
      setConnected(true);

      const docsForSeries = sortDocsByTimestamp(snapshot.docs);
      const series = flattenPacketDocs(docsForSeries);

      if (!series.length) return;

      const last = series[series.length - 1];
      setScore(last.score, last.risk, last.timestamp);
      setHistory(series);

      // Aggregate HR from all docs for HRV display
      const aggregatedHRArray = [];
      for (let i = 0; i < docsForSeries.length; i++) {
        const doc = docsForSeries[i];
        const docData = doc.data ? doc.data() : {};
        const docHRArray = docData.HR ? toNumArr(docData.HR) : [];
        aggregatedHRArray.push(...docHRArray);
      }

      if (aggregatedHRArray.length >= 5) {
        const rmssd = calculateRMSSD(aggregatedHRArray);
        const sdnn = calculateSDNN(aggregatedHRArray);
        if (rmssd !== null) lastRMSSD = rmssd;
        if (sdnn !== null) lastSDNN = sdnn;
      }

      const latestDoc = docsForSeries[docsForSeries.length - 1];
      const latestDocData = (latestDoc && latestDoc.data) ? latestDoc.data() || {} : {};

      setRawValues({
        AcX: lastOf(latestDocData.AcX) ?? '—',
        AcY: lastOf(latestDocData.AcY) ?? '—',
        AcZ: lastOf(latestDocData.AcZ) ?? '—',
        HR: lastOf(latestDocData.HR) ?? '—',
        Magnitude: lastOf(latestDocData.Magnitude) ?? '—',
        SPO2: lastOf(latestDocData.SPO2) ?? '—',
        Temp: lastOf(latestDocData.Temp) ?? '—',
        RMSSD: lastRMSSD,
        SDNN: lastSDNN,
      });
    } catch (err) {
      console.error('[firestore] error:', err);
    }
  }, (error) => {
    console.error('[firestore] listener error:', error);
    setConnected(false);
  });
}

function handleScoringModeChange(newMode) {
  CONFIG.scoringMode = newMode;
  if (typeof unsubscribe === 'function') unsubscribe();
  startSensorStream();
}

startSensorStream();
loadClusterModel();
onScoringModeChange(handleScoringModeChange);

export function stopSensorStream() {
  if (typeof unsubscribe === 'function') unsubscribe();
  unsubscribe = null;
}
