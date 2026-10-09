import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, addDoc, collection, runTransaction } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { activatePPBoost, getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';
import { updateChallengeProgressByType } from '../utils/dailyChallengeTracker';
import {
  MARKETPLACE_STORE_ARTIFACTS,
  type MarketplaceStoreArtifact
} from '../data/marketplaceArtifactsCatalog';
import { mergeMarketplaceStoreItems } from '../utils/marketplaceStoreMerge';
import { mergeEquippableCatalogLayers } from '../utils/battleSkillsService';
import { normalizeEquippableCatalogSlot } from '../utils/equippableArtifactSlot';
import { isRevivePotionName } from '../utils/liveEventRevive';
import { applyConsumableEffectToVault } from '../utils/consumableEffectResolver';
import { resolveVaultBattleConsumable } from '../utils/vaultConsumablePlan';
import { getEquippablePerkDisplayRows } from '../utils/marketplaceEquippablePerks';
import WaysToEarnPowerPointsModal from '../components/WaysToEarnPowerPointsModal';
import {
  artifactRequiresUxpStyleApproval,
  markUserArtifactPendingStaffApproval,
} from '../utils/artifactsRequiringStaffApproval';

type Artifact = MarketplaceStoreArtifact;

/** Firestore rejects `undefined` in nested maps; strip recursively before writes. */
function deepOmitUndefined<T>(value: T): T {
  if (value === undefined) return value as T;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((v) => deepOmitUndefined(v)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k] = deepOmitUndefined(v);
    }
  }
  return out as T;
}

