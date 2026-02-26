// Run first: suppress Firestore ca9 before React or dev overlay
import './firestoreErrorSuppression';

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { GoogleOAuthProvider } from '@react-oauth/google';

const clientId = '281092791460-085tqid3jq8e9llqdmlps0f5d6c835n5.apps.googleusercontent.com'; // Replace with your actual client ID

// Build full diagnostic string from any error-like value (for Firestore detection)
function buildErrorDiagnosticString(value: any): string {
  if (value == null) return '';
  const parts: string[] = [
    String(value),
    typeof value === 'object' && value?.message ? String(value.message) : '',
    typeof value === 'object' && value?.stack ? String(value.stack) : '',
    typeof value === 'object' && value?.code != null ? String(value.code) : '',
    typeof value === 'object' && value?.name ? String(value.name) : ''
  ];
  try {
    if (typeof value === 'object') {
      parts.push(JSON.stringify(value));
      if (value.context) parts.push(JSON.stringify(value.context));
    }
  } catch (_) {
    // ignore
  }
  return parts.join(' ');
}

// Helper function to check if error is a Firestore internal assertion error
const isFirestoreInternalError = (error: any): boolean => {
  const allErrorStrings = buildErrorDiagnosticString(error);
  if (!allErrorStrings.length) return false;
  return (
    allErrorStrings.includes('INTERNAL ASSERTION FAILED') ||
    allErrorStrings.includes('ID: ca9') ||
    allErrorStrings.includes('(ID: ca9)') ||
    allErrorStrings.includes('ca9') ||
    allErrorStrings.includes('ID: b815') ||
    allErrorStrings.includes('b815') ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('Unexpected state')) ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('INTERNAL ASSERTION')) ||
    allErrorStrings.includes('__PRIVATE__fail') ||
    allErrorStrings.includes('__PRIVATE_hardAssert') ||
    allErrorStrings.includes('__PRIVATE_WatchChangeAggregator') ||
    allErrorStrings.includes('__PRIVATE_PersistentListenStream') ||
    allErrorStrings.includes('BrowserConnectivityMonitor') ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('(11.10.0)')) ||
    (allErrorStrings.includes('CONTEXT') && (allErrorStrings.includes('"ve":-1') || allErrorStrings.includes('ve":-1')))
  );
};

// For window error events: build one string from message + error so nothing is missed (e.g. Firefox)
function getEventDiagnosticString(event: { message?: string; error?: any; reason?: any }): string {
  const parts = [event.message || '', buildErrorDiagnosticString(event.error), buildErrorDiagnosticString((event as any).reason)];
  return parts.join(' ');
}

// Override console.error to catch Firestore errors before they're displayed
// This will be set up before React renders to catch all errors
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  // Check all arguments for Firestore errors
  const errorMessage = args.map(a => String(a)).join(' ');
  if (isFirestoreInternalError(errorMessage) || args.some(arg => isFirestoreInternalError(arg))) {
    return; // Completely suppress Firestore errors
  }
  originalConsoleError.apply(console, args);
};

