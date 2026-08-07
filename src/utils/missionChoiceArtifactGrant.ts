/**
 * Grant artifacts from a mission CHOICE result (player self-claim; idempotent if already owned).
 */

import { doc, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getArtifactDetails } from './artifactCompensation';
import { normalizeEquippableCatalogSlot } from './equippableArtifactSlot';

export async function grantMissionChoiceArtifacts(args: {
  userId: string;
  artifactIds: string[];
  missionId: string;
  stepId: string;
  choiceId: string;
}): Promise<{ granted: string[]; alreadyOwned: string[]; names: Record<string, string> }> {
  const ids = Array.from(
    new Set(
      (args.artifactIds || [])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
    )
  );
  if (ids.length === 0) {
    return { granted: [], alreadyOwned: [], names: {} };
  }

  const granted: string[] = [];
  const alreadyOwned: string[] = [];
  const names: Record<string, string> = {};

  for (const artifactId of ids) {
    const details = await getArtifactDetails(artifactId);
    const normalizedId = details.id;
    names[normalizedId] = details.name;

    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', args.userId);
      const studentRef = doc(db, 'students', args.userId);
      const [userDoc, studentDoc] = await Promise.all([tx.get(userRef), tx.get(studentRef)]);

      if (!userDoc.exists() && !studentDoc.exists()) {
        throw new Error('Player profile not found.');
      }

      const userData = userDoc.exists() ? userDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const studentArtifacts = { ...(studentData.artifacts || {}) };
      const userArtifacts = Array.isArray(userData.artifacts) ? [...userData.artifacts] : [];

      const existingInStudent = studentArtifacts[normalizedId] === true;
      const existingInUser = userArtifacts.some(
        (art: unknown) =>
          (typeof art === 'string' && (art === normalizedId || art === artifactId)) ||
          (typeof art === 'object' &&
            art != null &&
            ((art as { id?: string }).id === normalizedId ||
              (art as { id?: string }).id === artifactId ||
              (art as { name?: string }).name === details.name))
      );

      if (existingInStudent || existingInUser) {
        alreadyOwned.push(normalizedId);
        return;
      }

      studentArtifacts[normalizedId] = true;
      const purchasePayload: Record<string, unknown> = {
        id: normalizedId,
        name: details.name,
        description: details.description,
        icon: details.icon,
        image: details.image,
        category: details.category,
        rarity: details.rarity,
        obtainedAt: Timestamp.now(),
        fromMissionChoice: true,
        missionId: args.missionId,
        stepId: args.stepId,
        choiceId: args.choiceId,
        grantedAt: Timestamp.now(),
      };
      if (details.isEquippable && details.fullDefinition) {
        purchasePayload.slot = normalizeEquippableCatalogSlot(details.fullDefinition.slot);
        purchasePayload.powerLevelBonus = details.fullDefinition.powerLevelBonus;
        purchasePayload.perks = details.fullDefinition.perks;
        purchasePayload.artifactSkill = details.fullDefinition.artifactSkill;
        purchasePayload.level = details.fullDefinition.level ?? 1;
        purchasePayload.stats = details.fullDefinition.stats ?? {};
      }
      studentArtifacts[`${normalizedId}_purchase`] = purchasePayload;

      const userArtifact: Record<string, unknown> = {
        id: normalizedId,
        name: details.name,
        description: details.description,
        price: 0,
        icon: details.icon,
        image: details.image,
        category: details.category,
        rarity: details.rarity,
        purchasedAt: new Date(),
        used: false,
        fromMissionChoice: true,
        missionId: args.missionId,
        stepId: args.stepId,
        choiceId: args.choiceId,
        grantedAt: new Date(),
      };
      if (details.isEquippable && details.fullDefinition) {
        userArtifact.slot = normalizeEquippableCatalogSlot(details.fullDefinition.slot);
        userArtifact.powerLevelBonus = details.fullDefinition.powerLevelBonus;
        userArtifact.perks = details.fullDefinition.perks;
        userArtifact.artifactSkill = details.fullDefinition.artifactSkill;
        userArtifact.level = details.fullDefinition.level ?? 1;
        userArtifact.stats = details.fullDefinition.stats ?? {};
      }

      if (studentDoc.exists()) {
        tx.update(studentRef, { artifacts: studentArtifacts });
      } else {
        tx.set(studentRef, { artifacts: studentArtifacts }, { merge: true });
      }

      if (userDoc.exists()) {
        tx.update(userRef, { artifacts: [...userArtifacts, userArtifact] });
      } else {
        tx.set(userRef, { artifacts: [userArtifact] }, { merge: true });
      }

      granted.push(normalizedId);
    });
  }

  return { granted, alreadyOwned, names };
}

export async function resolveArtifactNames(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    if (!id?.trim()) continue;
    const raw = id.trim();
    try {
      const d = await getArtifactDetails(raw);
      out[d.id] = d.name;
      out[raw] = d.name;
    } catch {
      out[raw] = raw;
    }
  }
  return out;
}

/** Convenience: read whether student already owns an artifact id. */
export async function studentOwnsArtifact(userId: string, artifactId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'students', userId));
  if (!snap.exists()) return false;
  const arts = snap.data()?.artifacts || {};
  return arts[artifactId] === true || !!arts[`${artifactId}_purchase`];
}
