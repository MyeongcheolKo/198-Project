// app_firestore.js (ESM) - Firestore realtime
import { firebaseConfig } from './firebase-config.js';
import { setConnected, setPatients, getSelectedPatient, setScore, pushReading, setHistory } from './ui.js';

// Firebase v10 modular CDN imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc, onSnapshot, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Keep unsubscribers to clean up when patient changes
let unsubStatus = null;
let unsubReadings = null;
let unsubPatients = null;

// Patients list
const patientsCol = collection(db, 'patients');
unsubPatients = onSnapshot(patientsCol, (snap) => {
  const ids = snap.docs.map(d => d.id).sort();
  setPatients(ids);
  setConnected(true);
}, (err) => {
  console.error(err);
  setConnected(false);
});

async function watchPatient(patientId){
  if (unsubStatus) unsubStatus();
  if (unsubReadings) unsubReadings();
  if (!patientId) return;

  // 1) current status document
  const statusRef = doc(db, 'patients', patientId);
  unsubStatus = onSnapshot(statusRef, (snap) => {
    const data = snap.data() || {};
    if (typeof data.score === 'number' && data.updatedAt) {
      setScore(data.score, data.risk, data.updatedAt);
      pushReading({ patient_id: patientId, score: data.score, risk: data.risk, timestamp: data.updatedAt });
    }
  }, (err) => console.error('status watch error', err));

  // 2) last N readings for chart/table
  const readingsRef = collection(db, 'patients', patientId, 'readings');
  const qy = query(readingsRef, orderBy('ts', 'desc'), limit(600)); // latest 600 points
  unsubReadings = onSnapshot(qy, (snap) => {
    const arrDesc = snap.docs.map(d => {
      const x = d.data() || {};
      return { patient_id: patientId, score: Number(x.score || 0), risk: x.risk, timestamp: x.ts };
    });
    const arr = arrDesc.reverse();
    setHistory(arr);
  }, (err) => console.error('readings watch error', err));
}

// Listen for patient selection changes
window.addEventListener('patient-changed', (e) => watchPatient(e.detail.patientId));

// If a patient was auto-selected by UI, start watching
setTimeout(() => {
  const p = getSelectedPatient();
  if (p) watchPatient(p);
}, 300);
