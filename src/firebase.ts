import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Firefox-specific Firestore configuration
if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox')) {
  console.log('🦊 Firefox detected - applying Firefox-specific Firestore settings');
  
  // Firefox sometimes has issues with Firestore persistence
  // We'll handle this gracefully by catching any persistence errors
  import('firebase/firestore').then(({ enableNetwork, disableNetwork }) => {
    // Ensure network is enabled for Firefox
    enableNetwork(db).catch((error) => {
      console.warn('Firefox: Could not enable Firestore network, continuing without persistence:', error);
    });
  }).catch((error) => {
    console.warn('Firefox: Could not import Firestore network functions:', error);
  });
}

// Initialize Analytics conditionally to avoid Firefox issues
let analytics: any = null;
isSupported().then(yes => yes ? analytics = getAnalytics(app) : null).catch(() => {
  console.log('Analytics not supported in this browser');
});

export { analytics };

// Firestore connection reset utility
export const resetFirestoreConnection = () => {
  try {
    console.log('🔄 Resetting Firestore connection...');
    // This is a placeholder for connection reset logic
    // The actual reset would require more complex Firestore internals
    console.log('✅ Firestore connection reset attempted');
  } catch (error) {
    console.warn('⚠️ Could not reset Firestore connection:', error);
  }
};

export default app; 