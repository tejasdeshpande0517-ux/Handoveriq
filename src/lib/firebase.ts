import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.authDomain &&
    firebaseConfig.appId
);

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth: Auth = getAuth(firebaseApp);
export const googleAuthProvider = new GoogleAuthProvider();
export const firestoreDb: Firestore = getFirestore(firebaseApp);
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);
export const firebaseFunctions: Functions = getFunctions(firebaseApp);

export let firebaseAnalytics: Analytics | null = null;
if (typeof window !== 'undefined' && isFirebaseConfigured) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        firebaseAnalytics = getAnalytics(firebaseApp);
      }
    })
    .catch(() => {
      // Analytics optional in restricted environments
    });
}

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8080);
    connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001);
    connectStorageEmulator(firebaseStorage, '127.0.0.1', 9199);
  } catch {
    // Emulators already bound
  }
}
