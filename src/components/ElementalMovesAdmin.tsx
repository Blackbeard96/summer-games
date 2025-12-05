import React, { useState, useEffect } from 'react';
import { MOVE_DAMAGE_VALUES, MOVE_TEMPLATES } from '../types/battle';
import { db } from '../firebase';
import { collection, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { invalidateMoveOverridesCache } from '../utils/moveOverrides';

interface ElementalMovesAdminProps {
  isOpen: boolean;
  onClose: () => void;
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

const ELEMENTAL_TYPES: Array<{ id: string; name: string; color: string }> = [
  { id: 'fire', name: 'Fire', color: '#dc2626' },
  { id: 'water', name: 'Water', color: '#2563eb' },
  { id: 'air', name: 'Air', color: '#7c3aed' },
  { id: 'earth', name: 'Earth', color: '#059669' },
  { id: 'lightning', name: 'Lightning', color: '#f59e0b' },
  { id: 'light', name: 'Light', color: '#fbbf24' },
  { id: 'shadow', name: 'Shadow', color: '#6b7280' },
  { id: 'metal', name: 'Metal', color: '#9ca3af' },
];

const ElementalMovesAdmin: React.FC<ElementalMovesAdminProps> = ({ isOpen, onClose }) => {
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
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

  const loadExistingOverrides = async () => {
    setLoading(true);
    try {
      const moveOverridesRef = doc(db, 'adminSettings', 'moveOverrides');
      const overrideDoc = await getDoc(moveOverridesRef);
      
      if (overrideDoc.exists()) {
        const overrideData = overrideDoc.data();
        setExistingOverrides(overrideData);
      }
    } catch (error) {
      console.error('Error loading move overrides:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleElementSelect = (elementId: string) => {
    setSelectedElement(elementId);
    setEditingMoves(false);
  };

  const getElementalMoves = (elementId: string) => {
    // Get moves from MOVE_TEMPLATES that match this element
    const elementMoves = MOVE_TEMPLATES.filter(
      move => move.category === 'elemental' && move.elementalAffinity === elementId
    );

    const moves: MoveEditData[] = [];
    
    elementMoves.forEach(moveTemplate => {
      const moveName = moveTemplate.name;
      const moveData = MOVE_DAMAGE_VALUES[moveName];
      const override = existingOverrides[moveName];
      
      // Determine move type from template
      let moveType: 'attack' | 'defense' | 'heal' = 'attack';
      if (moveTemplate.type === 'defense' || moveTemplate.type === 'support') {
        moveType = moveTemplate.healing ? 'heal' : 'defense';
      } else if (moveTemplate.healing) {
        moveType = 'heal';
      }

      // Support both legacy single effect and new multiple effects
      const effects = override?.statusEffects || (override?.statusEffect ? [override.statusEffect] : []);
      
      moves.push({
        id: moveName,
        name: override?.name || moveName,
        type: override?.type || moveType,
        damage: override?.damage || moveData?.damage || 0,
        description: override?.description || moveTemplate.description || '',
        statusEffect: override?.statusEffect, // Legacy support
        statusEffects: effects.length > 0 ? effects : undefined
      });
    });

    // Sort by level
    return moves.sort((a, b) => {
      const aLevel = elementMoves.find(m => m.name === a.id)?.level || 0;
      const bLevel = elementMoves.find(m => m.name === b.id)?.level || 0;
      return aLevel - bLevel;
    });
  };

  const handleMoveEdit = (moveId: string, field: string, value: any) => {
    setMoveEdits(prev => {
      const currentMove = prev[moveId] || {};
      
      if (field === 'statusEffect') {
        // Legacy support - convert to array
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
    const move = moveEdits[moveId];
    if (move?.statusEffects) {
      return move.statusEffects;
    }
    if (move?.statusEffect && move.statusEffect.type !== 'none') {
      return [move.statusEffect];
    }
    const originalMove = getElementalMoves(selectedElement || '').find(m => m.id === moveId);
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
      
      let damageRange: { min: number; max: number };
      if (typeof currentDamage === 'number') {
        damageRange = { min: currentDamage, max: currentDamage };
      } else if (currentDamage && typeof currentDamage === 'object') {
        damageRange = { ...currentDamage };
      } else {
        const originalMove = MOVE_DAMAGE_VALUES[moveId];
        const originalDamage = originalMove?.damage || 0;
        damageRange = { min: originalDamage, max: originalDamage };
      }
      
      damageRange[rangeField] = value;
      
      return {
        ...prev,
        [moveId]: {
          ...currentMove,
          id: moveId,
          name: currentMove?.name || moveId,
          damage: damageRange,
          description: currentMove?.description || ''
        }
      };
    });
  };

  // Helper function to remove undefined values from objects (Firestore doesn't accept undefined)
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
      
      // Create a document with the move overrides
      const moveOverridesRef = doc(collection(db, 'adminSettings'), 'moveOverrides');
      
      const overridesData = {
        ...existingOverrides,
        ...moveEdits,
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin' // You could get this from auth context
      };
      
      // Remove all undefined values before saving (Firestore doesn't accept undefined)
      const cleanedData = removeUndefined(overridesData);
      
      await setDoc(moveOverridesRef, cleanedData);
      
      console.log('Move changes saved to database:', moveEdits);
      console.log('Overrides data saved:', cleanedData);
      alert('✅ Elemental move changes saved successfully! These will override the default values in battle.');
      
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

  const resetToDefault = () => {
    if (selectedElement) {
      const moves = getElementalMoves(selectedElement);
      const resetEdits: { [key: string]: MoveEditData } = {};
      
      moves.forEach(move => {
        resetEdits[move.id] = {
          id: move.id,
          name: move.id,
          damage: MOVE_DAMAGE_VALUES[move.id]?.damage || 0,
          description: ''
        };
      });
      
      setMoveEdits(resetEdits);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
      padding: '2rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '2px solid #334155',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.5rem' }}>Elemental Moves Admin</h2>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem' }}>
          {/* Element Selection */}
          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#fbbf24', fontSize: '1rem' }}>Elements</h3>
            {ELEMENTAL_TYPES.map(element => (
              <div
                key={element.id}
                onClick={() => handleElementSelect(element.id)}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: selectedElement === element.id ? `rgba(${element.color}, 0.2)` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${selectedElement === element.id ? element.color : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  color: selectedElement === element.id ? element.color : 'white',
                  fontWeight: selectedElement === element.id ? 'bold' : 'normal'
                }}
              >
                {element.name}
              </div>
            ))}
          </div>

          {/* Move Editing */}
          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '1rem' }}>
            {selectedElement ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: ELEMENTAL_TYPES.find(e => e.id === selectedElement)?.color || '#fbbf24' }}>
                    {ELEMENTAL_TYPES.find(e => e.id === selectedElement)?.name} Moves
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setEditingMoves(!editingMoves)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: editingMoves ? '#ef4444' : '#10b981',
                        border: 'none',
                        borderRadius: '0.5rem',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      {editingMoves ? 'Cancel Editing' : 'Edit Moves'}
                    </button>
                    {editingMoves && (
                      <button
                        onClick={resetToDefault}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#ef4444',
                          border: 'none',
                          borderRadius: '0.5rem',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                </div>

                {editingMoves ? (
                  <div>
                    {getElementalMoves(selectedElement).map((move) => {
                      const hasOverride = existingOverrides[move.id];
                      const originalMove = MOVE_DAMAGE_VALUES[move.id];
                      const moveTemplate = MOVE_TEMPLATES.find(m => m.name === move.id);
                      
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
                            {moveTemplate && (
                              <span style={{
                                marginLeft: '0.5rem',
                                padding: '0.25rem 0.5rem',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                borderRadius: '0.25rem',
                                fontSize: '0.7rem'
                              }}>
                                Level {moveTemplate.level}
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
                                value={moveEdits[move.id]?.name || move.name}
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
                                value={moveEdits[move.id]?.type || move.type || 'attack'}
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

                          {(moveEdits[move.id]?.type || move.type || 'attack') === 'attack' && (
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

                          {(moveEdits[move.id]?.type || move.type || 'attack') === 'heal' && (
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
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                              Description
                            </label>
                            <textarea
                              value={moveEdits[move.id]?.description || move.description || ''}
                              onChange={(e) => handleMoveEdit(move.id, 'description', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem',
                                minHeight: '60px',
                                resize: 'vertical',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white'
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
                                          // Reset effect-specific fields when changing type
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
                    })}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
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
                ) : (
                  <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
                    Click "Edit Moves" to start editing {ELEMENTAL_TYPES.find(e => e.id === selectedElement)?.name} moves
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
                Select an element to view its moves
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ElementalMovesAdmin;

