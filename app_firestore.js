// app_firestore.js
// Firestore realtime for collection: SensorData/<docId> with arrays per doc

import { firebaseConfig } from './firebase-config.js';
import {
  setConnected,
  setScore,
  setHistory,
  setRawValues,
} from './ui.js';

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
// ============================================

// Firebase setup
console.log('[firestore] init app with config:', firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ------------- utilities -------------

function toNumArr(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
}

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

/**
 * Flatten packets from Firestore docs into a time series.
 * We do not assume any server ordering; we just treat docs in array order.
 */
function flattenPacketDocs(packetDocs) {
  if (!packetDocs.length) return [];

  const docs = [...packetDocs]; // copy
  const now  = Date.now();
  const series = [];

  const docsCount = docs.length;

  for (let dIdx = 0; dIdx < docsCount; dIdx++) {
    const data    = docs[dIdx].data() || {};
    const samples = toNumArr(data[SCORE_CHANNEL]);
    const L       = samples.length;

    if (!L) continue;

    for (let i = 0; i < L; i++) {
      const raw   = samples[i];
      const score = normalize(raw);

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

// ------------- realtime subscription -------------

let unsubscribe = null;

function startSensorStream() {
  console.log('[firestore] starting listener on collection:', COLLECTION_NAME);

  const colRef = collection(db, COLLECTION_NAME);

  // Simple query: just limit the number of docs, no orderBy, no index requirements
  const qRef = query(colRef, limit(PACKETS_FETCH));

  unsubscribe = onSnapshot(
    qRef,
    (snapshot) => {
      console.log('[firestore] snapshot size:', snapshot.size);

      if (snapshot.empty) {
        console.log('[firestore] no documents found in SensorData');
        setConnected(true);
        return;
      }

      setConnected(true);

      const series = flattenPacketDocs(snapshot.docs);

      if (!series.length) {
        console.log('[firestore] no samples in series yet');
        return;
      }

      const last = series[series.length - 1];
      console.log('[firestore] last point:', last);

      setScore(last.score, last.risk, last.timestamp);
      setHistory(series);

      // Use the last doc in the snapshot as "latest" for raw readings
      const latestDocData = snapshot.docs[snapshot.docs.length - 1].data() || {};
      setRawValues({
        AcX:  lastOf(latestDocData.AcX),
        AcY:  lastOf(latestDocData.AcY),
        AcZ:  lastOf(latestDocData.AcZ),
        HR:   lastOf(latestDocData.HR),
        SPO2:  lastOf(latestDocData.SPO2),
        Temp: lastOf(latestDocData.Temp),
        VHR: lastOf(latestDocData.VHR),
        VSPO2: lastOf(latestDocData.VSPO2),
      });
    },
    (error) => {
      console.error('[firestore] listener error:', error);
      setConnected(false);
    }
  );
}

// Start once at load
startSensorStream();

export function stopSensorStream() {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
    unsubscribe = null;
  }
}