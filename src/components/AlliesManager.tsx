import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserAllies, AllyDefinition } from '../types/allies';
import {
  getOrCreateAllies,
  updateAlliesSlots,
  assignAlly,
  removeAlly,
  setAllyActive,
  reorderAllies,
  getAllAllyDefinitions,
  getAllyDefinition
} from '../utils/alliesFirestore';
import AllySlotCard from './AllySlotCard';

const AlliesManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [userAllies, setUserAllies] = useState<UserAllies | null>(null);
  const [allyDefinitions, setAllyDefinitions] = useState<AllyDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap: Get or create Allies document
  useEffect(() => {
    if (!currentUser) return;

    const loadAllies = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get or create user's Allies
        const allies = await getOrCreateAllies(currentUser.uid);
        setUserAllies(allies);

        // Load all available ally definitions
        const definitions = await getAllAllyDefinitions();
        setAllyDefinitions(definitions);

        // If Kon doesn't exist, seed it (dev/admin tool)
        if (definitions.length === 0) {
          const { seedKonAlly } = await import('../utils/alliesFirestore');
          await seedKonAlly();
          const updatedDefinitions = await getAllAllyDefinitions();
          setAllyDefinitions(updatedDefinitions);
        }
      } catch (err: any) {
        console.error('Error loading allies:', err);
        setError(err.message || 'Failed to load allies');
      } finally {
        setLoading(false);
      }
    };

    loadAllies();
  }, [currentUser]);

  const handleAssignAlly = async (slotNumber: number, allyId: string) => {
    if (!currentUser || !userAllies) return;

    try {
      setError(null);
      await assignAlly(currentUser.uid, slotNumber, allyId);
      
      // Refresh allies
      const updated = await getOrCreateAllies(currentUser.uid);
      setUserAllies(updated);
      setShowAssignModal(false);
      setSelectedSlot(null);
    } catch (err: any) {
      console.error('Error assigning ally:', err);
      setError(err.message || 'Failed to assign ally');
    }
  };

  const handleRemoveAlly = async (slotNumber: number) => {
    if (!currentUser || !userAllies) return;

    try {
      setError(null);
      await removeAlly(currentUser.uid, slotNumber);
      
      // Refresh allies
      const updated = await getOrCreateAllies(currentUser.uid);
      setUserAllies(updated);
    } catch (err: any) {
      console.error('Error removing ally:', err);
      setError(err.message || 'Failed to remove ally');
    }
  };

  const handleToggleActive = async (slotNumber: number) => {
    if (!currentUser || !userAllies) return;

    const slot = userAllies.slots.find(s => s.slot === slotNumber);
    if (!slot || !slot.allyId) return;

    try {
      setError(null);
      await setAllyActive(currentUser.uid, slotNumber, !slot.active);
      
      // Refresh allies
      const updated = await getOrCreateAllies(currentUser.uid);
      setUserAllies(updated);
    } catch (err: any) {
      console.error('Error toggling ally active state:', err);
      setError(err.message || 'Failed to toggle ally active state');
    }
  };

  const handleMoveSlot = async (fromSlot: number, toSlot: number) => {
    if (!currentUser || !userAllies) return;

    try {
      setError(null);
      await reorderAllies(currentUser.uid, fromSlot, toSlot);
      
      // Refresh allies
      const updated = await getOrCreateAllies(currentUser.uid);
      setUserAllies(updated);
    } catch (err: any) {
      console.error('Error reordering allies:', err);
      setError(err.message || 'Failed to reorder allies');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: 18, color: '#6b7280' }}>Loading Allies...</div>
      </div>
    );
  }

  if (!userAllies) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: 18, color: '#6b7280' }}>Has No Allies</div>
      </div>
    );
  }

  // Get available allies (not already assigned)
  const assignedAllyIds = userAllies.slots
    .filter(s => s.allyId)
    .map(s => s.allyId!);
  const availableAllies = allyDefinitions.filter(a => !assignedAllyIds.includes(a.id));
  
  // Check if user has any assigned allies
  const hasAssignedAllies = userAllies.slots.some(s => s.allyId);
  
  if (!hasAssignedAllies) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>
            Allies (In Game)
          </h2>
          <p style={{ fontSize: '1rem', color: '#6b7280' }}>
            Manage your in-game character companions. Allies fight alongside you in battles and provide passive abilities.
          </p>
        </div>
        <div style={{ padding: '3rem', textAlign: 'center', background: '#f9fafb', borderRadius: '0.5rem', border: '2px dashed #d1d5db' }}>
          <div style={{ fontSize: 48, marginBottom: '1rem' }}>👥</div>
          <div style={{ fontSize: 18, color: '#6b7280', fontWeight: '500' }}>Has No Allies</div>
          <div style={{ fontSize: 14, color: '#9ca3af', marginTop: '0.5rem' }}>
            Assign allies to your slots to get started
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>
          Allies (In Game)
        </h2>
        <p style={{ fontSize: '1rem', color: '#6b7280' }}>
          Manage your in-game character companions. Allies fight alongside you in battles and provide passive abilities.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#dc2626',
            marginBottom: '1rem'
          }}
        >
          {error}
        </div>
      )}

      {/* 4-Slot Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        {userAllies.slots.map((slot) => {
          const allyDef = slot.allyId
            ? allyDefinitions.find(a => a.id === slot.allyId) || null
            : null;

          return (
            <div key={slot.slot} style={{ position: 'relative' }}>
              {/* Slot Number Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '-0.5rem',
                  left: '-0.5rem',
                  background: '#4f46e5',
                  color: 'white',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 'bold',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                {slot.slot}
              </div>

              <AllySlotCard
                slot={slot}
                allyDefinition={allyDef}
                onAssign={
                  slot.status === 'unlocked' && !slot.allyId
                    ? () => {
                        setSelectedSlot(slot.slot);
                        setShowAssignModal(true);
                      }
                    : undefined
                }
                onRemove={
                  slot.allyId
                    ? () => handleRemoveAlly(slot.slot)
                    : undefined
                }
                onToggleActive={
                  slot.allyId
                    ? () => handleToggleActive(slot.slot)
                    : undefined
                }
                isLocked={slot.status === 'locked'}
              />
            </div>
          );
        })}
      </div>

      {/* Assign Ally Modal */}
      {showAssignModal && selectedSlot && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => {
            setShowAssignModal(false);
            setSelectedSlot(null);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: '2rem',
              maxWidth: 600,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Assign Ally to Slot {selectedSlot}
            </h3>

            {availableAllies.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                No available allies to assign
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {availableAllies.map((ally) => (
                  <div
                    key={ally.id}
                    style={{
                      padding: '1rem',
                      border: '2px solid #e5e7eb',
                      borderRadius: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#4f46e5';
                      e.currentTarget.style.background = '#f5f5f5';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.background = 'white';
                    }}
                    onClick={() => handleAssignAlly(selectedSlot, ally.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      >
                        {ally.displayName.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937' }}>
                          {ally.displayName}
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7280' }}>{ally.role}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: '0.25rem' }}>
                          {ally.description}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setShowAssignModal(false);
                setSelectedSlot(null);
              }}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlliesManager;

