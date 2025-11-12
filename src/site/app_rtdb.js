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

// Patients list at /patients
const patientsRef = ref(db, 'patients');
offPatients = onValue(patientsRef, (snap) => {
  const val = snap.val() || {};
  const ids = Object.keys(val).sort();
  setPatients(ids);
  setConnected(true);
}, (err) => {
  console.error(err);
  setConnected(false);
});

function watchPatient(patientId){
  off(offStatus);
  off(offReadings);
  if (!patientId) return;

  // 1) status
  const statusRef = ref(db, `patients/${patientId}/status`);
  offStatus = onValue(statusRef, (snap) => {
    const data = snap.val() || {};
    if (typeof data.score === 'number' && data.updatedAt) {
      setScore(data.score, data.risk, data.updatedAt);
      pushReading({ patient_id: patientId, score: data.score, risk: data.risk, timestamp: data.updatedAt });
    }
  }, (err)=>console.error('status watch error', err));

  // 2) last N readings
  const readingsRef = query(ref(db, `patients/${patientId}/readings`), orderByChild('ts'), limitToLast(600));
  offReadings = onValue(readingsRef, (snap) => {
    const obj = snap.val() || {};
    const arr = Object.values(obj).sort((a,b)=> new Date(a.ts) - new Date(b.ts))
      .map(x => ({ patient_id: patientId, score: Number(x.score || 0), risk: x.risk, timestamp: x.ts }));
    setHistory(arr);
  }, (err)=>console.error('readings watch error', err));
}

window.addEventListener('patient-changed', (e) => watchPatient(e.detail.patientId));
setTimeout(() => {
  const p = getSelectedPatient();
  if (p) watchPatient(p);
}, 300);
