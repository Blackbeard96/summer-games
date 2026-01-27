import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { calculateUpgradeCost, getArtifactDamageMultiplier, getManifestDamageBoost } from '../utils/artifactUtils';

// Artifact price definitions for refund calculations
const artifactPrices: { [key: string]: number } = {
  'blaze-ring': 540,
  'terra-ring': 540,
  'aqua-ring': 540,
  'air-ring': 540,
  'checkin-free': 50,
  'shield': 50,
  'health-potion-25': 40,
  'lunch-mosley': 5400,
  'forge-token': 1000,
  'uxp-credit-1': 30,
  'uxp-credit': 60,
  'uxp-credit-4': 100,
  'double-pp': 75,
  'skip-the-line': 50,
  'work-extension': 250,
  'instant-a': 99
};

interface Artifact {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'ring1' | 'ring2' | 'ring3' | 'ring4' | 'legs' | 'shoes' | 'jacket';
  stats?: {
    [key: string]: number;
  };
  level?: number;
  image?: string;
  price?: number; // Original purchase price for refund calculations
}

interface EquippedArtifacts {
  head?: Artifact | null;
  chest?: Artifact | null;
  ring1?: Artifact | null;
  ring2?: Artifact | null;
  ring3?: Artifact | null;
  ring4?: Artifact | null;
  legs?: Artifact | null;
  shoes?: Artifact | null;
  jacket?: Artifact | null;
}

