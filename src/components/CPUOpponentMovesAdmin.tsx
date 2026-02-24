import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { invalidateMoveOverridesCache } from '../utils/moveOverrides';

interface CPUOpponentMovesAdminProps {
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

interface CPUOpponentMove {
  id: string;
  name: string;
  damageRange?: { min: number; max: number };
  baseDamage?: number;
  healingRange?: { min: number; max: number };
  type: 'attack' | 'defense' | 'heal';
  description?: string;
  statusEffect?: StatusEffect; // Legacy support - single effect
  statusEffects?: StatusEffect[]; // New - multiple effects
  // Defensive move properties
  damageReduction?: {
    amount?: number; // Flat damage reduction
    percentage?: number; // Percentage damage reduction (0-100)
  };
  counterMove?: {
    condition: 'always' | 'on_attack' | 'on_critical' | 'on_shield_break' | 'on_low_health' | 'if_attacked' | 'if_pp_stolen' | 'if_shield_attacked' | 'if_rival'; // When counter triggers
    damage?: number; // Flat counter damage
    damageRange?: { min: number; max: number }; // Counter damage range
    threshold?: number; // For conditions like 'on_low_health' (health percentage)
    rivalName?: string; // For 'if_rival' condition - specific rival name to check
  };
  duration?: number; // How many turns the defensive effect lasts (for damage reduction)
}

export interface CPUOpponent {
  id: string;
  name: string;
  moves: CPUOpponentMove[];
}

/** Exported for Mission Builder wave opponent selection. */
export const DEFAULT_OPPONENTS: CPUOpponent[] = [
  {
    id: 'cpu-easy-1',
    name: 'Training Dummy',
    moves: [
      { id: 'vault-breach', name: 'Vault Breach', baseDamage: 8, type: 'attack' },
      { id: 'pp-drain', name: 'PP Drain', baseDamage: 6, type: 'attack' },
      { id: 'shield-bash', name: 'Shield Bash', baseDamage: 7, type: 'attack' },
      { id: 'energy-strike', name: 'Energy Strike', baseDamage: 9, type: 'attack' }
    ]
  },
  {
    id: 'cpu-easy-2',
    name: 'Novice Guard',
    moves: [
      { id: 'vault-breach', name: 'Vault Breach', baseDamage: 8, type: 'attack' },
      { id: 'pp-drain', name: 'PP Drain', baseDamage: 6, type: 'attack' },
      { id: 'shield-bash', name: 'Shield Bash', baseDamage: 7, type: 'attack' },
      { id: 'energy-strike', name: 'Energy Strike', baseDamage: 9, type: 'attack' }
    ]
  },
  {
    id: 'cpu-medium-1',
    name: 'Elite Soldier',
    moves: [
      { id: 'vault-breach', name: 'Vault Breach', baseDamage: 8, type: 'attack' },
      { id: 'pp-drain', name: 'PP Drain', baseDamage: 6, type: 'attack' },
      { id: 'shield-bash', name: 'Shield Bash', baseDamage: 7, type: 'attack' },
      { id: 'energy-strike', name: 'Energy Strike', baseDamage: 9, type: 'attack' }
    ]
  },
  {
    id: 'cpu-medium-2',
    name: 'Vault Keeper',
    moves: [
      { id: 'vault-breach', name: 'Vault Breach', baseDamage: 8, type: 'attack' },
      { id: 'pp-drain', name: 'PP Drain', baseDamage: 6, type: 'attack' },
      { id: 'shield-bash', name: 'Shield Bash', baseDamage: 7, type: 'attack' },
      { id: 'energy-strike', name: 'Energy Strike', baseDamage: 9, type: 'attack' }
    ]
  },
  {
    id: 'cpu-hard-1',
    name: 'Master Guardian',
    moves: [
      { 
        id: 'flameburst', 
        name: 'Flameburst', 
        damageRange: { min: 28, max: 36 }, 
        type: 'attack',
        description: 'Low-level move that sends out two fireballs at the opponent'
      },
      { 
        id: 'inferno-breaker', 
        name: 'Inferno Breaker', 
        damageRange: { min: 45, max: 60 }, 
        type: 'attack',
        description: 'Higher level move that shoots flames out from the caster all around him, engulfing the area in flames'
      },
      { 
        id: 'phoenix-regeneration', 
        name: 'Phoenix Regeneration', 
        healingRange: { min: 30, max: 45 }, 
        type: 'heal',
        description: 'Healing move that heals 30 - 45 Health'
      }
    ]
  },
  {
    id: 'cpu-hard-2',
    name: 'Legendary Protector',
    moves: [
      { id: 'vault-breach', name: 'Vault Breach', baseDamage: 8, type: 'attack' },
      { id: 'pp-drain', name: 'PP Drain', baseDamage: 6, type: 'attack' },
      { id: 'shield-bash', name: 'Shield Bash', baseDamage: 7, type: 'attack' },
      { id: 'energy-strike', name: 'Energy Strike', baseDamage: 9, type: 'attack' }
    ]
  },
  {
    id: 'ice-golem',
    name: 'Ice Golem',
    moves: [
      { 
        id: 'ice-shard', 
        name: 'Ice Shard', 
        damageRange: { min: 20, max: 50 }, 
        type: 'attack',
        description: 'Hurls sharp ice shards at the target'
      },
      { 
        id: 'ice-punch', 
        name: 'Ice Punch', 
        damageRange: { min: 25, max: 40 }, 
        type: 'attack',
        description: 'A powerful frozen punch attack'
      }
    ]
  },
  {
    id: 'powered-zombie',
    name: 'Powered Zombie',
    moves: [
      { 
        id: 'energy-strike', 
        name: 'Energy Strike', 
        baseDamage: 9, 
        type: 'attack',
        description: 'A basic energy-based attack'
      },
      { 
        id: 'vault-breach', 
        name: 'Vault Breach', 
        baseDamage: 8, 
        type: 'attack',
        description: 'A direct attack on the vault'
      },
      { 
        id: 'pp-drain', 
        name: 'PP Drain', 
        baseDamage: 6, 
        type: 'attack',
        description: 'Drains power points from the target'
      },
      { 
        id: 'shield-bash', 
        name: 'Shield Bash', 
        baseDamage: 7, 
        type: 'attack',
        description: 'A bash attack that damages shields'
      }
    ]
  },
  {
    id: 'zombie-captain',
    name: 'Zombie Captain',
    moves: [
      { 
        id: 'energy-strike', 
        name: 'Energy Strike', 
        baseDamage: 9, 
        type: 'attack',
        description: 'A basic energy-based attack'
      },
      { 
        id: 'vault-breach', 
        name: 'Vault Breach', 
        baseDamage: 8, 
        type: 'attack',
        description: 'A direct attack on the vault'
      },
      { 
        id: 'pp-drain', 
        name: 'PP Drain', 
        baseDamage: 6, 
        type: 'attack',
        description: 'Drains power points from the target'
      },
      { 
        id: 'shield-bash', 
        name: 'Shield Bash', 
        baseDamage: 7, 
        type: 'attack',
        description: 'A bash attack that damages shields'
      }
    ]
  },
  {
    id: 'zombie',
    name: 'Unpowered Zombie',
    moves: [
      { 
        id: 'energy-strike', 
        name: 'Energy Strike', 
        baseDamage: 9, 
        type: 'attack',
        description: 'A basic energy-based attack'
      },
      { 
        id: 'vault-breach', 
        name: 'Vault Breach', 
        baseDamage: 8, 
        type: 'attack',
        description: 'A direct attack on the vault'
      },
      { 
        id: 'pp-drain', 
        name: 'PP Drain', 
        baseDamage: 6, 
        type: 'attack',
        description: 'Drains power points from the target'
      },
      { 
        id: 'shield-bash', 
        name: 'Shield Bash', 
        baseDamage: 7, 
        type: 'attack',
        description: 'A bash attack that damages shields'
      }
    ]
  },
  {
    id: 'unveiled_elite_luz',
    name: 'Luz, Wielder of Light',
    moves: [
      { 
        id: 'light-strike', 
        name: 'Light Strike', 
        damageRange: { min: 100, max: 150 }, 
        type: 'attack',
        description: 'A powerful light-based attack'
      },
      { 
        id: 'radiant-burst', 
        name: 'Radiant Burst', 
        damageRange: { min: 150, max: 200 }, 
        type: 'attack',
        description: 'A devastating burst of radiant energy'
      },
      { 
        id: 'light-shield', 
        name: 'Light Shield', 
        type: 'defense',
        damageReduction: { percentage: 25 },
        duration: 2,
        description: 'Creates a protective shield of light'
      }
    ]
  },
  {
    id: 'unveiled_elite_kon',
    name: 'Kon, the Guardian for Config',
    moves: [
      { 
        id: 'config-strike', 
        name: 'Config Strike', 
        damageRange: { min: 100, max: 150 }, 
        type: 'attack',
        description: 'A powerful configuration-based attack'
      },
      { 
        id: 'system-overload', 
        name: 'System Overload', 
        damageRange: { min: 150, max: 200 }, 
        type: 'attack',
        description: 'Overloads the target system with configuration energy'
      },
      { 
        id: 'config-shield', 
        name: 'Config Shield', 
        type: 'defense',
        damageReduction: { percentage: 25 },
        duration: 2,
        description: 'Creates a protective shield of configuration energy'
      }
    ]
  },
  {
    id: 'unveiled_elite_updown',
    name: 'Up/Down Guardian',
    moves: [
      { 
        id: 'updown-strike', 
        name: 'Up/Down Strike', 
        damageRange: { min: 100, max: 150 }, 
        type: 'attack',
        description: 'A powerful up/down-based attack'
      },
      { 
        id: 'vertical-burst', 
        name: 'Vertical Burst', 
        damageRange: { min: 150, max: 200 }, 
        type: 'attack',
        description: 'A devastating vertical energy burst'
      },
      { 
        id: 'updown-shield', 
        name: 'Up/Down Shield', 
        type: 'defense',
        damageReduction: { percentage: 25 },
        duration: 2,
        description: 'Creates a protective shield of up/down energy'
      }
    ]
  }
];

const CPUOpponentMovesAdmin: React.FC<CPUOpponentMovesAdminProps> = ({ isOpen, onClose }) => {
  const [opponents, setOpponents] = useState<CPUOpponent[]>(DEFAULT_OPPONENTS);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [editingMove, setEditingMove] = useState<string | null>(null);
  const [moveEdits, setMoveEdits] = useState<{ [key: string]: Partial<CPUOpponentMove> }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadOpponentMoves();
    }
  }, [isOpen]);

  const loadOpponentMoves = async () => {
    setLoading(true);
    try {
      const cpuMovesRef = doc(db, 'adminSettings', 'cpuOpponentMoves');
      const cpuMovesDoc = await getDoc(cpuMovesRef);
      
      if (cpuMovesDoc.exists()) {
        const data = cpuMovesDoc.data();
        if (data.opponents && Array.isArray(data.opponents)) {
          // Merge with defaults to ensure new opponents are included
          const existingOpponentIds = new Set(data.opponents.map((opp: CPUOpponent) => opp.id));
          const newOpponents = DEFAULT_OPPONENTS.filter(opp => !existingOpponentIds.has(opp.id));
          
          // Update "Zombie" to "Unpowered Zombie" if it exists
          let nameWasUpdated = false;
          const updatedOpponents = data.opponents.map((opp: CPUOpponent) => {
            if (opp.id === 'zombie' && opp.name === 'Zombie') {
              console.log('🔄 Updating "Zombie" to "Unpowered Zombie" in Firestore');
              nameWasUpdated = true;
              return { ...opp, name: 'Unpowered Zombie' };
            }
            return opp;
          });
          
          const mergedOpponents = [...updatedOpponents, ...newOpponents];
          setOpponents(mergedOpponents);
          
          // If name was updated or new opponents were added, save the updated list
          if (newOpponents.length > 0 || nameWasUpdated) {
            const cleanedOpponents = removeUndefined(mergedOpponents);
            await setDoc(cpuMovesRef, { opponents: cleanedOpponents });
            if (nameWasUpdated) {
              setSaveMessage(`✅ Updated "Zombie" to "Unpowered Zombie"!`);
            } else {
              setSaveMessage(`✅ Added ${newOpponents.length} new opponent(s) to the list!`);
            }
            setTimeout(() => setSaveMessage(''), 3000);
          }
        } else {
          // Invalid data structure, use defaults
          await setDoc(cpuMovesRef, { opponents: DEFAULT_OPPONENTS });
          setOpponents(DEFAULT_OPPONENTS);
        }
      } else {
        // Initialize with defaults
        await setDoc(cpuMovesRef, { opponents: DEFAULT_OPPONENTS });
        setOpponents(DEFAULT_OPPONENTS);
      }
    } catch (error) {
      console.error('Error loading CPU opponent moves:', error);
      setSaveMessage('Error loading moves. Using defaults.');
    } finally {
      setLoading(false);
    }
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

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const cpuMovesRef = doc(db, 'adminSettings', 'cpuOpponentMoves');
      // Remove all undefined values before saving
      const cleanedOpponents = removeUndefined(opponents);
      await setDoc(cpuMovesRef, { opponents: cleanedOpponents });
      setSaveMessage('✅ CPU opponent moves saved successfully!');
      invalidateMoveOverridesCache();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving CPU opponent moves:', error);
      setSaveMessage('❌ Error saving moves. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveEdit = (opponentId: string, moveId: string, field: string, value: any) => {
    setOpponents(prev => {
      const updated = prev.map(opp => {
        if (opp.id === opponentId) {
          return {
            ...opp,
            moves: opp.moves.map(move => {
              if (move.id === moveId) {
                if (field === 'damageRange') {
                  return { ...move, damageRange: value, baseDamage: undefined };
                } else if (field === 'healingRange') {
                  return { ...move, healingRange: value };
                } else if (field === 'damageRangeMin' || field === 'damageRangeMax') {
                  const currentRange = move.damageRange || { min: 0, max: 0 };
                  const newRange = { ...currentRange, [field === 'damageRangeMin' ? 'min' : 'max']: value };
                  return { ...move, damageRange: newRange, baseDamage: undefined };
                } else if (field === 'healingRangeMin' || field === 'healingRangeMax') {
                  const currentRange = move.healingRange || { min: 0, max: 0 };
                  const newRange = { ...currentRange, [field === 'healingRangeMin' ? 'min' : 'max']: value };
                  return { ...move, healingRange: newRange };
                } else if (field === 'damageReduction') {
                  return { ...move, damageReduction: value };
                } else if (field === 'counterMove') {
                  return { ...move, counterMove: value };
                } else if (field === 'statusEffect') {
                  // Legacy support - convert to array
                  return { ...move, statusEffect: value, statusEffects: value && value.type !== 'none' ? [value] : [] };
                } else if (field === 'statusEffects') {
                  return { ...move, statusEffects: value };
                } else if (field.startsWith('statusEffect.')) {
                  const statusField = field.replace('statusEffect.', '');
                  const currentEffect = move.statusEffect || { type: 'none', duration: 0, successChance: 100 };
                  const updatedEffect = { ...currentEffect, [statusField]: value };
                  // Ensure successChance defaults to 100 if not set
                  if (statusField === 'type' && value !== 'none' && updatedEffect.successChance === undefined) {
                    updatedEffect.successChance = 100;
                  }
                  return { ...move, statusEffect: updatedEffect, statusEffects: updatedEffect.type !== 'none' ? [updatedEffect] : [] };
                } else {
                  return { ...move, [field]: value };
                }
              }
              return move;
            })
          };
        }
        return opp;
      });
      return updated;
    });
  };

  const handleAddMove = (opponentId: string) => {
    setOpponents(prev => {
      return prev.map(opp => {
        if (opp.id === opponentId) {
          const newMove: CPUOpponentMove = {
            id: `move-${Date.now()}`,
            name: 'New Move',
            baseDamage: 10,
            type: 'attack'
          };
          return { ...opp, moves: [...opp.moves, newMove] };
        }
        return opp;
      });
    });
  };

  const handleRemoveMove = (opponentId: string, moveId: string) => {
    setOpponents(prev => {
      return prev.map(opp => {
        if (opp.id === opponentId) {
          return { ...opp, moves: opp.moves.filter(m => m.id !== moveId) };
        }
        return opp;
      });
    });
  };

  const getMoveEffects = (move: CPUOpponentMove): StatusEffect[] => {
    if (move.statusEffects) {
      return move.statusEffects;
    }
    if (move.statusEffect && move.statusEffect.type !== 'none') {
      return [move.statusEffect];
    }
    return [];
  };

  const addStatusEffect = (opponentId: string, moveId: string) => {
    const currentEffects = getMoveEffects(selectedOpponentData?.moves.find(m => m.id === moveId) || { id: moveId, name: '', type: 'attack' } as CPUOpponentMove);
    const newEffect: StatusEffect = {
      type: 'burn',
      duration: 1,
      successChance: 100
    };
    handleMoveEdit(opponentId, moveId, 'statusEffects', [...currentEffects, newEffect]);
  };

  const removeStatusEffect = (opponentId: string, moveId: string, effectIndex: number) => {
    const move = selectedOpponentData?.moves.find(m => m.id === moveId);
    if (!move) return;
    const currentEffects = getMoveEffects(move);
    const newEffects = currentEffects.filter((_, index) => index !== effectIndex);
    handleMoveEdit(opponentId, moveId, 'statusEffects', newEffects);
  };

  const updateStatusEffect = (opponentId: string, moveId: string, effectIndex: number, field: keyof StatusEffect, value: any) => {
    const move = selectedOpponentData?.moves.find(m => m.id === moveId);
    if (!move) return;
    const currentEffects = getMoveEffects(move);
    const newEffects = [...currentEffects];
    newEffects[effectIndex] = {
      ...newEffects[effectIndex],
      [field]: value
    };
    handleMoveEdit(opponentId, moveId, 'statusEffects', newEffects);
  };

  if (!isOpen) return null;

  const selectedOpponentData = opponents.find(o => o.id === selectedOpponent);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '1200px',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>CPU Opponent Moves Admin</h2>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Close
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ flex: '0 0 250px', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Opponents</h3>
                {opponents.map(opp => (
                  <div
                    key={opp.id}
                    onClick={() => setSelectedOpponent(opp.id)}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: selectedOpponent === opp.id ? '#3b82f6' : '#f3f4f6',
                      color: selectedOpponent === opp.id ? 'white' : '#374151',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontWeight: selectedOpponent === opp.id ? 'bold' : 'normal'
                    }}
                  >
                    {opp.name}
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
                {selectedOpponentData ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0 }}>{selectedOpponentData.name} Moves</h3>
                      <button
                        onClick={() => handleAddMove(selectedOpponentData.id)}
                        style={{
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.5rem',
                          cursor: 'pointer'
                        }}
                      >
                        + Add Move
                      </button>
                    </div>

                    {selectedOpponentData.moves.map((move, index) => (
                      <div
                        key={move.id}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.5rem',
                          padding: '1rem',
                          marginBottom: '1rem',
                          background: '#f9fafb'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ margin: 0 }}>Move {index + 1}</h4>
                          <button
                            onClick={() => handleRemoveMove(selectedOpponentData.id, move.id)}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                          >
                            Remove
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                              Move Name
                            </label>
                            <input
                              type="text"
                              value={move.name}
                              onChange={(e) => handleMoveEdit(selectedOpponentData.id, move.id, 'name', e.target.value)}
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
                              Type
                            </label>
                            <select
                              value={move.type}
                              onChange={(e) => handleMoveEdit(selectedOpponentData.id, move.id, 'type', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem'
                              }}
                            >
                              <option value="attack">Attack</option>
                              <option value="defense">Defense</option>
                              <option value="heal">Heal</option>
                            </select>
                          </div>
                        </div>

                        {move.type === 'attack' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                Damage Range (Min)
                              </label>
                              <input
                                type="number"
                                value={move.damageRange?.min || move.baseDamage || 0}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  if (move.damageRange) {
                                    handleMoveEdit(selectedOpponentData.id, move.id, 'damageRangeMin', value);
                                  } else {
                                    handleMoveEdit(selectedOpponentData.id, move.id, 'damageRange', { min: value, max: value });
                                  }
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
                                Damage Range (Max)
                              </label>
                              <input
                                type="number"
                                value={move.damageRange?.max || move.baseDamage || 0}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  if (move.damageRange) {
                                    handleMoveEdit(selectedOpponentData.id, move.id, 'damageRangeMax', value);
                                  } else {
                                    handleMoveEdit(selectedOpponentData.id, move.id, 'damageRange', { min: value, max: value });
                                  }
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
                                Base Damage (if no range)
                              </label>
                              <input
                                type="number"
                                value={move.baseDamage || 0}
                                onChange={(e) => handleMoveEdit(selectedOpponentData.id, move.id, 'baseDamage', parseInt(e.target.value) || 0)}
                                disabled={!!move.damageRange}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.875rem',
                                  background: move.damageRange ? '#f3f4f6' : 'white'
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {move.type === 'heal' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                Healing Range (Min)
                              </label>
                              <input
                                type="number"
                                value={move.healingRange?.min || 0}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  const currentRange = move.healingRange || { min: 0, max: 0 };
                                  handleMoveEdit(selectedOpponentData.id, move.id, 'healingRange', { ...currentRange, min: value });
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
                                Healing Range (Max)
                              </label>
                              <input
                                type="number"
                                value={move.healingRange?.max || 0}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  const currentRange = move.healingRange || { min: 0, max: 0 };
                                  handleMoveEdit(selectedOpponentData.id, move.id, 'healingRange', { ...currentRange, max: value });
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

                        {move.type === 'defense' && (
                          <>
                            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '0.5rem', border: '1px solid #bae6fd' }}>
                              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 'bold', color: '#0369a1' }}>
                                Damage Reduction
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                    Flat Reduction (Amount)
                                  </label>
                                  <input
                                    type="number"
                                    value={move.damageReduction?.amount || ''}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                      const currentReduction = move.damageReduction || {};
                                      handleMoveEdit(selectedOpponentData.id, move.id, 'damageReduction', { ...currentReduction, amount: value });
                                    }}
                                    placeholder="0"
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
                                    Percentage Reduction (%)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={move.damageReduction?.percentage || ''}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                      const currentReduction = move.damageReduction || {};
                                      handleMoveEdit(selectedOpponentData.id, move.id, 'damageReduction', { ...currentReduction, percentage: value });
                                    }}
                                    placeholder="0"
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
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                  Duration (Turns)
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={move.duration || 1}
                                  onChange={(e) => handleMoveEdit(selectedOpponentData.id, move.id, 'duration', parseInt(e.target.value) || 1)}
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

                            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fde68a' }}>
                              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>
                                Counter Move
                              </h5>
                              <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                  Counter Condition
                                </label>
                                <select
                                  value={move.counterMove?.condition || 'always'}
                                  onChange={(e) => {
                                    const currentCounter = move.counterMove || { condition: 'always' };
                                    handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', { ...currentCounter, condition: e.target.value });
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  <option value="always">Always (every attack)</option>
                                  <option value="on_attack">On Any Attack</option>
                                  <option value="if_attacked">If Attacked</option>
                                  <option value="if_pp_stolen">If PP Stolen</option>
                                  <option value="if_shield_attacked">If Shield Attacked</option>
                                  <option value="on_critical">On Critical Hit</option>
                                  <option value="on_shield_break">On Shield Break</option>
                                  <option value="on_low_health">On Low Health</option>
                                  <option value="if_rival">If Attacker/Opponent is Rival</option>
                                </select>
                              </div>
                              {move.counterMove?.condition === 'on_low_health' && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                    Health Threshold (%)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={move.counterMove?.threshold || 50}
                                    onChange={(e) => {
                                      const currentCounter = move.counterMove || { condition: 'always' };
                                      handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', { ...currentCounter, threshold: parseInt(e.target.value) || 50 });
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
                              {move.counterMove?.condition === 'if_rival' && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                    Rival Name
                                  </label>
                                  <input
                                    type="text"
                                    value={move.counterMove?.rivalName || ''}
                                    onChange={(e) => {
                                      const currentCounter = move.counterMove || { condition: 'if_rival' };
                                      handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', { ...currentCounter, rivalName: e.target.value });
                                    }}
                                    placeholder="Enter rival name"
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
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                    Counter Damage (Min)
                                  </label>
                                  <input
                                    type="number"
                                    value={move.counterMove?.damageRange?.min || move.counterMove?.damage || ''}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                      const currentCounter = move.counterMove || { condition: 'always' };
                                      if (move.counterMove?.damageRange) {
                                        handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', {
                                          ...currentCounter,
                                          damageRange: { ...currentCounter.damageRange, min: value || 0 }
                                        });
                                      } else {
                                        handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', {
                                          ...currentCounter,
                                          damageRange: { min: value || 0, max: value || 0 },
                                          damage: undefined
                                        });
                                      }
                                    }}
                                    placeholder="0"
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
                                    Counter Damage (Max)
                                  </label>
                                  <input
                                    type="number"
                                    value={move.counterMove?.damageRange?.max || move.counterMove?.damage || ''}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                      const currentCounter = move.counterMove || { condition: 'always' };
                                      if (move.counterMove?.damageRange) {
                                        handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', {
                                          ...currentCounter,
                                          damageRange: { ...currentCounter.damageRange, max: value || 0 }
                                        });
                                      } else {
                                        handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', {
                                          ...currentCounter,
                                          damageRange: { min: value || 0, max: value || 0 },
                                          damage: undefined
                                        });
                                      }
                                    }}
                                    placeholder="0"
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
                                    Flat Counter Damage
                                  </label>
                                  <input
                                    type="number"
                                    value={move.counterMove?.damage || ''}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? undefined : parseInt(e.target.value) || 0;
                                      const currentCounter = move.counterMove || { condition: 'always' };
                                      handleMoveEdit(selectedOpponentData.id, move.id, 'counterMove', {
                                        ...currentCounter,
                                        damage: value,
                                        damageRange: undefined
                                      });
                                    }}
                                    disabled={!!move.counterMove?.damageRange}
                                    placeholder="0"
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '0.25rem',
                                      fontSize: '0.875rem',
                                      background: move.counterMove?.damageRange ? '#f3f4f6' : 'white'
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                            Description
                          </label>
                          <textarea
                            value={move.description || ''}
                            onChange={(e) => handleMoveEdit(selectedOpponentData.id, move.id, 'description', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.25rem',
                              fontSize: '0.875rem',
                              minHeight: '60px',
                              resize: 'vertical'
                            }}
                          />
                        </div>

                        {/* Status Effects Editor - Multiple Effects */}
                        <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fbbf24' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>
                              Status Effects
                            </h5>
                            <button
                              onClick={() => addStatusEffect(selectedOpponentData.id, move.id)}
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
                          
                          {getMoveEffects(move).length === 0 ? (
                            <div style={{ color: '#92400e', fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                              No effects. Click "Add Effect" to add one.
                            </div>
                          ) : (
                            getMoveEffects(move).map((effect, effectIndex) => (
                              <div key={effectIndex} style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.3)', borderRadius: '0.5rem', border: '1px solid rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>
                                    Effect {effectIndex + 1}
                                  </span>
                                  <button
                                    onClick={() => removeStatusEffect(selectedOpponentData.id, move.id, effectIndex)}
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
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'type', effectType);
                                        if (effectType === 'none') {
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'intensity', undefined);
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'damagePerTurn', undefined);
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'ppLossPerTurn', undefined);
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'ppStealPerTurn', undefined);
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'healPerTurn', undefined);
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'chance', undefined);
                                        }
                                        if (effectType !== 'none' && effect.successChance === undefined) {
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'successChance', 100);
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
                                      onChange={(e) => updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'duration', parseInt(e.target.value) || 0)}
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
                                      onChange={(e) => updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'successChance', parseInt(e.target.value) || 100)}
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
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'damagePerTurn', value);
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'intensity', value);
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
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'ppLossPerTurn', value);
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'intensity', value);
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
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'chance', value);
                                        updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'intensity', value);
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
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'ppStealPerTurn', value);
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'intensity', value);
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
                                          updateStatusEffect(selectedOpponentData.id, move.id, effectIndex, 'healPerTurn', value);
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
                    ))}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Select an opponent to view and edit their moves
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ color: saveMessage.includes('✅') ? '#10b981' : saveMessage.includes('❌') ? '#ef4444' : '#6b7280' }}>
                {saveMessage}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: saving ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold'
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CPUOpponentMovesAdmin;

