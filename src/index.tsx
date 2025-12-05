import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { GoogleOAuthProvider } from '@react-oauth/google';

const clientId = '281092791460-085tqid3jq8e9llqdmlps0f5d6c835n5.apps.googleusercontent.com'; // Replace with your actual client ID

// Helper function to check if error is a Firestore internal assertion error
const isFirestoreInternalError = (error: any): boolean => {
  if (!error) return false;
  const errorString = String(error);
  const errorMessage = error?.message || '';
  const errorStack = error?.stack || '';
  const errorCode = error?.code || '';
  
  return (
    errorString.includes('INTERNAL ASSERTION FAILED') || 
    errorMessage.includes('INTERNAL ASSERTION FAILED') ||
    errorStack.includes('INTERNAL ASSERTION FAILED') ||
    errorString.includes('ID: ca9') ||
    errorString.includes('ID: b815') ||
    errorMessage.includes('ID: ca9') ||
    errorMessage.includes('ID: b815') ||
    errorStack.includes('ID: ca9') ||
    errorStack.includes('ID: b815') ||
    (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state')) ||
    (errorMessage.includes('FIRESTORE') && errorMessage.includes('Unexpected state')) ||
    (errorCode === 'failed-precondition' && (errorMessage.includes('ID: ca9') || errorMessage.includes('ID: b815')))
  );
};

// Override console.error to catch Firestore errors before they're displayed
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  const errorMessage = args.join(' ');
  if (isFirestoreInternalError(errorMessage) || args.some(arg => isFirestoreInternalError(arg))) {
    // Suppress Firestore internal errors - don't log them
    return;
  }
  originalConsoleError.apply(console, args);
};

// Add error handling for debugging Firefox issues - multiple layers for maximum coverage
window.addEventListener('error', (event) => {
  // Suppress Firestore internal assertion errors
  if (isFirestoreInternalError(event.error) || isFirestoreInternalError(event.message)) {
    // Completely suppress - don't even warn in production
    event.preventDefault(); // Prevent default error handling
    event.stopPropagation(); // Stop event propagation
    event.stopImmediatePropagation(); // Stop immediate propagation
    return false;
  }
  // Only log non-Firestore errors
  originalConsoleError('Global error caught:', event.error);
  originalConsoleError('Error details:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
}, true); // Use capture phase to catch errors earlier

// Additional error listener in bubble phase for Firefox compatibility
window.addEventListener('error', (event) => {
  if (isFirestoreInternalError(event.error) || isFirestoreInternalError(event.message)) {
    // Completely suppress - don't log anything
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
}, false);

window.addEventListener('unhandledrejection', (event) => {
  // Suppress Firestore internal assertion errors
  if (isFirestoreInternalError(event.reason)) {
    // Completely suppress - don't even warn
    event.preventDefault(); // Prevent default error handling
    event.stopPropagation(); // Stop event propagation
    return false;
  }
  originalConsoleError('Unhandled promise rejection:', event.reason);
});

// Suppress React error overlay for Firestore errors
if (typeof window !== 'undefined') {
  // Suppress React error overlay (the red screen in development)
  if ((window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__) {
    const originalOnError = (window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.onError;
    (window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.onError = function(...args: any[]) {
      const error = args[0];
      if (isFirestoreInternalError(error)) {
        // Suppress React error overlay for Firestore errors
        return;
      }
      if (originalOnError) {
        return originalOnError.apply(this, args);
      }
    };
  }
}

console.log('App starting...', {
  userAgent: navigator.userAgent,
  browser: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other',
  window: typeof window !== 'undefined',
  document: typeof document !== 'undefined'
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

try {
  root.render(
    <GoogleOAuthProvider clientId={clientId}>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </GoogleOAuthProvider>
  );
  console.log('App rendered successfully');
} catch (error) {
  console.error('Error rendering app:', error);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
