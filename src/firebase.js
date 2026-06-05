import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

export const isFirebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_DATABASE_URL &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const db = isFirebaseConfigured
  ? getDatabase(initializeApp(firebaseConfig))
  : null;

/** Root path nel Realtime Database per lo stato dell'asta */
export const AUCTION_PATH = 'auction';

/*
 * REGOLE DI SICUREZZA — Realtime Database Rules
 *
 * SVILUPPO (aperte, da usare solo in locale/test):
 * {
 *   "rules": {
 *     ".read": true,
 *     ".write": true
 *   }
 * }
 *
 * PRODUZIONE (esempio — adattare al vostro modello di trust):
 * {
 *   "rules": {
 *     "auction": {
 *       ".read": true,
 *       "timer": {
 *         ".write": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 60"
 *       },
 *       "currentBid": { ".write": true },
 *       "currentBidder": { ".write": true },
 *       "coaches": {
 *         "$idx": {
 *           "online": { ".write": true }
 *         }
 *       },
 *       ".write": "false"
 *     }
 *   }
 * }
 *
 * Nota: senza Firebase Auth non è possibile vincolare write per ruolo lato server.
 * Per produzione seria, aggiungere Auth o Cloud Functions per validare le offerte.
 */
