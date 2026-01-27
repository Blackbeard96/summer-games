import React from 'react';
import { AllySlot, AllyDefinition } from '../types/allies';

interface AllySlotCardProps {
  slot: AllySlot;
  allyDefinition?: AllyDefinition | null;
  onAssign?: () => void;
  onRemove?: () => void;
  onToggleActive?: () => void;
  isLocked: boolean;
}

const AllySlotCard: React.FC<AllySlotCardProps> = ({
  slot,
  allyDefinition,
  onAssign,
  onRemove,
  onToggleActive,
  isLocked
}) => {
  if (isLocked || slot.status === 'locked') {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
          border: '2px dashed #6b7280',
          borderRadius: 16,
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          position: 'relative',
          opacity: 0.6
        }}
      >
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
          Locked
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
          Unlock by progressing in the story
        </div>
      </div>
    );
  }

  if (!allyDefinition) {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
          border: '2px dashed #9ca3af',
          borderRadius: 16,
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          cursor: onAssign ? 'pointer' : 'default'
        }}
        onClick={onAssign}
      >
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>➕</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>
          Empty Slot
        </div>
        <div style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
          {onAssign ? 'Click to assign an Ally' : 'No Ally assigned'}
        </div>
      </div>
    );
  }

  const rarityColors: Record<string, string> = {
    common: '#6b7280',
    rare: '#3b82f6',
    epic: '#8b5cf6',
    legendary: '#f59e0b'
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
        border: `3px solid ${slot.active ? '#10b981' : '#e5e7eb'}`,
        borderRadius: 16,
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 300,
        position: 'relative',
        boxShadow: slot.active ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}
    >
      {/* Active Badge */}
      {slot.active && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: '#10b981',
            color: 'white',
            padding: '0.25rem 0.75rem',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 'bold'
          }}
        >
          Active
        </div>
      )}

      {/* Portrait */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        {allyDefinition.portraitUrl ? (
          <img
            src={allyDefinition.portraitUrl}
            alt={allyDefinition.displayName}
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              objectFit: 'cover',
              border: `3px solid ${rarityColors[allyDefinition.rarity] || '#6b7280'}`
            }}
          />
        ) : (
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${rarityColors[allyDefinition.rarity] || '#6b7280'} 0%, #fbbf24 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              color: 'white',
              fontWeight: 'bold'
            }}
          >
            {allyDefinition.displayName.charAt(0)}
          </div>
        )}
      </div>

      {/* Name and Role */}
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: '0.25rem' }}>
          {allyDefinition.displayName}
        </div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          {allyDefinition.role}
        </div>
        <div
          style={{
            display: 'inline-block',
            marginTop: '0.5rem',
            padding: '0.25rem 0.75rem',
            background: rarityColors[allyDefinition.rarity] || '#6b7280',
            color: 'white',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}
        >
          {allyDefinition.rarity}
        </div>
      </div>

      {/* Passive Ability */}
      <div style={{ marginBottom: '1rem', flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>
          Passive Ability
        </div>
        <div style={{ fontSize: 14, color: '#1f2937', fontWeight: 'bold', marginBottom: '0.25rem' }}>
          {allyDefinition.passiveAbility.name}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
          {allyDefinition.passiveAbility.description}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
        {onToggleActive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive();
            }}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: slot.active ? '#ef4444' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {slot.active ? 'Deactivate' : 'Activate'}
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

export default AllySlotCard;











