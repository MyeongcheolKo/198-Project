// app_firestore.js — Firestore realtime listener for SensorData collection
// Computes delirium risk from multi-sensor data using weighted/recursive/blended scoring

import { firebaseConfig } from './firebase-config.js';
import { setConnected, setScore, setHistory, setRawValues, onScoringModeChange } from './ui.js';
import { RecursiveAnalyzer } from './recursive_analyzer.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, onSnapshot, query, limit } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ================== CONFIG ==================
const COLLECTION_NAME = 'SensorData';
const INTRA_PACKET_INTERVAL_MS = 200;
const PACKETS_FETCH = 8;
const MAX_POINTS = 600;

let SCORING_MODE = 'blend';
const BLEND_ALPHA = 0.5;
// ============================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const analyzer = new RecursiveAnalyzer({ longWindow: 1500, shortWindow: 150, minSamples: 100 });

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

// ===== Clinical thresholds (from HRV study) =====
const NORMALS = {
  RMSSD_DELIRIUM_MEAN: 120.7, RMSSD_NORMAL_MEAN: 69.4,
  SDNN_DELIRIUM_MEAN: 93.4, SDNN_NORMAL_MEAN: 89.1,
  SPO2_MIN: 85, SPO2_MAX: 100,
  ACCEL_MAX: 30, TEMP_BASE: 37.0, TEMP_DEV_MAX: 3.0,
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

// ===== Normalization functions =====
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

function normalizeRMSSDRisk(rmssd) {
  return normalizeRisk(rmssd, 50, 150);
}

function normalizeSDNNRisk(sdnn) {
  return normalizeRisk(sdnn, 60, 130);
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

// ===== Scoring Methods =====
function computeCombinedScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
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
  return { score: clamp01(score), components: { hrv: hrvRisk, rmssd, sdnn, spo2, accel, temp }, method: 'weighted' };
}

function computeRiskRecursive({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  if (hrArr && hrArr[idx] != null) analyzer.addSample('hr', hrArr[idx]);
  if (spo2Arr && spo2Arr[idx] != null) analyzer.addSample('spo2', spo2Arr[idx]);
  if (magArr && magArr[idx] != null) analyzer.addSample('accel', magArr[idx]);
  if (tempArr && tempArr[idx] != null) analyzer.addSample('temp', tempArr[idx]);
  const result = analyzer.computeRisk();
  return { score: result.score, components: result.components, method: 'recursive' };
}

function computeBlendedScore({ hrArr, spo2Arr, magArr, tempArr }, idx) {
  const weighted = computeCombinedScore({ hrArr, spo2Arr, magArr, tempArr }, idx);
  const recursive = computeRiskRecursive({ hrArr, spo2Arr, magArr, tempArr }, idx);
  const blended = BLEND_ALPHA * recursive.score + (1 - BLEND_ALPHA) * weighted.score;
  return { score: clamp01(blended), components: { weighted: weighted.score, recursive: recursive.score, blended }, method: 'blend' };
}

function computeRiskScore(sensors, idx) {
  switch (SCORING_MODE) {
    case 'weighted': return computeCombinedScore(sensors, idx);
    case 'recursive': return computeRiskRecursive(sensors, idx);
    case 'blend': return computeBlendedScore(sensors, idx);
    default: return computeCombinedScore(sensors, idx);
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
      const ts = new Date(now - samplesFromEnd * INTRA_PACKET_INTERVAL_MS).toISOString();
      series.push({ timestamp: ts, score, risk: riskFromScore(score) });
    }
  }
  return series.slice(-MAX_POINTS);
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

function sortDocsByDetectedTimestamp(docs) {
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
  const colRef = collection(db, COLLECTION_NAME);
  const qRef = query(colRef, limit(PACKETS_FETCH));

  unsubscribe = onSnapshot(qRef, (snapshot) => {
    try {
      if (snapshot.empty) { setConnected(true); return; }
      setConnected(true);

      const docsForSeries = sortDocsByDetectedTimestamp(snapshot.docs);
      const series = flattenPacketDocs(docsForSeries);

      if (!series.length) return;

      const last = series[series.length - 1];
      setScore(last.score, last.risk, last.timestamp);
      setHistory(series);

      // Aggregate HR from all docs for HRV calculation
      const aggregatedHRArray = [];
      for (let i = 0; i < docsForSeries.length; i++) {
        const doc = docsForSeries[i];
        const docData = doc.data ? doc.data() : {};
        const docHRArray = docData.HR ? toNumArr(docData.HR) : [];
        aggregatedHRArray.push(...docHRArray);
      }

      // Lower threshold: calculate HRV even with fewer samples (min 5)
      if (aggregatedHRArray.length >= 5) {
        const rmssd = calculateRMSSD(aggregatedHRArray);
        const sdnn = calculateSDNN(aggregatedHRArray);
        if (rmssd !== null) {
          lastRMSSD = rmssd;
          console.log('[firestore] HRV updated: RMSSD=', rmssd.toFixed(2));
        }
        if (sdnn !== null) {
          lastSDNN = sdnn;
          console.log('[firestore] HRV updated: SDNN=', sdnn.toFixed(2));
        }
      } else {
        console.log('[firestore] HR samples too few:', aggregatedHRArray.length, '(need >=5)');
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
  SCORING_MODE = newMode;
  analyzer.reset();
  if (typeof unsubscribe === 'function') unsubscribe();
  startSensorStream();
}

startSensorStream();
onScoringModeChange(handleScoringModeChange);

export function stopSensorStream() {
  if (typeof unsubscribe === 'function') unsubscribe();
  unsubscribe = null;
}