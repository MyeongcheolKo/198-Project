// bootstrap.js (ESM)
import { setDataSource, initUI } from './ui.js';

// default data source; can be overridden by the dropdown or by setting window.DATA_SOURCE before this loads
let source = (window.DATA_SOURCE || 'firestore').toLowerCase();

// allow user to switch between Firestore & RTDB at runtime
document.addEventListener('DOMContentLoaded', () => {
  const sourceSelect = document.getElementById('sourceSelect');
  if (sourceSelect) sourceSelect.value = source;
  initUI();
  loadSource(source);
  if (sourceSelect) {
    sourceSelect.addEventListener('change', (e) => {
      const next = e.target.value.toLowerCase();
      if (next !== source) {
        source = next;
        // reload the page modules so subscriptions are recreated
        location.reload();
      }
    });
  }
});

async function loadSource(src) {
  setDataSource(src);
  if (src === 'rtdb') {
    await import('./app_rtdb.js');
  } else {
    await import('./app_firestore.js'); // default
  }
}
