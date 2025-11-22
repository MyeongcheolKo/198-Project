#!/usr/bin/env node
/**
 * firestore_to_csv.js
 * 
 * Export Firestore 'SensorData' collection directly to CSV format.
 * 
 * Usage:
 *   node firestore_to_csv.js [--output sensor_data.csv]
 * 
 * Requires:
 *   - Firebase Admin SDK: npm install firebase-admin
 *   - Service account key JSON at: ./firebase-admin-key.json
 *   
 * To get your service account key:
 *   1. Firebase Console > Project Settings > Service Accounts
 *   2. Click "Generate new private key"
 *   3. Save as firebase-admin-key.json in this folder
 */

const admin = require('firebase-admin');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');

const COLLECTION_NAME = 'SensorData';
const KEY_FILE = './firebase-admin-key.json';
const OUTPUT_FILE = process.argv.find(a => a.startsWith('--output='))?.split('=')[1] || 'sensor_data.csv';

async function exportToCsv() {
  try {
    // Load service account key
    if (!fs.existsSync(KEY_FILE)) {
      console.error(`Error: Service account key not found at ${KEY_FILE}`);
      console.error('To get your key:');
      console.error('  1. Go to Firebase Console > Project Settings > Service Accounts');
      console.error('  2. Click "Generate new private key"');
      console.error('  3. Save it as firebase-admin-key.json in this folder');
      process.exit(1);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    
    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });

    const db = admin.firestore();
    
    console.log(`Fetching documents from Firestore collection: ${COLLECTION_NAME}`);
    
    const snapshot = await db.collection(COLLECTION_NAME).get();
    
    if (snapshot.empty) {
      console.warn(`Warning: Collection "${COLLECTION_NAME}" is empty`);
    }

    const records = [];
    const fieldNames = new Set();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const record = { docId: doc.id, ...data };
      Object.keys(record).forEach(k => fieldNames.add(k));
      records.push(record);
    });

    console.log(`Fetched ${records.length} documents`);

    // Prepare CSV headers
    const headers = Array.from(fieldNames).sort();
    console.log(`CSV columns: ${headers.join(', ')}`);

    // Write CSV using csv-writer
    const csvWriter = createObjectCsvWriter({
      path: OUTPUT_FILE,
      header: headers.map(h => ({ id: h, title: h }))
    });

    await csvWriter.writeRecords(records);
    
    console.log(`✓ Saved to: ${OUTPUT_FILE}`);
    console.log(`  Rows: ${records.length}`);
    console.log(`  Columns: ${headers.length}`);

    if (records.length > 0) {
      console.log(`\nSample (first record):`);
      console.log(JSON.stringify(records[0], null, 2).slice(0, 300) + '...');
    }

    await admin.app().delete();
  } catch (err) {
    console.error('Error during export:', err.message);
    process.exit(1);
  }
}

exportToCsv();
