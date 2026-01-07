// app_rtdb.js (ESM) - Realtime Database
import { firebaseConfig } from './firebase-config.js';
import { setConnected, setPatients, getSelectedPatient, setScore, pushReading, setHistory } from './ui.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, onValue, query, orderByChild, limitToLast
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let offStatus = null;
let offReadings = null;
let offPatients = null;

function off(refOrUnsub) {
  // The modular SDK returns an unsubscribe function
  if (typeof refOrUnsub === 'function') { try { refOrUnsub(); } catch {} }
}

function toISO(ts) {
  if (!ts) return null;
  // Firestore Timestamp-like
  if (ts && typeof ts.toDate === 'function') {
    try { return ts.toDate().toISOString(); } catch {}
  }
  if (ts && typeof ts.toMillis === 'function') {
    try { return new Date(ts.toMillis()).toISOString(); } catch {}
  }
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (typeof ts === 'string') {
    const p = Date.parse(ts);
    if (!Number.isNaN(p)) return new Date(p).toISOString();
    return ts; // may already be ISO
  }
  try {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return null;
}

// Patients list at /patients
const patientsRef = ref(db, 'patients');
offPatients = onValue(patientsRef, (snap) => {
  try {
    const val = snap.val() || {};
    const ids = Object.keys(val).sort();
    console.log('[rtdb] patients list:', ids);
    setPatients(ids);
    setConnected(true);
  } catch (err) {
    console.error('[rtdb] patients onValue error:', err);
    setConnected(false);
  }
}, (err) => {
  console.error('[rtdb] patients watch error:', err);
  setConnected(false);
});

function watchPatient(patientId){
  off(offStatus);
  off(offReadings);
  if (!patientId) return;

  // 1) status
  const statusRef = ref(db, `patients/${patientId}/status`);
  offStatus = onValue(statusRef, (snap) => {
    try {
      const data = snap.val() || {};
      if (!data || Object.keys(data).length === 0) {
        console.log('[rtdb] status empty for', patientId);
        return;
      }
      // Normalize timestamp
      const isoTs = toISO(data.updatedAt || data.ts || data.timestamp);
      if (typeof data.score === 'number' && isoTs) {
        setScore(data.score, data.risk, isoTs);
        pushReading({ patient_id: patientId, score: data.score, risk: data.risk, timestamp: isoTs });
        setConnected(true);
      } else {
        console.log('[rtdb] status missing score or timestamp', { patientId, data });
      }
    } catch (e) {
      console.error('[rtdb] status callback error', e);
    }
  }, (err)=>{ console.error('[rtdb] status watch error', err); setConnected(false); });

  // 2) last N readings
  const readingsRef = query(ref(db, `patients/${patientId}/readings`), orderByChild('ts'), limitToLast(600));
  offReadings = onValue(readingsRef, (snap) => {
    try {
      const obj = snap.val() || {};
      const arr = Object.values(obj).sort((a,b)=> new Date(a.ts) - new Date(b.ts))
        .map(x => ({
          patient_id: patientId,
          score: Number(x.score || 0),
          risk: x.risk,
          timestamp: toISO(x.ts) || x.ts
        }));
      setHistory(arr);
    } catch (e) {
      console.error('[rtdb] readings callback error', e);
    }
  }, (err)=>{ console.error('[rtdb] readings watch error', err); setConnected(false); });
}

window.addEventListener('patient-changed', (e) => watchPatient(e.detail.patientId));
setTimeout(() => {
  const p = getSelectedPatient();
  if (p) watchPatient(p);
}, 300);
