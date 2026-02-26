/**
 * Firestore ca9 / ve:-1 internal assertion error suppression.
 * MUST be imported first in index.tsx so it runs before React and any other code.
 * This prevents the red "Uncaught runtime errors" overlay in development.
 */

function buildDiagnostic(value: unknown): string {
  if (value == null) return '';
  const parts: string[] = [
    String(value),
    typeof value === 'object' && value !== null && 'message' in value ? String((value as Error).message) : '',
    typeof value === 'object' && value !== null && 'stack' in value ? String((value as Error).stack) : '',
  ];
  try {
    if (typeof value === 'object' && value !== null) parts.push(JSON.stringify(value));
  } catch (_) {}
  return parts.join(' ');
}

function isFirestoreCa9(value: unknown): boolean {
  const s = buildDiagnostic(value);
  if (!s) return false;
  return (
    s.includes('INTERNAL ASSERTION FAILED') ||
    s.includes('(ID: ca9)') ||
    s.includes('ID: ca9') ||
    (s.includes('FIRESTORE') && s.includes('Unexpected state')) ||
    s.includes('__PRIVATE__fail') ||
    s.includes('__PRIVATE_hardAssert') ||
    (s.includes('CONTEXT') && (s.includes('ve":-1') || s.includes('"ve":-1')))
  );
}

const _originalConsoleError = console.error;
console.error = function (...args: unknown[]) {
  const combined = args.map((a) => buildDiagnostic(a)).join(' ');
  if (isFirestoreCa9(combined) || args.some((a) => isFirestoreCa9(a))) return;
  _originalConsoleError.apply(console, args);
};

window.addEventListener(
  'error',
  (ev: ErrorEvent) => {
    if (isFirestoreCa9(ev.error) || isFirestoreCa9(ev.message) || isFirestoreCa9(buildDiagnostic(ev.error) + ev.message)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return false;
    }
  },
  true
);

window.addEventListener(
  'error',
  (ev: ErrorEvent) => {
    if (isFirestoreCa9(ev.error) || isFirestoreCa9(ev.message)) {
      ev.preventDefault();
      ev.stopPropagation();
      return false;
    }
  },
  false
);

window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  if (isFirestoreCa9(ev.reason) || isFirestoreCa9(buildDiagnostic(ev.reason))) {
    ev.preventDefault();
    ev.stopPropagation();
    return false;
  }
});

// Assign window.onerror so we handle synchronously (overlay may also use it)
const prevOnError = window.onerror;
window.onerror = function (message, source, lineno, colno, error) {
  const s = [String(message), buildDiagnostic(error)].join(' ');
  if (isFirestoreCa9(s) || isFirestoreCa9(message) || isFirestoreCa9(error)) return true;
  if (prevOnError) return prevOnError.call(this, message, source, lineno, colno, error);
  return false;
};

// Expose for overlay hook patching in index.tsx
(window as unknown as { __isFirestoreCa9?: (v: unknown) => boolean }).__isFirestoreCa9 = isFirestoreCa9;
(window as unknown as { __buildFirestoreDiagnostic?: (v: unknown) => string }).__buildFirestoreDiagnostic = buildDiagnostic;

export {};
