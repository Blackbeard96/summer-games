/**
 * Admin Artifact Compensation Service
 * 
 * Allows admins to grant artifacts to players to compensate for errors.
 * Includes both static (marketplace-style) artifacts and equippable artifacts from admin.
 */

import { 
  doc, 
  getDoc, 
  runTransaction, 
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { mergeEquippableCatalogLayers, CATALOG_NEST_KEYS } from './battleSkillsService';
import { MARKETPLACE_STORE_ARTIFACTS } from '../data/marketplaceArtifactsCatalog';
import { mergeMarketplaceStoreItems } from './marketplaceStoreMerge';
import { DEFAULT_EQUIPPABLE_ARTIFACTS_CATALOG } from '../data/defaultEquippableArtifactsCatalog';

const SKIP_CATALOG_KEYS = new Set<string>([...CATALOG_NEST_KEYS, 'lastUpdated', 'updatedBy']);

export interface ArtifactOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  image: string;
  category: string;
  rarity: string;
  /** static = legacy hardcoded; marketplace = Firestore admin catalog; equippable = Firestore equippable; in_game_store = MKT page list */
  source: 'static' | 'marketplace' | 'equippable' | 'in_game_store';
  slot?: string;
}

// Static artifact lookup (marketplace-style) for compensation
const ARTIFACT_LOOKUP: Record<string, { name: string; description: string; icon: string; image: string; category: string; rarity: string }> = {
  'elemental-ring': {
    name: "Elemental Ring",
    description: "A ring that enhances elemental move damage",
    icon: '💍',
    image: '/images/Elemental Ring.png',
    category: 'accessory',
    rarity: 'common'
  },
  'rr_candy': {
    name: "RR Candy",
    description: "A special candy with mysterious properties",
    icon: '🍬',
    image: '/images/RR Candy.png',
    category: 'consumable',
    rarity: 'rare'
  }
};

const SLOT_ICONS: Record<string, string> = {
  head: '👑',
  chest: '🦺',
  ring1: '💍',
  ring2: '💍',
  ring3: '💍',
  ring4: '💍',
  legs: '👖',
  shoes: '👟',
  jacket: '🧥',
  weapon: '⚔️'
};

// Normalize artifact IDs
function normalizeArtifactId(artifactId: string): string {
  if (artifactId === 'captain-helmet' || artifactId === 'captains-helmet') {
    return 'captains-helmet';
  }
  return artifactId;
}

/** Collapse id variants for deduping the compensate dropdown (hyphen vs underscore). */
function artifactDedupeKey(id: string): string {
  return normalizeArtifactId(id).replace(/[-_\s]/g, '').toLowerCase();
}

export interface ArtifactGrantResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Resolve artifact definition: static lookup first, then equippable, then marketplace from Firestore.
 */