const Marketplace = () => {
  const { currentUser, isAdmin: checkIsAdmin } = useAuth();
  const { vault, updateVault } = useBattle();
  const [powerPoints, setPowerPoints] = useState(0);
  const [inventory, setInventory] = useState<string[]>([]);
  const [artifactCounts, setArtifactCounts] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRarity, setSelectedRarity] = useState('all');
  const [isMobile, setIsMobile] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredArtifactId, setHoveredArtifactId] = useState<string | null>(null);
  const [showWaysToEarnPpModal, setShowWaysToEarnPpModal] = useState(false);
  const [storeItems, setStoreItems] = useState<MarketplaceStoreArtifact[]>(MARKETPLACE_STORE_ARTIFACTS);
  /** Listing id → player already owns the linked equippable (students.artifacts). */
  const [equippableStoreOwned, setEquippableStoreOwned] = useState<Record<string, boolean>>({});
  /** Merged equippable catalog (for perk labels on equippable marketplace listings). */
  const [equippableCatalogMerged, setEquippableCatalogMerged] = useState<Record<string, unknown>>(() =>
    mergeEquippableCatalogLayers(undefined) as Record<string, unknown>
  );
  const [truthMetal, setTruthMetal] = useState(0);
  const isAdmin = checkIsAdmin ?? false;

  // Function to create admin notifications
  const createAdminNotification = async (notification: any) => {
    try {
      await addDoc(collection(db, 'adminNotifications'), {
        ...notification,
        createdAt: new Date(),
        read: false
      });
    } catch (error) {
      console.error('Error creating admin notification:', error);
    }
  };

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  /**
   * Live MST MKT = code catalog merged with adminSettings/marketplaceArtifacts.
   * Rules require auth to read that doc; signed-out users see the static catalog only.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser?.uid) {
        setStoreItems(MARKETPLACE_STORE_ARTIFACTS);
        return;
      }
      try {
        const marketplaceRef = doc(db, 'adminSettings', 'marketplaceArtifacts');
        const snap = await getDoc(marketplaceRef);
        const merged = mergeMarketplaceStoreItems(
          MARKETPLACE_STORE_ARTIFACTS,
          snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
        );
        if (!cancelled) {
          setStoreItems(merged);
        }
      } catch (e) {
        console.error('MST MKT: failed to load marketplace catalog from Firestore', e);
        if (!cancelled) {
          setStoreItems(MARKETPLACE_STORE_ARTIFACTS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  /** Load equippable catalog so marketplace cards can show perk names for grant-by-id listings. */
  useEffect(() => {
    let cancelled = false;
    if (!currentUser?.uid) {
      setEquippableCatalogMerged(mergeEquippableCatalogLayers(undefined) as Record<string, unknown>);
      return;
    }
    (async () => {
      try {
        const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
        const snap = await getDoc(equippableRef);
        const merged = mergeEquippableCatalogLayers(
          snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
        );
        if (!cancelled) {
          setEquippableCatalogMerged(merged as Record<string, unknown>);
        }
      } catch (e) {
        console.error('MST MKT: failed to load equippable catalog for perk display', e);
        if (!cancelled) {
          setEquippableCatalogMerged(mergeEquippableCatalogLayers(undefined) as Record<string, unknown>);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;

      try {
        // Fetch balances — vault is canonical PP when present
        const studentsRef = doc(db, 'students', currentUser.uid);
        const usersRef = doc(db, 'users', currentUser.uid);
        const { getPlayerPowerPoints } = await import('../utils/playerPowerPoints');
        
        const [studentsSnap, usersSnap, canonicalPP] = await Promise.all([
          getDoc(studentsRef),
          getDoc(usersRef),
          getPlayerPowerPoints(currentUser.uid),
        ]);
        
        setPowerPoints(canonicalPP);
        
        if (studentsSnap.exists()) {
          const studentsData = studentsSnap.data();
          setTruthMetal(Math.max(0, Math.floor(Number(studentsData.truthMetal) || 0)));
          const rawInv = studentsData.inventory;
          setInventory(Array.isArray(rawInv) ? rawInv : []);
        }
        
        // Also fetch user artifacts to check for consistency
        if (usersSnap.exists()) {
          const usersData = usersSnap.data();
          console.log('Users artifacts:', usersData.artifacts);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, [currentUser]);

  // Update artifact counts when catalog, user, or inventory changes
  useEffect(() => {
    updateAllArtifactCounts();
  }, [currentUser, inventory, storeItems]);

  // Function to count specific artifacts in inventory (including used ones)
  const getArtifactCount = async (artifactName: string) => {
    if (!currentUser) return 0;
    
    try {
      // Check students collection for current inventory
      const studentsRef = doc(db, 'students', currentUser.uid);
      const studentsSnap = await getDoc(studentsRef);
      const studentsInventory = studentsSnap.exists() ? studentsSnap.data().inventory || [] : [];
      
      // Check users collection for all artifacts (including used ones)
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      const usersArtifactsRaw = usersSnap.exists() ? usersSnap.data().artifacts || [] : [];
      
      // Handle artifacts as either array or object
      let usersArtifacts: any[] = [];
      if (Array.isArray(usersArtifactsRaw)) {
        usersArtifacts = usersArtifactsRaw;
      } else if (typeof usersArtifactsRaw === 'object' && usersArtifactsRaw !== null) {
        // Convert object format to array format
        usersArtifacts = Object.values(usersArtifactsRaw).filter((val: any) => {
          // Filter out purchase metadata entries (those with _purchase suffix)
          if (typeof val === 'object' && val !== null) {
            return val.name || val.id; // Keep actual artifact objects
          }
          return false;
        });
      }
      
      // Count from students inventory (current available items)
      const studentsCount = studentsInventory.filter((item: string) => item === artifactName).length;
      
      // Count from users artifacts (all purchased items, including used)
      const usersCount = usersArtifacts.filter((artifact: any) => {
        if (typeof artifact === 'string') {
          return artifact === artifactName;
        } else {
          return artifact.name === artifactName;
        }
      }).length;
      
      // For debugging - let's be more conservative and only use students inventory for now
      // This should match what the Profile page shows
      const totalCount = studentsCount;
      
      console.log(`🔍 DEBUG: Artifact count for "${artifactName}":`, { 
        artifactName, 
        studentsCount, 
        usersCount, 
        totalCount,
        studentsInventory: studentsInventory,
        usersArtifacts: usersArtifacts.map((a: any) => typeof a === 'string' ? a : a.name),
        note: 'Using studentsCount only to match Profile page'
      });
      
      return totalCount;
    } catch (error) {
      console.error('Error counting artifacts:', error);
      // Fallback to local inventory count
      const count = inventory.filter(item => item === artifactName).length;
      console.log(`🔍 FALLBACK: Using local inventory count for "${artifactName}": ${count}`, { inventory });
      return count;
    }
  };

  // Function to update all artifact counts
  const updateAllArtifactCounts = async () => {
    if (!currentUser) return;

    const newCounts: Record<string, number> = {};
    const newEqOwned: Record<string, boolean> = {};

    let arts: Record<string, unknown> = {};
    try {
      const studentsRef = doc(db, 'students', currentUser.uid);
      const studentsSnap = await getDoc(studentsRef);
      const raw = studentsSnap.exists() ? studentsSnap.data().artifacts : undefined;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        arts = raw as Record<string, unknown>;
      }
    } catch (e) {
      console.warn('Marketplace: failed to load artifacts for equippable ownership', e);
    }

    for (const artifact of storeItems) {
      newCounts[artifact.name] = await getArtifactCount(artifact.name);
      const eqId = artifact.equippableArtifactId?.trim();
      if (eqId) {
        newEqOwned[artifact.id] = arts[eqId] === true || Boolean(arts[`${eqId}_purchase`]);
      }
    }

    setArtifactCounts(newCounts);
    setEquippableStoreOwned(newEqOwned);
  };

  // Debug function to check inventory consistency
  const debugInventoryData = async () => {
    if (!currentUser) return;
    
    console.log('=== INVENTORY DEBUG INFO ===');
    console.log('Current inventory state:', inventory);
    
    try {
      // Check students collection
      const studentsRef = doc(db, 'students', currentUser.uid);
      const studentsSnap = await getDoc(studentsRef);
      if (studentsSnap.exists()) {
        const studentsData = studentsSnap.data();
        console.log('Students collection inventory:', studentsData.inventory);
        console.log('Students collection artifacts:', studentsData.artifacts);
      }
      
      // Check users collection
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        console.log('Users collection artifacts:', usersData.artifacts);
        
        // Check for inconsistencies
        const studentsInventory = studentsSnap.exists() ? studentsSnap.data().inventory || [] : [];
        const usersArtifactsRaw = usersData.artifacts || [];
        
        // Handle artifacts as either array or object
        let usersArtifacts: any[] = [];
        if (Array.isArray(usersArtifactsRaw)) {
          usersArtifacts = usersArtifactsRaw;
        } else if (typeof usersArtifactsRaw === 'object' && usersArtifactsRaw !== null) {
          // Convert object format to array format
          usersArtifacts = Object.values(usersArtifactsRaw).filter((val: any) => {
            if (typeof val === 'object' && val !== null) {
              return val.name || val.id; // Keep actual artifact objects
            }
            return false;
          });
        }
        
        console.log('=== INCONSISTENCY CHECK ===');
        console.log('Students inventory items:', studentsInventory);
        console.log('Users artifacts (not used):', usersArtifacts.filter((a: any) => !a.used && !a.pending));
        
        // Find items that are in students.inventory but marked as used in users.artifacts
        const usedArtifactNames = usersArtifacts
          .filter((a: any) => a.used || a.pending)
          .map((a: any) => a.name);
        
        const inconsistentItems = studentsInventory.filter((item: string) => 
          usedArtifactNames.includes(item)
        );
        
        if (inconsistentItems.length > 0) {
          console.log('🚨 INCONSISTENT ITEMS FOUND:', inconsistentItems);
        } else {
          console.log('✅ No inconsistencies found');
        }
      }
    } catch (error) {
      console.error('Error debugging inventory:', error);
    }
  };

  // Function to clean up inventory inconsistencies
  const cleanupInventoryData = async () => {
    if (!currentUser) return;
    
    try {
      console.log('=== CLEANING UP INVENTORY DATA ===');
      
      // Get data from both collections
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      if (studentsSnap.exists() && usersSnap.exists()) {
        const studentsData = studentsSnap.data();
        const usersData = usersSnap.data();
        
        // Get used artifacts from users collection
        const usersArtifactsRaw = usersData.artifacts || [];
        let usersArtifactsArray: any[] = [];
        if (Array.isArray(usersArtifactsRaw)) {
          usersArtifactsArray = usersArtifactsRaw;
        } else if (typeof usersArtifactsRaw === 'object' && usersArtifactsRaw !== null) {
          // Convert object format to array format
          usersArtifactsArray = Object.values(usersArtifactsRaw).filter((val: any) => {
            if (typeof val === 'object' && val !== null) {
              return val.name || val.id; // Keep actual artifact objects
            }
            return false;
          });
        }
        
        const usedArtifacts = usersArtifactsArray
          .filter((artifact: any) => artifact.used)
          .map((artifact: any) => artifact.name);
        
        console.log('Used artifacts from users collection:', usedArtifacts);
        
        // Clean up students collection inventory
        const currentInventory = studentsData.inventory || [];
        const cleanedInventory = currentInventory.filter((item: string) => 
          !usedArtifacts.includes(item)
        );
        
        console.log('Original inventory:', currentInventory);
        console.log('Cleaned inventory:', cleanedInventory);
        
        if (cleanedInventory.length !== currentInventory.length) {
          // Update students collection with cleaned inventory
          await updateDoc(studentsRef, {
            inventory: cleanedInventory
          });
          
          // Update local state
          setInventory(cleanedInventory);
          
          console.log('✅ Inventory cleaned up successfully!');
          alert('✅ Inventory data has been cleaned up! The page will refresh.');
          window.location.reload();
        } else {
          console.log('✅ Inventory data is already consistent');
          alert('✅ Inventory data is already consistent');
        }
      }
    } catch (error) {
      console.error('Error cleaning up inventory:', error);
      alert('❌ Error cleaning up inventory. Check console for details.');
    }
  };

  // Function to force sync inventory from users.artifacts to students.inventory
  const forceSyncInventory = async () => {
    if (!currentUser) return;
    
    try {
      console.log('=== FORCE SYNCING INVENTORY ===');
      
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      if (studentsSnap.exists() && usersSnap.exists()) {
        const usersData = usersSnap.data();
        const usersArtifactsRaw = usersData.artifacts || [];
        
        // Handle artifacts as either array or object
        let usersArtifacts: any[] = [];
        if (Array.isArray(usersArtifactsRaw)) {
          usersArtifacts = usersArtifactsRaw;
        } else if (typeof usersArtifactsRaw === 'object' && usersArtifactsRaw !== null) {
          // Convert object format to array format
          usersArtifacts = Object.values(usersArtifactsRaw).filter((val: any) => {
            if (typeof val === 'object' && val !== null) {
              return val.name || val.id; // Keep actual artifact objects
            }
            return false;
          });
        }
        
        // Get all available artifacts (not used, not pending)
        const availableArtifacts = usersArtifacts
          .filter((a: any) => !a.used && !a.pending)
          .map((a: any) => a.name);
        
        console.log('Available artifacts from users.artifacts:', availableArtifacts);
        console.log('Current students.inventory:', studentsSnap.data().inventory);
        
        // Update students.inventory to match users.artifacts
        await updateDoc(studentsRef, {
          inventory: availableArtifacts
        });
        
        console.log('✅ Force synced inventory:', availableArtifacts);
        alert('✅ Inventory force synced! The page will refresh.');
        
        // Refresh the page to show updated data
        window.location.reload();
      }
    } catch (error) {
      console.error('Error force syncing inventory:', error);
      alert('❌ Error force syncing inventory. Check console for details.');
    }
  };

  // Function to clear phantom shield data
  const clearPhantomShield = async () => {
    if (!currentUser) return;
    
    try {
      console.log('=== CLEARING PHANTOM SHIELD DATA ===');
      
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      let changesMade = false;
      
      // Clear Shield from students inventory
      if (studentsSnap.exists()) {
        const studentsData = studentsSnap.data();
        const currentInventory = studentsData.inventory || [];
        const cleanedInventory = currentInventory.filter((item: string) => item !== 'Shield');
        
        if (cleanedInventory.length !== currentInventory.length) {
          await updateDoc(studentsRef, {
            inventory: cleanedInventory
          });
          console.log('✅ Removed Shield from students inventory');
          changesMade = true;
        }
      }
      
      // Clear Shield from users artifacts
      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        const currentArtifacts = usersData.artifacts || [];
        const cleanedArtifacts = currentArtifacts.filter((artifact: any) => {
          if (typeof artifact === 'string') {
            return artifact !== 'Shield';
          } else {
            return artifact.name !== 'Shield';
          }
        });
        
        if (cleanedArtifacts.length !== currentArtifacts.length) {
          await updateDoc(usersRef, {
            artifacts: cleanedArtifacts
          });
          console.log('✅ Removed Shield from users artifacts');
          changesMade = true;
        }
      }
      
      if (changesMade) {
        console.log('✅ Phantom Shield data cleared!');
        alert('✅ Phantom Shield data cleared! The page will refresh.');
        window.location.reload();
      } else {
        console.log('ℹ️ No Shield data found to clear');
        alert('ℹ️ No Shield data found to clear');
      }
    } catch (error) {
      console.error('Error clearing phantom shield:', error);
      alert('❌ Error clearing phantom shield. Check console for details.');
    }
  };

  // Function to display ERROR 1001 with binary smile
  const showError1001 = () => {
    const binarySmile = `
      ╔════════════════════════════════════╗
      ║         ERROR 1001                 ║
      ║                                     ║
      ║     01001000 01100101 01101100      ║
      ║     01101100 01101111 00100000      ║
      ║                                     ║
      ║         01110111 01101111           ║
      ║         01110010 01101100           ║
      ║         01100100 00101110           ║
      ║                                     ║
      ╚════════════════════════════════════╝
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: 'Courier New', monospace;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: #000;
      border: 2px solid #ff0000;
      padding: 2rem;
      border-radius: 0.5rem;
      color: #00ff00;
      text-align: center;
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
      max-width: 500px;
      position: relative;
    `;
    
    const errorTitle = document.createElement('div');
    errorTitle.style.cssText = `
      font-size: 1.5rem;
      color: #ff0000;
      margin-bottom: 1rem;
      font-weight: bold;
    `;
    errorTitle.textContent = 'ERROR 1001';
    
    const binaryText = document.createElement('pre');
    binaryText.style.cssText = `
      font-size: 1rem;
      color: #00ff00;
      margin: 1rem 0;
      white-space: pre;
      line-height: 1.2;
      text-align: center;
      font-family: 'Courier New', monospace;
    `;
    binaryText.textContent = `    0 1 0 1 0
  0 1     0 1     0 1
0 1         1         1 0
  0   0 0 0   0 0 0   0
    0         0`;
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'CLOSE';
    closeButton.style.cssText = `
      background: #ff0000;
      color: #000;
      border: none;
      padding: 0.5rem 1.5rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-weight: bold;
      margin-top: 1rem;
      font-family: 'Courier New', monospace;
    `;
    closeButton.onclick = () => document.body.removeChild(modal);
    
    content.appendChild(errorTitle);
    content.appendChild(binaryText);
    content.appendChild(closeButton);
    modal.appendChild(content);
    document.body.appendChild(modal);
  };

  // Function to handle using an artifact
  const handleUseArtifact = async (artifactName: string) => {
    if (!currentUser) {
      alert('❌ You must be logged in to use artifacts.');
      return;
    }

    // Handle Instant A - show ERROR 1001 and don't consume the item
    if (artifactName === 'Instant A') {
      showError1001();
      return;
    }

    if (isRevivePotionName(artifactName)) {
      alert(
        '💚 Revive Potion only works during a Live Event.\n\nJoin the event, open your Bag (🎒), then choose an eliminated teammate.'
      );
      return;
    }

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      // Get current user data from both collections
      const [userSnap, usersSnap] = await Promise.all([
        getDoc(userRef),
        getDoc(usersRef)
      ]);
      
      const currentUserData = userSnap.exists() ? userSnap.data() : {};
      const currentUsersData = usersSnap.exists() ? usersSnap.data() : {};
      
      // Check if artifact exists in either collection
      const studentsInventory = currentUserData.inventory || [];
      const usersArtifactsRaw = currentUsersData.artifacts || [];
      
      // Handle artifacts as either array or object
      let usersArtifacts: any[] = [];
      if (Array.isArray(usersArtifactsRaw)) {
        usersArtifacts = usersArtifactsRaw;
      } else if (typeof usersArtifactsRaw === 'object' && usersArtifactsRaw !== null) {
        // Convert object format to array format
        usersArtifacts = Object.values(usersArtifactsRaw).filter((val: any) => {
          // Filter out purchase metadata entries (those with _purchase suffix)
          if (typeof val === 'object' && val !== null) {
            return val.name || val.id; // Keep actual artifact objects
          }
          return false;
        });
      }
      
      // Check if artifact exists in students inventory
      const inStudentsInventory = studentsInventory.includes(artifactName);
      
      // Check if artifact exists in users artifacts (not used)
      const inUsersArtifacts = usersArtifacts.some((artifact: any) => {
        if (typeof artifact === 'string') {
          return artifact === artifactName;
        } else {
          const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
          return artifact.name === artifactName && isNotUsed;
        }
      });
      
      if (!inStudentsInventory && !inUsersArtifacts) {
        alert(`❌ You don't have "${artifactName}" in your inventory. Please refresh the page and try again.`);
        // Refresh inventory
        await updateAllArtifactCounts();
        const refreshedSnap = await getDoc(userRef);
        if (refreshedSnap.exists()) {
          const refreshedData = refreshedSnap.data();
          setInventory(refreshedData.inventory || []);
        }
        return;
      }
      
      const vaultConsumable = await resolveVaultBattleConsumable(artifactName);
      if (vaultConsumable.ok) {
        if (!vault) {
          alert('❌ Vault not found. Please try again.');
          return;
        }
        const maxVaultHealth = vault.maxVaultHealth || Math.floor(vault.capacity * 0.1);
        const currentVaultHealth =
          vault.vaultHealth !== undefined ? vault.vaultHealth : Math.min(vault.currentPP, maxVaultHealth);
        const maxShieldStrength = vault.maxShieldStrength ?? 100;
        const shieldStrength = vault.shieldStrength ?? 0;

        const applied = applyConsumableEffectToVault(
          {
            vaultHealth: currentVaultHealth,
            maxVaultHealth,
            shieldStrength,
            maxShieldStrength,
          },
          vaultConsumable.effect,
          artifactName
        );

        if (applied.noop || !applied.success) {
          alert(applied.message);
          return;
        }

        const vaultPatch: { vaultHealth?: number; shieldStrength?: number } = {};
        if (applied.vaultHealth !== undefined) vaultPatch.vaultHealth = applied.vaultHealth;
        if (applied.shieldStrength !== undefined) vaultPatch.shieldStrength = applied.shieldStrength;
        if (Object.keys(vaultPatch).length > 0) {
          await updateVault(vaultPatch);
        }

        const usersRef = doc(db, 'users', currentUser.uid);
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
            }
            transaction.update(userRef, { inventory: freshUpdatedInventory });
          }

          if (freshUsersSnap.exists()) {
            const freshUsersData = freshUsersSnap.data();
            const freshArtifactsRaw = freshUsersData.artifacts || [];
            const freshArtifacts: any[] = Array.isArray(freshArtifactsRaw)
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
                    isLegacy: true,
                  };
                }
                return artifact;
              }
              const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
              if (artifact.name === artifactName && isNotUsed) {
                foundOne = true;
                return { ...artifact, used: true, usedAt: new Date() };
              }
              return artifact;
            });
            transaction.update(usersRef, { artifacts: freshUpdatedArtifacts });
          }
        });

        const refreshedSnap = await getDoc(userRef);
        if (refreshedSnap.exists()) {
          const refreshedData = refreshedSnap.data();
          setInventory(refreshedData.inventory || []);
        }
        await updateAllArtifactCounts();
        if (vaultConsumable.effect.effectType === 'restore_health') {
          updateChallengeProgressByType(currentUser.uid, 'use_health_potion', 1).catch((err) =>
            console.error('Error updating daily challenge progress for health potion:', err)
          );
        }
        alert(`🧪 ${applied.message}`);
        return;
      }

      const catalogForStaff =
        storeItems.find((i) => i.name === artifactName) ||
        MARKETPLACE_STORE_ARTIFACTS.find((i) => i.name === artifactName);
      const staffCheckArtifact = catalogForStaff
        ? { id: catalogForStaff.id, name: catalogForStaff.name }
        : { name: artifactName, id: artifactName.toLowerCase().replace(/\s+/g, '-') };
      if (artifactRequiresUxpStyleApproval(staffCheckArtifact)) {
        const submit = await markUserArtifactPendingStaffApproval(currentUser.uid, {
          id: catalogForStaff?.id ?? staffCheckArtifact.id,
          name: catalogForStaff?.name ?? artifactName,
          description: catalogForStaff?.description,
          icon: catalogForStaff?.icon,
          image: catalogForStaff?.image,
          category: catalogForStaff?.category,
          rarity: catalogForStaff?.rarity,
        });
        if (!submit.ok) {
          alert(submit.error || 'Could not submit for staff approval. Try again or refresh.');
          return;
        }
        await updateAllArtifactCounts();
        alert(
          artifactName.toLowerCase().includes('uxp')
            ? 'Your UXP Credit request has been sent to the admin for approval.'
            : 'Your Assignment Pass request has been sent for staff approval. It will apply after approval (subject to assignment type rules).'
        );
        return;
      }
      
      // Handle Shield artifact - check for active overshield before using
      if (artifactName === 'Shield') {
        if (!vault) {
          alert('❌ Vault not found. Please try again.');
          return;
        }
        
        // Check if player already has an active overshield
        if ((vault.overshield || 0) > 0) {
          alert('❌ You already have an active overshield! You can only have 1 overshield at a time.');
          return;
        }
        
        // Add overshield to vault
        await updateVault({ overshield: 1 });
        
        // Update both collections atomically using a transaction
        const usersRef = doc(db, 'users', currentUser.uid);
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
            }
            transaction.update(userRef, { inventory: freshUpdatedInventory });
          }
          
          if (freshUsersSnap.exists()) {
            const freshUsersData = freshUsersSnap.data();
            const freshArtifactsRaw = freshUsersData.artifacts || [];
            let freshArtifacts: any[] = [];
            if (Array.isArray(freshArtifactsRaw)) {
              freshArtifacts = freshArtifactsRaw;
            } else if (typeof freshArtifactsRaw === 'object' && freshArtifactsRaw !== null) {
              freshArtifacts = Object.values(freshArtifactsRaw).filter((val: any) =>
                typeof val === 'object' && val !== null && (val.name || val.id)
              );
            }
            let foundOne = false;
            const freshUpdatedArtifacts = freshArtifacts.map((artifact: any) => {
              if (foundOne) return artifact;
              if (typeof artifact === 'string') {
                if (artifact === artifactName) {
                  foundOne = true;
                  return { id: artifactName.toLowerCase().replace(/\s+/g, '-'), name: artifactName, used: true, usedAt: new Date(), isLegacy: true };
                }
                return artifact;
              }
              const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
              if (artifact.name === artifactName && isNotUsed) {
                foundOne = true;
                return { ...artifact, used: true, usedAt: new Date() };
              }
              return artifact;
            });
            transaction.update(usersRef, { artifacts: freshUpdatedArtifacts });
          }
        });
        
        const refreshedSnap = await getDoc(userRef);
        if (refreshedSnap.exists()) {
          const refreshedData = refreshedSnap.data();
          setInventory(refreshedData.inventory || []);
        }
        await updateAllArtifactCounts();
        alert('🛡️ Shield activated! Your next attack will be blocked.');
        return;
      }
      
      // Remove one instance of the artifact from inventory
      // Use the actual data from Firestore, not local state
      const updatedInventory = [...studentsInventory];
      const artifactIndex = updatedInventory.indexOf(artifactName);
      if (artifactIndex > -1) {
        updatedInventory.splice(artifactIndex, 1);
      } else {
        // Artifact not in students inventory but might be in users artifacts
        // This can happen if there's a sync issue - we'll handle it below
        console.warn(`Artifact "${artifactName}" not found in students inventory, but may exist in users artifacts`);
      }
      
      // Handle special artifacts
      if (artifactName === 'Double PP Boost') {
        // Activate PP boost immediately (no admin approval needed)
        const success = await activatePPBoost(currentUser.uid, artifactName);
        if (success) {
          // Get the active boost to show countdown
          const activeBoost = await getActivePPBoost(currentUser.uid);
          const boostStatus = getPPBoostStatus(activeBoost);
          const timeRemaining = boostStatus.isActive ? boostStatus.timeRemaining : '4:00';
          alert(`⚡ Double PP Boost activated! You'll receive double PP for the next 4 hours!\n\nTime remaining: ${timeRemaining}`);
        } else {
          alert('Failed to activate PP boost. Please try again.');
          return;
        }
      } else if (artifactName === 'Skip the Line') {
        // Create admin notification for Skip the Line
        await createAdminNotification({
          type: 'skip_line_request',
          title: 'Skip the Line Request',
          message: `${currentUser.displayName || currentUser.email} used Skip the Line - they should be next to use the pass to leave`,
          data: {
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            artifactName: artifactName,
            usageTime: new Date(),
            location: 'Marketplace',
            priority: 'high'
          }
        });
        alert(`🚀 Skip the Line activated! You'll be notified when it's your turn to use the pass to leave.`);
      } else if (artifactName === 'Work Extension') {
        // Create admin notification for Work Extension
        await createAdminNotification({
          type: 'work_extension_request',
          title: 'Work Extension Request',
          message: `${currentUser.displayName || currentUser.email} used Work Extension - they want to complete past due assignments`,
          data: {
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            artifactName: artifactName,
            usageTime: new Date(),
            location: 'Marketplace',
            priority: 'medium'
          }
        });
        alert(`📝 Work Extension activated! You can now complete assignments that were past due. Contact your teacher for details.`);
      } else {
        // For other artifacts, use immediately without admin approval
        alert(`✨ ${artifactName} used!`);
      }
      
      // Update both collections atomically using a transaction
      // usersRef is already declared at the top of the try block
      await runTransaction(db, async (transaction) => {
        const freshUserSnap = await transaction.get(userRef);
        const freshUsersSnap = await transaction.get(usersRef);
        if (!freshUserSnap.exists() && !freshUsersSnap.exists()) {
          throw new Error('User data not found. Please refresh the page and try again.');
        }
        if (freshUserSnap.exists()) {
          const freshUserData = freshUserSnap.data();
          const freshInventory = freshUserData.inventory || [];
          const freshUpdatedInventory = [...freshInventory];
          const freshArtifactIndex = freshUpdatedInventory.indexOf(artifactName);
          if (freshArtifactIndex > -1) {
            freshUpdatedInventory.splice(freshArtifactIndex, 1);
          }
          transaction.update(userRef, { inventory: freshUpdatedInventory });
        }
        if (freshUsersSnap.exists()) {
          const freshUsersData = freshUsersSnap.data();
          const freshArtifactsRaw = freshUsersData.artifacts || [];
          let freshArtifacts: any[] = [];
          if (Array.isArray(freshArtifactsRaw)) {
            freshArtifacts = freshArtifactsRaw;
          } else if (typeof freshArtifactsRaw === 'object' && freshArtifactsRaw !== null) {
            freshArtifacts = Object.values(freshArtifactsRaw).filter((val: any) =>
              typeof val === 'object' && val !== null && (val.name || val.id)
            );
          }
          let foundOne = false;
          const freshUpdatedArtifacts = freshArtifacts.map((artifact: any) => {
            if (foundOne) return artifact;
            if (typeof artifact === 'string') {
              if (artifact === artifactName) {
                foundOne = true;
                return { id: artifactName.toLowerCase().replace(/\s+/g, '-'), name: artifactName, used: true, usedAt: new Date(), isLegacy: true };
              }
              return artifact;
            }
            const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
            if (artifact.name === artifactName && isNotUsed) {
              foundOne = true;
              return { ...artifact, used: true, usedAt: new Date() };
            }
            return artifact;
          });
          transaction.update(usersRef, { artifacts: freshUpdatedArtifacts });
        }
      });

      // Refresh user data to ensure consistency
      const refreshedUserSnap = await getDoc(userRef);
      if (refreshedUserSnap.exists()) {
        const refreshedUserData = refreshedUserSnap.data();
        setInventory(refreshedUserData.inventory || []);
        setPowerPoints(refreshedUserData.powerPoints || 0);
      }
      
      // Refresh artifact counts
      await updateAllArtifactCounts();
      
      if (artifactName !== 'Double PP Boost') {
        alert(`✅ Used ${artifactName}!`);
      }
    } catch (error: any) {
      console.error('Error using artifact:', error);
      
      let errorMessage = 'Failed to use artifact. Please try again.';
      const code = error?.code;
      const msg = error?.message ?? '';
      
      if (code === 'permission-denied' || msg.toLowerCase().includes('permission')) {
        errorMessage = '❌ Permission denied. Please make sure you are logged in.';
      } else if (code === 'not-found' || msg.toLowerCase().includes('not found')) {
        errorMessage = '❌ User or artifact data not found. Please refresh the page and try again.';
      } else if (code === 'unavailable' || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('offline')) {
        errorMessage = '❌ Network error. Please check your connection and try again.';
      } else if (code === 'failed-precondition' || msg.toLowerCase().includes('transaction')) {
        errorMessage = '❌ Data changed. Please refresh the page and try again.';
      } else if (msg) {
        errorMessage = `❌ ${msg}`;
      }
      
      alert(errorMessage);
      
      // Refresh inventory on error to sync state
      try {
        const userRef = doc(db, 'students', currentUser.uid);
        const refreshedSnap = await getDoc(userRef);
        if (refreshedSnap.exists()) {
          const refreshedData = refreshedSnap.data();
          setInventory(refreshedData.inventory || []);
        }
        await updateAllArtifactCounts();
      } catch (refreshError) {
        console.error('Error refreshing inventory after error:', refreshError);
      }
    }
  };

  const handlePurchase = async (item: Artifact) => {
    if (!currentUser) return;

    const tmCost = Math.max(0, Math.floor(Number(item.truthMetalPrice) || 0));

    if (powerPoints < item.price) {
      alert('Insufficient Power Points!');
      return;
    }
    if (truthMetal < tmCost) {
      alert(`Insufficient Truth Metal! This item costs ${tmCost} shard(s) in addition to PP.`);
      return;
    }

    // Check for artifact limits
    const artifactCount = await getArtifactCount(item.name);
    
    if (item.name === '+1 UXP Credit' && artifactCount >= 2) {
      alert('You can only own a maximum of 2 +1 UXP Credit artifacts at a time!');
      return;
    }
    
    if (item.name === '+2 UXP Credit' && artifactCount >= 2) {
      alert('You can only own a maximum of 2 +2 UXP Credit artifacts at a time!');
      return;
    }
    
    if (item.name === '+4 UXP Credit' && artifactCount >= 2) {
      alert('You can only own a maximum of 2 +4 UXP Credit artifacts at a time!');
      return;
    }
    
    if (item.name === 'Get Out of Check-in Free' && artifactCount >= 2) {
      alert('You can only own a maximum of 2 Get Out of Check-in Free artifacts at a time!');
      return;
    }
    
    // Shield purchase limit - check for active overshield
    if (item.name === 'Shield') {
      // Check if player already has an active overshield
      if (vault && (vault.overshield || 0) > 0) {
        alert('You already have an active overshield! You can only have 1 overshield at a time.');
        return;
      }
      // Also check artifact count as backup
      if (artifactCount >= 1) {
        alert('You can only own 1 Shield artifact at a time!');
        return;
      }
    }

    try {
      const userRef = doc(db, 'students', currentUser.uid);

      const userSnap = await getDoc(userRef);
      const currentUserData = userSnap.exists() ? userSnap.data() : {};
      const currentArtifacts = currentUserData.artifacts || {};
      const nextTruth = Math.max(0, (currentUserData.truthMetal || 0) - tmCost);

      const equippableGrantId = item.equippableArtifactId?.trim() || '';

      /** Equippable MKT listing: grant catalog id + full stats (Artifacts page / battle). */
      if (equippableGrantId) {
        const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
        const equippableDoc = await getDoc(equippableRef);
        if (!equippableDoc.exists()) {
          alert('Equippable catalog is unavailable. Please try again later.');
          return;
        }
        const mergedEq = mergeEquippableCatalogLayers(
          equippableDoc.data() as Record<string, unknown>
        );
        const def = mergedEq[equippableGrantId];
        if (!def || typeof def !== 'object') {
          alert(
            'This store listing is misconfigured (equippable not found). Please contact an admin.'
          );
          return;
        }
        const art = def as Record<string, unknown>;

        if (Array.isArray(currentArtifacts)) {
          alert('Your account uses a legacy artifact format. Ask an admin to migrate your artifacts.');
          return;
        }

        const alreadyOwns =
          currentArtifacts[equippableGrantId] === true ||
          Boolean(currentArtifacts[`${equippableGrantId}_purchase`]);
        if (alreadyOwns) {
          alert('You already own this equippable artifact!');
          return;
        }

        const purchasedEquippable = deepOmitUndefined({
          id: equippableGrantId,
          name: item.name || (typeof art.name === 'string' ? art.name : equippableGrantId),
          description: item.description,
          price: item.price,
          ...(tmCost > 0 ? { truthMetalPrice: tmCost } : {}),
          icon: item.icon,
          image: item.image || (typeof art.image === 'string' ? art.image : ''),
          category: 'equippable' as const,
          rarity: item.rarity,
          purchasedAt: new Date(),
          used: false,
          fromMarketplace: true,
          marketplaceListingId: item.id,
          slot: normalizeEquippableCatalogSlot(art.slot),
          powerLevelBonus: art.powerLevelBonus,
          perks: art.perks,
          artifactSkill: art.artifactSkill,
          level: typeof art.level === 'number' ? art.level : 1,
          stats: art.stats ?? {},
        });

        const updatedEquippableArtifacts = {
          ...currentArtifacts,
          [equippableGrantId]: true,
          [`${equippableGrantId}_purchase`]: purchasedEquippable,
        };

        await setDoc(
          userRef,
          deepOmitUndefined({
            ...(tmCost > 0 ? { truthMetal: nextTruth } : {}),
            artifacts: updatedEquippableArtifacts,
          }),
          { merge: true }
        );

        const { setPlayerPowerPoints } = await import('../utils/playerPowerPoints');
        const nextPP = await setPlayerPowerPoints(currentUser.uid, powerPoints - item.price, {
          previousAmount: powerPoints,
          meta: {
            sourceType: 'marketplace',
            sourceId: item.id || 'marketplace',
            notes: `Marketplace: ${item.name || 'purchase'}`,
          },
        });
        setPowerPoints(nextPP);

        const usersRef = doc(db, 'users', currentUser.uid);
        const usersSnap = await getDoc(usersRef);
        const usersData = usersSnap.exists() ? usersSnap.data() : {};
        const usersArtifacts = usersData.artifacts || {};
        let updatedUsersArtifacts;
        if (Array.isArray(usersArtifacts)) {
          updatedUsersArtifacts = [...usersArtifacts, purchasedEquippable];
        } else {
          updatedUsersArtifacts = {
            ...usersArtifacts,
            [equippableGrantId]: true,
            [`${equippableGrantId}_purchase`]: purchasedEquippable,
          };
        }
        await setDoc(usersRef, deepOmitUndefined({ artifacts: updatedUsersArtifacts }), { merge: true });

        await createAdminNotification({
          type: 'artifact_purchase',
          title: 'Artifact Purchase (Equippable)',
          message: `${currentUser.displayName || currentUser.email} purchased ${item.name} (grants ${equippableGrantId}) for ${item.price} PP${tmCost ? ` + ${tmCost} Truth Metal` : ''}`,
          data: {
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            artifactName: item.name,
            equippableArtifactId: equippableGrantId,
            marketplaceListingId: item.id,
            artifactPrice: item.price,
            truthMetalPrice: tmCost,
            artifactRarity: item.rarity,
            purchaseTime: new Date(),
          },
        });

        setPowerPoints(nextPP);
        if (vault) {
          try {
            await updateVault({ currentPP: nextPP });
          } catch {
            /* BattleContext may not be ready */
          }
        }
        if (tmCost > 0) setTruthMetal((t) => Math.max(0, t - tmCost));
        await updateAllArtifactCounts();
        alert(`Successfully purchased ${item.name}! Equip it on the Artifacts page.`);
        return;
      }

      const needsPurchaseStaffApproval = artifactRequiresUxpStyleApproval({
        name: item.name,
        id: item.id,
      });

      // Create detailed artifact purchase record (no undefined fields — Firestore rejects them)
      const purchasedArtifact = deepOmitUndefined({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        ...(tmCost > 0 ? { truthMetalPrice: tmCost } : {}),
        icon: item.icon,
        image: item.image,
        category: item.category,
        rarity: item.rarity,
        purchasedAt: new Date(),
        used: false,
        ...(needsPurchaseStaffApproval
          ? { pendingApproval: true, approvalStatus: 'pending' as const }
          : {}),
      });

      // Handle artifacts - can be either array or object
      let updatedArtifacts;

      if (Array.isArray(currentArtifacts)) {
        // If artifacts is an array, add to it
        updatedArtifacts = [...currentArtifacts, purchasedArtifact];
      } else {
        // If artifacts is an object, add the artifact with its ID as key
        updatedArtifacts = {
          ...currentArtifacts,
          [item.id]: true, // Mark as owned
          [`${item.id}_purchase`]: purchasedArtifact, // Store purchase details
        };
      }

      const invList = Array.isArray(inventory) ? inventory : [];

      // Update inventory/artifacts, then debit PP across vault + students + users
      await setDoc(
        userRef,
        deepOmitUndefined({
          ...(tmCost > 0 ? { truthMetal: nextTruth } : {}),
          inventory: [...invList, item.name],
          artifacts: updatedArtifacts,
        }),
        { merge: true }
      );

      const { setPlayerPowerPoints } = await import('../utils/playerPowerPoints');
      const nextPP = await setPlayerPowerPoints(currentUser.uid, powerPoints - item.price, {
        previousAmount: powerPoints,
        meta: {
          sourceType: 'marketplace',
          sourceId: item.id || 'marketplace',
          notes: `Marketplace: ${item.name || 'purchase'}`,
        },
      });

      // Also update the users collection to keep both in sync
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      const usersData = usersSnap.exists() ? usersSnap.data() : {};
      const usersArtifacts = usersData.artifacts || {};
      let updatedUsersArtifacts;

      if (Array.isArray(usersArtifacts)) {
        updatedUsersArtifacts = [...usersArtifacts, purchasedArtifact];
      } else {
        updatedUsersArtifacts = {
          ...usersArtifacts,
          [item.id]: true,
          [`${item.id}_purchase`]: purchasedArtifact,
        };
      }

      if (needsPurchaseStaffApproval) {
        alert(
          item.name.toLowerCase().includes('uxp')
            ? 'Your UXP Credit purchase requires admin approval. The artifact will be active once approved by an admin.'
            : 'Your Assignment Pass purchase requires admin approval. It will be active once approved by an admin.'
        );
      }

      await setDoc(usersRef, deepOmitUndefined({ artifacts: updatedUsersArtifacts }), { merge: true });

      // Create admin notification
      await createAdminNotification({
        type: 'artifact_purchase',
        title: 'Artifact Purchase',
        message: `${currentUser.displayName || currentUser.email} purchased ${item.name} for ${item.price} PP${tmCost ? ` + ${tmCost} Truth Metal` : ''}`,
        data: {
          userId: currentUser.uid,
          userName: currentUser.displayName || currentUser.email,
          artifactName: item.name,
          artifactPrice: item.price,
          truthMetalPrice: tmCost,
          artifactRarity: item.rarity,
          purchaseTime: new Date(),
        },
      });

      setPowerPoints(nextPP);
      if (vault) {
        try {
          await updateVault({ currentPP: nextPP });
        } catch {
          /* BattleContext may not be ready */
        }
      }
      if (tmCost > 0) setTruthMetal((t) => Math.max(0, t - tmCost));
      setInventory((prev) => [...prev, item.name]);

      // Refresh artifact counts
      await updateAllArtifactCounts();

      alert(`Successfully purchased ${item.name}!`);
    } catch (error: unknown) {
      console.error('Error purchasing item:', error);
      const detail =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : String(error);
      alert(
        `Failed to purchase item.${detail ? ` ${detail}` : ''} If this persists, refresh the page and try again.`
      );
    }
  };

  const isLimitedToTwo = (name: string) =>
    name === '+1 UXP Credit' || name === '+2 UXP Credit' || name === '+4 UXP Credit' || name === 'Get Out of Check-in Free';

  const filteredArtifacts = storeItems.filter(artifact => {
    // Filter out disabled artifacts
    if (artifact.disabled) return false;
    
    const matchesSearch = artifact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         artifact.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || artifact.category === selectedCategory;
    const matchesRarity = selectedRarity === 'all' || artifact.rarity === selectedRarity;
    
    return matchesSearch && matchesCategory && matchesRarity;
  });

  const categories = [
    { id: 'all', name: 'All Categories', icon: '📦' },
    { id: 'time', name: 'Time Artifacts', icon: '⏰' },
    { id: 'protection', name: 'Protection', icon: '🛡️' },
    { id: 'food', name: 'Food & Rest', icon: '🍕' },
    { id: 'special', name: 'Special Powers', icon: '✨' },
    { id: 'equippable', name: 'Equippable Gear', icon: '⚔️' }
  ];

  const rarities = [
    { id: 'all', name: 'All Rarities' },
    { id: 'common', name: 'Common' },
    { id: 'rare', name: 'Rare' },
    { id: 'epic', name: 'Epic' },
    { id: 'legendary', name: 'Legendary' }
  ];

  return (
    <div className="mst-mkt">
      {/* Header */}
      <header className="marketplace-header mst-mkt-header">
        <div className="mst-mkt-container">
          <div className="mst-mkt-header-row">
            <div className="mst-mkt-header-left">
              <div className="mst-mkt-brand">
                <span className="mst-mkt-brand-mark" aria-hidden>🔮</span>
                <div>
                  <h1 className="mst-mkt-title">MST MKT</h1>
                  <span className="mst-mkt-subtitle">Masters of Space and Time</span>
                </div>
              </div>
              <div className="mst-mkt-search">
                <span className="mst-mkt-search-icon" aria-hidden>🔍</span>
                <input
                  type="text"
                  placeholder="What are you looking for?"
                  aria-label="Search artifacts"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="mst-mkt-wallet">
              <div className="power-points mst-resource-chip mst-card--power">
                <span aria-hidden>⚡</span>
                <span className="mst-resource-label">Power Points</span>
                <span className="mst-resource-value">{powerPoints}</span>
              </div>
              <div className="mst-resource-chip mst-card--truth">
                <span aria-hidden>💎</span>
                <span className="mst-resource-label">Truth Metal</span>
                <span className="mst-resource-value">{truthMetal}</span>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="mst-mkt-debug">
              <h3 className="mst-mkt-debug-title">🔧 Admin Debug Tools</h3>
              <div className="mst-mkt-debug-actions">
                <button type="button" className="mst-mkt-debug-btn" onClick={debugInventoryData}>
                  🔍 Debug Inventory Data
                </button>
                <button type="button" className="mst-mkt-debug-btn mst-mkt-debug-btn--danger" onClick={cleanupInventoryData}>
                  🧹 Clean Up Inventory
                </button>
                <button type="button" className="mst-mkt-debug-btn mst-mkt-debug-btn--success" onClick={forceSyncInventory}>
                  🔄 Force Sync Inventory
                </button>
                <button type="button" className="mst-mkt-debug-btn mst-mkt-debug-btn--danger" onClick={clearPhantomShield}>
                  🛡️ Clear Phantom Shield
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Banner */}
      <div className="mst-mkt-banner">
        <div className="mst-mkt-container">
          🔮 <strong>MASTERS OF SPACE AND TIME</strong> · Epic and Legendary artifacts now available! Limited time only.
        </div>
      </div>

      <div className="mst-mkt-container mst-mkt-body">
        {isMobile && (
          <button
            type="button"
            className="mst-mkt-filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <span>🔧 Filters</span>
            <span>{showFilters ? '▲' : '▼'}</span>
          </button>
        )}

        <div className="mst-mkt-layout">
          {/* Sidebar Filters */}
          <aside className={`category-filters mst-mkt-sidebar${isMobile && !showFilters ? ' is-collapsed' : ''}`}>
            <div className="mst-mkt-filters">
              <div className="mst-mkt-filter-group">
                <h3 className="mst-mkt-filter-title">Category</h3>
                <div className="mst-mkt-filter-options">
                  {categories.map(category => (
                    <label
                      key={category.id}
                      className={`mst-mkt-filter-option${selectedCategory === category.id ? ' is-active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={category.id}
                        checked={selectedCategory === category.id}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                      />
                      <span className="mst-mkt-filter-icon" aria-hidden>{category.icon}</span>
                      <span>{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mst-mkt-filter-group">
                <h3 className="mst-mkt-filter-title">Rarity</h3>
                <div className="mst-mkt-filter-options">
                  {rarities.map(rarity => (
                    <label
                      key={rarity.id}
                      className={`mst-mkt-filter-option mst-mkt-rarity--${rarity.id}${selectedRarity === rarity.id ? ' is-active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="rarity"
                        value={rarity.id}
                        checked={selectedRarity === rarity.id}
                        onChange={(e) => setSelectedRarity(e.target.value)}
                      />
                      <span className="mst-mkt-dot" aria-hidden />
                      <span>{rarity.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="mst-mkt-main">
            <div className="mst-mkt-grid-head">
              <h2 className="mst-mkt-grid-title">
                Artifacts <span>({filteredArtifacts.length})</span>
              </h2>
              <div className="mst-mkt-grid-count">
                Showing {filteredArtifacts.length} of {storeItems.length} artifacts
              </div>
            </div>

            <div className="mst-mkt-grid">
              {/* Want more PP? Card - First Item */}
              <div
                key="want-more-pp"
                className="artifact-card mst-mkt-card mst-mkt-card--info"
                onClick={() => setShowWaysToEarnPpModal(true)}
              >
                <div className="mst-mkt-info-media">
                  <span aria-hidden>💰</span>
                </div>
                <span className="mst-mkt-badge mst-mkt-badge--info">Info</span>
                <div className="mst-mkt-card-body">
                  <h3 className="mst-mkt-card-title">Want more PP?</h3>
                  <p className="mst-mkt-card-desc">
                    Tap to open the full list of ways to earn PP. Use the Daily Challenges row for where to find daily missions on Home.
                  </p>
                  <button
                    type="button"
                    className="mst-mkt-btn mst-mkt-btn--buy"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowWaysToEarnPpModal(true);
                    }}
                  >
                    Learn More
                  </button>
                </div>
              </div>

              {filteredArtifacts.map((artifact) => {
                const artifactCount = artifactCounts[artifact.name] || 0;
                const isEquippableListing = Boolean(artifact.equippableArtifactId?.trim());
                const equippableOwned = isEquippableListing && !!equippableStoreOwned[artifact.id];
                const purchased = equippableOwned || (!isEquippableListing && artifactCount > 0);
                const tmCost = Math.max(0, Math.floor(Number(artifact.truthMetalPrice) || 0));
                const isAtLimit = isLimitedToTwo(artifact.name) && artifactCount >= 2;
                // Shield limit: check both artifact count and active overshield
                const hasActiveOvershield = artifact.name === 'Shield' && vault && (vault.overshield || 0) > 0;
                const isShieldAtLimit = artifact.name === 'Shield' && (artifactCount >= 1 || hasActiveOvershield);
                const equippableAtLimit = isEquippableListing && equippableOwned;
                const insufficientTm = tmCost > 0 && truthMetal < tmCost;
                const insufficientPp = powerPoints < artifact.price;
                const equippablePerkLines =
                  isEquippableListing && artifact.equippableArtifactId?.trim()
                    ? getEquippablePerkDisplayRows(artifact.equippableArtifactId, equippableCatalogMerged)
                    : [];
                const shieldActive = artifact.name === 'Shield' && !!vault && (vault.overshield || 0) > 0;
                const atAnyLimit = equippableAtLimit || isAtLimit || isShieldAtLimit;
                const purchaseVariant = atAnyLimit
                  ? 'mst-mkt-btn--muted'
                  : insufficientPp
                    ? 'mst-mkt-btn--no-pp'
                    : insufficientTm
                      ? 'mst-mkt-btn--no-tm'
                      : 'mst-mkt-btn--buy';
                return (
                  <div
                    key={artifact.id}
                    className={`artifact-card mst-mkt-card mst-mkt-rarity--${artifact.rarity}${purchased ? ' is-owned' : ''}`}
                    onMouseEnter={() => setHoveredArtifactId(artifact.id)}
                    onMouseLeave={() => setHoveredArtifactId(null)}
                  >
                    <div className="mst-mkt-card-media">
                      <img src={artifact.image} alt={artifact.name} />
                      {artifact.discount && (
                        <span className="mst-mkt-badge mst-mkt-badge--discount">-{artifact.discount}%</span>
                      )}
                      <span className="mst-mkt-badge mst-mkt-badge--rarity">{artifact.rarity}</span>
                      {artifact.id === 'instant-a' && hoveredArtifactId === 'instant-a' && (
                        <div className="mst-mkt-card-warning">⚠️ Limited to One User per Class</div>
                      )}
                    </div>

                    <div className="mst-mkt-card-body">
                      <div className="mst-mkt-card-title-row">
                        <span className="mst-mkt-card-icon" aria-hidden>{artifact.icon}</span>
                        <h3 className="mst-mkt-card-title">{artifact.name}</h3>
                      </div>

                      <p className="mst-mkt-card-desc">{artifact.description}</p>

                      {equippablePerkLines.length > 0 && (
                        <div className="mst-mkt-perks">
                          <div className="mst-mkt-perks-title">Perks when equipped</div>
                          <ul>
                            {equippablePerkLines.map((line, idx) => (
                              <li key={idx}>
                                <strong>{line.label}</strong>
                                {line.description ? <span> — {line.description}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mst-mkt-card-foot">
                        <div className="mst-mkt-price">
                          <div className="mst-mkt-price-row">
                            <span className="mst-mkt-price-pp">{artifact.price} PP</span>
                            {artifact.originalPrice ? (
                              <span className="mst-mkt-price-was">{artifact.originalPrice} PP</span>
                            ) : null}
                          </div>
                          {tmCost > 0 && (
                            <span className="mst-mkt-price-tm">+ {tmCost} 💎 Truth Metal</span>
                          )}
                        </div>

                        <div className="mst-mkt-actions">
                          {purchased && (
                            <div className="mst-mkt-owned-note">
                              {equippableOwned ? 'Owned (equip on Artifacts page)' : `Owned: ${artifactCount}`}
                              {isLimitedToTwo(artifact.name) && ` (Max: 2)`}
                              {artifact.name === 'Shield' && ` (Max: 1)`}
                            </div>
                          )}
                          <div className="mst-mkt-btn-row">
                            {purchased && !isEquippableListing && (
                              <button
                                type="button"
                                className="mst-mkt-btn mst-mkt-btn--use"
                                onClick={() => handleUseArtifact(artifact.name)}
                                disabled={shieldActive}
                                title={shieldActive ? 'You already have an active overshield!' : ''}
                              >
                                {shieldActive ? 'Active' : 'Used'}
                              </button>
                            )}
                            <button
                              type="button"
                              className={`mst-mkt-btn ${purchaseVariant}`}
                              onClick={() => handlePurchase(artifact)}
                              disabled={atAnyLimit || insufficientPp || insufficientTm}
                            >
                              {equippableAtLimit ? 'Owned' : isAtLimit ? 'At Limit' : isShieldAtLimit ? (hasActiveOvershield ? 'Active' : 'Owned') : insufficientPp ? 'Insufficient PP' : insufficientTm ? 'Need Truth Metal' : 'Purchase'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredArtifacts.length === 0 && (
              <div className="mst-mkt-empty">
                <div className="mst-mkt-empty-icon" aria-hidden>🔍</div>
                <h3>No artifacts found</h3>
                <p>Try adjusting your search terms or filters.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      <WaysToEarnPowerPointsModal
        open={showWaysToEarnPpModal}
        onClose={() => setShowWaysToEarnPpModal(false)}
      />

    </div>
  );
};

export default Marketplace; 