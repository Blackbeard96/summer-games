import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ACTION_CARD_TEMPLATES, ActionCard } from '../types/battle';

interface ActionCardsAdminProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActionCardEditData extends Omit<ActionCard, 'id' | 'unlocked'> {
  id?: string; // Optional for editing
}

const ActionCardsAdmin: React.FC<ActionCardsAdminProps> = ({ isOpen, onClose }) => {
  const [actionCards, setActionCards] = useState<ActionCardEditData[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [cardEdits, setCardEdits] = useState<{ [key: string]: Partial<ActionCardEditData> }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadActionCards();
    }
  }, [isOpen]);

  const loadActionCards = async () => {
    setLoading(true);
    try {
      const actionCardsRef = doc(db, 'adminSettings', 'actionCards');
      const actionCardsDoc = await getDoc(actionCardsRef);
      
      if (actionCardsDoc.exists()) {
        const data = actionCardsDoc.data();
        if (data.cards && Array.isArray(data.cards)) {
          setActionCards(data.cards);
        } else {
          // Initialize with templates
          const initialCards = ACTION_CARD_TEMPLATES.map((template, index) => ({
            ...template,
            id: `card_${index + 1}`
          }));
          setActionCards(initialCards);
        }
      } else {
        // Initialize with templates
        const initialCards = ACTION_CARD_TEMPLATES.map((template, index) => ({
          ...template,
          id: `card_${index + 1}`
        }));
        await setDoc(actionCardsRef, { 
          cards: initialCards,
          lastUpdated: serverTimestamp()
        });
        setActionCards(initialCards);
      }
    } catch (error) {
      console.error('Error loading action cards:', error);
      setSaveMessage('Error loading cards. Using defaults.');
      // Fallback to templates
      const initialCards = ACTION_CARD_TEMPLATES.map((template, index) => ({
        ...template,
        id: `card_${index + 1}`
      }));
      setActionCards(initialCards);
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
      const actionCardsRef = doc(db, 'adminSettings', 'actionCards');
      
      // Merge edits with existing cards
      const updatedCards = actionCards.map(card => {
        const edits = cardEdits[card.name];
        if (edits) {
          return { ...card, ...edits };
        }
        return card;
      });
      
      // Remove all undefined values before saving
      const cleanedCards = removeUndefined(updatedCards);
      
      await setDoc(actionCardsRef, { 
        cards: cleanedCards,
        lastUpdated: serverTimestamp()
      });
      
      setSaveMessage('✅ Action cards saved successfully!');
      setCardEdits({});
      setEditingCard(null);
      await loadActionCards(); // Reload to get saved data
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving action cards:', error);
      setSaveMessage('❌ Error saving cards. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCardEdit = (cardName: string, field: string, value: any) => {
    setCardEdits(prev => {
      const currentCard = prev[cardName] || {};
      
      // Handle nested effect object
      if (field.startsWith('effect.')) {
        const effectField = field.split('.')[1];
        const existingEffect = currentCard.effect || {};
        return {
          ...prev,
          [cardName]: {
            ...currentCard,
            effect: {
              ...existingEffect,
              [effectField]: value
            } as Partial<ActionCardEditData>['effect']
          }
        };
      }
      
      // Handle nested nextLevelEffect object
      if (field.startsWith('nextLevelEffect.')) {
        const nextLevelField = field.split('.')[1];
        const existingNextLevel = currentCard.nextLevelEffect || {};
        return {
          ...prev,
          [cardName]: {
            ...currentCard,
            nextLevelEffect: {
              ...existingNextLevel,
              [nextLevelField]: value
            } as Partial<ActionCardEditData>['nextLevelEffect']
          }
        };
      }
      
      // Default: update the field directly
      return {
        ...prev,
        [cardName]: {
          ...currentCard,
          [field]: value
        } as Partial<ActionCardEditData>
      };
    });
  };

  const resetToDefault = () => {
    const defaultCards = ACTION_CARD_TEMPLATES.map((template, index) => ({
      ...template,
      id: `card_${index + 1}`
    }));
    setActionCards(defaultCards);
    setCardEdits({});
    setEditingCard(null);
    setSaveMessage('Reset to defaults. Click Save to apply changes.');
  };

  const getCardDisplayValue = (card: ActionCardEditData, field: string): any => {
    const edits = cardEdits[card.name];
    if (edits) {
      if (field.startsWith('effect.')) {
        const effectField = field.split('.')[1];
        return edits.effect?.[effectField as keyof typeof edits.effect] ?? 
               (card.effect as any)?.[effectField];
      }
      if (field.startsWith('nextLevelEffect.')) {
        const nextLevelField = field.split('.')[1];
        return edits.nextLevelEffect?.[nextLevelField as keyof typeof edits.nextLevelEffect] ?? 
               (card.nextLevelEffect as any)?.[nextLevelField];
      }
      return (edits as any)[field] ?? (card as any)[field];
    }
    if (field.startsWith('effect.')) {
      const effectField = field.split('.')[1];
      return (card.effect as any)?.[effectField];
    }
    if (field.startsWith('nextLevelEffect.')) {
      const nextLevelField = field.split('.')[1];
      return (card.nextLevelEffect as any)?.[nextLevelField];
    }
    return (card as any)[field];
  };

  if (!isOpen) return null;

  const selectedCardData = selectedCard ? actionCards.find(c => c.name === selectedCard) : null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
      padding: '2rem',
      overflow: 'auto'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        borderRadius: '1.5rem',
        padding: '2rem',
        maxWidth: '1400px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        border: '2px solid rgba(139, 92, 246, 0.5)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          borderBottom: '2px solid rgba(139, 92, 246, 0.3)',
          paddingBottom: '1rem'
        }}>
          <div>
            <h2 style={{
              fontSize: '2.5rem',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0
            }}>
              🃏 Action Cards Administration
            </h2>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
              Edit and manage Action Cards. Changes will affect all players.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '1.125rem',
              fontWeight: 'bold'
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            borderRadius: '0.5rem',
            background: saveMessage.includes('✅') 
              ? 'rgba(34, 197, 94, 0.2)' 
              : 'rgba(239, 68, 68, 0.2)',
            border: `1px solid ${saveMessage.includes('✅') 
              ? 'rgba(34, 197, 94, 0.5)' 
              : 'rgba(239, 68, 68, 0.5)'}`,
            color: saveMessage.includes('✅') ? '#86efac' : '#fca5a5',
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            {saveMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '2rem',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              background: saving || loading
                ? 'rgba(100, 100, 100, 0.3)'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.75rem 1.5rem',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              boxShadow: saving || loading ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.4)'
            }}
          >
            {saving ? '💾 Saving...' : '💾 Save Changes'}
          </button>
          <button
            onClick={resetToDefault}
            disabled={saving || loading}
            style={{
              background: saving || loading
                ? 'rgba(100, 100, 100, 0.3)'
                : 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '0.75rem',
              padding: '0.75rem 1.5rem',
              color: '#fbbf24',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: saving || loading ? 'not-allowed' : 'pointer'
            }}
          >
            🔄 Reset to Defaults
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
            Loading Action Cards...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr',
            gap: '2rem'
          }}>
            {/* Card List */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '1rem',
              padding: '1rem',
              maxHeight: '70vh',
              overflow: 'auto'
            }}>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#a78bfa'
              }}>
                Action Cards
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {actionCards.map((card) => (
                  <button
                    key={card.name}
                    onClick={() => {
                      setSelectedCard(card.name);
                      setEditingCard(card.name);
                    }}
                    style={{
                      background: selectedCard === card.name
                        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(124, 58, 237, 0.3) 100%)'
                        : 'rgba(0, 0, 0, 0.2)',
                      border: `2px solid ${selectedCard === card.name 
                        ? 'rgba(139, 92, 246, 0.5)' 
                        : 'rgba(100, 100, 100, 0.3)'}`,
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      color: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCard !== card.name) {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCard !== card.name) {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
                      }
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      {card.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {card.type} • {card.rarity}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Card Editor */}
            {selectedCardData && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '1rem',
                padding: '1.5rem',
                maxHeight: '70vh',
                overflow: 'auto'
              }}>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  marginBottom: '1.5rem',
                  color: '#a78bfa'
                }}>
                  Edit: {selectedCardData.name}
                </h3>

                {/* Basic Info */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#cbd5e1' }}>
                    Basic Information
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={getCardDisplayValue(selectedCardData, 'name') || ''}
                        onChange={(e) => handleCardEdit(selectedCardData.name, 'name', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '0.5rem',
                          color: 'white',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                        Description
                      </label>
                      <textarea
                        value={getCardDisplayValue(selectedCardData, 'description') || ''}
                        onChange={(e) => handleCardEdit(selectedCardData.name, 'description', e.target.value)}
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '0.5rem',
                          color: 'white',
                          fontSize: '0.875rem',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Type
                        </label>
                        <select
                          value={getCardDisplayValue(selectedCardData, 'type') || 'attack'}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'type', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        >
                          <option value="attack">Attack</option>
                          <option value="defense">Defense</option>
                          <option value="utility">Utility</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Rarity
                        </label>
                        <select
                          value={getCardDisplayValue(selectedCardData, 'rarity') || 'common'}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'rarity', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        >
                          <option value="common">Common</option>
                          <option value="rare">Rare</option>
                          <option value="epic">Epic</option>
                          <option value="legendary">Legendary</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Truth Metal Cost
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'truthMetalCost') || 0}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'truthMetalCost', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Uses
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'uses') || 0}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'uses', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Max Uses
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'maxUses') || 0}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'maxUses', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Mastery Level
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={getCardDisplayValue(selectedCardData, 'masteryLevel') || 1}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'masteryLevel', parseInt(e.target.value) || 1)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Upgrade Cost (PP)
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'upgradeCost') || 0}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'upgradeCost', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                        Image URL
                      </label>
                      <input
                        type="text"
                        value={getCardDisplayValue(selectedCardData, 'imageUrl') || ''}
                        onChange={(e) => handleCardEdit(selectedCardData.name, 'imageUrl', e.target.value)}
                        placeholder="/images/Action Card - Freeze.png"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '0.5rem',
                          color: 'white',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Effect */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#cbd5e1' }}>
                    Effect
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                        Effect Type
                      </label>
                      <select
                        value={getCardDisplayValue(selectedCardData, 'effect.type') || 'shield_breach'}
                        onChange={(e) => handleCardEdit(selectedCardData.name, 'effect.type', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '0.5rem',
                          color: 'white',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="shield_breach">Shield Breach</option>
                        <option value="pp_restore">PP Restore</option>
                        <option value="teleport_pp">Teleport PP</option>
                        <option value="reverse_dues">Reverse Dues</option>
                        <option value="double_xp">Double XP</option>
                        <option value="move_disrupt">Move Disrupt</option>
                        <option value="shield_restore">Shield Restore</option>
                        <option value="freeze">Freeze</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Strength
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'effect.strength') || 0}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'effect.strength', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Duration
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'effect.duration') || ''}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'effect.duration', e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Optional"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Chance (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={getCardDisplayValue(selectedCardData, 'effect.chance') || ''}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'effect.chance', e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Optional"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Next Level Effect */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#cbd5e1' }}>
                    Next Level Effect (Upgrade)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Strength
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'nextLevelEffect.strength') || ''}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'nextLevelEffect.strength', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="Optional"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Duration
                        </label>
                        <input
                          type="number"
                          value={getCardDisplayValue(selectedCardData, 'nextLevelEffect.duration') || ''}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'nextLevelEffect.duration', e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Optional"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          Chance (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={getCardDisplayValue(selectedCardData, 'nextLevelEffect.chance') || ''}
                          onChange={(e) => handleCardEdit(selectedCardData.name, 'nextLevelEffect.chance', e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Optional"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionCardsAdmin;