/** Exported for live quiz placement rewards and other grant flows. */
export async function getArtifactDetails(artifactId: string): Promise<{
  id: string;
  name: string;
  description: string;
  icon: string;
  image: string;
  category: string;
  rarity: string;
  isEquippable?: boolean;
  fullDefinition?: Record<string, unknown>;
}> {
  const normalizedId = normalizeArtifactId(artifactId);
  const fromStatic = ARTIFACT_LOOKUP[normalizedId] || ARTIFACT_LOOKUP[artifactId];
  if (fromStatic) {
    return { id: normalizedId, ...fromStatic };
  }
  const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
  const equippableDoc = await getDoc(equippableRef);
  const eqRaw = equippableDoc.exists() ? (equippableDoc.data() as Record<string, unknown>) : {};
  const mergedEquippable = mergeEquippableCatalogLayers(eqRaw);
  const art = mergedEquippable[artifactId] || mergedEquippable[normalizedId];
  if (art && typeof art === 'object') {
    const slot = (art as Record<string, unknown>).slot || 'ring1';
    const icon = SLOT_ICONS[String(slot)] || '🎁';
    const grantId =
      typeof (art as { id?: string }).id === 'string' && (art as { id: string }).id.trim()
        ? (art as { id: string }).id.trim()
        : normalizedId;
    return {
      id: grantId,
      name: (typeof (art as { name?: string }).name === 'string' && (art as { name: string }).name) || grantId,
      description: typeof (art as { description?: string }).description === 'string' ? (art as { description: string }).description : '',
      icon,
      image: typeof (art as { image?: string }).image === 'string' ? (art as { image: string }).image : '',
      category: 'equippable',
      rarity: String((art as { rarity?: string }).rarity || 'common').toLowerCase(),
      isEquippable: true,
      fullDefinition: { ...(art as Record<string, unknown>), id: grantId },
    };
  }
  const marketplaceRef = doc(db, 'adminSettings', 'marketplaceArtifacts');
  const marketplaceDoc = await getDoc(marketplaceRef);
  const mktMerged = mergeMarketplaceStoreItems(
    MARKETPLACE_STORE_ARTIFACTS,
    marketplaceDoc.exists() ? (marketplaceDoc.data() as Record<string, unknown>) : {}
  );
  const mRow = mktMerged.find((r) => r.id === artifactId || r.id === normalizedId);
  if (mRow) {
    const eqLink =
      typeof mRow.equippableArtifactId === 'string' ? mRow.equippableArtifactId.trim() : '';
    if (eqLink) {
      const equippableDoc2 = await getDoc(equippableRef);
      const rawEq = equippableDoc2.exists() ? (equippableDoc2.data() as Record<string, unknown>) : {};
      const mergedEq = mergeEquippableCatalogLayers(rawEq);
      const artEq = mergedEq[eqLink] || mergedEq[normalizeArtifactId(eqLink)];
      if (artEq && typeof artEq === 'object') {
        const slot = (artEq as Record<string, unknown>).slot || 'ring1';
        const icon = mRow.icon || SLOT_ICONS[String(slot)] || '🎁';
        return {
          id: eqLink,
          name: mRow.name || (artEq as { name?: string }).name || eqLink,
          description: mRow.description || (artEq as { description?: string }).description || '',
          icon,
          image: mRow.image || (artEq as { image?: string }).image || '',
          category: 'equippable',
          rarity: (mRow.rarity || (artEq as { rarity?: string }).rarity || 'common').toLowerCase(),
          isEquippable: true,
          fullDefinition: artEq as Record<string, unknown>,
        };
      }
    }
    return {
      id: mRow.id,
      name: mRow.name,
      description: mRow.description,
      icon: mRow.icon,
      image: mRow.image,
      category: mRow.category,
      rarity: mRow.rarity.toLowerCase(),
    };
  }
  return {
    id: artifactId,
    name: artifactId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: `Artifact: ${artifactId}`,
    icon: '🎁',
    image: '',
    category: 'special',
    rarity: 'common'
  };
}

/**
 * Grant an artifact to a player (admin-only compensation)
 * 
 * @param userId - User ID of the player
 * @param artifactId - Artifact ID to grant
 * @param adminId - Admin user ID (for logging)
 * @param reason - Reason for granting (optional)
 * @returns Result object with success status
 */
