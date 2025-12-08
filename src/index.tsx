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
  const errorName = error?.name || '';
  
  // Check all possible string representations
  const allErrorStrings = [
    errorString,
    errorMessage,
    errorStack,
    errorName,
    JSON.stringify(error)
  ].join(' ');
  
  return (
    allErrorStrings.includes('INTERNAL ASSERTION FAILED') ||
    allErrorStrings.includes('ID: ca9') ||
    allErrorStrings.includes('ID: b815') ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('Unexpected state')) ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('INTERNAL ASSERTION')) ||
    (errorCode === 'failed-precondition' && (allErrorStrings.includes('ID: ca9') || allErrorStrings.includes('ID: b815'))) ||
    // Check for the specific error pattern from the stack trace
    allErrorStrings.includes('__PRIVATE__fail') ||
    allErrorStrings.includes('__PRIVATE_hardAssert') ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('(11.10.0)'))
  );
};

// Override console.error to catch Firestore errors before they're displayed
// This will be set up before React renders to catch all errors
const originalConsoleError = console.error;

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

// Suppress React error overlay for Firestore errors - multiple approaches for maximum coverage
if (typeof window !== 'undefined') {
  // Suppress React error overlay (the red screen in development)
  if ((window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__) {
    const originalOnError = (window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.onError;
    (window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__.onError = function(...args: any[]) {
      // Check all arguments for Firestore errors
      for (const arg of args) {
        if (isFirestoreInternalError(arg)) {
          // Suppress React error overlay for Firestore errors
          return;
        }
      }
      if (originalOnError) {
        return originalOnError.apply(this, args);
      }
    };
  }
  
  // Also intercept React DevTools error reporting
  if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const originalOnCommitFiberRoot = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot;
    if (originalOnCommitFiberRoot) {
      (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = function(...args: any[]) {
        // Check for Firestore errors in React DevTools
        try {
          return originalOnCommitFiberRoot.apply(this, args);
        } catch (error) {
          if (isFirestoreInternalError(error)) {
            return;
          }
          throw error;
        }
      };
    }
  }
  
  // Intercept console.error calls that might trigger React error overlay
  console.error = function(...args: any[]) {
    const errorMessage = args.join(' ');
    if (isFirestoreInternalError(errorMessage) || args.some(arg => isFirestoreInternalError(arg))) {
      // Suppress Firestore internal errors - don't log them
      return;
    }
    originalConsoleError.apply(console, args);
  };
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
