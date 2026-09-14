import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

admin.initializeApp();

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
});

const ADMIN_EMAILS = new Set([
  'edm21179@gmail.com',
  'eddymosley@compscihigh.org',
  'admin@mstgames.net',
]);

const APP_CONTINUE_URL = 'https://summer-games-99fba.web.app/login';

type AuthLike = {
  uid: string;
  token: {
    email?: string;
  };
};

async function assertIsAdmin(auth: AuthLike | undefined): Promise<void> {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const email = (auth.token.email || '').toLowerCase();
  if (email && ADMIN_EMAILS.has(email)) {
    return;
  }

  const roleSnap = await admin.firestore().doc(`userRoles/${auth.uid}`).get();
  if (roleSnap.exists) {
    const data = roleSnap.data() || {};
    const roles = Array.isArray(data.roles) ? data.roles : [];
    if (data.role === 'admin' || roles.includes('admin')) {
      return;
    }
  }

  const studentSnap = await admin.firestore().doc(`students/${auth.uid}`).get();
  if (studentSnap.exists && studentSnap.data()?.role === 'admin') {
    return;
  }

  throw new HttpsError('permission-denied', 'Admin access required.');
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (!password || password.length < 6) {
    throw new HttpsError(
      'invalid-argument',
      'Password must be at least 6 characters.'
    );
  }
  if (password.length > 128) {
    throw new HttpsError('invalid-argument', 'Password is too long.');
  }
}

async function resolveUid(params: {
  uid?: string;
  email?: string;
}): Promise<{ uid: string; email: string }> {
  if (params.uid) {
    const user = await admin.auth().getUser(params.uid);
    return { uid: user.uid, email: user.email || '' };
  }
  const email = normalizeEmail(params.email || '');
  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email or user id is required.');
  }
  const user = await admin.auth().getUserByEmail(email);
  return { uid: user.uid, email: user.email || email };
}

/**
 * Generate a password-reset link for an admin to copy/share.
 * Note: generating a new link invalidates older unused reset codes,
 * so do not also send a Firebase reset email in the same action.
 */
export const adminGeneratePasswordResetLink = onCall(async (request) => {
  await assertIsAdmin(request.auth);

  const email = normalizeEmail(String(request.data?.email || ''));
  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }

  try {
    await admin.auth().getUserByEmail(email);
  } catch {
    throw new HttpsError('not-found', `No Auth account found for ${email}.`);
  }

  let resetLink = '';
  try {
    resetLink = await admin.auth().generatePasswordResetLink(email, {
      url: APP_CONTINUE_URL,
      handleCodeInApp: false,
    });
  } catch (err: unknown) {
    console.error('generatePasswordResetLink failed:', err);
    throw new HttpsError('internal', 'Could not generate password reset link.');
  }

  await admin.firestore().collection('adminLogs').add({
    adminId: request.auth!.uid,
    adminEmail: request.auth!.token.email || null,
    action: 'password_reset_link',
    targetEmail: email,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    email,
    resetLink,
    message: `Reset link generated for ${email}. Share it with the player (do not also send a Firebase reset email for the same user right now).`,
  };
});

/**
 * Directly set a user's Firebase Auth password (admin only).
 */
export const adminSetUserPassword = onCall(async (request) => {
  await assertIsAdmin(request.auth);

  const password = String(request.data?.password || '');
  validatePassword(password);

  let target: { uid: string; email: string };
  try {
    target = await resolveUid({
      uid: request.data?.uid ? String(request.data.uid) : undefined,
      email: request.data?.email ? String(request.data.email) : undefined,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No Auth account found for that user.');
    }
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', 'Could not resolve user.');
  }

  try {
    await admin.auth().updateUser(target.uid, { password });
  } catch (err: unknown) {
    console.error('updateUser password failed:', err);
    throw new HttpsError('internal', 'Failed to update password.');
  }

  await admin.firestore().collection('adminLogs').add({
    adminId: request.auth!.uid,
    adminEmail: request.auth!.token.email || null,
    action: 'password_set',
    targetUid: target.uid,
    targetEmail: target.email || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    uid: target.uid,
    email: target.email,
    message: `Password updated for ${target.email || target.uid}.`,
  };
});