export async function grantArtifactToPlayer(
  userId: string,
  artifactId: string,
  adminId: string,
  reason?: string
): Promise<ArtifactGrantResult> {
  console.log(`🎁 grantArtifactToPlayer: Granting artifact ${artifactId} to user ${userId} by admin ${adminId}`, { reason });

  try {
    const artifactDetails = await getArtifactDetails(artifactId);
    const normalizedId = artifactDetails.id;

    const result = await runTransaction(db, async (transaction) => {
      // Read current user state
      const userRef = doc(db, 'users', userId);
      const studentRef = doc(db, 'students', userId);

      const [userDoc, studentDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(studentRef)
      ]);

      if (!userDoc.exists() && !studentDoc.exists()) {
        throw new Error(`User documents not found for ${userId}`);
      }

      const userData = userDoc.exists() ? userDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};

      // Prepare artifact updates
      const currentStudentArtifacts = studentData.artifacts || {};
      const updatedStudentArtifacts = { ...currentStudentArtifacts };
      
      const currentUserArtifacts = Array.isArray(userData.artifacts) ? userData.artifacts : [];
      const newUserArtifacts: any[] = [];

      // Check if artifact already exists
      const existingInStudent = updatedStudentArtifacts[normalizedId] === true;
      const existingInUser = currentUserArtifacts.find((art: any) => 
        (typeof art === 'string' && (art === normalizedId || art === artifactId)) ||
        (typeof art === 'object' && (art.id === normalizedId || art.id === artifactId || art.name === artifactDetails.name))
      );

      if (existingInStudent || existingInUser) {
        console.log(`⚠️ grantArtifactToPlayer: Artifact ${normalizedId} already exists for user ${userId}`);
        // Still update metadata but don't duplicate
      }

      // Update students collection (object format)
      updatedStudentArtifacts[normalizedId] = true;

      const purchasePayload: Record<string, unknown> = {
        id: normalizedId,
        name: artifactDetails.name,
        description: artifactDetails.description,
        icon: artifactDetails.icon,
        image: artifactDetails.image,
        category: artifactDetails.category,
        rarity: artifactDetails.rarity,
        obtainedAt: Timestamp.now(),
        fromAdmin: true,
        adminId: adminId,
        reason: reason || 'Compensation',
        grantedAt: Timestamp.now()
      };
      // For equippable artifacts, include full definition so Artifacts page can show and equip
      if (artifactDetails.isEquippable && artifactDetails.fullDefinition) {
        purchasePayload.slot = artifactDetails.fullDefinition.slot ?? 'ring1';
        purchasePayload.powerLevelBonus = artifactDetails.fullDefinition.powerLevelBonus;
        purchasePayload.perks = artifactDetails.fullDefinition.perks;
        purchasePayload.artifactSkill = artifactDetails.fullDefinition.artifactSkill;
        purchasePayload.level = artifactDetails.fullDefinition.level ?? 1;
        purchasePayload.stats = artifactDetails.fullDefinition.stats ?? {};
      }
      updatedStudentArtifacts[`${normalizedId}_purchase`] = purchasePayload;

      // Update users collection (array format)
      if (!existingInUser) {
        const userArtifact: Record<string, unknown> = {
          id: normalizedId,
          name: artifactDetails.name,
          description: artifactDetails.description,
          price: 0,
          icon: artifactDetails.icon,
          image: artifactDetails.image,
          category: artifactDetails.category,
          rarity: artifactDetails.rarity,
          purchasedAt: new Date(),
          used: false,
          fromAdmin: true,
          adminId: adminId,
          reason: reason || 'Compensation',
          grantedAt: new Date()
        };
        if (artifactDetails.isEquippable && artifactDetails.fullDefinition) {
          userArtifact.slot = artifactDetails.fullDefinition.slot ?? 'ring1';
          userArtifact.powerLevelBonus = artifactDetails.fullDefinition.powerLevelBonus;
          userArtifact.perks = artifactDetails.fullDefinition.perks;
          userArtifact.artifactSkill = artifactDetails.fullDefinition.artifactSkill;
          userArtifact.level = artifactDetails.fullDefinition.level ?? 1;
          userArtifact.stats = artifactDetails.fullDefinition.stats ?? {};
        }
        newUserArtifacts.push(userArtifact);
      }

      const updatedUserArtifacts = [...currentUserArtifacts, ...newUserArtifacts];

      console.log(`🎁 grantArtifactToPlayer: Transaction - Preparing updates:`, {
        artifactId: normalizedId,
        artifactName: artifactDetails.name,
        alreadyExists: existingInStudent || existingInUser,
        newArtifactsCount: newUserArtifacts.length
      });

      // Update all documents atomically
      if (userDoc.exists()) {
        const userUpdates: any = {};
        
        if (newUserArtifacts.length > 0) {
          userUpdates.artifacts = updatedUserArtifacts;
        }
        
        if (Object.keys(userUpdates).length > 0) {
          transaction.update(userRef, userUpdates);
        }
      }

      if (studentDoc.exists()) {
        const studentUpdates: any = {};
        
        if (Object.keys(updatedStudentArtifacts).length > 0) {
          studentUpdates.artifacts = updatedStudentArtifacts;
        }
        
        if (Object.keys(studentUpdates).length > 0) {
          transaction.update(studentRef, studentUpdates);
        }
      }

      console.log(`✅ grantArtifactToPlayer: Transaction committed successfully`);

      return {
        success: true,
        message: existingInStudent || existingInUser 
          ? `Artifact "${artifactDetails.name}" already exists for this player, but metadata was updated.`
          : `Artifact "${artifactDetails.name}" granted successfully to player.`
      };
    });

    // Verify the artifact was actually applied (post-transaction check)
    if (result.success) {
      try {
        const [verifyUserDoc, verifyStudentDoc] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'students', userId))
        ]);
        
        const verifyUserData = verifyUserDoc.exists() ? verifyUserDoc.data() : {};
        const verifyStudentData = verifyStudentDoc.exists() ? verifyStudentDoc.data() : {};
        
        const verifyUserArtifacts = Array.isArray(verifyUserData.artifacts) ? verifyUserData.artifacts : [];
        const verifyStudentArtifacts = verifyStudentData.artifacts || {};
        
        const inUser = verifyUserArtifacts.some((a: any) => 
          (typeof a === 'string' && a === normalizedId) ||
          (typeof a === 'object' && (a.id === normalizedId || a.name === artifactDetails.name))
        );
        const inStudent = verifyStudentArtifacts[normalizedId] === true;
        
        if (inUser || inStudent) {
          console.log(`✅ grantArtifactToPlayer: Artifact verified in post-transaction check`);
        } else {
          console.warn(`⚠️ grantArtifactToPlayer: Artifact not found in post-transaction check`);
        }
      } catch (verifyError) {
        console.error(`⚠️ grantArtifactToPlayer: Error during post-transaction verification:`, verifyError);
      }
    }

    console.log(`✅ grantArtifactToPlayer: Completed for user ${userId}:`, result);
    return result;

  } catch (error: any) {
    console.error(`❌ grantArtifactToPlayer: Error granting artifact to user ${userId}:`, error);
    return {
      success: false,
      message: `Failed to grant artifact: ${error.message || 'Unknown error'}`,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Get list of available artifacts (static only, for backward compatibility)
 */
export function getAvailableArtifacts(): Array<{ id: string; name: string; description: string; icon: string; image: string; category: string; rarity: string }> {
  const cap = DEFAULT_EQUIPPABLE_ARTIFACTS_CATALOG['captains-helmet'];
  const captainSync = cap
    ? [
        {
          id: 'captains-helmet',
          name: String(cap.name ?? "Captain's Helmet"),
          description: String(cap.description ?? ''),
          icon: '⛑️',
          image: String(cap.image ?? ''),
          category: 'equippable',
          rarity: String(cap.rarity ?? 'common'),
        },
      ]
    : [];
  return [
    ...captainSync,
    ...Object.entries(ARTIFACT_LOOKUP).map(([id, details]) => ({
      id,
      ...details,
    })),
  ];
}

/**
 * Load all artifacts available for compensation: marketplace + equippable from Firestore (full catalog),
 * plus static entries only when not already present in Firestore.
 *
 * Uses mergeEquippableCatalogLayers so nested shapes match the rest of the app:
 * e.g. { artifacts: { id: row } }, list arrays, etc.
 */
export async function getAvailableArtifactsAsync(): Promise<ArtifactOption[]> {
  const all: ArtifactOption[] = [];
  const seenDedupeKeys = new Set<string>();

  const markSeen = (id: string) => {
    seenDedupeKeys.add(artifactDedupeKey(id));
    seenDedupeKeys.add(id);
  };
  const alreadyListed = (id: string) =>
    seenDedupeKeys.has(id) || seenDedupeKeys.has(artifactDedupeKey(id));

  try {
    // 1) Marketplace — full flattened catalog (store artifacts)
    const marketplaceRef = doc(db, 'adminSettings', 'marketplaceArtifacts');
    const marketplaceDoc = await getDoc(marketplaceRef);
    if (marketplaceDoc.exists()) {
      const catalog = mergeEquippableCatalogLayers(marketplaceDoc.data() as Record<string, unknown>);
      for (const [key, art] of Object.entries(catalog)) {
        if (SKIP_CATALOG_KEYS.has(key)) continue;
        if (!art || typeof art !== 'object' || Array.isArray(art)) continue;
        const a = art as Record<string, unknown>;
        const id =
          typeof a.id === 'string' && a.id.trim()
            ? a.id.trim()
            : key;
        if (!id || alreadyListed(id)) continue;
        markSeen(id);
        all.push({
          id: normalizeArtifactId(id),
          name: (a.name as string) || id,
          description: (a.description as string) || '',
          icon: (a.icon as string) || '🎁',
          image: (a.image as string) || '',
          category: (a.category as string) || 'special',
          rarity: ((a.rarity as string) || 'common').toLowerCase(),
          source: 'marketplace' as const
        });
      }
    }

    // 2) Equippable catalog (admin tab + built-in defaults, e.g. Captain's Helmet)
    const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
    const equippableDoc = await getDoc(equippableRef);
    const eqData = equippableDoc.exists() ? (equippableDoc.data() as Record<string, unknown>) : {};
    const catalog = mergeEquippableCatalogLayers(eqData);
    for (const [key, art] of Object.entries(catalog)) {
      if (SKIP_CATALOG_KEYS.has(key)) continue;
      if (!art || typeof art !== 'object' || Array.isArray(art)) continue;
      const a = art as Record<string, unknown>;
      const id =
        typeof a.id === 'string' && a.id.trim()
          ? a.id.trim()
          : key;
      if (!id || alreadyListed(id)) continue;
      markSeen(id);
      const slot = (a.slot as string) || 'ring1';
      all.push({
        id: normalizeArtifactId(id),
        name: (a.name as string) || id,
        description: (a.description as string) || '',
        icon: SLOT_ICONS[slot] || '🎁',
        image: (a.image as string) || '',
        category: 'equippable',
        rarity: ((a.rarity as string) || 'common').toLowerCase(),
        source: 'equippable' as const,
        slot
      });
    }

    // 3) In-game MKT store (catalog + adminSettings/marketplaceArtifacts — same merge as Marketplace)
    const mktSnap = await getDoc(doc(db, 'adminSettings', 'marketplaceArtifacts'));
    const mktRows = mergeMarketplaceStoreItems(
      MARKETPLACE_STORE_ARTIFACTS,
      mktSnap.exists() ? (mktSnap.data() as Record<string, unknown>) : {}
    );
    for (const row of mktRows) {
      const id = row.id;
      if (!id || row.disabled || alreadyListed(id)) continue;
      markSeen(id);
      all.push({
        id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        image: row.image,
        category: row.category,
        rarity: row.rarity,
        source: 'in_game_store'
      });
    }

    // 4) Static fallback — legacy IDs not present elsewhere
    for (const [id, details] of Object.entries(ARTIFACT_LOOKUP)) {
      if (id === 'captain-helmet') continue;
      if (alreadyListed(id)) continue;
      markSeen(id);
      all.push({
        id,
        ...details,
        source: 'static' as const
      });
    }

    // Sort: name A–Z so long lists are scannable
    all.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));

    return all;
  } catch (e) {
    console.warn('artifactCompensation: failed to load artifacts', e);
    // Minimal fallback if Firestore fails
    const fallback: ArtifactOption[] = Object.entries(ARTIFACT_LOOKUP)
      .filter(([id]) => id !== 'captain-helmet')
      .map(([id, details]) => ({
        id,
        ...details,
        source: 'static' as const
      }));
    return fallback.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
  }
}

