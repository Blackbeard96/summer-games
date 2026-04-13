import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Artifacts whose *use* is submitted for admin review in the same queue as UXP credits
 * (Admin → UXP Approval tab).
 */
export function artifactRequiresUxpStyleApproval(
  artifact: { name?: string; id?: string } | null | undefined
): boolean {
  if (!artifact) return false;
  const name = String(artifact.name ?? '').toLowerCase();
  const id = String(artifact.id ?? '').toLowerCase().replace(/_/g, '-');
  if (name.includes('uxp')) return true;
  if (id.startsWith('uxp-credit')) return true;
  if (id === 'assignment-pass' || id === 'assignmentpass') return true;
  if (name.includes('assignment pass')) return true;
  return false;
}

export type StaffApprovalArtifactMeta = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  image?: string;
  category?: string;
  rarity?: string;
};

const pendingFields = () => ({
  pending: true,
  pendingApproval: true,
  approvalStatus: 'pending' as const,
  submittedAt: new Date(),
  used: false,
});

/**
 * Mark one unused instance as pending staff approval on `users/{uid}.artifacts` (array or object).
 * Does not remove `students` inventory (same as UXP flow).
 */
export async function markUserArtifactPendingStaffApproval(
  userId: string,
  meta: StaffApprovalArtifactMeta
): Promise<{ ok: boolean; error?: string }> {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return { ok: false, error: 'User profile not found' };

  const userData = snap.data();
  const raw = userData.artifacts;

  if (Array.isArray(raw)) {
    let foundOne = false;
    const next = raw.map((artifact: unknown) => {
      if (foundOne) return artifact;
      if (typeof artifact === 'string') {
        if (artifact === meta.name) {
          foundOne = true;
          return {
            id: meta.id,
            name: meta.name,
            description: meta.description,
            icon: meta.icon,
            image: meta.image,
            category: meta.category,
            rarity: meta.rarity,
            purchasedAt: null,
            isLegacy: true,
            ...pendingFields(),
          };
        }
        return artifact;
      }
      if (artifact && typeof artifact === 'object') {
        const a = artifact as Record<string, unknown>;
        const isNotUsed = a.used === false || a.used === undefined || a.used === null;
        if (isNotUsed && (a.id === meta.id || a.name === meta.name)) {
          foundOne = true;
          return { ...a, ...pendingFields() };
        }
      }
      return artifact;
    });
    if (!foundOne) return { ok: false, error: 'No unused artifact found to submit' };
    await updateDoc(userRef, { artifacts: next });
    return { ok: true };
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    let foundKey: string | null = null;
    for (const key of Object.keys(o)) {
      if (!key.endsWith('_purchase')) continue;
      const val = o[key];
      if (!val || typeof val !== 'object') continue;
      const a = val as Record<string, unknown>;
      const isNotUsed = a.used === false || a.used === undefined || a.used === null;
      const matches = a.name === meta.name || a.id === meta.id;
      if (matches && isNotUsed) {
        foundKey = key;
        break;
      }
    }
    if (!foundKey) return { ok: false, error: 'No unused artifact found to submit' };
    const updated = { ...o };
    updated[foundKey] = { ...(updated[foundKey] as object), ...pendingFields() };
    await updateDoc(userRef, { artifacts: updated });
    return { ok: true };
  }

  return { ok: false, error: 'Unsupported artifacts storage format' };
}
