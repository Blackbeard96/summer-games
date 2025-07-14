// Firebase Configuration Template
// Copy these values from your Firebase project settings
// and create a .env.local file in the root directory

export const FIREBASE_CONFIG_TEMPLATE = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Required environment variables for .env.local:
export const REQUIRED_ENV_VARS = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID'
];

// Check if all required environment variables are set
export const validateFirebaseConfig = () => {
  const missingVars = REQUIRED_ENV_VARS.filter(
    varName => !process.env[varName] || process.env[varName] === 'YOUR_API_KEY'
  );
  
  if (missingVars.length > 0) {
    console.warn('Missing or invalid Firebase configuration:', missingVars);
    console.warn('Please create a .env.local file with your Firebase credentials');
    return false;
  }
  
  return true;
}; 