const Artifacts: React.FC = () => {
  const { currentUser } = useAuth();
  const { unlockElementalMoves } = useBattle();
  const [equippedArtifacts, setEquippedArtifacts] = useState<EquippedArtifacts>({});
  const [availableArtifacts, setAvailableArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [artifactsUnlocked, setArtifactsUnlocked] = useState(false);
  const [showElementalRingModal, setShowElementalRingModal] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [powerPoints, setPowerPoints] = useState(0);
  const [truthMetal, setTruthMetal] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    // Helper to check for Firestore internal errors
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorStack = error?.stack || '';
      return (
        errorString.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorStack.includes('INTERNAL ASSERTION FAILED') ||
        errorString.includes('ID: ca9') ||
        errorString.includes('ID: b815') ||
        (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
      );
    };

    const checkArtifactsUnlocked = async () => {
      try {
        // Check if Chapter 8 is completed
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const challenge8Completed = userData.chapters?.[1]?.challenges?.['ep1-view-power-card']?.isCompleted;
          
          // Also check if artifacts_unlocked artifact exists
          const studentRef = doc(db, 'students', currentUser.uid);
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          const hasArtifactsUnlocked = studentData?.artifacts?.artifacts_unlocked === true;
          
          setArtifactsUnlocked(challenge8Completed || hasArtifactsUnlocked);
        }

        // Load equipped artifacts
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          let loadedEquipped = studentData.equippedArtifacts || {};
          
          // If player has chosen an element and has the ring artifact but it's not equipped, auto-equip it
          const hasElementalRing = studentData.artifacts?.elemental_ring_level_1 === true;
          const chosenElement = studentData.artifacts?.chosen_element || studentData.elementalAffinity;
          
          if (hasElementalRing && chosenElement && !loadedEquipped.ring1) {
            // Auto-equip the Elemental Ring to Ring 1 slot
            const elementName = chosenElement.charAt(0).toUpperCase() + chosenElement.slice(1);
            const elementalRing: Artifact = {
              id: 'elemental-ring-level-1',
              name: `Elemental Ring: ${elementName} (Level 1)`,
              slot: 'ring1',
              level: 1,
              image: '/images/Elemental Ring.png',
              stats: {}
            };
            
            loadedEquipped = {
              ...loadedEquipped,
              ring1: elementalRing
            };
            
            // Save the equipped ring to the database
            await updateDoc(studentRef, {
              equippedArtifacts: loadedEquipped
            });
          }
          
          setEquippedArtifacts(loadedEquipped);
          
          // Load available artifacts from purchased items
          const available: Artifact[] = [];
          
          // Check for Blaze Ring (can be equipped to any ring slot)
          // Check both hyphen and underscore formats for compatibility
          const hasBlazeRing = studentData.artifacts?.['blaze-ring'] === true || 
                               studentData.artifacts?.blaze_ring === true ||
                               studentData.artifacts?.['blaze-ring_purchase'] ||
                               studentData.artifacts?.blaze_ring_purchase;
          
          if (hasBlazeRing) {
            const purchaseData = studentData.artifacts?.['blaze-ring_purchase'] || 
                                studentData.artifacts?.blaze_ring_purchase;
            // Check if it's already equipped
            const isEquipped = Object.values(loadedEquipped).some(
              (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'blaze-ring'
            );
            
            if (!isEquipped) {
              const blazeRing: Artifact = {
                id: 'blaze-ring',
                name: purchaseData?.name || 'Blaze Ring',
                slot: 'ring1', // Default slot, but can be equipped to any ring slot
                level: 1,
                image: purchaseData?.image || '/images/Blaze Ring.png',
                stats: {},
                price: purchaseData?.price || artifactPrices['blaze-ring'] || 0
              };
              available.push(blazeRing);
            }
          }
          
          // Check for Terra Ring (can be equipped to any ring slot)
          // Check both hyphen and underscore formats for compatibility
          const hasTerraRing = studentData.artifacts?.['terra-ring'] === true || 
                               studentData.artifacts?.terra_ring === true ||
                               studentData.artifacts?.['terra-ring_purchase'] ||
                               studentData.artifacts?.terra_ring_purchase;
          
          if (hasTerraRing) {
            const purchaseData = studentData.artifacts?.['terra-ring_purchase'] || 
                                studentData.artifacts?.terra_ring_purchase;
            // Check if it's already equipped
            const isEquipped = Object.values(loadedEquipped).some(
              (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'terra-ring'
            );
            
            if (!isEquipped) {
              const terraRing: Artifact = {
                id: 'terra-ring',
                name: purchaseData?.name || 'Terra Ring',
                slot: 'ring1', // Default slot, but can be equipped to any ring slot
                level: 1,
                image: purchaseData?.image || '/images/Terra Ring.png',
                stats: {},
                price: purchaseData?.price || artifactPrices['terra-ring'] || 0
              };
              available.push(terraRing);
            }
          }

          // Check for Aqua Ring (can be equipped to any ring slot)
          // Check both hyphen and underscore formats for compatibility
          const hasAquaRing = studentData.artifacts?.['aqua-ring'] === true || 
                               studentData.artifacts?.aqua_ring === true ||
                               studentData.artifacts?.['aqua-ring_purchase'] ||
                               studentData.artifacts?.aqua_ring_purchase;
          
          if (hasAquaRing) {
            const purchaseData = studentData.artifacts?.['aqua-ring_purchase'] || 
                                studentData.artifacts?.aqua_ring_purchase;
            // Check if it's already equipped
            const isEquipped = Object.values(loadedEquipped).some(
              (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'aqua-ring'
            );
            
            if (!isEquipped) {
              const aquaRing: Artifact = {
                id: 'aqua-ring',
                name: purchaseData?.name || 'Aqua Ring',
                slot: 'ring1', // Default slot, but can be equipped to any ring slot
                level: 1,
                image: purchaseData?.image || '/images/Aqua Ring.png',
                stats: {},
                price: purchaseData?.price || artifactPrices['aqua-ring'] || 0
              };
              available.push(aquaRing);
            }
          }

          // Check for Air Ring (can be equipped to any ring slot)
          // Check both hyphen and underscore formats for compatibility
          const hasAirRing = studentData.artifacts?.['air-ring'] === true || 
                               studentData.artifacts?.air_ring === true ||
                               studentData.artifacts?.['air-ring_purchase'] ||
                               studentData.artifacts?.air_ring_purchase;
          
          if (hasAirRing) {
            const purchaseData = studentData.artifacts?.['air-ring_purchase'] || 
                                studentData.artifacts?.air_ring_purchase;
            // Check if it's already equipped
            const isEquipped = Object.values(loadedEquipped).some(
              (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'air-ring'
            );
            
            if (!isEquipped) {
              const airRing: Artifact = {
                id: 'air-ring',
                name: purchaseData?.name || 'Air Ring',
                slot: 'ring1', // Default slot, but can be equipped to any ring slot
                level: 1,
                image: purchaseData?.image || '/images/Air Ring.png',
                stats: {},
                price: purchaseData?.price || artifactPrices['air-ring'] || 0
              };
              available.push(airRing);
            }
          }
          
          // Check for Captain's Helmet (can be equipped to head slot)
          // Check both hyphen and underscore formats for compatibility
          const hasCaptainsHelmet = studentData.artifacts?.['captains-helmet'] === true || 
                                     studentData.artifacts?.captains_helmet === true ||
                                     studentData.artifacts?.['captain-helmet'] === true ||
                                     studentData.artifacts?.captain_helmet === true ||
                                     studentData.artifacts?.['captains-helmet_purchase'] ||
                                     studentData.artifacts?.captains_helmet_purchase ||
                                     studentData.artifacts?.['captain-helmet_purchase'] ||
                                     studentData.artifacts?.captain_helmet_purchase;
          
          if (hasCaptainsHelmet) {
            const purchaseData = studentData.artifacts?.['captains-helmet_purchase'] || 
                                studentData.artifacts?.captains_helmet_purchase ||
                                studentData.artifacts?.['captain-helmet_purchase'] ||
                                studentData.artifacts?.captain_helmet_purchase;
            // Check if it's already equipped
            const isEquipped = Object.values(loadedEquipped).some(
              (eq) => {
                if (!eq || typeof eq !== 'object') return false;
                const artifact = eq as Artifact;
                if (artifact.id && (artifact.id === 'captains-helmet' || artifact.id === 'captain-helmet')) {
                  return true;
                }
                if (artifact.name && typeof artifact.name === 'string') {
                  const nameLower = artifact.name.toLowerCase();
                  return nameLower.includes('captain') && nameLower.includes('helmet');
                }
                return false;
              }
            );
            
            if (!isEquipped) {
              const captainsHelmet: Artifact = {
                id: 'captains-helmet',
                name: purchaseData?.name || "Captain's Helmet",
                slot: 'head',
                level: 1,
                image: purchaseData?.image || '/images/Captains Helmet.png',
                stats: {},
                price: purchaseData?.price || 0
              };
              available.push(captainsHelmet);
            }
          }
          
          // Check for other wearable artifacts that might be purchased
          // Add more wearable artifacts here as they're added to the marketplace
          
          setAvailableArtifacts(available);
          
          // Load powerPoints and truthMetal
          setPowerPoints(studentData.powerPoints || 0);
          setTruthMetal(studentData.truthMetal || 0);
          
          // Check if player has Elemental Ring and hasn't chosen an element yet
          const hasSeenModal = studentData.artifacts?.elemental_ring_modal_seen === true;
          
          // Show modal if they have the ring but haven't chosen an element
          if (hasElementalRing && !chosenElement && !hasSeenModal) {
            setShowElementalRingModal(true);
          }
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('Artifacts: Firestore internal assertion error when checking artifacts - ignoring');
          // Still set loading to false so UI doesn't hang
          setLoading(false);
          return;
        }
        console.error('Error checking artifacts unlock status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkArtifactsUnlocked();
  }, [currentUser]);

  const slotConfig = [
    { key: 'head' as const, label: 'Head', icon: '👑' },
    { key: 'chest' as const, label: 'Chest/Top', icon: '🦺' },
    { key: 'ring1' as const, label: 'Ring 1', icon: '💍' },
    { key: 'ring2' as const, label: 'Ring 2', icon: '💍' },
    { key: 'ring3' as const, label: 'Ring 3', icon: '💍' },
    { key: 'ring4' as const, label: 'Ring 4', icon: '💍' },
    { key: 'legs' as const, label: 'Legs/Bottom', icon: '👖' },
    { key: 'shoes' as const, label: 'Shoes', icon: '👟' },
    { key: 'jacket' as const, label: 'Jacket', icon: '🧥' },
  ];

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!artifactsUnlocked) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          marginBottom: '2rem'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒 Artifacts System Locked</h1>
          <p style={{ fontSize: '1.125rem', opacity: 0.9 }}>
            Complete Chapter 1 - Challenge 8: "Artifacts and Elements" to unlock the Artifacts System.
          </p>
        </div>
      </div>
    );
  }

  // Calculate total stats from equipped artifacts
  const calculateTotalStats = () => {
    const totalStats: { [key: string]: number } = {};
    Object.values(equippedArtifacts).forEach((artifact) => {
      if (artifact && artifact.stats) {
        Object.entries(artifact.stats).forEach(([stat, value]) => {
          const numValue = typeof value === 'number' ? value : 0;
          totalStats[stat] = (totalStats[stat] || 0) + numValue;
        });
      }
    });
    return totalStats;
  };

  const totalStats = calculateTotalStats();
  const hasEquippedArtifacts = Object.values(equippedArtifacts).some(artifact => artifact !== null && artifact !== undefined);

  // Handle equipping an artifact to a slot
  const handleEquipArtifact = async (artifact: Artifact, slot: keyof EquippedArtifacts) => {
    if (!currentUser) return;

    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) {
        alert('Error: Student data not found.');
        return;
      }

      const studentData = studentDoc.data();
      const currentEquipped = studentData.equippedArtifacts || {};
      
      // Check if this artifact is already equipped in another slot
      const currentlyEquippedSlot = Object.keys(currentEquipped).find(
        s => currentEquipped[s as keyof EquippedArtifacts]?.id === artifact.id
      );
      
      if (currentlyEquippedSlot) {
        // Remove from old slot
        currentEquipped[currentlyEquippedSlot as keyof EquippedArtifacts] = null;
      }
      
      // Check if target slot is already occupied
      if (currentEquipped[slot]) {
        if (!window.confirm(`This slot already has ${currentEquipped[slot]?.name} equipped. Replace it with ${artifact.name}?`)) {
          return;
        }
      }
      
      // Create artifact with correct slot
      const artifactToEquip: Artifact = {
        ...artifact,
        slot: slot
      };
      
      // Update equipped artifacts
      const updatedEquipped = {
        ...currentEquipped,
        [slot]: artifactToEquip
      };
      
      await updateDoc(studentRef, {
        equippedArtifacts: updatedEquipped
      });
      
      // Update local state
      setEquippedArtifacts(updatedEquipped);
      
      // Refresh available artifacts (remove equipped one)
      setAvailableArtifacts(prev => prev.filter(a => a.id !== artifact.id));
      
      // Recalculate power level after artifact equip
      try {
        const { recalculatePowerLevel } = await import('../services/recalculatePowerLevel');
        await recalculatePowerLevel(currentUser.uid);
      } catch (plError) {
        console.error('Error recalculating power level after artifact equip:', plError);
        // Don't block the operation - power level recalculation is non-critical
      }
      
      alert(`✅ ${artifact.name} equipped to ${slotConfig.find(s => s.key === slot)?.label || slot}!`);
    } catch (error) {
      console.error('Error equipping artifact:', error);
      alert('Failed to equip artifact. Please try again.');
    }
  };

  // Handle unequipping an artifact
  const handleUnequipArtifact = async (slot: keyof EquippedArtifacts) => {
    if (!currentUser) return;

    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) {
        alert('Error: Student data not found.');
        return;
      }

      const studentData = studentDoc.data();
      const currentEquipped = studentData.equippedArtifacts || {};
      const artifactToUnequip = currentEquipped[slot];
      
      if (!artifactToUnequip) return;
      
      if (!window.confirm(`Unequip ${artifactToUnequip.name}?`)) {
        return;
      }
      
      // Remove artifact from slot
      const updatedEquipped = {
        ...currentEquipped,
        [slot]: null
      };
      
      await updateDoc(studentRef, {
        equippedArtifacts: updatedEquipped
      });
      
      // Update local state
      setEquippedArtifacts(updatedEquipped);
      
      // Recalculate power level after artifact unequip
      try {
        const { recalculatePowerLevel } = await import('../services/recalculatePowerLevel');
        await recalculatePowerLevel(currentUser.uid);
      } catch (plError) {
        console.error('Error recalculating power level after artifact unequip:', plError);
        // Don't block the operation - power level recalculation is non-critical
      }
      
      // Reload available artifacts to show the unequipped one
      const refreshedStudentData = (await getDoc(studentRef)).data();
      if (refreshedStudentData) {
        const available: Artifact[] = [];
        
        // Check for Blaze Ring
        // Check both hyphen and underscore formats for compatibility
        const hasBlazeRing = refreshedStudentData.artifacts?.['blaze-ring'] === true || 
                             refreshedStudentData.artifacts?.blaze_ring === true ||
                             refreshedStudentData.artifacts?.['blaze-ring_purchase'] ||
                             refreshedStudentData.artifacts?.blaze_ring_purchase;
        
        if (hasBlazeRing) {
          const purchaseData = refreshedStudentData.artifacts?.['blaze-ring_purchase'] || 
                              refreshedStudentData.artifacts?.blaze_ring_purchase;
          const isEquipped = Object.values(updatedEquipped).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'blaze-ring'
          );
          
          if (!isEquipped) {
            const blazeRing: Artifact = {
              id: 'blaze-ring',
              name: purchaseData?.name || 'Blaze Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Blaze Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['blaze-ring'] || 0
            };
            available.push(blazeRing);
          }
        }
        
        // Check for Terra Ring
        // Check both hyphen and underscore formats for compatibility
        const hasTerraRing = refreshedStudentData.artifacts?.['terra-ring'] === true || 
                             refreshedStudentData.artifacts?.terra_ring === true ||
                             refreshedStudentData.artifacts?.['terra-ring_purchase'] ||
                             refreshedStudentData.artifacts?.terra_ring_purchase;
        
        if (hasTerraRing) {
          const purchaseData = refreshedStudentData.artifacts?.['terra-ring_purchase'] || 
                              refreshedStudentData.artifacts?.terra_ring_purchase;
          const isEquipped = Object.values(updatedEquipped).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'terra-ring'
          );
          
          if (!isEquipped) {
            const terraRing: Artifact = {
              id: 'terra-ring',
              name: purchaseData?.name || 'Terra Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Terra Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['terra-ring'] || 0
            };
            available.push(terraRing);
          }
        }

        // Check for Aqua Ring
        // Check both hyphen and underscore formats for compatibility
        const hasAquaRing = refreshedStudentData.artifacts?.['aqua-ring'] === true || 
                             refreshedStudentData.artifacts?.aqua_ring === true ||
                             refreshedStudentData.artifacts?.['aqua-ring_purchase'] ||
                             refreshedStudentData.artifacts?.aqua_ring_purchase;
        
        if (hasAquaRing) {
          const purchaseData = refreshedStudentData.artifacts?.['aqua-ring_purchase'] || 
                              refreshedStudentData.artifacts?.aqua_ring_purchase;
          const isEquipped = Object.values(updatedEquipped).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'aqua-ring'
          );
          
          if (!isEquipped) {
            const aquaRing: Artifact = {
              id: 'aqua-ring',
              name: purchaseData?.name || 'Aqua Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Aqua Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['aqua-ring'] || 0
            };
            available.push(aquaRing);
          }
        }

        // Check for Air Ring
        // Check both hyphen and underscore formats for compatibility
        const hasAirRing = refreshedStudentData.artifacts?.['air-ring'] === true || 
                             refreshedStudentData.artifacts?.air_ring === true ||
                             refreshedStudentData.artifacts?.['air-ring_purchase'] ||
                             refreshedStudentData.artifacts?.air_ring_purchase;
        
        if (hasAirRing) {
          const purchaseData = refreshedStudentData.artifacts?.['air-ring_purchase'] || 
                              refreshedStudentData.artifacts?.air_ring_purchase;
          const isEquipped = Object.values(updatedEquipped).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'air-ring'
          );
          
          if (!isEquipped) {
            const airRing: Artifact = {
              id: 'air-ring',
              name: purchaseData?.name || 'Air Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Air Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['air-ring'] || 0
            };
            available.push(airRing);
          }
        }
        
        setAvailableArtifacts(available);
      }
      
      alert(`✅ ${artifactToUnequip.name} unequipped!`);
    } catch (error) {
      console.error('Error unequipping artifact:', error);
      alert('Failed to unequip artifact. Please try again.');
    }
  };

  // Handle refunding an artifact
  const handleRefundArtifact = async (artifact: Artifact) => {
    if (!currentUser) return;

    try {
      // Get current user data
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (!studentDoc.exists() || !userDoc.exists()) {
        alert('Error: User data not found.');
        return;
      }

      const studentData = studentDoc.data();
      const userData = userDoc.data();

      // Get the original price - check multiple sources
      let artifactPrice = 0;
      
      // First, check purchase data in students.artifacts
      const purchaseData = studentData.artifacts?.[`${artifact.id}_purchase`] || 
                          studentData.artifacts?.[`${artifact.id.replace('-', '_')}_purchase`];
      if (purchaseData && purchaseData.price) {
        artifactPrice = purchaseData.price;
      }
      // Second, check artifactPrices map
      else if (artifactPrices[artifact.id]) {
        artifactPrice = artifactPrices[artifact.id];
      }
      
      // Only allow refund if artifact has a price (was purchased from MST MKT)
      if (artifactPrice === 0) {
        alert('This artifact cannot be refunded (no purchase price found).');
        return;
      }

      const returnPrice = Math.floor(artifactPrice * 0.5);
      
      if (!window.confirm(`Return ${artifact.name} for ${returnPrice} PP (50% of original ${artifactPrice} PP)?`)) {
        return;
      }

      // Check if artifact is equipped - must unequip first
      const isEquipped = Object.values(studentData.equippedArtifacts || {}).some(
        (eq: any) => eq && typeof eq === 'object' && 'id' in eq && eq.id === artifact.id
      );
      
      if (isEquipped) {
        alert('Please unequip this artifact before returning it.');
        return;
      }

      // Remove artifact from students.artifacts
      const currentArtifacts = studentData.artifacts || {};
      const updatedArtifacts = { ...currentArtifacts };
      
      // Remove the artifact flag and purchase data
      delete updatedArtifacts[artifact.id];
      delete updatedArtifacts[`${artifact.id}_purchase`];
      delete updatedArtifacts[artifact.id.replace('-', '_')];
      delete updatedArtifacts[`${artifact.id.replace('-', '_')}_purchase`];

      // Remove ONE instance from students.inventory
      const currentInventory = studentData.inventory || [];
      const artifactIndex = currentInventory.indexOf(artifact.name);
      const updatedInventory = artifactIndex > -1 
        ? currentInventory.filter((item: string, index: number) => index !== artifactIndex)
        : currentInventory;

      // Calculate new PP (add 50% of original price)
      const currentPP = studentData.powerPoints || 0;
      const newPP = currentPP + returnPrice;

      // Remove artifact from users.artifacts array
      const usersArtifacts = userData.artifacts || [];
      let foundOne = false;
      const updatedUsersArtifacts = usersArtifacts.filter((art: any) => {
        if (foundOne) return true;
        
        if (typeof art === 'string') {
          if (art === artifact.name) {
            foundOne = true;
            return false; // Remove this artifact
          }
          return true;
        } else {
          // Match by ID or name, and ensure it's not used
          const isNotUsed = art.used === false || art.used === undefined || art.used === null;
          if ((art.id === artifact.id || art.name === artifact.name) && isNotUsed) {
            foundOne = true;
            return false; // Remove this artifact
          }
          return true;
        }
      });

      // Update both collections
      await updateDoc(studentRef, {
        artifacts: updatedArtifacts,
        inventory: updatedInventory,
        powerPoints: newPP
      });

      await updateDoc(userRef, {
        artifacts: updatedUsersArtifacts
      });

      // Also update vault directly to ensure consistency
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const vaultDoc = await getDoc(vaultRef);
      if (vaultDoc.exists()) {
        const vaultData = vaultDoc.data();
        const maxVaultHealth = vaultData.maxVaultHealth || Math.floor((vaultData.capacity || 1000) * 0.1);
        const correctVaultHealth = newPP >= maxVaultHealth
          ? maxVaultHealth
          : Math.min(newPP, maxVaultHealth);
        
        await updateDoc(vaultRef, {
          currentPP: newPP,
          vaultHealth: correctVaultHealth
        });
      }

      // Update local state
      setPowerPoints(newPP);
      
      // Reload available artifacts to reflect the refund
      const refreshedStudentData = (await getDoc(studentRef)).data();
      if (refreshedStudentData) {
        const available: Artifact[] = [];
        
        // Check for Blaze Ring
        const hasBlazeRing = refreshedStudentData.artifacts?.['blaze-ring'] === true || 
                             refreshedStudentData.artifacts?.blaze_ring === true ||
                             refreshedStudentData.artifacts?.['blaze-ring_purchase'] ||
                             refreshedStudentData.artifacts?.blaze_ring_purchase;
        
        if (hasBlazeRing) {
          const purchaseData = refreshedStudentData.artifacts?.['blaze-ring_purchase'] || 
                              refreshedStudentData.artifacts?.blaze_ring_purchase;
          const isEquipped = Object.values(refreshedStudentData.equippedArtifacts || {}).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'blaze-ring'
          );
          
          if (!isEquipped) {
            const blazeRing: Artifact = {
              id: 'blaze-ring',
              name: purchaseData?.name || 'Blaze Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Blaze Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['blaze-ring'] || 0
            };
            available.push(blazeRing);
          }
        }
        
        // Check for Terra Ring
        const hasTerraRing = refreshedStudentData.artifacts?.['terra-ring'] === true || 
                             refreshedStudentData.artifacts?.terra_ring === true ||
                             refreshedStudentData.artifacts?.['terra-ring_purchase'] ||
                             refreshedStudentData.artifacts?.terra_ring_purchase;
        
        if (hasTerraRing) {
          const purchaseData = refreshedStudentData.artifacts?.['terra-ring_purchase'] || 
                              refreshedStudentData.artifacts?.terra_ring_purchase;
          const isEquipped = Object.values(refreshedStudentData.equippedArtifacts || {}).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'terra-ring'
          );
          
          if (!isEquipped) {
            const terraRing: Artifact = {
              id: 'terra-ring',
              name: purchaseData?.name || 'Terra Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Terra Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['terra-ring'] || 0
            };
            available.push(terraRing);
          }
        }

        // Check for Aqua Ring
        const hasAquaRing = refreshedStudentData.artifacts?.['aqua-ring'] === true || 
                             refreshedStudentData.artifacts?.aqua_ring === true ||
                             refreshedStudentData.artifacts?.['aqua-ring_purchase'] ||
                             refreshedStudentData.artifacts?.aqua_ring_purchase;
        
        if (hasAquaRing) {
          const purchaseData = refreshedStudentData.artifacts?.['aqua-ring_purchase'] || 
                              refreshedStudentData.artifacts?.aqua_ring_purchase;
          const isEquipped = Object.values(refreshedStudentData.equippedArtifacts || {}).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'aqua-ring'
          );
          
          if (!isEquipped) {
            const aquaRing: Artifact = {
              id: 'aqua-ring',
              name: purchaseData?.name || 'Aqua Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Aqua Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['aqua-ring'] || 0
            };
            available.push(aquaRing);
          }
        }

        // Check for Air Ring
        const hasAirRing = refreshedStudentData.artifacts?.['air-ring'] === true || 
                             refreshedStudentData.artifacts?.air_ring === true ||
                             refreshedStudentData.artifacts?.['air-ring_purchase'] ||
                             refreshedStudentData.artifacts?.air_ring_purchase;
        
        if (hasAirRing) {
          const purchaseData = refreshedStudentData.artifacts?.['air-ring_purchase'] || 
                              refreshedStudentData.artifacts?.air_ring_purchase;
          const isEquipped = Object.values(refreshedStudentData.equippedArtifacts || {}).some(
            (eq) => eq !== null && eq !== undefined && typeof eq === 'object' && 'id' in eq && eq.id === 'air-ring'
          );
          
          if (!isEquipped) {
            const airRing: Artifact = {
              id: 'air-ring',
              name: purchaseData?.name || 'Air Ring',
              slot: 'ring1',
              level: 1,
              image: purchaseData?.image || '/images/Air Ring.png',
              stats: {},
              price: purchaseData?.price || artifactPrices['air-ring'] || 0
            };
            available.push(airRing);
          }
        }
        
        setAvailableArtifacts(available);
      } else {
        // Fallback: just remove from list
        setAvailableArtifacts(prev => prev.filter(a => a.id !== artifact.id));
      }

      alert(`✅ ${artifact.name} returned! You received ${returnPrice} PP (50% of original ${artifactPrice} PP).`);
    } catch (error) {
      console.error('Error returning artifact:', error);
      alert('Error returning artifact. Please try again.');
    }
  };

  const handleElementSelection = async (element: string) => {
    if (!currentUser || selectedElement) return; // Prevent multiple selections
    
    setSelectedElement(element);
    
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const elementLower = element.toLowerCase();
        
        // Create the Elemental Ring artifact object
        const elementalRing: Artifact = {
          id: 'elemental-ring-level-1',
          name: `Elemental Ring: ${element} (Level 1)`,
          slot: 'ring1',
          level: 1,
          image: '/images/Elemental Ring.png',
          stats: {} // No stat bonuses, just the perk
        };
        
        // Update equipped artifacts - equip to Ring 1 slot
        const currentEquipped = studentData.equippedArtifacts || {};
        const updatedEquippedArtifacts = {
          ...currentEquipped,
          ring1: elementalRing
        };
        
        // Update student data with chosen element and equipped ring
        const updatedArtifacts = {
          ...(studentData.artifacts || {}),
          elemental_ring_level_1: true,
          elemental_ring_modal_seen: true,
          chosen_element: elementLower
        };
        
        // Update elementalAffinity if not already set
        const updateData: any = {
          artifacts: updatedArtifacts,
          equippedArtifacts: updatedEquippedArtifacts
        };
        
        if (!studentData.elementalAffinity) {
          updateData.elementalAffinity = elementLower;
        }
        
        await updateDoc(studentRef, updateData);
        
        // Update local state
        setEquippedArtifacts(updatedEquippedArtifacts);
        
        // Unlock elemental moves for the chosen element
        await unlockElementalMoves(elementLower);
        
        // Close modal after a brief delay to show success
        setTimeout(() => {
          setShowElementalRingModal(false);
          alert(`🔥 ${element} elemental moves unlocked! You can now use ${element} moves in battle!`);
        }, 500);
      }
    } catch (error) {
      console.error('Error selecting element:', error);
      alert('Failed to select element. Please try again.');
      setSelectedElement(null);
    }
  };

  const handleCloseElementalRingModal = async () => {
    if (!currentUser || selectedElement) return; // Don't allow closing if element is already selected
    
    try {
      // Mark modal as seen (but element not chosen yet)
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const updatedArtifacts = {
          ...(studentData.artifacts || {}),
          elemental_ring_modal_seen: true
        };
        
        await updateDoc(studentRef, {
          artifacts: updatedArtifacts
        });
      }
    } catch (error) {
      console.error('Error marking Elemental Ring modal as seen:', error);
    }
    
    setShowElementalRingModal(false);
  };


  // Handle artifact upgrade
  const handleUpgradeArtifact = async (slot: keyof EquippedArtifacts) => {
    if (!currentUser) return;
    
    const artifact = equippedArtifacts[slot];
    if (!artifact || artifact.id !== 'elemental-ring-level-1') {
      alert('Only Elemental Rings can be upgraded at this time.');
      return;
    }

    const currentLevel = artifact.level || 1;
    const upgradeCost = calculateUpgradeCost(currentLevel);
    
    // Check if player has enough resources
    if (powerPoints < upgradeCost.pp) {
      alert(`Insufficient Power Points! Need ${upgradeCost.pp} PP, have ${powerPoints} PP.`);
      return;
    }
    
    if (truthMetal < upgradeCost.truthMetal) {
      alert(`Insufficient Truth Metal! Need ${upgradeCost.truthMetal} shard(s), have ${truthMetal} shard(s).`);
      return;
    }

    // Calculate damage multipliers for confirmation dialog
    const oldMultiplier = getArtifactDamageMultiplier(currentLevel);
    const newMultiplier = getArtifactDamageMultiplier(currentLevel + 1);
    const damageIncrease = Math.round((newMultiplier - oldMultiplier) * 100);
    const totalDamageIncrease = Math.round((newMultiplier - 1) * 100);
    const element = artifact.name.match(/Elemental Ring: (\w+)/)?.[1] || 'elemental';
    
    if (!window.confirm(
      `Upgrade ${artifact.name} to Level ${currentLevel + 1}?\n\n` +
      `💰 Cost: ${upgradeCost.pp} PP + ${upgradeCost.truthMetal} Truth Metal shard(s)\n\n` +
      `⚔️ DAMAGE INCREASE:\n` +
      `   Current: +${Math.round((oldMultiplier - 1) * 100)}% damage\n` +
      `   After Upgrade: +${totalDamageIncrease}% damage\n` +
      `   Gain: +${damageIncrease}% more damage!\n\n` +
      `🔥 All your ${element.toLowerCase()} elemental moves will deal ${totalDamageIncrease}% more damage in battle!`
    )) {
      return;
    }

    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) {
        alert('Error: Student data not found.');
        return;
      }

      const studentData = studentDoc.data();
      const newLevel = currentLevel + 1;
      
      // Extract element from artifact name
      const elementMatch = artifact.name.match(/Elemental Ring: (\w+)/);
      const element = elementMatch ? elementMatch[1] : 'Element';
      
      // Update artifact with new level
      const updatedArtifact: Artifact = {
        ...artifact,
        level: newLevel,
        name: `Elemental Ring: ${element} (Level ${newLevel})`
      };
      
      // Update equipped artifacts
      const updatedEquipped = {
        ...equippedArtifacts,
        [slot]: updatedArtifact
      };
      
      // Update student data
      const newPowerPoints = (studentData.powerPoints || 0) - upgradeCost.pp;
      const newTruthMetal = (studentData.truthMetal || 0) - upgradeCost.truthMetal;
      
      await updateDoc(studentRef, {
        equippedArtifacts: updatedEquipped,
        powerPoints: newPowerPoints,
        truthMetal: newTruthMetal
      });
      
      // Update local state
      setEquippedArtifacts(updatedEquipped);
      setPowerPoints(newPowerPoints);
      setTruthMetal(newTruthMetal);
      
      // Calculate damage multipliers for before and after
      const oldMultiplier = getArtifactDamageMultiplier(currentLevel);
      const newMultiplier = getArtifactDamageMultiplier(newLevel);
      const damageIncrease = Math.round((newMultiplier - oldMultiplier) * 100);
      const totalDamageIncrease = Math.round((newMultiplier - 1) * 100);
      
      // Show detailed upgrade impact
      const upgradeMessage = `✅ Elemental Ring: ${element} upgraded to Level ${newLevel}!\n\n` +
        `🔥 DAMAGE INCREASE:\n` +
        `   • Previous: +${Math.round((oldMultiplier - 1) * 100)}% damage\n` +
        `   • New: +${totalDamageIncrease}% damage\n` +
        `   • Increase: +${damageIncrease}% more damage!\n\n` +
        `⚔️ IMPACT ON YOUR ${element.toUpperCase()} MOVES:\n` +
        `   All your ${element.toLowerCase()} elemental moves now deal ${totalDamageIncrease}% more damage in battle!\n\n` +
        `💪 Example: A move that dealt 10 damage now deals ${Math.round(10 * newMultiplier)} damage!`;
      
      alert(upgradeMessage);
    } catch (error) {
      console.error('Error upgrading artifact:', error);
      alert('Failed to upgrade artifact. Please try again.');
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Elemental Ring Reward Modal */}
      {showElementalRingModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { transform: translateY(30px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.05); }
            }
            @keyframes glow {
              0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.5); }
              50% { box-shadow: 0 0 30px rgba(102, 126, 234, 0.8); }
            }
          `}</style>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '1.5rem',
            padding: '2.5rem',
            maxWidth: '600px',
            width: '100%',
            color: 'white',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            animation: 'slideUp 0.4s ease-out',
            position: 'relative'
          }}>
            {/* Close button - only show if element not selected */}
            {!selectedElement && (
              <button
                onClick={handleCloseElementalRingModal}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  color: 'white',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ×
              </button>
            )}
            
            {/* Elemental Ring Image */}
            <div style={{
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'center',
              animation: selectedElement ? 'pulse 1s ease-in-out infinite' : 'glow 2s ease-in-out infinite'
            }}>
              <img
                src="/images/Elemental Ring.png"
                alt="Elemental Ring"
                style={{
                  width: '200px',
                  height: 'auto',
                  borderRadius: '0.5rem',
                  border: '3px solid rgba(255, 255, 255, 0.3)'
                }}
              />
            </div>
            
            {/* Title */}
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
            }}>
              Elemental Ring: Level 1
            </h2>
            
            {/* Question */}
            <p style={{
              fontSize: '1.25rem',
              lineHeight: 1.6,
              opacity: 0.95,
              marginBottom: '2rem',
              fontWeight: '500'
            }}>
              Which element most aligns with your nature?
            </p>
            
            {/* Element Selection Buttons */}
            {!selectedElement ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                {['Fire', 'Water', 'Earth', 'Air'].map((element) => {
                  const elementColors: { [key: string]: { bg: string; hover: string; icon: string } } = {
                    Fire: { bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', hover: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)', icon: '🔥' },
                    Water: { bg: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', hover: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)', icon: '💧' },
                    Earth: { bg: 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)', hover: 'linear-gradient(135deg, #a3e635 0%, #84cc16 100%)', icon: '🌍' },
                    Air: { bg: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)', hover: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)', icon: '💨' }
                  };
                  
                  const colors = elementColors[element] || elementColors.Fire;
                  
                  return (
                    <button
                      key={element}
                      onClick={() => handleElementSelection(element)}
                      style={{
                        background: colors.bg,
                        border: 'none',
                        borderRadius: '0.75rem',
                        padding: '1.25rem',
                        color: 'white',
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = colors.hover;
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = colors.bg;
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                      }}
                    >
                      <span style={{ fontSize: '2rem' }}>{colors.icon}</span>
                      <span>{element}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  {selectedElement === 'Fire' && '🔥'} 
                  {selectedElement === 'Water' && '💧'} 
                  {selectedElement === 'Earth' && '🌍'} 
                  {selectedElement === 'Air' && '💨'} 
                  {' '}{selectedElement} Element Selected!
                </div>
                <p style={{
                  fontSize: '1rem',
                  opacity: 0.95,
                  marginTop: '0.5rem'
                }}>
                  Unlocking {selectedElement.toLowerCase()} elemental moves...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1rem'
        }}>
          <div>
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem'
            }}>
              💎 Artifacts System
            </h1>
            <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
              Equip artifacts to enhance your character's stats and abilities.
            </p>
          </div>
          {/* Resource Display */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}>
              <span style={{ fontSize: '1.25rem' }}>💰</span>
              <div>
                <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Power Points</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{powerPoints.toLocaleString()}</div>
              </div>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
            }}>
              <span style={{ fontSize: '1.25rem' }}>💎</span>
              <div>
                <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Truth Metal</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{truthMetal.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Split Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        minHeight: '600px'
      }}>
        {/* Left Side: Equipment Slots */}
        <div style={{
          background: '#f9fafb',
          borderRadius: '1rem',
          padding: '1.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            color: '#374151'
          }}>
            Equipment Slots
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1rem'
          }}>
            {slotConfig.map((slot) => {
              const equipped = equippedArtifacts[slot.key];
              return (
                <div
                  key={slot.key}
                  style={{
                    background: equipped ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' : 'white',
                    border: `2px solid ${equipped ? '#3b82f6' : '#d1d5db'}`,
                    borderRadius: '0.75rem',
                    padding: '1.25rem',
                    textAlign: 'center',
                    minHeight: '150px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {equipped && equipped.image ? (
                    <div style={{ 
                      marginBottom: '0.5rem',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                      height: '80px'
                    }}>
                      <img
                        src={equipped.image}
                        alt={equipped.name}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '80px',
                          objectFit: 'contain',
                          borderRadius: '0.25rem'
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                      {slot.icon}
                    </div>
                  )}
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    color: equipped ? '#1e40af' : '#6b7280'
                  }}>
                    {slot.label}
                  </div>
                  {equipped ? (
                    <>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#1e40af',
                        fontWeight: '600',
                        textAlign: 'center',
                        marginBottom: '0.5rem'
                      }}>
                        {equipped.name}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnequipArtifact(slot.key);
                        }}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.625rem',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        Unequip
                      </button>
                    </>
                  ) : (
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      Empty Slot
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Available Artifacts Section */}
          {availableArtifacts.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#374151'
              }}>
                Available Artifacts
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '1rem'
              }}>
                {availableArtifacts.map((artifact) => {
                  // Determine which slots this artifact can be equipped to
                  // Ring artifacts (like Blaze Ring, Terra Ring, Aqua Ring, Air Ring) can be equipped to any ring slot
                  const compatibleSlots = (artifact.id === 'blaze-ring' || artifact.id === 'terra-ring' || artifact.id === 'aqua-ring' || artifact.id === 'air-ring' || artifact.slot?.startsWith('ring'))
                    ? ['ring1', 'ring2', 'ring3', 'ring4'] as const
                    : artifact.slot 
                    ? [artifact.slot] as const
                    : [];
                  
                  const isEquipped = Object.values(equippedArtifacts).some(
                    eq => eq && eq.id === artifact.id
                  );
                  
                  return (
                    <div
                      key={artifact.id}
                      style={{
                        background: isEquipped ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' : 'white',
                        border: `2px solid ${isEquipped ? '#3b82f6' : '#d1d5db'}`,
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        textAlign: 'center'
                      }}
                    >
                      {artifact.image && (
                        <img
                          src={artifact.image}
                          alt={artifact.name}
                          style={{
                            width: '100%',
                            maxHeight: '100px',
                            objectFit: 'contain',
                            marginBottom: '0.5rem',
                            borderRadius: '0.25rem'
                          }}
                        />
                      )}
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        marginBottom: '0.5rem',
                        color: '#1f2937'
                      }}>
                        {artifact.name}
                      </div>
                      {isEquipped ? (
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#3b82f6',
                          fontWeight: '600'
                        }}>
                          ✓ Equipped
                        </div>
                      ) : (
                        <div>
                          <div style={{
                            fontSize: '0.7rem',
                            color: '#6b7280',
                            marginBottom: '0.5rem'
                          }}>
                            Equip to:
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                            marginBottom: '0.5rem'
                          }}>
                            {compatibleSlots.map((slot) => {
                              const slotInfo = slotConfig.find(s => s.key === slot);
                              return (
                                <button
                                  key={slot}
                                  onClick={() => handleEquipArtifact(artifact, slot)}
                                  style={{
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    padding: '0.375rem 0.75rem',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  {slotInfo?.label || slot}
                                </button>
                              );
                            })}
                          </div>
                          {/* Return Artifact Button */}
                          {(() => {
                            // Get the original price from artifact object or fallback to artifactPrices
                            const artifactPrice = artifact.price || artifactPrices[artifact.id] || 0;
                            
                            // Only show return button if artifact has a price (was purchased from MST MKT)
                            if (artifactPrice > 0) {
                              const returnPrice = Math.floor(artifactPrice * 0.5);
                              
                              return (
                                <button
                                  onClick={() => handleRefundArtifact(artifact)}
                                  style={{
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    padding: '0.375rem 0.75rem',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '100%',
                                    transition: 'background-color 0.2s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#059669';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#10b981';
                                  }}
                                >
                                  💰 Return ({returnPrice} PP)
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Stats and Perks */}
        <div style={{
          background: '#f9fafb',
          borderRadius: '1rem',
          padding: '1.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            color: '#374151'
          }}>
            Stat Changes & Perks
          </h2>
          
          {!hasEquippedArtifacts ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>
                💎
              </div>
              <p style={{ fontSize: '1rem', fontStyle: 'italic' }}>
                No artifacts equipped. Equip artifacts to see stat changes and perks here.
              </p>
            </div>
          ) : (
            <div>
              {/* Total Stats */}
              {Object.keys(totalStats).length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    marginBottom: '1rem',
                    color: '#374151'
                  }}>
                    Total Stat Bonuses
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    {Object.entries(totalStats).map(([stat, value]) => (
                      <div
                        key={stat}
                        style={{
                          background: 'white',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: '#374151',
                          textTransform: 'capitalize'
                        }}>
                          {stat.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: 'bold',
                          color: '#10b981'
                        }}>
                          +{value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipped Artifacts Details */}
              <div>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  color: '#374151'
                }}>
                  Equipped Artifacts
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  {slotConfig.map((slot) => {
                    const equipped = equippedArtifacts[slot.key];
                    if (!equipped) return null;

                    return (
                      <div
                        key={slot.key}
                        style={{
                          background: 'white',
                          border: '1px solid #3b82f6',
                          borderRadius: '0.75rem',
                          padding: '1rem'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{ fontSize: '1.5rem' }}>
                            {slot.icon}
                          </div>
                          <div>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                              color: '#1e40af'
                            }}>
                              {equipped.name}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280'
                            }}>
                              {slot.label}
                            </div>
                          </div>
                        </div>
                        {equipped.stats && Object.keys(equipped.stats).length > 0 && (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            {Object.entries(equipped.stats).map(([stat, value]) => (
                              <div
                                key={stat}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '0.75rem'
                                }}
                              >
                                <span style={{ color: '#6b7280', textTransform: 'capitalize' }}>
                                  {stat.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                <span style={{ color: '#10b981', fontWeight: '600' }}>
                                  +{value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show manifest damage boost for Captain's Helmet */}
                        {(equipped.id === 'captains-helmet' || equipped.id === 'captain-helmet' || 
                          (equipped.name && equipped.name.toLowerCase().includes('captain') && equipped.name.toLowerCase().includes('helmet'))) && (() => {
                            const manifestBoost = getManifestDamageBoost({ head: equipped });
                            const damagePercent = Math.round((manifestBoost - 1) * 100);
                            
                            return (
                              <div style={{
                                marginTop: '0.75rem',
                                paddingTop: '0.75rem',
                                borderTop: '1px solid #e5e7eb'
                              }}>
                                <div style={{
                                  background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                                  border: '1px solid #6366f1',
                                  borderRadius: '0.5rem',
                                  padding: '0.5rem',
                                  marginTop: '0.5rem'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    color: '#4338ca'
                                  }}>
                                    <span style={{ fontSize: '1rem' }}>🪖</span>
                                    <span>Manifest Damage Boost: +{damagePercent}%</span>
                                  </div>
                                  <div style={{
                                    fontSize: '0.75rem',
                                    color: '#4f46e5',
                                    marginTop: '0.25rem',
                                    fontStyle: 'italic'
                                  }}>
                                    All manifest moves deal {damagePercent}% more damage
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        {/* Show perk for Elemental Ring */}
                        {equipped.id === 'elemental-ring-level-1' && (
                          <div style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            <div style={{
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              color: '#9333ea',
                              marginBottom: '0.25rem'
                            }}>
                              Perk:
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              fontStyle: 'italic'
                            }}>
                              {(() => {
                                // Extract element from name (e.g., "Elemental Ring: Fire (Level 1)" -> "Fire")
                                const elementMatch = equipped.name.match(/Elemental Ring: (\w+)/);
                                const element = elementMatch ? elementMatch[1] : 'Element';
                                return `Grants access to ${element} element moves`;
                              })()}
                            </div>
                          </div>
                        )}
                        {equipped.level && (
                          <div style={{
                            marginTop: '0.5rem',
                            marginBottom: '0.75rem'
                          }}>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              marginBottom: '0.25rem'
                            }}>
                              Level: {equipped.level}
                            </div>
                            {equipped.id === 'elemental-ring-level-1' && (() => {
                              const damageMultiplier = getArtifactDamageMultiplier(equipped.level);
                              const damagePercent = Math.round((damageMultiplier - 1) * 100);
                              return (
                                <div style={{
                                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                  border: '1px solid #fbbf24',
                                  borderRadius: '0.5rem',
                                  padding: '0.5rem',
                                  marginTop: '0.5rem'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    color: '#92400e'
                                  }}>
                                    <span style={{ fontSize: '1rem' }}>⚔️</span>
                                    <span>Elemental Damage Boost: +{damagePercent}%</span>
                                  </div>
                                  <div style={{
                                    fontSize: '0.75rem',
                                    color: '#78350f',
                                    marginTop: '0.25rem',
                                    fontStyle: 'italic'
                                  }}>
                                    All {equipped.name.match(/Elemental Ring: (\w+)/)?.[1]?.toLowerCase() || 'elemental'} moves deal {damagePercent}% more damage
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {/* Upgrade button for Elemental Ring */}
                        {equipped.id === 'elemental-ring-level-1' && (
                          <div style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            {(() => {
                              const currentLevel = equipped.level || 1;
                              const upgradeCost = calculateUpgradeCost(currentLevel);
                              const canAfford = powerPoints >= upgradeCost.pp && truthMetal >= upgradeCost.truthMetal;
                              
                              return (
                                <button
                                  onClick={() => handleUpgradeArtifact(slot.key)}
                                  disabled={!canAfford}
                                  style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: canAfford 
                                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                      : '#d1d5db',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    cursor: canAfford ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s',
                                    opacity: canAfford ? 1 : 0.6
                                  }}
                                  onMouseOver={(e) => {
                                    if (canAfford) {
                                      e.currentTarget.style.transform = 'translateY(-2px)';
                                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                                    }
                                  }}
                                  onMouseOut={(e) => {
                                    if (canAfford) {
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = 'none';
                                    }
                                  }}
                                >
                                  ⬆️ Upgrade to Level {currentLevel + 1}
                                  <div style={{
                                    fontSize: '0.75rem',
                                    marginTop: '0.25rem',
                                    opacity: 0.9
                                  }}>
                                    {upgradeCost.pp} PP + {upgradeCost.truthMetal} 💎 Truth Metal
                                  </div>
                                  {(() => {
                                    const nextLevelMultiplier = getArtifactDamageMultiplier(currentLevel + 1);
                                    const currentMultiplier = getArtifactDamageMultiplier(currentLevel);
                                    const nextDamagePercent = Math.round((nextLevelMultiplier - 1) * 100);
                                    const damageIncrease = Math.round((nextLevelMultiplier - currentMultiplier) * 100);
                                    return (
                                      <div style={{
                                        fontSize: '0.7rem',
                                        marginTop: '0.25rem',
                                        opacity: 0.95,
                                        fontWeight: '600'
                                      }}>
                                        → +{nextDamagePercent}% damage (+{damageIncrease}% increase)
                                      </div>
                                    );
                                  })()}
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Perks Section */}
              {(() => {
                // Check if Elemental Ring is equipped
                const elementalRing = equippedArtifacts.ring1;
                if (elementalRing && elementalRing.id === 'elemental-ring-level-1') {
                  const elementMatch = elementalRing.name.match(/Elemental Ring: (\w+)/);
                  const element = elementMatch ? elementMatch[1] : 'Element';
                  
                  return (
                    <div style={{ marginTop: '2rem' }}>
                      <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        marginBottom: '1rem',
                        color: '#374151'
                      }}>
                        Active Perks
                      </h3>
                      <div style={{
                        background: 'white',
                        border: '1px solid #9333ea',
                        borderRadius: '0.75rem',
                        padding: '1rem'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.5rem'
                        }}>
                          <div style={{ fontSize: '1.5rem' }}>💍</div>
                          <div>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                              color: '#9333ea'
                            }}>
                              {elementalRing.name}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              marginTop: '0.25rem'
                            }}>
                              Grants access to {element} element moves
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Artifacts;

