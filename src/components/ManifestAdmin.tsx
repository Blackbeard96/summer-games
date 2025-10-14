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

interface MoveEditData {
  id: string;
  name: string;
  damage: number | { min: number; max: number };
  description?: string;
  statusEffect?: {
    type: 'burn' | 'freeze' | 'confuse' | 'none';
    duration: number;
    intensity?: number; // For burn damage per turn, or confuse chance percentage
  };
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
    }
  }, [editingMoves, selectedManifest]);

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
      'reading': ['Emotional Read', 'Pattern Shield'],
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
        
                manifestMoves.push({
                  id: moveName,
                  name: override?.name || moveName,
                  damage: override?.damage || moveData.damage,
                  description: override?.description || '',
                  statusEffect: override?.statusEffect
                });
      }
    });

    return manifestMoves;
  };

  const handleMoveEdit = (moveId: string, field: string, value: string | number) => {
    setMoveEdits(prev => ({
      ...prev,
      [moveId]: {
        ...prev[moveId],
        id: moveId,
        name: prev[moveId]?.name || moveId,
        damage: prev[moveId]?.damage || 0,
        [field]: value
      }
    }));
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

  const handleStatusEffectEdit = (moveId: string, field: 'type' | 'duration' | 'intensity', value: string | number) => {
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

  const saveMoveChanges = async () => {
    try {
      // For now, we'll save to a Firestore collection for admin move overrides
      // This allows us to override the default MOVE_DAMAGE_VALUES without changing the source code
      const { db } = await import('../firebase');
      const { collection, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      
      // Create a document with the move overrides
      const moveOverridesRef = doc(collection(db, 'adminSettings'), 'moveOverrides');
      
      const overridesData = {
        ...moveEdits,
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin' // You could get this from auth context
      };
      
      await setDoc(moveOverridesRef, overridesData);
      
      console.log('Move changes saved to database:', moveEdits);
      console.log('Overrides data saved:', overridesData);
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
                        setEditingMoves(true);
                        console.log('editingMoves set to true');
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
                      'reading': ['Emotional Read', 'Pattern Shield'],
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
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                        Move Name:
                      </label>
                      <input
                        type="text"
                        value={moveEdits[move.id]?.name || move.name}
                        onChange={(e) => handleMoveEdit(move.id, 'name', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.3)',
                          borderRadius: '0.25rem',
                          color: 'white',
                          fontSize: '0.9rem'
                        }}
                      />
                      {hasOverride && (
                        <div style={{ fontSize: '0.7rem', color: '#10B981', marginTop: '0.25rem' }}>
                          Original: {originalMove ? Object.keys(MOVE_DAMAGE_VALUES).find(k => k === move.id) : move.id}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                        Damage Range:
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="Min"
                          value={(() => {
                            const damage = moveEdits[move.id]?.damage || move.damage;
                            if (typeof damage === 'object') {
                              return damage.min || 0;
                            }
                            return damage || 0;
                          })()}
                          onChange={(e) => handleDamageRangeEdit(move.id, 'min', parseInt(e.target.value) || 0)}
                          style={{
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.9rem'
                          }}
                        />
                        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>to</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={(() => {
                            const damage = moveEdits[move.id]?.damage || move.damage;
                            if (typeof damage === 'object') {
                              return damage.max || 0;
                            }
                            return damage || 0;
                          })()}
                          onChange={(e) => handleDamageRangeEdit(move.id, 'max', parseInt(e.target.value) || 0)}
                          style={{
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.9rem'
                          }}
                        />
                      </div>
                      {hasOverride && originalMove && (
                        <div style={{ fontSize: '0.7rem', color: '#10B981', marginTop: '0.25rem' }}>
                          Original: {originalMove.damage}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      Description:
                    </label>
                    <textarea
                      value={moveEdits[move.id]?.description || move.description || ''}
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
                  
                  {/* Status Effect Controls */}
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fbbf24' }}>
                        Status Effect:
                      </label>
                      <button
                        onClick={() => handleRemoveStatusEffect(move.id)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#dc2626',
                          border: 'none',
                          borderRadius: '0.25rem',
                          color: 'white',
                          fontSize: '0.7rem',
                          cursor: 'pointer'
                        }}
                      >
                        Remove Effect
                      </button>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                      {/* Status Effect Type */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                          Effect Type:
                        </label>
                        <select
                          value={moveEdits[move.id]?.statusEffect?.type || 'none'}
                          onChange={(e) => handleStatusEffectEdit(move.id, 'type', e.target.value as 'burn' | 'freeze' | 'confuse' | 'none')}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.9rem'
                          }}
                        >
                          <option value="none" style={{ background: '#1f2937', color: 'white' }}>⚪ None</option>
                          <option value="burn" style={{ background: '#1f2937', color: 'white' }}>🔥 Burn</option>
                          <option value="freeze" style={{ background: '#1f2937', color: 'white' }}>❄️ Freeze</option>
                          <option value="confuse" style={{ background: '#1f2937', color: 'white' }}>🌀 Confuse</option>
                        </select>
                      </div>
                      
                      {/* Duration */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                          Duration (turns):
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={moveEdits[move.id]?.statusEffect?.duration || 1}
                          onChange={(e) => handleStatusEffectEdit(move.id, 'duration', parseInt(e.target.value) || 1)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.9rem'
                          }}
                        />
                      </div>
                      
                      {/* Intensity */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                          {moveEdits[move.id]?.statusEffect?.type === 'burn' ? 'Damage/Turn:' : 
                           moveEdits[move.id]?.statusEffect?.type === 'confuse' ? 'Chance %:' : 'Strength:'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={moveEdits[move.id]?.statusEffect?.type === 'confuse' ? '100' : '50'}
                          value={moveEdits[move.id]?.statusEffect?.intensity || (moveEdits[move.id]?.statusEffect?.type === 'confuse' ? 50 : 5)}
                          onChange={(e) => handleStatusEffectEdit(move.id, 'intensity', parseInt(e.target.value) || (moveEdits[move.id]?.statusEffect?.type === 'confuse' ? 50 : 5))}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '0.25rem',
                            color: 'white',
                            fontSize: '0.9rem'
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Status Effect Description */}
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#d1d5db', fontStyle: 'italic' }}>
                      {moveEdits[move.id]?.statusEffect?.type === 'burn' && 
                        `Deals ${moveEdits[move.id]?.statusEffect?.intensity || 5} damage per turn for ${moveEdits[move.id]?.statusEffect?.duration || 1} turns.`
                      }
                      {moveEdits[move.id]?.statusEffect?.type === 'freeze' && 
                        `Skips opponent's turn for ${moveEdits[move.id]?.statusEffect?.duration || 1} turns.`
                      }
                      {moveEdits[move.id]?.statusEffect?.type === 'confuse' && 
                        `${moveEdits[move.id]?.statusEffect?.intensity || 50}% chance to use wrong move or attack self for ${moveEdits[move.id]?.statusEffect?.duration || 1} turns.`
                      }
                      {moveEdits[move.id]?.statusEffect?.type === 'none' && 
                        `This move has no status effect.`
                      }
                      {!moveEdits[move.id]?.statusEffect && 
                        `This move has no status effect.`
                      }
                    </div>
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
