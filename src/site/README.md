# Delirium Monitor — Firebase Web (drop-in)

A static website that **updates in real time** from **Firebase**. Choose either **Cloud Firestore** or **Realtime Database**.

> ⚠️ Research demo only. Do not store or display PHI on public builds. Lock down security rules before any real use.

---

## 1) Files

```
delirium-web/
├─ index.html
├─ styles.css
├─ ui.js
├─ app_firestore.js         # Firestore realtime implementation
├─ app_rtdb.js              # Realtime Database implementation
├─ firebase-config.sample.js  # Copy to firebase-config.js and fill in
└─ firebase.json            # Optional: for Firebase Hosting deploys
```

---

## 2) Configure Firebase (Web App)

1. Create (or open) your Firebase project in the console.
2. In **Project settings → Your apps**, add a **Web app** and copy the config snippet.
3. Create `firebase-config.js` in this folder by copying `firebase-config.sample.js`, then paste your config values.

---

## 3) Pick your database and structure

### Option A — **Cloud Firestore** (recommended for simple reads)

Enable Firestore in the console. Create data like this:

```
patients (collection)
  └─ bed-12 (document)
     ├─ score: 0.72
     ├─ risk: "high"            # optional (derived from score if absent)
     ├─ updatedAt: "2025-01-01T12:00:00Z"
     └─ readings (subcollection)
        └─ 2025-01-01T12:00:00Z (document id can be any unique key)
           ├─ ts: "2025-01-01T12:00:00Z"
           ├─ score: 0.72
           └─ features: { "hr": 84 }
```

This site listens with `onSnapshot()` to update instantly when data changes.

### Option B — **Realtime Database**

Enable **Realtime Database** (RTDB). Create data like this:

```
patients
  └─ bed-12
     ├─ status
     │  ├─ score: 0.72
     │  ├─ risk: "high"
     │  └─ updatedAt: "2025-01-01T12:00:00Z"
     └─ readings
        └─ 2025-01-01T12:00:00Z
           ├─ ts: "2025-01-01T12:00:00Z"
           ├─ score: 0.72
           └─ features: { "hr": 84 }
```

This site uses `onValue()` with a query to pull the latest readings as they stream in.

> **Tip:** Keep timestamps as ISO-8601 ('YYYY-MM-DDTHH:mm:ssZ') so they chart correctly.

---

## 4) Local preview

Just open `index.html` in a local HTTP server (module imports require HTTP, not the `file://` protocol):

```bash
# Python 3
python -m http.server -d . 8080
# or Node
npx http-server . -p 8080
```

Then visit `http://localhost:8080` and use the **Data Source** dropdown to choose **Firestore** or **Realtime DB**.

---

## 5) Deploy to Firebase Hosting (optional)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose this folder as your public directory ("." )
firebase deploy --only hosting
```

Your site will be available at `https://<project-id>.web.app`.

---

## 6) Sensor → Firebase (examples)

### A) Firestore via Node (server, laptop, or gateway)

```js
// npm i firebase-admin
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('serviceAccount.json','utf8'))) });
const db = admin.firestore();

async function pushReading(patientId, score, features={}) {
  const ts = new Date().toISOString();
  const docRef = db.doc(`patients/${patientId}`);
  await docRef.set({ score, risk: score>=0.6?'high':(score>=0.3?'moderate':'low'), updatedAt: ts }, { merge: true });
  await docRef.collection('readings').add({ ts, score, features });
}

pushReading('bed-12', 0.72, { hr: 84 });
```

### B) Realtime Database via REST (curl)

```bash
# Requires your databaseURL and an auth token (use Emulator or secure server-side auth in production)
curl -X PUT "https://<project-id>-default-rtdb.firebaseio.com/patients/bed-12/status.json?auth=<TOKEN>"   -H "Content-Type: application/json"   -d '{"score":0.72,"risk":"high","updatedAt":"'$(date -u +%FT%TZ)'"}'
```

---

## 7) Security (dev vs prod)

**Development (quick demo)**

- Firestore rules (read-only public demo):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /patients/{patientId} { allow read: if true; allow write: if false; }
      match /patients/{patientId}/readings/{readingId} { allow read: if true; allow write: if false; }
    }
  }
  ```

- RTDB rules (read-only public demo):
  ```json
  {
    "rules": {
      "patients": { ".read": true, ".write": false }
    }
  }
  ```

**Production**

- Lock reads to signed-in staff and writes to trusted server code only.
- Consider Firebase Emulator Suite for local testing.

---

## 8) Repo integration

You can drop this entire folder into your repo (e.g., `198-Project/site/`) and deploy it as-is. Update `firebase-config.js` and start pushing sensor readings to your chosen database.

---

## 9) Notes

- Chart shows ~10 minutes of data (adjust in `ui.js`).
- Risk color logic is based on 0.3/0.6 thresholds; change in `ui.js` if needed.
- The UI is keyboard-friendly and high-contrast for nurse workflows.