// Capture phase: suppress Firestore so overlay never sees it
window.addEventListener('error', (event) => {
  const diagnostic = getEventDiagnosticString(event);
  if (isFirestoreInternalError(event.error) || isFirestoreInternalError(event.message) || isFirestoreInternalError(diagnostic)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
}, true);

window.addEventListener('error', (event) => {
  const diagnostic = getEventDiagnosticString(event);
  if (isFirestoreInternalError(event.error) || isFirestoreInternalError(event.message) || isFirestoreInternalError(diagnostic)) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
}, false);

window.addEventListener('unhandledrejection', (event) => {
  const diagnostic = buildErrorDiagnosticString(event.reason);
  if (isFirestoreInternalError(event.reason) || isFirestoreInternalError(diagnostic)) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

// Suppress React error overlay for Firestore errors - multiple approaches for maximum coverage
if (typeof window !== 'undefined') {
  // Intercept React error overlay as early as possible
  const setupReactErrorOverlaySuppression = () => {
    // Method 1: Intercept __REACT_ERROR_OVERLAY_GLOBAL_HOOK__
    if ((window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__) {
      const hook = (window as any).__REACT_ERROR_OVERLAY_GLOBAL_HOOK__;
      
      // Intercept onError (called when React catches an error)
      if (hook.onError) {
        const originalOnError = hook.onError;
        hook.onError = function(...args: any[]) {
          for (const arg of args) {
            if (isFirestoreInternalError(arg) || isFirestoreInternalError(buildErrorDiagnosticString(arg))) return;
          }
          const combinedMessage = args.map((a) => buildErrorDiagnosticString(a)).join(' ');
          if (isFirestoreInternalError(combinedMessage)) return;
          return originalOnError.apply(this, args);
        };
      }
      // Intercept showErrorOverlay (prevents the red overlay from appearing)
      if (hook.showErrorOverlay) {
        const originalShowErrorOverlay = hook.showErrorOverlay;
        hook.showErrorOverlay = function(...args: any[]) {
          for (const arg of args) {
            if (isFirestoreInternalError(arg) || isFirestoreInternalError(buildErrorDiagnosticString(arg))) return;
          }
          const combinedMessage = args.map((a) => buildErrorDiagnosticString(a)).join(' ');
          if (isFirestoreInternalError(combinedMessage)) return;
          return originalShowErrorOverlay.apply(this, args);
        };
      }
    }
    
    // Method 2: Intercept console.error that triggers overlay (only if not already overridden)
    // Note: originalConsoleError is defined at the top of the file
    if (!console.error.toString().includes('isFirestoreInternalError')) {
      const currentConsoleError = console.error;
      console.error = function(...args: any[]) {
        const errorMessage = args.join(' ');
        if (isFirestoreInternalError(errorMessage) || args.some(arg => isFirestoreInternalError(arg))) {
          return;
        }
        currentConsoleError.apply(console, args);
      };
    }
  };
  
  // Set up immediately and also after multiple delays to catch late initialization
  setupReactErrorOverlaySuppression();
  setTimeout(setupReactErrorOverlaySuppression, 0);
  setTimeout(setupReactErrorOverlaySuppression, 50);
  setTimeout(setupReactErrorOverlaySuppression, 100);
  setTimeout(setupReactErrorOverlaySuppression, 200);
  setTimeout(setupReactErrorOverlaySuppression, 500);
  setTimeout(setupReactErrorOverlaySuppression, 1000); // Even later initialization
  
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
  
  // Method 3: Intercept window.onerror more aggressively
  const originalWindowOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    // Check all possible error representations
    const errorMessage = String(message || '');
    const errorString = error ? String(error) : '';
    const errorStack = error?.stack || '';
    
    if (isFirestoreInternalError(message) || 
        isFirestoreInternalError(error) || 
        isFirestoreInternalError(errorMessage) ||
        isFirestoreInternalError(errorString) ||
        isFirestoreInternalError(errorStack) ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('ca9') ||
        (errorMessage.includes('FIRESTORE') && errorMessage.includes('Unexpected state'))) {
      return true; // Suppress the error
    }
    if (originalWindowOnError) {
      return originalWindowOnError.call(this, message, source, lineno, colno, error);
    }
    return false;
  };
}

// Error boundary: catch Firestore ca9 so it never reaches the dev overlay
class FirestoreErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const isCa9 = (window as unknown as { __isFirestoreCa9?: (v: unknown) => boolean }).__isFirestoreCa9?.(this.state.error) ?? false;
      if (isCa9) return null; // Swallow: no overlay, no fallback
      return <div style={{ padding: '2rem', textAlign: 'center' }}>Something went wrong.</div>;
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <GoogleOAuthProvider clientId={clientId}>
    <React.StrictMode>
      <FirestoreErrorBoundary>
        <App />
      </FirestoreErrorBoundary>
    </React.StrictMode>
  </GoogleOAuthProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
