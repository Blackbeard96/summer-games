import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MANIFESTS } from '../types/manifest';
import { MOVE_DAMAGE_VALUES, MOVE_TEMPLATES } from '../types/battle';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { invalidateMoveOverridesCache } from '../utils/moveOverrides';

interface ManifestAdminProps {
  isOpen: boolean;
  onClose: () => void;
  asModal?: boolean; // If false, render directly without modal overlay
}

interface StatusEffect {
  type: 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain' | 'cleanse' | 'freeze' | 'reduce' | 'none';
  duration: number;
  intensity?: number;
  damagePerTurn?: number;
  ppLossPerTurn?: number;
  ppStealPerTurn?: number;
  healPerTurn?: number;
  chance?: number;
  successChance?: number;
  damageReduction?: number; // For reduce effect - percentage of damage to reduce (0-100)
}

interface MoveEditData {
  id: string;
  name: string;
  type?: 'attack' | 'defense' | 'heal';
  damage?: number | { min: number; max: number };
  damageRange?: { min: number; max: number };
  baseDamage?: number;
  healingRange?: { min: number; max: number };
  description?: string;
  statusEffect?: StatusEffect; // Legacy support - single effect
  statusEffects?: StatusEffect[]; // New - multiple effects
}

const ManifestAdmin: React.FC<ManifestAdminProps> = ({ isOpen, onClose, asModal = true }) => {
  const [selectedManifest, setSelectedManifest] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [editingMoves, setEditingMoves] = useState<boolean>(false);
  const [moveEdits, setMoveEdits] = useState<{ [key: string]: MoveEditData }>({});
  const [existingOverrides, setExistingOverrides] = useState<{ [key: string]: MoveEditData }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [addingNewMove, setAddingNewMove] = useState<boolean>(false);
  const [newMoveData, setNewMoveData] = useState<Partial<MoveEditData>>({
    name: '',
    type: 'attack',
    damage: 0,
    description: ''
  });
  
  // Track if we've already initialized moves for this manifest to prevent unnecessary resets
  const initializedForManifestRef = useRef<string | null>(null);

  // Load existing move overrides when component opens
  useEffect(() => {
    if (isOpen) {
      loadExistingOverrides();
    }
  }, [isOpen]);

  useEffect(() => {
    console.log('[ManifestAdmin] useEffect triggered:', { 
      editingMoves, 
      selectedManifest, 
      existingOverridesCount: Object.keys(existingOverrides).length,
      initializedForManifest: initializedForManifestRef.current
    });
    
    if (editingMoves && selectedManifest) {
      // Only initialize if we haven't already for this manifest, or if the manifest changed
      if (initializedForManifestRef.current !== selectedManifest) {
        console.log('[ManifestAdmin] ✅ Initializing move edits for manifest:', selectedManifest);
        
        // Initialize moveEdits with ALL moves (not just overrides) when editing starts
        const manifestMoves = getManifestMoves(selectedManifest);
        console.log('[ManifestAdmin] 📋 Found', manifestMoves.length, 'moves for manifest', selectedManifest);
        console.log('[ManifestAdmin] 📋 Move names:', manifestMoves.map(m => m.name));
        console.log('[ManifestAdmin] 📋 Move details:', manifestMoves);
        
        if (manifestMoves.length === 0) {
          console.warn('[ManifestAdmin] ⚠️ WARNING: No moves found for manifest:', selectedManifest);
          console.warn('[ManifestAdmin] ⚠️ This might indicate a problem with getManifestMoves() or MOVE_TEMPLATES');
        }
        
        const initialEdits: { [key: string]: MoveEditData } = {};
        
        manifestMoves.forEach(move => {
          const existingOverride = existingOverrides[move.id] as MoveEditData | undefined;
          console.log('[ManifestAdmin] 🔍 Processing move:', move.id, {
            hasOverride: !!existingOverride,
            overrideName: existingOverride?.name,
            defaultName: move.name
          });
          
          // Initialize with move data, applying overrides if they exist
          initialEdits[move.id] = {
            id: move.id,
            name: existingOverride?.name || move.name,
            type: existingOverride?.type || move.type || 'attack',
            damage: existingOverride?.damage !== undefined ? existingOverride.damage : (move.damage || 0),
            description: existingOverride?.description || move.description || '',
            statusEffect: existingOverride?.statusEffect,
            statusEffects: existingOverride?.statusEffects || move.statusEffects
          };
        });
        
        console.log('[ManifestAdmin] ✅ Initialized moveEdits with', Object.keys(initialEdits).length, 'moves');
        console.log('[ManifestAdmin] 📝 Initial edits object:', initialEdits);
        setMoveEdits(initialEdits);
        initializedForManifestRef.current = selectedManifest; // Mark as initialized
      } else {
        console.log('[ManifestAdmin] ℹ️ Moves already initialized for', selectedManifest, '- skipping re-initialization to preserve edits.');
      }
    } else {
      // Clear moveEdits when not editing
      console.log('[ManifestAdmin] 🧹 Clearing moveEdits (not editing)');
      setMoveEdits({});
      initializedForManifestRef.current = null; // Reset ref when not editing
    }
  }, [editingMoves, selectedManifest]); // Removed existingOverrides from dependencies to prevent resets

  const loadExistingOverrides = async () => {
    console.log('[ManifestAdmin] 🔄 Loading existing overrides...');
    setLoading(true);
    try {
      const moveOverridesRef = doc(db, 'adminSettings', 'moveOverrides');
      console.log('[ManifestAdmin] 📍 Firestore read path: adminSettings/moveOverrides');
      const overrideDoc = await getDoc(moveOverridesRef);
      
      if (overrideDoc.exists()) {
        const overrideData = overrideDoc.data();
        // Filter out metadata fields
        const { lastUpdated, updatedBy, ...moveOverrides } = overrideData;
        const loadedOverrides = moveOverrides as { [key: string]: MoveEditData };
        setExistingOverrides(loadedOverrides);
        console.log('[ManifestAdmin] ✅ Loaded existing move overrides:', Object.keys(loadedOverrides).length, 'overrides');
        console.log('[ManifestAdmin] 📋 Override keys:', Object.keys(loadedOverrides));
        console.log('[ManifestAdmin] 📋 Sample override data:', Object.keys(loadedOverrides).slice(0, 3).map(k => ({
          key: k,
          name: loadedOverrides[k]?.name,
          damage: loadedOverrides[k]?.damage
        })));
        
        // If we're currently editing a manifest, refresh moveEdits with the loaded overrides
        if (editingMoves && selectedManifest) {
          console.log('[ManifestAdmin] 🔄 Refreshing moveEdits with loaded overrides for', selectedManifest);
          const manifestMoves = getManifestMoves(selectedManifest);
          const refreshedEdits: { [key: string]: MoveEditData } = {};
          
          manifestMoves.forEach(move => {
            const savedOverride = loadedOverrides[move.id] as MoveEditData | undefined;
            refreshedEdits[move.id] = {
              id: move.id,
              name: savedOverride?.name || move.name,
              type: savedOverride?.type || move.type || 'attack',
              damage: savedOverride?.damage !== undefined ? savedOverride.damage : (move.damage || 0),
              description: savedOverride?.description || move.description || '',
              statusEffect: savedOverride?.statusEffect,
              statusEffects: savedOverride?.statusEffects || move.statusEffects
            };
          });
          
          // Also include any custom moves for this manifest
          Object.keys(loadedOverrides).forEach(key => {
            if (key.startsWith(`${selectedManifest}-`) && !refreshedEdits[key]) {
              refreshedEdits[key] = loadedOverrides[key] as MoveEditData;
            }
          });
          
          console.log('[ManifestAdmin] ✅ Refreshed moveEdits with', Object.keys(refreshedEdits).length, 'moves');
          setMoveEdits(refreshedEdits);
          initializedForManifestRef.current = selectedManifest;
        }
      } else {
        console.log('[ManifestAdmin] ℹ️ No existing move overrides found in database');
        setExistingOverrides({});
      }
    } catch (error: any) {
      console.error('[ManifestAdmin] ❌ Error loading move overrides:', error);
      console.error('[ManifestAdmin] ❌ Error details:', {
        message: error.message,
        code: error.code
      });
      setError(`Failed to load overrides: ${error.message || 'Unknown error'}`);
      setExistingOverrides({});
    } finally {
      setLoading(false);
      console.log('[ManifestAdmin] ✅ Finished loading overrides');
    }
  };

  // Allow component to be rendered directly (not just as modal)
  // If asModal is false, always render (for direct embedding in AdminPanel)
  // If asModal is true, only render when isOpen is true (for modal mode)
  const shouldRender = asModal ? isOpen : true;
  
  if (!shouldRender) {
    console.log('[ManifestAdmin] Not rendering - isOpen:', isOpen, 'asModal:', asModal);
    return null;
  }

  const handleManifestSelect = (manifestId: string) => {
    setSelectedManifest(manifestId);
    setShowDetails(null);
    setEditingMoves(false);
  };

  const getManifestById = (id: string) => {
    return MANIFESTS.find(m => m.id === id);
  };

  const getManifestMoves = (manifestId: string) => {
    console.log('[ManifestAdmin] 🔍 getManifestMoves called for manifest:', manifestId);
    
    // Get moves from MOVE_TEMPLATES that match this manifest type
    const manifestMovesFromTemplates = MOVE_TEMPLATES.filter(
      move => move.category === 'manifest' && move.manifestType === manifestId
    );
    
    console.log('[ManifestAdmin] 📋 Found', manifestMovesFromTemplates.length, 'move templates for', manifestId);
    console.log('[ManifestAdmin] 📋 Template names:', manifestMovesFromTemplates.map(m => m.name));

    const manifestMoves: MoveEditData[] = [];
    const processedMoveIds = new Set<string>();
    
    // First, process moves from templates
    manifestMovesFromTemplates.forEach(moveTemplate => {
      const moveName = moveTemplate.name;
      processedMoveIds.add(moveName);
      const moveData = MOVE_DAMAGE_VALUES[moveName];
      const override = existingOverrides[moveName];
      
      console.log('[ManifestAdmin] 🔍 Processing move template:', moveName, {
        hasMoveData: !!moveData,
        hasOverride: !!override,
        moveDataDamage: moveData?.damage
      });
      
      // Determine move type from template
      let moveType: 'attack' | 'defense' | 'heal' = 'attack';
      if (moveTemplate.type === 'defense' || moveTemplate.type === 'support') {
        moveType = moveTemplate.healing ? 'heal' : 'defense';
      } else if (moveTemplate.healing) {
        moveType = 'heal';
      }

      // Support both legacy single effect and new multiple effects
      const effects = override?.statusEffects || (override?.statusEffect ? [override.statusEffect] : []);
      
      manifestMoves.push({
        id: moveName,
        name: override?.name || moveName,
        type: override?.type || moveType,
        damage: override?.damage || moveData?.damage || 0,
        description: override?.description || moveTemplate.description || '',
        statusEffect: override?.statusEffect, // Legacy support
        statusEffects: effects.length > 0 ? effects : undefined
      });
    });

    // Then, add custom moves from overrides that don't have a template and belong to this manifest
    // Custom moves have IDs like: "manifestId-move-name-timestamp"
    Object.keys(existingOverrides).forEach(moveId => {
      if (!processedMoveIds.has(moveId) && moveId.startsWith(`${manifestId}-`)) {
        const override = existingOverrides[moveId] as MoveEditData;
        console.log('[ManifestAdmin] 🔍 Adding custom move from overrides:', moveId, override);
        manifestMoves.push({
          id: moveId,
          name: override.name || moveId,
          type: override.type || 'attack',
          damage: override.damage || 0,
          description: override.description || '',
          statusEffect: override.statusEffect,
          statusEffects: override.statusEffects
        });
      }
    });

    // Sort by level (template moves first, then custom moves)
    const sorted = manifestMoves.sort((a, b) => {
      const aIsTemplate = !!manifestMovesFromTemplates.find(m => m.name === a.id);
      const bIsTemplate = !!manifestMovesFromTemplates.find(m => m.name === b.id);
      
      // Template moves first
      if (aIsTemplate && !bIsTemplate) return -1;
      if (!aIsTemplate && bIsTemplate) return 1;
      
      // If both are templates, sort by level
      if (aIsTemplate && bIsTemplate) {
        const aLevel = manifestMovesFromTemplates.find(m => m.name === a.id)?.level || 0;
        const bLevel = manifestMovesFromTemplates.find(m => m.name === b.id)?.level || 0;
        return aLevel - bLevel;
      }
      
      // If both are custom, sort by name
      return (a.name || '').localeCompare(b.name || '');
    });
    
    console.log('[ManifestAdmin] ✅ Returning', sorted.length, 'moves for', manifestId, '(including', sorted.length - manifestMovesFromTemplates.length, 'custom moves)');
    return sorted;
  };

  const handleMoveEdit = (moveId: string, field: string, value: any) => {
    console.log('[ManifestAdmin] ✏️ handleMoveEdit called:', { moveId, field, value, currentMoveEdits: Object.keys(moveEdits).length });
    
    setMoveEdits(prev => {
      const currentMove = prev[moveId] || {};
      console.log('[ManifestAdmin] 📝 Current move state for', moveId, ':', currentMove);
      
      // Handle status effect updates (can be an object) - legacy support
      if (field === 'statusEffect') {
        // Convert to array
        return {
      ...prev,
      [moveId]: {
            ...currentMove,
        id: moveId,
            name: currentMove.name || moveId,
            damage: currentMove.damage || 0,
            statusEffect: value,
            statusEffects: value && value.type !== 'none' ? [value] : []
          }
        };
      }
      
      if (field === 'statusEffects') {
        return {
          ...prev,
          [moveId]: {
            ...currentMove,
            id: moveId,
            name: currentMove.name || moveId,
            damage: currentMove.damage || 0,
            statusEffects: value
          }
        };
      }
      
      // Handle healing range updates
      if (field === 'healingRange') {
        return {
          ...prev,
          [moveId]: {
            ...currentMove,
            id: moveId,
            name: currentMove.name || moveId,
            damage: currentMove.damage || 0,
            healingRange: value
          }
        };
      }
      
      // Default: update the field directly
      return {
        ...prev,
        [moveId]: {
          ...currentMove,
          id: moveId,
          name: currentMove.name || moveId,
          damage: currentMove.damage || 0,
        [field]: value
      }
      };
    });
  };

  const getMoveEffects = (moveId: string): StatusEffect[] => {
    // First check moveEdits (current edits)
    const move = moveEdits[moveId];
    if (move?.statusEffects) {
      return move.statusEffects;
    }
    if (move?.statusEffect && move.statusEffect.type !== 'none') {
      return [move.statusEffect];
    }
    
    // Then check existingOverrides (saved in database)
    const existingOverride = existingOverrides[moveId] as MoveEditData | undefined;
    if (existingOverride?.statusEffects) {
      return existingOverride.statusEffects;
    }
    if (existingOverride?.statusEffect && existingOverride.statusEffect.type !== 'none') {
      return [existingOverride.statusEffect];
    }
    
    // Finally check original move template
    const originalMove = getManifestMoves(selectedManifest || '').find(m => m.id === moveId);
    if (originalMove?.statusEffects) {
      return originalMove.statusEffects;
    }
    if (originalMove?.statusEffect && originalMove.statusEffect.type !== 'none') {
      return [originalMove.statusEffect];
    }
    return [];
  };

  const addStatusEffect = (moveId: string) => {
    const currentEffects = getMoveEffects(moveId);
    const newEffect: StatusEffect = {
      type: 'burn',
      duration: 1,
      successChance: 100
    };
    handleMoveEdit(moveId, 'statusEffects', [...currentEffects, newEffect]);
  };

  const removeStatusEffect = (moveId: string, effectIndex: number) => {
    const currentEffects = getMoveEffects(moveId);
    const newEffects = currentEffects.filter((_, index) => index !== effectIndex);
    handleMoveEdit(moveId, 'statusEffects', newEffects);
  };

  const updateStatusEffect = (moveId: string, effectIndex: number, field: keyof StatusEffect, value: any) => {
    const currentEffects = getMoveEffects(moveId);
    const newEffects = [...currentEffects];
    newEffects[effectIndex] = {
      ...newEffects[effectIndex],
      [field]: value
    };
    handleMoveEdit(moveId, 'statusEffects', newEffects);
  };

  const handleDamageRangeEdit = (moveId: string, rangeField: 'min' | 'max', value: number) => {
    setMoveEdits(prev => {
      const currentMove = prev[moveId];
      const currentDamage = currentMove?.damage;
      
      // If current damage is a number, convert it to a range
      let damageRange: { min: number; max: number };
      if (typeof currentDamage === 'number') {
        damageRange = { min: currentDamage, max: currentDamage };
      } else if (currentDamage && typeof currentDamage === 'object') {
        damageRange = { ...currentDamage };
      } else {
        // If no current damage, get the original damage from MOVE_DAMAGE_VALUES
        const originalMove = MOVE_DAMAGE_VALUES[moveId];
        const originalDamage = originalMove?.damage || 0;
        damageRange = { min: originalDamage, max: originalDamage };
      }
      
      // Update the specific range field
      damageRange[rangeField] = value;
      
      console.log(`Updating damage range for ${moveId}:`, {
        rangeField,
        value,
        damageRange,
        currentDamage,
        originalDamage: MOVE_DAMAGE_VALUES[moveId]?.damage
      });
      
      return {
        ...prev,
        [moveId]: {
          ...currentMove,
          id: moveId,
          name: currentMove?.name || moveId,
          damage: damageRange,
          description: currentMove?.description || '',
          statusEffect: currentMove?.statusEffect
        }
      };
    });
  };

  const handleStatusEffectEdit = (moveId: string, field: 'type' | 'duration' | 'intensity' | 'successChance', value: string | number) => {
    setMoveEdits(prev => {
      const currentMove = prev[moveId];
      
      // If type is 'none', remove the status effect entirely
      if (field === 'type' && value === 'none') {
        return {
          ...prev,
          [moveId]: {
            ...currentMove,
            id: moveId,
            name: currentMove?.name || moveId,
            damage: currentMove?.damage || 0,
            description: currentMove?.description || '',
            statusEffect: undefined
          }
        };
      }
      
      const currentStatusEffect = currentMove?.statusEffect || { type: 'burn', duration: 1, intensity: 5 };
      
      return {
        ...prev,
        [moveId]: {
          ...currentMove,
          id: moveId,
          name: currentMove?.name || moveId,
          damage: currentMove?.damage || 0,
          description: currentMove?.description || '',
          statusEffect: {
            ...currentStatusEffect,
            [field]: value
          }
        }
      };
    });
  };

  const handleRemoveStatusEffect = (moveId: string) => {
    setMoveEdits(prev => {
      const currentMove = prev[moveId];
      
      return {
        ...prev,
        [moveId]: {
          ...currentMove,
          id: moveId,
          name: currentMove?.name || moveId,
          damage: currentMove?.damage || 0,
          description: currentMove?.description || '',
          statusEffect: undefined
        }
      };
    });
  };

  const removeUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => removeUndefined(item));
    }
    if (typeof obj === 'object' && obj.constructor === Object) {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
          cleaned[key] = removeUndefined(obj[key]);
        }
      }
      return cleaned;
    }
    return obj;
  };

  const saveMoveChanges = async () => {
    console.log('[ManifestAdmin] 💾 saveMoveChanges called');
    console.log('[ManifestAdmin] 📊 Current state:', {
      selectedManifest,
      moveEditsCount: Object.keys(moveEdits).length,
      moveEdits: moveEdits,
      existingOverridesCount: Object.keys(existingOverrides).length
    });
    
    setError(null);
    setSaveStatus('saving');
    
    if (!selectedManifest) {
      const errorMsg = '❌ Cannot save: No manifest selected';
      console.error('[ManifestAdmin]', errorMsg);
      setError(errorMsg);
      setSaveStatus('error');
      return;
    }
    
    if (Object.keys(moveEdits).length === 0) {
      const errorMsg = '❌ Cannot save: No moves to save. Please ensure moves are loaded.';
      console.error('[ManifestAdmin]', errorMsg);
      setError(errorMsg);
      setSaveStatus('error');
      return;
    }
    
    try {
      console.log('[ManifestAdmin] 🔄 Starting Firestore save...');
      
      // For now, we'll save to a Firestore collection for admin move overrides
      // This allows us to override the default MOVE_DAMAGE_VALUES without changing the source code
      const { db } = await import('../firebase');
      const { collection, doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
      
      // Create a document with the move overrides
      const moveOverridesRef = doc(collection(db, 'adminSettings'), 'moveOverrides');
      console.log('[ManifestAdmin] 📍 Firestore path:', 'adminSettings/moveOverrides');
      
      // First, read the current document to get ALL existing overrides (including other manifests)
      const currentDoc = await getDoc(moveOverridesRef);
      const allExistingOverrides = currentDoc.exists() ? currentDoc.data() : {};
      const { lastUpdated: _, updatedBy: __, ...existingOverridesFromDB } = allExistingOverrides;
      
      console.log('[ManifestAdmin] 📦 Current overrides in DB:', Object.keys(existingOverridesFromDB).length, 'keys');
      
      // Build the data to save:
      // 1. Start with ALL existing overrides from DB (to preserve other manifests)
      // 2. Remove any overrides for THIS manifest (we'll replace them with moveEdits)
      // 3. Add all moveEdits for this manifest
      const overridesData: any = {};
      
      // Preserve overrides for OTHER manifests (not this one)
      Object.keys(existingOverridesFromDB).forEach(key => {
        // Keep if it's not for this manifest
        const isTemplateMove = MOVE_TEMPLATES.find(m => m.name === key);
        const isCustomMoveForThisManifest = key.startsWith(`${selectedManifest}-`);
        
        if (isTemplateMove) {
          // Check if this template move belongs to this manifest
          const template = MOVE_TEMPLATES.find(m => m.name === key);
          if (template && template.category === 'manifest' && template.manifestType !== selectedManifest) {
            // This template move belongs to a different manifest, preserve it
            overridesData[key] = existingOverridesFromDB[key];
          }
        } else if (!isCustomMoveForThisManifest) {
          // This is an override for a different manifest or element, preserve it
          overridesData[key] = existingOverridesFromDB[key];
        }
        // If it's a template move for this manifest or a custom move for this manifest, we'll replace it with moveEdits
      });
      
      // Add all moveEdits for THIS manifest (this overwrites any existing overrides for this manifest)
      Object.keys(moveEdits).forEach(key => {
        overridesData[key] = moveEdits[key];
      });
      
      // Add metadata
      overridesData.lastUpdated = serverTimestamp();
      overridesData.updatedBy = 'admin';
      
      console.log('[ManifestAdmin] 📦 Data to save (before cleaning):', {
        totalKeys: Object.keys(overridesData).length,
        moveEditsKeys: Object.keys(moveEdits).length,
        preservedOtherManifestKeys: Object.keys(overridesData).filter(k => !moveEdits[k] && k !== 'lastUpdated' && k !== 'updatedBy').length
      });
      
      // Remove undefined values before saving (Firestore doesn't allow undefined)
      const cleanedData = removeUndefined(overridesData);
      console.log('[ManifestAdmin] 🧹 Cleaned data keys:', Object.keys(cleanedData).length);
      
      console.log('[ManifestAdmin] 💾 Writing to Firestore...');
      await setDoc(moveOverridesRef, cleanedData);
      console.log('[ManifestAdmin] ✅ Firestore write successful!');
      
      console.log('[ManifestAdmin] 📝 Move changes saved to database:', moveEdits);
      console.log('[ManifestAdmin] 📝 Overrides data saved:', cleanedData);
      
      setSaveStatus('success');
      
      // Invalidate the cache so other components get fresh data
      console.log('[ManifestAdmin] 🔄 Invalidating cache...');
      invalidateMoveOverridesCache();
      
      // Reload the existing overrides to reflect the saved changes
      console.log('[ManifestAdmin] 🔄 Reloading overrides...');
      await loadExistingOverrides();
      
      // After reloading, refresh moveEdits with the saved data (if still editing)
      // This ensures the UI shows the saved state
      if (editingMoves && selectedManifest) {
        console.log('[ManifestAdmin] 🔄 Refreshing moveEdits with saved overrides after save...');
        const manifestMoves = getManifestMoves(selectedManifest);
        const refreshedEdits: { [key: string]: MoveEditData } = {};
        
        manifestMoves.forEach(move => {
          // Use the freshly loaded overrides (they're now in existingOverrides state)
          const savedOverride = existingOverrides[move.id] as MoveEditData | undefined;
          refreshedEdits[move.id] = {
            id: move.id,
            name: savedOverride?.name || move.name,
            type: savedOverride?.type || move.type || 'attack',
            damage: savedOverride?.damage !== undefined ? savedOverride.damage : (move.damage || 0),
            description: savedOverride?.description || move.description || '',
            statusEffect: savedOverride?.statusEffect,
            statusEffects: savedOverride?.statusEffects || move.statusEffects
          };
        });
        
        // Also include any custom moves for this manifest
        Object.keys(existingOverrides).forEach(key => {
          if (key.startsWith(`${selectedManifest}-`) && !refreshedEdits[key]) {
            refreshedEdits[key] = existingOverrides[key] as MoveEditData;
          }
        });
        
        console.log('[ManifestAdmin] ✅ Refreshed moveEdits with', Object.keys(refreshedEdits).length, 'moves after save');
        setMoveEdits(refreshedEdits);
        initializedForManifestRef.current = selectedManifest; // Mark as initialized to prevent useEffect from resetting
      }
      
      console.log('[ManifestAdmin] ✅ Save complete!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
      
    } catch (error: any) {
      console.error('[ManifestAdmin] ❌ Error saving move changes:', error);
      console.error('[ManifestAdmin] ❌ Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      let errorMessage = 'Failed to save move changes.';
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Check Firestore security rules.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      setError(errorMessage);
      setSaveStatus('error');
    }
  };

  const cancelMoveEdit = () => {
    console.log('[ManifestAdmin] 🚫 Cancelling move edit');
    setEditingMoves(false);
    setMoveEdits({});
    setSelectedManifest(null);
    setError(null);
    setSaveStatus('idle');
    initializedForManifestRef.current = null;
  };

  const content = (
    <div style={{
      background: asModal ? 'rgba(30, 41, 59, 0.95)' : '#ffffff',
      backdropFilter: asModal ? 'blur(10px)' : 'none',
        padding: '2rem',
        borderRadius: '1rem',
        maxWidth: '1400px',
        width: '100%',
      maxHeight: asModal ? '90vh' : 'auto',
        overflow: 'auto',
      color: asModal ? '#f8fafc' : '#111827',
      border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
      boxShadow: asModal ? '0 20px 60px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Manifest Administration
          </h1>
          <p style={{ 
            fontSize: '1.2rem', 
            marginBottom: '1rem',
            color: asModal ? '#e2e8f0' : '#374151',
            fontWeight: '500'
          }}>
            Manage manifests, moves, and damage values for the Nine Knowings Universe.
          </p>
          {loading && (
            <div style={{ 
              textAlign: 'center', 
              marginBottom: '1rem',
              color: '#fbbf24',
              fontSize: '1rem'
            }}>
              Loading existing move overrides...
            </div>
          )}
        </div>

        <div style={{ 
          display: editingMoves ? 'none' : 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: editingMoves ? '0' : '2rem'
        }}>
          {MANIFESTS.map((manifest) => (
            <div
              key={manifest.id}
              onClick={() => handleManifestSelect(manifest.id)}
              style={{
                padding: '1.5rem',
                background: selectedManifest === manifest.id 
                  ? `linear-gradient(135deg, ${manifest.color}20 0%, ${manifest.color}10 100%)`
                  : 'rgba(255,255,255,0.05)',
                border: selectedManifest === manifest.id 
                  ? `2px solid ${manifest.color}` 
                  : '2px solid rgba(255,255,255,0.2)',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                textAlign: 'center',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (selectedManifest !== manifest.id) {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = `0 10px 25px ${manifest.color}40`;
                }
              }}
              onMouseLeave={(e) => {
                if (selectedManifest !== manifest.id) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
                {manifest.icon}
              </div>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: 'bold', 
                marginBottom: '0.5rem',
                color: selectedManifest === manifest.id ? manifest.color : (asModal ? '#f8fafc' : '#111827')
              }}>
                {manifest.name}
              </h3>
              <p style={{ 
                fontSize: '0.9rem', 
                marginBottom: '1rem',
                color: asModal ? '#e2e8f0' : '#4b5563',
                lineHeight: '1.4'
              }}>
                {manifest.description}
              </p>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                fontSize: '0.8rem',
                color: asModal ? '#cbd5e1' : '#6b7280'
              }}>
                <span>Catalyst: {manifest.catalyst}</span>
                <span>Move: {manifest.signatureMove}</span>
              </div>

              {selectedManifest === manifest.id && (
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: manifest.color,
                  color: 'white',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}>
                  ✓
                </div>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(showDetails === manifest.id ? null : manifest.id);
                }}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  background: asModal ? 'rgba(255,255,255,0.15)' : '#f3f4f6',
                  border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  color: asModal ? '#f8fafc' : '#111827',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {showDetails === manifest.id ? 'Hide Details' : 'View Moves & Edit'}
              </button>

              {showDetails === manifest.id && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '0.5rem',
                  textAlign: 'left'
                }}>
                  <h4 style={{ marginBottom: '0.5rem', color: manifest.color }}>Manifest Details:</h4>
                  {manifest.levels.map((level) => (
                    <div key={level.level} style={{ marginBottom: '0.5rem' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        fontWeight: 'bold',
                        fontSize: '0.8rem'
                      }}>
                        <span>Level {level.level}: {level.scale}</span>
                        <span>{level.xpRequired} XP</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: asModal ? '#cbd5e1' : '#6b7280' }}>
                        {level.example}
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem', color: manifest.color }}>Associated Moves:</h4>
                    {getManifestMoves(manifest.id).length > 0 ? (
                      getManifestMoves(manifest.id).map((move) => (
                        <div key={move.id} style={{ 
                          marginBottom: '0.5rem', 
                          padding: '0.5rem',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '0.25rem'
                        }}>
                          <div style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                            {move.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: asModal ? '#cbd5e1' : '#6b7280' }}>
                            {`Damage: ${typeof move.damage === 'object' 
                              ? `${move.damage.min}-${move.damage.max}` 
                              : move.damage} | ${move.description}`}
                            {move.statusEffect && (
                              <div style={{ marginTop: '0.25rem', color: '#fbbf24', fontWeight: 'bold' }}>
                                Status Effect: {move.statusEffect.type === 'burn' && '🔥'} 
                                {move.statusEffect.type === 'freeze' && '❄️'} 
                                {move.statusEffect.type === 'confuse' && '🌀'} 
                                {move.statusEffect.type.toUpperCase()} 
                                ({move.statusEffect.duration} turn{move.statusEffect.duration > 1 ? 's' : ''}
                                {move.statusEffect.intensity && `, ${move.statusEffect.intensity}${move.statusEffect.type === 'confuse' ? '%' : ''}`})
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: asModal ? '#94a3b8' : '#9ca3af', fontStyle: 'italic' }}>
                        No specific moves found for this manifest
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[ManifestAdmin] 🖱️ Edit Moves button clicked for manifest:', manifest.id);
                        console.log('[ManifestAdmin] 🔍 Current state before click:', {
                          selectedManifest,
                          editingMoves,
                          moveEditsCount: Object.keys(moveEdits).length,
                          existingOverridesCount: Object.keys(existingOverrides).length,
                          asModal
                        });
                        
                        // Set selectedManifest and editingMoves - the useEffect will handle initialization
                        console.log('[ManifestAdmin] 🔄 Setting selectedManifest to:', manifest.id);
                        setSelectedManifest(manifest.id);
                        console.log('[ManifestAdmin] 🔄 Setting editingMoves to: true');
                        setEditingMoves(true);
                        
                        // Scroll to edit panel after a brief delay to ensure it's rendered
                        setTimeout(() => {
                          const editPanel = document.getElementById('manifest-edit-panel');
                          if (editPanel) {
                            console.log('[ManifestAdmin] 📍 Scrolling to edit panel');
                            editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          } else {
                            console.warn('[ManifestAdmin] ⚠️ Edit panel not found in DOM - checking again in 200ms');
                            setTimeout(() => {
                              const editPanel2 = document.getElementById('manifest-edit-panel');
                              if (editPanel2) {
                                editPanel2.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              } else {
                                console.error('[ManifestAdmin] ❌ Edit panel still not found after delay');
                              }
                            }, 200);
                          }
                        }, 100);
                      }}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: '#10B981',
                        border: 'none',
                        borderRadius: '0.25rem',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      Edit Moves
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {editingMoves && selectedManifest && (
          <div 
            id="manifest-edit-panel"
            style={{
              position: asModal ? 'fixed' : 'relative',
              top: asModal ? 0 : 'auto',
              left: asModal ? 0 : 'auto',
              right: asModal ? 0 : 'auto',
              bottom: asModal ? 0 : 'auto',
              background: asModal ? 'rgba(0,0,0,0.8)' : 'transparent',
              display: 'flex',
              alignItems: asModal ? 'center' : 'flex-start',
              justifyContent: 'center',
              zIndex: asModal ? 1001 : 100,
              padding: asModal ? '2rem' : '0',
              marginTop: asModal ? 0 : '2rem',
              marginBottom: asModal ? 0 : '2rem',
              width: '100%',
              minHeight: asModal ? '100vh' : 'auto'
            }}
          >
            <div style={{
              background: asModal ? 'rgba(30, 41, 59, 0.95)' : '#ffffff',
              backdropFilter: asModal ? 'blur(10px)' : 'none',
              padding: '2rem',
              borderRadius: '1rem',
              maxWidth: asModal ? '800px' : '100%',
              width: '100%',
              maxHeight: asModal ? '80vh' : 'none',
              overflow: 'auto',
              color: asModal ? '#f8fafc' : '#111827',
              border: asModal ? '1px solid rgba(255,255,255,0.3)' : '2px solid #6366f1',
              boxShadow: asModal ? '0 20px 60px rgba(0,0,0,0.5)' : '0 8px 16px rgba(0,0,0,0.15)',
              position: 'relative',
              zIndex: 1
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ 
                  fontSize: '2rem', 
                  fontWeight: 'bold',
                  color: asModal ? '#fbbf24' : '#111827',
                  margin: 0
                }}>
                  Edit Moves for {getManifestById(selectedManifest)?.name}
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      setEditingMoves(false);
                      setSelectedManifest(null);
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: asModal ? 'rgba(255,255,255,0.1)' : '#6b7280',
                      border: asModal ? '1px solid rgba(255,255,255,0.3)' : 'none',
                      borderRadius: '0.5rem',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Close
                  </button>
                <button
                  onClick={() => {
                    // Reset all moves for this manifest to default values
                      const manifestMoves = getManifestMoves(selectedManifest);
                    const resetEdits: { [key: string]: MoveEditData } = {};
                    
                      manifestMoves.forEach(move => {
                        const moveTemplate = MOVE_TEMPLATES.find(m => m.name === move.id);
                        resetEdits[move.id] = {
                          id: move.id,
                          name: move.id, // Reset to original name
                          type: moveTemplate?.type === 'defense' ? 'defense' : moveTemplate?.type === 'support' ? 'heal' : 'attack',
                          damage: MOVE_DAMAGE_VALUES[move.id]?.damage || 0, // Reset to original damage
                          description: moveTemplate?.description || '', // Reset description
                          statusEffect: undefined, // Reset status effect
                          statusEffects: undefined
                        };
                    });
                    
                    setMoveEdits(resetEdits);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#ef4444',
                    border: 'none',
                      borderRadius: '0.5rem',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}
                >
                  Reset to Default
                </button>
                </div>
              </div>
              
              {error && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '0.5rem',
                  color: '#991b1b'
                }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
              
              {saveStatus === 'saving' && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: '#dbeafe',
                  border: '1px solid #3b82f6',
                  borderRadius: '0.5rem',
                  color: '#1e40af'
                }}>
                  💾 Saving changes...
                </div>
              )}
              
              {saveStatus === 'success' && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: '#d1fae5',
                  border: '1px solid #10b981',
                  borderRadius: '0.5rem',
                  color: '#065f46'
                }}>
                  ✅ Changes saved successfully!
                </div>
              )}
              
              {saveStatus === 'error' && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '0.5rem',
                  color: '#991b1b'
                }}>
                  ❌ Failed to save changes. Check console for details.
                </div>
              )}
              
              {/* Debug Panel (Admin Only) */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{
                  padding: '1rem',
                  marginBottom: '1rem',
                  background: asModal ? 'rgba(0,0,0,0.3)' : '#f3f4f6',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: asModal ? 'white' : '#1f2937'
                }}>
                  <strong>🐛 Debug Info:</strong>
                  <div>Selected Manifest: {selectedManifest || 'null'}</div>
                  <div>Editing Moves: {editingMoves ? 'true' : 'false'}</div>
                  <div>Move Edits Count: {Object.keys(moveEdits).length}</div>
                  <div>Existing Overrides Count: {Object.keys(existingOverrides).length}</div>
                  <div>Loading: {loading ? 'true' : 'false'}</div>
                  <div>Save Status: {saveStatus}</div>
                  <div>Firestore Path: adminSettings/moveOverrides</div>
                  {selectedManifest && (
                    <div>Moves for {selectedManifest}: {getManifestMoves(selectedManifest).map(m => m.name).join(', ')}</div>
                  )}
                </div>
              )}
              
              {/* Add New Move Button */}
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: asModal ? '#fbbf24' : '#1f2937' }}>
                  Moves ({Object.keys(moveEdits).length})
                </h3>
                <button
                  onClick={() => {
                    console.log('[ManifestAdmin] ➕ Add New Move button clicked');
                    setAddingNewMove(true);
                    setNewMoveData({
                      name: '',
                      type: 'attack',
                      damage: 0,
                      description: ''
                    });
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#10B981',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold'
                  }}
                >
                  ➕ Add New Move
                </button>
              </div>

              {/* Add New Move Form */}
              {addingNewMove && (
                <div style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: asModal ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5',
                  borderRadius: '0.5rem',
                  border: asModal ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid #10b981'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: asModal ? '#fbbf24' : '#1f2937' }}>
                    Add New Move
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Move Name *
                      </label>
                      <input
                        type="text"
                        value={newMoveData.name || ''}
                        onChange={(e) => setNewMoveData({ ...newMoveData, name: e.target.value })}
                        placeholder="Enter move name"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: asModal ? 'rgba(255,255,255,0.1)' : 'white',
                          border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          color: asModal ? '#f8fafc' : '#111827',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Type *
                      </label>
                      <select
                        value={newMoveData.type || 'attack'}
                        onChange={(e) => setNewMoveData({ ...newMoveData, type: e.target.value as 'attack' | 'defense' | 'heal' })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: asModal ? 'rgba(255,255,255,0.1)' : 'white',
                          border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          color: asModal ? '#f8fafc' : '#111827',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="attack">Attack</option>
                        <option value="defense">Defense</option>
                        <option value="heal">Heal</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Base Damage *
                    </label>
                    <input
                      type="number"
                      value={typeof newMoveData.damage === 'number' ? newMoveData.damage : (typeof newMoveData.damage === 'object' && newMoveData.damage !== null ? newMoveData.damage.min : 0)}
                      onChange={(e) => setNewMoveData({ ...newMoveData, damage: parseInt(e.target.value) || 0 })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        background: asModal ? 'rgba(255,255,255,0.1)' : 'white',
                        border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        color: asModal ? '#f8fafc' : '#111827',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Description
                    </label>
                    <textarea
                      value={newMoveData.description || ''}
                      onChange={(e) => setNewMoveData({ ...newMoveData, description: e.target.value })}
                      placeholder="Enter move description"
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        background: asModal ? 'rgba(255,255,255,0.1)' : 'white',
                        border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        color: asModal ? '#f8fafc' : '#111827',
                        fontSize: '0.875rem',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        console.log('[ManifestAdmin] ❌ Cancelling new move');
                        setAddingNewMove(false);
                        setNewMoveData({ name: '', type: 'attack', damage: 0, description: '' });
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: asModal ? 'rgba(255,255,255,0.1)' : '#6b7280',
                        border: asModal ? '1px solid rgba(255,255,255,0.3)' : 'none',
                        borderRadius: '0.5rem',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!newMoveData.name || !newMoveData.name.trim()) {
                          alert('Please enter a move name');
                          return;
                        }
                        
                        // Generate unique ID for the new move
                        const moveId = `${selectedManifest}-${newMoveData.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
                        console.log('[ManifestAdmin] ✅ Adding new move:', moveId, newMoveData);
                        
                        // Add to moveEdits
                        const newMove: MoveEditData = {
                          id: moveId,
                          name: newMoveData.name.trim(),
                          type: newMoveData.type || 'attack',
                          damage: newMoveData.damage || 0,
                          description: newMoveData.description || ''
                        };
                        
                        setMoveEdits(prev => ({
                          ...prev,
                          [moveId]: newMove
                        }));
                        
                        console.log('[ManifestAdmin] ✅ New move added to moveEdits');
                        
                        // Reset form
                        setAddingNewMove(false);
                        setNewMoveData({ name: '', type: 'attack', damage: 0, description: '' });
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#10B981',
                        border: 'none',
                        borderRadius: '0.5rem',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Add Move
                    </button>
                  </div>
                </div>
              )}

              {Object.keys(moveEdits).length === 0 && !addingNewMove ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: asModal ? 'white' : '#6b7280' }}>
                  {loading ? 'Loading moves...' : 'No moves loaded. Click "Edit Moves" to load moves for this manifest.'}
                </div>
              ) : (
                Object.values(moveEdits).map((move) => {
                const hasOverride = existingOverrides[move.id];
                const originalMove = MOVE_DAMAGE_VALUES[move.id];
                
                return (
                  <div key={move.id} style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: hasOverride 
                      ? (asModal ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)')
                      : (asModal ? 'rgba(0,0,0,0.3)' : '#f9fafb'),
                    borderRadius: '0.5rem',
                    border: hasOverride 
                      ? (asModal ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid #10b981')
                      : (asModal ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e5e7eb')
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, color: asModal ? '#fbbf24' : '#1f2937' }}>
                          {move.name}
                        </h4>
                        {hasOverride && (
                          <span style={{
                            marginLeft: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            background: '#10B981',
                            color: 'white',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 'bold'
                          }}>
                            OVERRIDDEN
                          </span>
                        )}
                        {!MOVE_TEMPLATES.find(m => m.name === move.id) && (
                          <span style={{
                            marginLeft: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            background: '#3b82f6',
                            color: 'white',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 'bold'
                          }}>
                            CUSTOM
                          </span>
                        )}
                      </div>
                      {!MOVE_TEMPLATES.find(m => m.name === move.id) && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete "${move.name}"? This cannot be undone.`)) {
                              console.log('[ManifestAdmin] 🗑️ Deleting custom move:', move.id);
                              setMoveEdits(prev => {
                                const updated = { ...prev };
                                delete updated[move.id];
                                return updated;
                              });
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '0.25rem',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: 'bold'
                          }}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Move Name
                      </label>
                      <input
                        type="text"
                        value={moveEdits[move.id]?.name || move.name || ''}
                        onChange={(e) => {
                          console.log('[ManifestAdmin] 📝 Name input changed for', move.id, ':', e.target.value);
                          handleMoveEdit(move.id, 'name', e.target.value);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: asModal ? 'rgba(255,255,255,0.1)' : 'white',
                          border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          color: asModal ? '#f8fafc' : '#111827',
                          fontSize: '0.875rem'
                        }}
                      />
                        </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Type
                      </label>
                      <select
                        value={moveEdits[move.id]?.type || move.type || 'attack'}
                        onChange={(e) => {
                          console.log('[ManifestAdmin] 📝 Type changed for', move.id, ':', e.target.value);
                          handleMoveEdit(move.id, 'type', e.target.value);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: asModal ? 'rgba(255,255,255,0.1)' : 'white',
                          border: asModal ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          color: asModal ? '#f8fafc' : '#111827',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="attack" style={{ background: '#1f2937', color: 'white' }}>Attack</option>
                        <option value="defense" style={{ background: '#1f2937', color: 'white' }}>Defense</option>
                        <option value="heal" style={{ background: '#1f2937', color: 'white' }}>Heal</option>
                      </select>
                    </div>
                    </div>
                    
                  {(moveEdits[move.id]?.type || 'attack') === 'attack' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Damage Range (Min)
                      </label>
                        <input
                          type="number"
                          value={(() => {
                            const damage = moveEdits[move.id]?.damage || move.damage;
                            if (typeof damage === 'object') {
                              return damage.min || 0;
                            }
                            return typeof damage === 'number' ? damage : 0;
                          })()}
                          onChange={(e) => handleDamageRangeEdit(move.id, 'min', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Damage Range (Max)
                        </label>
                        <input
                          type="number"
                          value={(() => {
                            const damage = moveEdits[move.id]?.damage || move.damage;
                            if (typeof damage === 'object') {
                              return damage.max || 0;
                            }
                            return typeof damage === 'number' ? damage : 0;
                          })()}
                          onChange={(e) => handleDamageRangeEdit(move.id, 'max', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Base Damage (if no range)
                        </label>
                        <input
                          type="number"
                          value={(() => {
                            const damage = moveEdits[move.id]?.damage || move.damage;
                            if (typeof damage === 'number') {
                              return damage;
                            }
                            return 0;
                          })()}
                          onChange={(e) => {
                            const newValue = parseInt(e.target.value) || 0;
                            console.log('[ManifestAdmin] 📝 Damage changed for', move.id, ':', newValue);
                            handleMoveEdit(move.id, 'damage', newValue);
                          }}
                          disabled={typeof (moveEdits[move.id]?.damage || move.damage) === 'object'}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: typeof (moveEdits[move.id]?.damage || move.damage) === 'object' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                        </div>
                      )}

                  {(moveEdits[move.id]?.type || 'attack') === 'heal' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Healing Range (Min)
                        </label>
                        <input
                          type="number"
                          value={moveEdits[move.id]?.healingRange?.min || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            const currentRange = moveEdits[move.id]?.healingRange || { min: 0, max: 0 };
                            handleMoveEdit(move.id, 'healingRange', { ...currentRange, min: value });
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                    </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Healing Range (Max)
                        </label>
                        <input
                          type="number"
                          value={moveEdits[move.id]?.healingRange?.max || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            const currentRange = moveEdits[move.id]?.healingRange || { min: 0, max: 0 };
                            handleMoveEdit(move.id, 'healingRange', { ...currentRange, max: value });
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                  </div>
                    </div>
                  )}
                  
                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      Description:
                    </label>
                    <textarea
                      value={moveEdits[move.id]?.description || (existingOverrides[move.id] as MoveEditData | undefined)?.description || move.description || ''}
                      onChange={(e) => {
                        console.log('[ManifestAdmin] 📝 Description changed for', move.id, ':', e.target.value.substring(0, 50) + '...');
                        handleMoveEdit(move.id, 'description', e.target.value);
                      }}
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '0.25rem',
                        color: 'white',
                        fontSize: '0.9rem',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                  
                  {/* Status Effects Editor - Multiple Effects */}
                  <div style={{ marginTop: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fbbf24' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>
                        Status Effects
                      </h5>
                      <button
                        onClick={() => addStatusEffect(move.id)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          background: '#10b981',
                          border: 'none',
                          borderRadius: '0.25rem',
                          color: 'white',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        + Add Effect
                      </button>
                    </div>
                    
                    {getMoveEffects(move.id).length === 0 ? (
                      <div style={{ color: '#92400e', fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                        No effects. Click "Add Effect" to add one.
                      </div>
                    ) : (
                      getMoveEffects(move.id).map((effect, effectIndex) => (
                        <div key={effectIndex} style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.3)', borderRadius: '0.5rem', border: '1px solid rgba(0,0,0,0.1)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>
                              Effect {effectIndex + 1}
                            </span>
                            <button
                              onClick={() => removeStatusEffect(move.id, effectIndex)}
                        style={{
                          padding: '0.25rem 0.5rem',
                                background: '#ef4444',
                          border: 'none',
                          borderRadius: '0.25rem',
                          color: 'white',
                          fontSize: '0.7rem',
                          cursor: 'pointer'
                        }}
                      >
                              Remove
                      </button>
                    </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                      <div>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Effect Type
                        </label>
                        <select
                                        value={effect.type || 'none'}
                                        onChange={(e) => {
                                          const effectType = e.target.value;
                                          updateStatusEffect(move.id, effectIndex, 'type', effectType);
                                          if (effectType === 'none') {
                                            updateStatusEffect(move.id, effectIndex, 'intensity', undefined);
                                            updateStatusEffect(move.id, effectIndex, 'damagePerTurn', undefined);
                                            updateStatusEffect(move.id, effectIndex, 'ppLossPerTurn', undefined);
                                            updateStatusEffect(move.id, effectIndex, 'ppStealPerTurn', undefined);
                                            updateStatusEffect(move.id, effectIndex, 'healPerTurn', undefined);
                                            updateStatusEffect(move.id, effectIndex, 'chance', undefined);
                                          }
                                          if (effectType !== 'none' && effect.successChance === undefined) {
                                            updateStatusEffect(move.id, effectIndex, 'successChance', 100);
                                          }
                                        }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                                          fontSize: '0.875rem'
                                        }}
                                      >
                                        <option value="none">None</option>
                                        <option value="burn">Burn (Damage over time)</option>
                                        <option value="stun">Stun (Skip turn)</option>
                                        <option value="bleed">Bleed (Lose PP each turn)</option>
                                        <option value="poison">Poison (Minor damage over time, stacks)</option>
                                        <option value="confuse">Confuse (50% wrong move/attack self)</option>
                                        <option value="drain">Drain (Steal PP and heal each turn)</option>
                                        <option value="cleanse">Cleanse (Removes all negative effects)</option>
                                        <option value="freeze">Freeze (Legacy)</option>
                                        <option value="reduce">Reduce (Reduce incoming damage)</option>
                        </select>
                      </div>
                      <div>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Duration (Turns)
                        </label>
                        <input
                          type="number"
                                        min="0"
                                        value={effect.duration || 0}
                                        onChange={(e) => updateStatusEffect(move.id, effectIndex, 'duration', parseInt(e.target.value) || 0)}
                                        disabled={effect.type === 'none'}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                                          fontSize: '0.875rem',
                                          background: effect.type === 'none' ? '#f3f4f6' : 'white'
                          }}
                        />
                      </div>
                      <div>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Success Chance (%)
                        </label>
                        <input
                          type="number"
                                        min="0"
                                        max="100"
                                        value={effect.successChance !== undefined ? effect.successChance : 100}
                                        onChange={(e) => updateStatusEffect(move.id, effectIndex, 'successChance', parseInt(e.target.value) || 100)}
                                        disabled={effect.type === 'none'}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                                          fontSize: '0.875rem',
                                          background: effect.type === 'none' ? '#f3f4f6' : 'white'
                          }}
                        />
                      </div>
                    </div>
                    
                                  {/* Effect-specific fields */}
                                  {(effect.type === 'burn' || effect.type === 'poison') && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Damage Per Turn
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={effect.damagePerTurn || effect.intensity || ''}
                                        onChange={(e) => {
                                          const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                          updateStatusEffect(move.id, effectIndex, 'damagePerTurn', value);
                                          updateStatusEffect(move.id, effectIndex, 'intensity', value);
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.875rem'
                                        }}
                                      />
                    </div>
                                  )}

                                  {effect.type === 'bleed' && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Health/PP Loss per turn
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={effect.ppLossPerTurn || effect.intensity || ''}
                                        onChange={(e) => {
                                          const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                          updateStatusEffect(move.id, effectIndex, 'ppLossPerTurn', value);
                                          updateStatusEffect(move.id, effectIndex, 'intensity', value);
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.875rem'
                                        }}
                                      />
                                    </div>
                                  )}

                                  {effect.type === 'confuse' && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Confusion Chance (%)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={effect.chance || effect.intensity || 50}
                                        onChange={(e) => {
                                          const value = e.target.value === '' ? 50 : parseInt(e.target.value) || 50;
                                          updateStatusEffect(move.id, effectIndex, 'chance', value);
                                          updateStatusEffect(move.id, effectIndex, 'intensity', value);
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.875rem'
                                        }}
                                      />
                                    </div>
                                  )}

                                  {effect.type === 'drain' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                                      <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                          PP Steal Per Turn
                                        </label>
                                        <input
                                          type="number"
                                          min="0"
                                          value={effect.ppStealPerTurn || effect.intensity || ''}
                                          onChange={(e) => {
                                            const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                            updateStatusEffect(move.id, effectIndex, 'ppStealPerTurn', value);
                                            updateStatusEffect(move.id, effectIndex, 'intensity', value);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.875rem'
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                          Heal Per Turn (Health/Shield)
                                        </label>
                                        <input
                                          type="number"
                                          min="0"
                                          value={effect.healPerTurn || ''}
                                          onChange={(e) => {
                                            const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                            updateStatusEffect(move.id, effectIndex, 'healPerTurn', value);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.875rem'
                                          }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {effect.type === 'reduce' && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                        Damage Reduction (%)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={effect.damageReduction || ''}
                                        onChange={(e) => {
                                          const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                          updateStatusEffect(move.id, effectIndex, 'damageReduction', value);
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.875rem'
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                );
              }))}
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '1rem',
                marginTop: '2rem'
              }}>
                <button
                  onClick={cancelMoveEdit}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveMoveChanges}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#10B981',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '1rem',
          marginTop: '2rem',
          padding: '1rem',
          position: 'relative',
          zIndex: 1000
        }}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[ManifestAdmin] ✅ Close button clicked!');
              console.log('[ManifestAdmin] onClose function:', onClose);
              console.log('[ManifestAdmin] asModal:', asModal);
              console.log('[ManifestAdmin] typeof onClose:', typeof onClose);
              try {
                if (onClose && typeof onClose === 'function') {
                  console.log('[ManifestAdmin] ✅ Calling onClose function...');
                  const result = onClose();
                  console.log('[ManifestAdmin] ✅ onClose called, result:', result);
                } else {
                  console.error('[ManifestAdmin] ❌ onClose is not a function or is undefined');
                  console.error('[ManifestAdmin] onClose value:', onClose);
                  alert('Close handler is not working. Check console for details.');
                }
              } catch (error) {
                console.error('[ManifestAdmin] ❌ Error calling onClose:', error);
                alert('Error closing panel: ' + (error as Error).message);
              }
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[ManifestAdmin] Button mousedown event');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              background: asModal ? 'rgba(255,255,255,0.1)' : '#6b7280',
              border: asModal ? '1px solid rgba(255,255,255,0.3)' : 'none',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              zIndex: 1001,
              position: 'relative',
              pointerEvents: 'auto'
            }}
            type="button"
            id="manifest-admin-close-button"
          >
            {asModal ? 'Close Admin Panel' : 'Back to Admin Panel'}
          </button>
        </div>
      </div>
    );

  if (asModal) {
    // Only render modal if isOpen is true
    if (!isOpen) {
      console.log('[ManifestAdmin] Modal mode but isOpen is false, returning null');
      return null;
    }
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem'
      }}>
        {content}
      </div>
    );
  }

  return content;
};

export default ManifestAdmin;
