import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { grantArtifactToPlayer, getAvailableArtifacts } from '../utils/artifactCompensation';
import { useAuth } from '../context/AuthContext';

interface Player {
  uid: string;
  email: string;
  displayName?: string;
}

const ArtifactCompensation: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [availableArtifacts] = useState(getAvailableArtifacts());

  // Search for players by email, name, or UID
  useEffect(() => {
    const searchPlayers = async () => {
      if (!searchQuery || searchQuery.trim().length < 2) {
        setPlayers([]);
        return;
      }

      const queryLower = searchQuery.toLowerCase().trim();
      const foundPlayers: Player[] = [];
      const playerMap = new Map<string, Player>();

      try {
        // Search in users collection
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        usersSnapshot.forEach((doc) => {
          const data = doc.data();
          const email = (data.email || '').toLowerCase();
          const displayName = (data.displayName || data.name || '').toLowerCase();
          const uid = doc.id.toLowerCase();
          
          // Check if query matches email, name, or UID
          if (
            email.includes(queryLower) ||
            displayName.includes(queryLower) ||
            uid.includes(queryLower)
          ) {
            const player: Player = {
              uid: doc.id,
              email: data.email || '',
              displayName: data.displayName || data.name || ''
            };
            playerMap.set(doc.id, player);
          }
        });

        // Also search in students collection (in case user data is there)
        const studentsRef = collection(db, 'students');
        const studentsSnapshot = await getDocs(studentsRef);
        
        studentsSnapshot.forEach((doc) => {
          const data = doc.data();
          const email = (data.email || '').toLowerCase();
          const displayName = (data.displayName || data.name || '').toLowerCase();
          const uid = doc.id.toLowerCase();
          
          // Check if query matches email, name, or UID
          if (
            email.includes(queryLower) ||
            displayName.includes(queryLower) ||
            uid.includes(queryLower)
          ) {
            // Only add if not already in map, or merge data
            if (!playerMap.has(doc.id)) {
              playerMap.set(doc.id, {
                uid: doc.id,
                email: data.email || '',
                displayName: data.displayName || data.name || ''
              });
            } else {
              // Merge data if user exists but student has better data
              const existing = playerMap.get(doc.id)!;
              if (!existing.displayName && data.displayName) {
                existing.displayName = data.displayName;
              }
              if (!existing.email && data.email) {
                existing.email = data.email;
              }
            }
          }
        });

        // Try direct UID lookup if query looks like a UID (long alphanumeric string)
        if (queryLower.length > 20 && /^[a-z0-9]+$/.test(queryLower)) {
          try {
            const userDoc = await getDoc(doc(db, 'users', queryLower));
            if (userDoc.exists()) {
              const data = userDoc.data();
              if (!playerMap.has(queryLower)) {
                playerMap.set(queryLower, {
                  uid: queryLower,
                  email: data.email || '',
                  displayName: data.displayName || data.name || ''
                });
              }
            }
          } catch (error) {
            // UID lookup failed, continue with other results
          }
        }

        // Convert map to array and sort by relevance (exact matches first, then by name)
        const playersArray = Array.from(playerMap.values());
        playersArray.sort((a, b) => {
          const aEmail = (a.email || '').toLowerCase();
          const bEmail = (b.email || '').toLowerCase();
          const aName = (a.displayName || '').toLowerCase();
          const bName = (b.displayName || '').toLowerCase();
          
          // Exact email match first
          if (aEmail === queryLower && bEmail !== queryLower) return -1;
          if (bEmail === queryLower && aEmail !== queryLower) return 1;
          
          // Exact name match second
          if (aName === queryLower && bName !== queryLower) return -1;
          if (bName === queryLower && aName !== queryLower) return 1;
          
          // Then by email starts with
          if (aEmail.startsWith(queryLower) && !bEmail.startsWith(queryLower)) return -1;
          if (bEmail.startsWith(queryLower) && !aEmail.startsWith(queryLower)) return 1;
          
          // Then by name starts with
          if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
          if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1;
          
          // Finally alphabetical by name
          return aName.localeCompare(bName);
        });

        setPlayers(playersArray.slice(0, 20)); // Limit to 20 results
      } catch (error) {
        console.error('Error searching players:', error);
        setMessage({ type: 'error', text: 'Error searching for players. Please try again.' });
        setPlayers([]);
      }
    };

    const debounceTimer = setTimeout(searchPlayers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleGrantArtifact = async () => {
    if (!selectedPlayer || !selectedArtifact || !currentUser) {
      setMessage({ type: 'error', text: 'Please select a player and artifact' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await grantArtifactToPlayer(
        selectedPlayer.uid,
        selectedArtifact,
        currentUser.uid,
        reason || undefined
      );

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        // Reset form
        setSelectedPlayer(null);
        setSelectedArtifact('');
        setReason('');
        setSearchQuery('');
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message || 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem', color: '#1f2937' }}>🎁 Artifact Compensation</h2>
      <p style={{ marginBottom: '2rem', color: '#6b7280' }}>
        Grant artifacts to players to compensate for errors or missing rewards.
      </p>

      {message && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            borderRadius: '0.5rem',
            backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
          Search Player (Email or UID)
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Enter player email or UID..."
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem'
          }}
        />
        
        {players.length > 0 && (
          <div
            style={{
              marginTop: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              maxHeight: '200px',
              overflowY: 'auto',
              backgroundColor: 'white'
            }}
          >
            {players.map((player) => (
              <div
                key={player.uid}
                onClick={() => {
                  setSelectedPlayer(player);
                  setSearchQuery(player.email || player.uid);
                  setPlayers([]);
                }}
                style={{
                  padding: '0.75rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: selectedPlayer?.uid === player.uid ? '#eff6ff' : 'white'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = selectedPlayer?.uid === player.uid ? '#eff6ff' : 'white';
                }}
              >
                <div style={{ fontWeight: '600' }}>{player.displayName || 'No name'}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{player.email}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>UID: {player.uid}</div>
              </div>
            ))}
          </div>
        )}

        {selectedPlayer && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#eff6ff',
              borderRadius: '0.5rem',
              border: '1px solid #3b82f6'
            }}
          >
            <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
              Selected: {selectedPlayer.displayName || 'No name'}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{selectedPlayer.email}</div>
            <button
              onClick={() => {
                setSelectedPlayer(null);
                setSearchQuery('');
              }}
              style={{
                marginTop: '0.5rem',
                padding: '0.25rem 0.75rem',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
          Select Artifact
        </label>
        <select
          value={selectedArtifact}
          onChange={(e) => setSelectedArtifact(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            backgroundColor: 'white'
          }}
        >
          <option value="">-- Select an artifact --</option>
          {availableArtifacts.map((artifact) => (
            <option key={artifact.id} value={artifact.id}>
              {artifact.icon} {artifact.name} ({artifact.rarity})
            </option>
          ))}
        </select>
        
        {selectedArtifact && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
            {(() => {
              const artifact = availableArtifacts.find(a => a.id === selectedArtifact);
              return artifact ? (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                    {artifact.icon} {artifact.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {artifact.description}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Category: {artifact.category} | Rarity: {artifact.rarity}
                  </div>
                </>
              ) : null;
            })()}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
          Reason (Optional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Missing Captain's Helmet from Chapter 2-3 completion..."
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            minHeight: '100px',
            resize: 'vertical'
          }}
        />
      </div>

      <button
        onClick={handleGrantArtifact}
        disabled={!selectedPlayer || !selectedArtifact || loading}
        style={{
          width: '100%',
          padding: '0.75rem 1.5rem',
          backgroundColor: (!selectedPlayer || !selectedArtifact || loading) ? '#9ca3af' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: (!selectedPlayer || !selectedArtifact || loading) ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Granting Artifact...' : 'Grant Artifact to Player'}
      </button>
    </div>
  );
};

export default ArtifactCompensation;

