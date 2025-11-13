// ui.js — shared UI functions

let chart;
const els = {};

function q(id) {
  return document.getElementById(id);
}

export function initUI() {
  els.mute = q('mute');
  els.status = q('status');
  els.score = q('scoreValue');
  els.risk = q('riskLabel');
  els.updated = q('lastUpdated');
  els.tableBody = document.querySelector('#events tbody');
  els.raw = document.getElementById('rawValues');

  initChart();
}

function initChart() {
  const ctx = document.getElementById('chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Delirium risk',
          data: [],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
        },
      ],
    },
    options: {
      parsing: false,
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'PPpp' },
        },
        y: {
          min: 0,
          max: 1,
          ticks: { stepSize: 0.1 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'nearest', intersect: false },
      },
    },
  });
}

export function setConnected(ok) {
  els.status.textContent = ok ? 'Live' : 'Disconnected';
  els.status.dataset.state = ok ? 'live' : 'down';
}

export function setScore(score, risk, tsIso) {
  els.score.textContent = Number(score).toFixed(2);
  const r = risk ?? (score >= 0.6 ? 'high' : score >= 0.3 ? 'moderate' : 'low');
  els.risk.textContent = String(r).toUpperCase();
  els.updated.textContent = tsIso ? new Date(tsIso).toLocaleString() : '—';
  document.documentElement.setAttribute('data-risk', r);
}

export function setHistory(readings) {
  chart.data.datasets[0].data = readings.map((r) => ({
    x: r.timestamp,
    y: r.score,
  }));
  pruneChart();
  chart.update();

  const last = readings[readings.length - 1];
  if (last) setScore(last.score, last.risk, last.timestamp);

  els.tableBody.innerHTML = '';
  readings
    .slice(-10)
    .reverse()
    .forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${new Date(r.timestamp).toLocaleTimeString()}</td>
                      <td>${Number(r.score).toFixed(2)}</td>
                      <td>${
                        r.risk ??
                        (r.score >= 0.6
                          ? 'high'
                          : r.score >= 0.3
                          ? 'moderate'
                          : 'low')
                      }</td>`;
      els.tableBody.prepend(tr);
    });
}

function pruneChart() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  chart.data.datasets[0].data = chart.data.datasets[0].data.filter((p) => {
    return new Date(p.x).getTime() >= cutoff;
  });
}

// 👇 THIS is the export your app_firestore.js is trying to import
export function setRawValues(values) {
  if (!els.raw) return;
  const fmt = (v) => (v === null || v === undefined ? '—' : v);

  els.raw.innerHTML = `
    <li><strong>IR:</strong> ${fmt(values.IR)}</li>
    <li><strong>BPM:</strong> ${fmt(values.BPM)}</li>
    <li><strong>ABPM:</strong> ${fmt(values.ABPM)}</li>
    <li><strong>AcX:</strong> ${fmt(values.AcX)}</li>
    <li><strong>AcY:</strong> ${fmt(values.AcY)}</li>
    <li><strong>AcZ:</strong> ${fmt(values.AcZ)}</li>
    <li><strong>Temp:</strong> ${fmt(values.Temp)}</li>
  `;
}