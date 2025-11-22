// ui.js — shared UI functions

const els = {};
let pendingHistory = null;
let scoringModeChangeCallback = null; // NEW: callback when mode changes

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
  els.scoringMode = q('scoringMode'); // NEW

  // NEW: Wire up scoring mode selector
  if (els.scoringMode) {
    els.scoringMode.addEventListener('change', (e) => {
      const newMode = e.target.value;
      console.log('[ui] scoring mode changed to:', newMode);
      if (scoringModeChangeCallback) {
        scoringModeChangeCallback(newMode);
      }
    });
  }

  // If we received history before init, apply it now
  if (pendingHistory) {
    setHistory(pendingHistory);
    pendingHistory = null;
  }
}

export function setConnected(ok) {
  if (!els.status) {
    // UI not initialized yet; don't throw
    console.debug('[ui] setConnected called before initUI');
    return;
  }
  els.status.textContent = ok ? 'Live' : 'Disconnected';
  els.status.dataset.state = ok ? 'live' : 'down';
}

export function setScore(score, risk, tsIso) {
  if (!els.score) {
    console.debug('[ui] setScore called before initUI');
    return;
  }
  els.score.textContent = Number(score).toFixed(2);
  const r = risk ?? (score >= 0.6 ? 'high' : score >= 0.3 ? 'moderate' : 'low');
  els.risk.textContent = String(r).toUpperCase();
  els.updated.textContent = tsIso ? new Date(tsIso).toLocaleString() : '—';
  document.documentElement.setAttribute('data-risk', r);
}

export function setHistory(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    console.debug('[ui] setHistory called with empty readings');
    return;
  }

  const last = readings[readings.length - 1];
  if (last) setScore(last.score, last.risk, last.timestamp);

  if (!els.tableBody) {
    console.debug('[ui] setHistory called before table element exists');
    return;
  }

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

export function setRawValues(values) {
  if (!els.raw) {
    console.debug('[ui] setRawValues called before initUI');
    return;
  }
  const fmt = (v) => (v === null || v === undefined ? '—' : v);

  els.raw.innerHTML = `
    <li><strong>AcX:</strong> ${fmt(values.AcX)}</li>
    <li><strong>AcY:</strong> ${fmt(values.AcY)}</li>
    <li><strong>AcZ:</strong> ${fmt(values.AcZ)}</li>
    <li><strong>HR:</strong> ${fmt(values.HR)}</li>
    <li><strong>Magnitude:</strong> ${fmt(values.Magnitude)}</li>
    <li><strong>SPO2:</strong> ${fmt(values.SPO2)}</li>
    <li><strong>Temp:</strong> ${fmt(values.Temp)}</li>
  `;
}

// NEW: Register callback for mode changes
export function onScoringModeChange(callback) {
  scoringModeChangeCallback = callback;
}

// Auto-init UI as a safe fallback
window.addEventListener('DOMContentLoaded', () => {
  try { initUI(); } catch (e) { console.debug('[ui] auto init failed', e); }
});