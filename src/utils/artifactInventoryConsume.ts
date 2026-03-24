/**
 * Remove one instance of a consumable artifact from students + users.artifacts (same shape as Marketplace).
 */

import { db } from '../firebase';
import { doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';

export async function consumeOneArtifactFromInventory(
  userId: string,
  artifactName: string
): Promise<boolean> {
  const userRef = doc(db, 'students', userId);
  const usersRef = doc(db, 'users', userId);

  try {
    await runTransaction(db, async (transaction) => {
      const freshUserSnap = await transaction.get(userRef);
      const freshUsersSnap = await transaction.get(usersRef);

      if (freshUserSnap.exists()) {
        const freshUserData = freshUserSnap.data();
        const freshInventory = freshUserData.inventory || [];
        const freshUpdatedInventory = [...freshInventory];
        const freshArtifactIndex = freshUpdatedInventory.indexOf(artifactName);
        if (freshArtifactIndex > -1) {
          freshUpdatedInventory.splice(freshArtifactIndex, 1);
          transaction.update(userRef, { inventory: freshUpdatedInventory });
        } else {
          throw new Error(`No "${artifactName}" in inventory`);
        }
      } else {
        throw new Error('Student doc not found');
      }

      if (freshUsersSnap.exists()) {
        const freshUsersData = freshUsersSnap.data();
        const freshArtifactsRaw = freshUsersData.artifacts || [];
        let freshArtifacts: any[] = Array.isArray(freshArtifactsRaw)
          ? freshArtifactsRaw
          : typeof freshArtifactsRaw === 'object' && freshArtifactsRaw !== null
            ? Object.values(freshArtifactsRaw).filter(
                (val: any) => typeof val === 'object' && val !== null && (val.name || val.id)
              )
            : [];
        let foundOne = false;
        const freshUpdatedArtifacts = freshArtifacts.map((artifact: any) => {
          if (foundOne) return artifact;
          if (typeof artifact === 'string') {
            if (artifact === artifactName) {
              foundOne = true;
              return {
                id: artifactName.toLowerCase().replace(/\s+/g, '-'),
                name: artifactName,
                used: true,
                usedAt: new Date(),
                isLegacy: true
              };
            }
            return artifact;
          }
          const isNotUsed =
            artifact.used === false || artifact.used === undefined || artifact.used === null;
          if (artifact.name === artifactName && isNotUsed) {
            foundOne = true;
            return { ...artifact, used: true, usedAt: new Date() };
          }
          return artifact;
        });
        transaction.update(usersRef, { artifacts: freshUpdatedArtifacts });
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function refundOneArtifactToInventory(userId: string, artifactName: string): Promise<void> {
  const userRef = doc(db, 'students', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const inv = (userSnap.data().inventory || []) as string[];
  await updateDoc(userRef, { inventory: [...inv, artifactName] });
}
