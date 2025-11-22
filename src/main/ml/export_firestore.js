#!/usr/bin/env node
/**
 * export_firestore.js
 * 
 * Export all documents from Firestore 'SensorData' collection to JSON.
 * 
 * Usage:
 *   node export_firestore.js [--output firestore_export.json]
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
const path = require('path');

const COLLECTION_NAME = 'SensorData';
const KEY_FILE = './firebase-admin-key.json';
const OUTPUT_FILE = process.argv.find(a => a.startsWith('--output='))?.split('=')[1] || 'firestore_export.json';

async function exportFirestore() {
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

    const documents = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      documents.push({
        docId: doc.id,
        ...data
      });
    });

    console.log(`Fetched ${documents.length} documents`);

    // Save to JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(documents, null, 2));
    console.log(`Saved to: ${OUTPUT_FILE}`);

    // Print summary
    if (documents.length > 0) {
      console.log(`\nSample (first document):`);
      console.log(JSON.stringify(documents[0], null, 2).slice(0, 500) + '...');
    }

    await admin.app().delete();
  } catch (err) {
    console.error('Error during export:', err.message);
    process.exit(1);
  }
}

exportFirestore();
