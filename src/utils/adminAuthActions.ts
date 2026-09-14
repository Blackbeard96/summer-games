import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  sendPasswordResetEmail,
  ActionCodeSettings,
} from 'firebase/auth';
import app, { auth } from '../firebase';

const CONTINUE_URL = 'https://summer-games-99fba.web.app/login';

const actionCodeSettings: ActionCodeSettings = {
  url: CONTINUE_URL,
  handleCodeInApp: false,
};

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function callableErrorMessage(err: unknown): string {
  const e = err as { message?: string; code?: string; details?: unknown };
  if (typeof e?.message === 'string' && e.message) return e.message;
  if (typeof e?.code === 'string') return e.code;
  return 'Request failed';
}

export type AdminPasswordResetResult = {
  ok: boolean;
  email: string;
  emailSent: boolean;
  message: string;
};

export type AdminResetLinkResult = {
  ok: boolean;
  email: string;
  resetLink: string;
  message: string;
};

export type AdminSetPasswordResult = {
  ok: boolean;
  uid: string;
  email: string;
  message: string;
};

function getCallableFunctions() {
  return getFunctions(app, 'us-central1');
}

/**
 * Send Firebase's built-in password reset email (client SDK).
 * Normalizes email + sets continue URL back to the app login page.
 */
export async function adminSendPasswordResetEmail(
  email: string
): Promise<AdminPasswordResetResult> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) {
    throw new Error('Please enter a valid email address');
  }

  try {
    await sendPasswordResetEmail(auth, normalized, actionCodeSettings);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      throw new Error(`No Auth account found for ${normalized}`);
    }
    if (code === 'auth/invalid-email') {
      throw new Error(`Invalid email address: ${normalized}`);
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many reset attempts. Wait a few minutes and try again.');
    }
    throw new Error(callableErrorMessage(err));
  }

  return {
    ok: true,
    email: normalized,
    emailSent: true,
    message: `Password reset email sent to ${normalized}. Ask the player to check inbox and spam.`,
  };
}

/** Generate a one-time reset link for admin to copy/share (Cloud Function). */
export async function adminGeneratePasswordResetLink(
  email: string
): Promise<AdminResetLinkResult> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) {
    throw new Error('Please enter a valid email address');
  }

  try {
    const fn = httpsCallable<{ email: string }, AdminResetLinkResult>(
      getCallableFunctions(),
      'adminGeneratePasswordResetLink'
    );
    const result = await fn({ email: normalized });
    return result.data;
  } catch (err: unknown) {
    throw new Error(callableErrorMessage(err));
  }
}

/** Set a user's Auth password directly (Cloud Function + Admin SDK). */
export async function adminSetUserPassword(params: {
  uid?: string;
  email?: string;
  password: string;
}): Promise<AdminSetPasswordResult> {
  const password = String(params.password || '');
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  try {
    const fn = httpsCallable<
      { uid?: string; email?: string; password: string },
      AdminSetPasswordResult
    >(getCallableFunctions(), 'adminSetUserPassword');

    const payload: { uid?: string; email?: string; password: string } = {
      password,
    };
    if (params.uid) payload.uid = params.uid;
    if (params.email) payload.email = normalizeEmail(params.email);

    const result = await fn(payload);
    return result.data;
  } catch (err: unknown) {
    throw new Error(callableErrorMessage(err));
  }
}

/** Public password-reset page helper */
export async function sendAppPasswordResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, normalizeEmail(email), actionCodeSettings);
}
