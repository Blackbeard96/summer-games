import React, { useState, useEffect } from 'react';
import { MANIFESTS } from '../types/manifest';
import { MOVE_DAMAGE_VALUES } from '../types/battle';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { invalidateMoveOverridesCache } from '../utils/moveOverrides';

interface ManifestAdminProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StatusEffect {
  type: 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain' | 'cleanse' | 'freeze' | 'none';
  duration: number;
  intensity?: number;
  damagePerTurn?: number;
  ppLossPerTurn?: number;
  ppStealPerTurn?: number;
  healPerTurn?: number;
  chance?: number;
  successChance?: number;
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

const ManifestAdmin: React.FC<ManifestAdminProps> = ({ isOpen, onClose }) => {
  const [selectedManifest, setSelectedManifest] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [editingMoves, setEditingMoves] = useState<boolean>(false);
  const [moveEdits, setMoveEdits] = useState<{ [key: string]: MoveEditData }>({});
  const [existingOverrides, setExistingOverrides] = useState<{ [key: string]: MoveEditData }>({});
  const [loading, setLoading] = useState<boolean>(false);

  // Load existing move overrides when component opens
  useEffect(() => {
    if (isOpen) {
      loadExistingOverrides();
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingMoves && selectedManifest) {
      console.log('Rendering move editing interface for manifest:', selectedManifest, 'editingMoves:', editingMoves);
      
      // Initialize moveEdits with existing overrides when editing starts
      const manifestMoves = getManifestMoves(selectedManifest);
      const initialEdits: { [key: string]: MoveEditData } = {};
      
      manifestMoves.forEach(move => {
        const existingOverride = existingOverrides[move.id] as MoveEditData | undefined;
        if (existingOverride) {
          initialEdits[move.id] = {
            ...existingOverride,
            id: move.id,
            name: existingOverride.name || move.id
          };
        }
      });
      
      if (Object.keys(initialEdits).length > 0) {
        setMoveEdits(prev => ({ ...prev, ...initialEdits }));
      }
    }
  }, [editingMoves, selectedManifest, existingOverrides]);

  const loadExistingOverrides = async () => {
    setLoading(true);
    try {
      const moveOverridesRef = doc(db, 'adminSettings', 'moveOverrides');
      const overrideDoc = await getDoc(moveOverridesRef);
      
      if (overrideDoc.exists()) {
        const overrideData = overrideDoc.data();
        setExistingOverrides(overrideData);
        console.log('Loaded existing move overrides:', overrideData);
        console.log('Override document exists:', overrideDoc.exists());
        console.log('Override document ID:', overrideDoc.id);
      } else {
        console.log('No existing move overrides found in database');
      }
    } catch (error) {
      console.error('Error loading move overrides:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleManifestSelect = (manifestId: string) => {
    setSelectedManifest(manifestId);
    setShowDetails(null);
    setEditingMoves(false);
  };

  const getManifestById = (id: string) => {
    return MANIFESTS.find(m => m.id === id);
  };

  const getManifestMoves = (manifestId: string) => {
    // Map manifest IDs to their associated moves based on the comments in MOVE_DAMAGE_VALUES
    const manifestMoveMapping: { [key: string]: string[] } = {
      'reading': ['Read the Room', 'Pattern Shield'],
      'writing': ['Reality Rewrite', 'Narrative Barrier'],
      'drawing': ['Illusion Strike', 'Mirage Shield'],
      'athletics': ['Flow Strike', 'Rhythm Guard'],
      'singing': ['Harmonic Blast', 'Melody Shield'],
      'gaming': ['Pattern Break', 'Strategy Matrix'],
      'observation': ['Precision Strike', 'Memory Shield'],
      'empathy': ['Emotional Resonance', 'Empathic Barrier'],
      'creating': ['Tool Strike', 'Construct Shield'],
      'cooking': ['Energy Feast', 'Nourishing Barrier']
    };

    const moveNames = manifestMoveMapping[manifestId] || [];
    const manifestMoves: MoveEditData[] = [];
    
    moveNames.forEach(moveName => {
      const moveData = MOVE_DAMAGE_VALUES[moveName];
      if (moveData) {
        // Check if there's an existing override for this move
        const override = existingOverrides[moveName];
        
                // Support both legacy single effect and new multiple effects
                const effects = override?.statusEffects || (override?.statusEffect ? [override.statusEffect] : []);
        
                manifestMoves.push({
                  id: moveName,
                  name: override?.name || moveName,
                  damage: override?.damage || moveData.damage,
                  description: override?.description || '',
                  statusEffect: override?.statusEffect, // Legacy support
                  statusEffects: effects.length > 0 ? effects : undefined
                });
      }
    });

    return manifestMoves;
  };

  const handleMoveEdit = (moveId: string, field: string, value: any) => {
    setMoveEdits(prev => {
      const currentMove = prev[moveId] || {};
      
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
    try {
      // For now, we'll save to a Firestore collection for admin move overrides
      // This allows us to override the default MOVE_DAMAGE_VALUES without changing the source code
      const { db } = await import('../firebase');
      const { collection, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      
      // Create a document with the move overrides
      const moveOverridesRef = doc(collection(db, 'adminSettings'), 'moveOverrides');
      
      // Merge existing overrides with new edits, prioritizing new edits
      const overridesData = {
        ...existingOverrides,
        ...moveEdits,
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin' // You could get this from auth context
      };
      
      // Remove undefined values before saving (Firestore doesn't allow undefined)
      const cleanedData = removeUndefined(overridesData);
      
      await setDoc(moveOverridesRef, cleanedData);
      
      console.log('Move changes saved to database:', moveEdits);
      console.log('Overrides data saved:', cleanedData);
      alert('✅ Move changes saved successfully! These will override the default values in battle.');
      
      // Reset editing state
      setEditingMoves(false);
      setMoveEdits({});
      
      // Invalidate the cache so other components get fresh data
      invalidateMoveOverridesCache();
      
      // Reload the existing overrides to reflect the saved changes
      await loadExistingOverrides();
      
    } catch (error) {
      console.error('Error saving move changes:', error);
      alert('❌ Failed to save move changes. Please try again.');
    }
  };

  const cancelMoveEdit = () => {
    setEditingMoves(false);
    setMoveEdits({});
  };

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
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
        padding: '2rem',
        borderRadius: '1rem',
        maxWidth: '1400px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        color: 'white',
        border: '1px solid rgba(255,255,255,0.2)'
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
            opacity: 0.9
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
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
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
                color: selectedManifest === manifest.id ? manifest.color : 'white'
              }}>
                {manifest.name}
              </h3>
              <p style={{ 
                fontSize: '0.9rem', 
                marginBottom: '1rem',
                opacity: 0.8,
                lineHeight: '1.4'
              }}>
                {manifest.description}
              </p>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                fontSize: '0.8rem',
                opacity: 0.7
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
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '0.25rem',
                  color: 'white',
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
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
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
                          <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
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
                      <div style={{ fontSize: '0.8rem', opacity: 0.6, fontStyle: 'italic' }}>
                        No specific moves found for this manifest
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Edit Moves button clicked for manifest:', manifest.id);
                        console.log('Current selectedManifest:', selectedManifest);
                        
                        // Initialize moveEdits with existing overrides for this manifest's moves
                        const manifestMoves = getManifestMoves(manifest.id);
                        const initialEdits: { [key: string]: MoveEditData } = {};
                        
                        manifestMoves.forEach(move => {
                          const existingOverride = existingOverrides[move.id] as MoveEditData | undefined;
                          if (existingOverride) {
                            initialEdits[move.id] = {
                              ...existingOverride,
                              id: move.id,
                              name: existingOverride.name || move.id
                            };
                          }
                        });
                        
                        setMoveEdits(initialEdits);
                        setEditingMoves(true);
                        console.log('editingMoves set to true, initialized with:', initialEdits);
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
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '2rem'
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
              padding: '2rem',
              borderRadius: '1rem',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ 
                  fontSize: '2rem', 
                  fontWeight: 'bold',
                  color: '#fbbf24',
                  margin: 0
                }}>
                  Edit Moves for {getManifestById(selectedManifest)?.name}
                </h2>
                <button
                  onClick={() => {
                    // Reset all moves for this manifest to default values
                    const manifestMoveMapping: { [key: string]: string[] } = {
                      'reading': ['Read the Room', 'Pattern Shield'],
                      'writing': ['Reality Rewrite', 'Narrative Barrier'],
                      'drawing': ['Illusion Strike', 'Mirage Shield'],
                      'athletics': ['Flow Strike', 'Rhythm Guard'],
                      'singing': ['Harmonic Blast', 'Melody Shield'],
                      'gaming': ['Pattern Break', 'Strategy Matrix'],
                      'observation': ['Precision Strike', 'Memory Shield'],
                      'empathy': ['Emotional Resonance', 'Empathic Barrier'],
                      'creating': ['Tool Strike', 'Construct Shield'],
                      'cooking': ['Energy Feast', 'Nourishing Barrier']
                    };
                    
                    const moveNames = manifestMoveMapping[selectedManifest] || [];
                    const resetEdits: { [key: string]: MoveEditData } = {};
                    
                    moveNames.forEach(moveName => {
                      const originalMove = MOVE_DAMAGE_VALUES[moveName];
                      if (originalMove) {
                resetEdits[moveName] = {
                  id: moveName,
                  name: moveName, // Reset to original name
                  damage: originalMove.damage, // Reset to original damage
                  description: '', // Reset description to empty
                  statusEffect: undefined // Reset status effect
                };
                      }
                    });
                    
                    setMoveEdits(resetEdits);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#ef4444',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}
                >
                  Reset to Default
                </button>
              </div>
              
              {getManifestMoves(selectedManifest).map((move) => {
                const hasOverride = existingOverrides[move.id];
                const originalMove = MOVE_DAMAGE_VALUES[move.id];
                
                return (
                  <div key={move.id} style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: hasOverride ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.3)',
                    borderRadius: '0.5rem',
                    border: hasOverride ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, color: '#fbbf24' }}>
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
                    </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                        Move Name
                      </label>
                      <input
                        type="text"
                        value={moveEdits[move.id]?.name || (existingOverrides[move.id] as MoveEditData | undefined)?.name || move.name}
                        onChange={(e) => handleMoveEdit(move.id, 'name', e.target.value)}
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
                        Type
                      </label>
                      <select
                        value={moveEdits[move.id]?.type || 'attack'}
                        onChange={(e) => handleMoveEdit(move.id, 'type', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.3)',
                          borderRadius: '0.25rem',
                          color: 'white',
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
                          onChange={(e) => handleMoveEdit(move.id, 'damage', parseInt(e.target.value) || 0)}
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
                      onChange={(e) => handleMoveEdit(move.id, 'description', e.target.value)}
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
                                </div>
                              ))
                            )}
                  </div>
                </div>
                );
              })}
              
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
          marginTop: '2rem'
        }}>
          <button
            onClick={onClose}
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
            Close Admin Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManifestAdmin;
