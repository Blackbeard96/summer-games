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

// Fallback: if overlay still appears, hide it when it shows Firestore ca9
function installOverlayHider() {
  const isFirestoreOverlay = (el: Element): boolean => {
    const t = (el.textContent || '') + (el.getAttribute?.('data-reactroot') ?? '');
    return (
      (t.includes('INTERNAL ASSERTION FAILED') || t.includes('Unexpected state')) &&
      (t.includes('ca9') || t.includes('FIRESTORE'))
    );
  };
  const hideFirestoreOverlay = (node: Node) => {
    const el = node.nodeType === 1 ? (node as Element) : null;
    if (!el || !el.textContent) return;
    if (!isFirestoreOverlay(el)) return;
    // Hide this node and walk up to hide overlay root (fixed full-screen container)
    let target: HTMLElement | null = el as HTMLElement;
    for (let i = 0; i < 8 && target; i++) {
      target.style.setProperty('display', 'none', 'important');
      target.style.setProperty('visibility', 'hidden', 'important');
      target = target.parentElement;
    }
  };
  const scan = (root: Node) => {
    if (root.nodeType === 1) {
      const el = root as Element;
      if (isFirestoreOverlay(el)) hideFirestoreOverlay(el);
      el.querySelectorAll?.('*').forEach((child) => {
        if (isFirestoreOverlay(child)) hideFirestoreOverlay(child);
      });
    }
  };
  if (document.body) {
    const obs = new MutationObserver((list) => {
      for (const rec of list) {
        if (rec.addedNodes.length) {
          rec.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
              scan(n);
            }
          });
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const runScan = () => document.querySelectorAll('body > *').forEach(scan);
    requestAnimationFrame(runScan);
    [0, 100, 300, 500, 1000].forEach((ms) => setTimeout(runScan, ms));
  }
}
if (typeof document !== 'undefined') {
  if (document.body) installOverlayHider();
  else document.addEventListener('DOMContentLoaded', installOverlayHider);
}

// Expose for overlay hook patching in index.tsx
(window as unknown as { __isFirestoreCa9?: (v: unknown) => boolean }).__isFirestoreCa9 = isFirestoreCa9;
(window as unknown as { __buildFirestoreDiagnostic?: (v: unknown) => string }).__buildFirestoreDiagnostic = buildDiagnostic;

export {};
