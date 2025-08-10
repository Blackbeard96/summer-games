import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';

interface RivalSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRivalSelected: (rivalId: string, rivalName: string) => void;
}

interface Player {
  uid: string;
  displayName: string;
  level: number;
  powerPoints: number;
  manifest?: string;
}

const RivalSelectionModal: React.FC<RivalSelectionModalProps> = ({ 
  isOpen, 
  onClose, 
  onRivalSelected 
}) => {
  const { currentUser } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedRival, setSelectedRival] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Load available players (excluding current user)
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const loadPlayers = async () => {
      setLoading(true);
      try {
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        const availablePlayers: Player[] = [];
        
        studentsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (doc.id !== currentUser.uid) {
            availablePlayers.push({
              uid: doc.id,
              displayName: data.displayName || 'Unknown Player',
              level: data.level || 1,
              powerPoints: data.powerPoints || 0,
              manifest: data.manifest?.manifestId || data.manifestationType || 'Unknown',
            });
          }
        });
        
        setPlayers(availablePlayers);
      } catch (error) {
        console.error('Error loading players:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [isOpen, currentUser]);

  const handleSelectRival = async () => {
    if (!selectedRival || !currentUser) {
      alert('Please select a rival first.');
      return;
    }

    const rival = players.find(p => p.uid === selectedRival);
    if (!rival) {
      alert('Selected rival not found.');
      return;
    }

    try {
      // Update user's rival in the database
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const updatedChapters = {
          ...userData.chapters,
          '2': { // Chapter 2
            ...userData.chapters?.['2'],
            rival: {
              id: rival.uid,
              name: rival.displayName,
              type: 'external',
              description: `Your rival ${rival.displayName} - a worthy opponent to overcome`,
              challenge: `Defeat ${rival.displayName} in battle or prove your superiority`,
              isDefeated: false
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });

        // Also update the legacy system
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          await updateDoc(studentRef, {
            rival: {
              id: rival.uid,
              name: rival.displayName,
              type: 'external',
              description: `Your rival ${rival.displayName} - a worthy opponent to overcome`,
              challenge: `Defeat ${rival.displayName} in battle or prove your superiority`,
              isDefeated: false
            }
          });
        }

        onRivalSelected(rival.uid, rival.displayName);
        onClose();
      }
    } catch (error) {
      console.error('Error selecting rival:', error);
      alert('Failed to select rival. Please try again.');
    }
  };

  const filteredPlayers = players.filter(player =>
    player.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (player.manifest && player.manifest.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        width: '90%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>🏆 Choose Your Rival</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          Select a player as your rival. This will be your primary opponent to overcome in this chapter.
        </p>

        {/* Search Bar */}
        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="text"
            placeholder="Search players by name or manifest..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              fontSize: '1rem',
            }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '1.125rem', color: '#6b7280' }}>Loading players...</div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem', color: '#374151' }}>
              Available Players ({filteredPlayers.length})
            </h3>
            
            <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '400px', overflow: 'auto' }}>
              {filteredPlayers.map(player => (
                <div
                  key={player.uid}
                  onClick={() => setSelectedRival(player.uid)}
                  style={{
                    padding: '1rem',
                    border: `2px solid ${selectedRival === player.uid ? '#dc2626' : '#e5e7eb'}`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    background: selectedRival === player.uid ? '#fef2f2' : 'white',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '0.25rem' }}>
                        {player.displayName}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        Level {player.level} • {player.powerPoints} PP • {player.manifest}
                      </div>
                    </div>
                    {selectedRival === player.uid && (
                      <span style={{ color: '#dc2626', fontWeight: 'bold' }}>✓ Selected</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredPlayers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                No players found matching your search.
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSelectRival}
            disabled={!selectedRival}
            style={{
              background: !selectedRival ? '#9ca3af' : '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: !selectedRival ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            Select Rival
          </button>
        </div>
      </div>
    </div>
  );
};

export default RivalSelectionModal; 