// ui.js (ESM) - shared UI helpers for both Firestore & RTDB backends
let chart;
let selectedPatient = null;
let dataSource = 'firestore';

const els = {};
function q(id){ return document.getElementById(id); }

export function setDataSource(v){ dataSource = v; }

export function initUI(){
  els.patientSelect = q('patientSelect');
  els.mute = q('mute');
  els.status = q('status');
  els.score = q('scoreValue');
  els.risk = q('riskLabel');
  els.updated = q('lastUpdated');
  els.tableBody = document.querySelector('#events tbody');

  initChart();
  attachHandlers();
}

function attachHandlers(){
  if (els.mute) els.mute.addEventListener('change', ()=> {});
  if (els.patientSelect) els.patientSelect.addEventListener('change', ()=>{
    selectedPatient = els.patientSelect.value || null;
    window.dispatchEvent(new CustomEvent('patient-changed', { detail: { patientId: selectedPatient }}));
  });
}

function initChart(){
  const ctx = document.getElementById('chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{ label: 'Delirium risk', data: [], borderWidth: 2, pointRadius: 0, tension: 0.15 }] },
    options: {
      parsing: false, animation: false, responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'time', time: { tooltipFormat: 'PPpp' } },
        y: { min: 0, max: 1, ticks: { stepSize: 0.1 } }
      },
      plugins: { legend: { display: false }, tooltip: { mode: 'nearest', intersect: false } }
    }
  });
}

export function setConnected(ok){
  els.status.textContent = ok ? 'Live' : 'Disconnected';
  els.status.dataset.state = ok ? 'live' : 'down';
}

export function setPatients(patients){
  const prev = selectedPatient;
  els.patientSelect.innerHTML = '';
  if (!patients || !patients.length) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '— waiting for first reading —';
    els.patientSelect.appendChild(opt);
    selectedPatient = null;
    return;
  }
  patients.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = id;
    els.patientSelect.appendChild(opt);
  });
  if (!prev || !patients.includes(prev)) selectedPatient = patients[0];
  els.patientSelect.value = selectedPatient;
  window.dispatchEvent(new CustomEvent('patient-changed', { detail: { patientId: selectedPatient }}));
}

export function getSelectedPatient(){ return selectedPatient; }

export function setScore(score, risk, tsIso){
  els.score.textContent = Number(score).toFixed(2);
  els.risk.textContent = String(risk || riskFromScore(score)).toUpperCase();
  els.updated.textContent = tsIso ? new Date(tsIso).toLocaleString() : '—';
  document.documentElement.setAttribute('data-risk', (risk || riskFromScore(score)));
}

export function pushReading(r){
  if (!r || typeof r.score !== 'number' || !r.timestamp) return;
  chart.data.datasets[0].data.push({ x: r.timestamp, y: r.score });
  pruneChart();
  chart.update('none');
  pushEventRow(r);
  if ((r.risk || riskFromScore(r.score)) === 'high') beep();
}

export function setHistory(readings){
  chart.data.datasets[0].data = readings.map(r => ({ x: r.timestamp, y: r.score }));
  pruneChart();
  chart.update();
  const last = readings[readings.length - 1];
  if (last) setScore(last.score, last.risk, last.timestamp);
  // fill recent events table
  els.tableBody.innerHTML = '';
  readings.slice(-10).reverse().forEach(pushEventRow);
}

function pruneChart(){
  const cutoff = Date.now() - 10 * 60 * 1000;
  chart.data.datasets[0].data = chart.data.datasets[0].data.filter(p => new Date(p.x).getTime() >= cutoff);
}

function pushEventRow(r){
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td>${r.patient_id || r.patientId || ''}</td>
                  <td>${Number(r.score).toFixed(2)}</td>
                  <td>${(r.risk || riskFromScore(r.score))}</td>`;
  els.tableBody.prepend(tr);
  // keep last 10 rows
  while (els.tableBody.rows.length > 10) els.tableBody.deleteRow(els.tableBody.rows.length - 1);
}

function riskFromScore(s){
  if (s >= 0.6) return 'high';
  if (s >= 0.3) return 'moderate';
  return 'low';
}

function beep(){
  if (els.mute && els.mute.checked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.stop(ctx.currentTime + 0.35);
  } catch {}
}
