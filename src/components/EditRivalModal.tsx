import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { setChosenRival } from '../utils/rivalService';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

interface EditRivalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRivalUpdated: () => void;
}

interface PlayerResult {
  uid: string;
  displayName: string;
  photoURL?: string;
  level: number;
}

const EditRivalModal: React.FC<EditRivalModalProps> = ({
  isOpen,
  onClose,
  onRivalUpdated
}) => {
  const { currentUser } = useAuth();
  const [searchScope, setSearchScope] = useState<'class' | 'all'>('class');
  const [searchQuery, setSearchQuery] = useState('');
  const [allPlayers, setAllPlayers] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [isSetting, setIsSetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userClassId, setUserClassId] = useState<string | null>(null);
  const [classStudentIds, setClassStudentIds] = useState<Set<string>>(new Set());

  // Load all players when modal opens (like VaultSiegeModal)
  useEffect(() => {
    if (!isOpen || !currentUser) {
      setAllPlayers([]);
      setSearchQuery('');
      setSelectedPlayer(null);
      setError(null);
      setClassStudentIds(new Set());
      return;
    }

    const loadPlayers = async () => {
      setLoading(true);
      try {
        // Get user's classId for filtering
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const classId = studentDoc.exists() 
          ? (studentDoc.data().classId || studentDoc.data().class || null)
          : null;
        setUserClassId(classId);

        // Load class student IDs if class exists
        let classStudentIdSet = new Set<string>();
        if (classId) {
          try {
            const classroomRef = doc(db, 'classrooms', classId);
            const classroomDoc = await getDoc(classroomRef);
            if (classroomDoc.exists()) {
              const classroomData = classroomDoc.data();
              const studentIds = classroomData.students || [];
              classStudentIdSet = new Set(studentIds);
            }
          } catch (error) {
            console.error('Error loading classroom data:', error);
          }
        }
        setClassStudentIds(classStudentIdSet);

        // Load all students
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        const players: PlayerResult[] = [];

        for (const studentDoc of studentsSnapshot.docs) {
          if (studentDoc.id === currentUser.uid) continue; // Skip self

          const studentData = studentDoc.data();
          
          // Get user data for displayName and photoURL
          let displayName = studentData.displayName || studentData.name || 'Unknown Player';
          let photoURL = studentData.photoURL;
          
          try {
            const userDoc = await getDoc(doc(db, 'users', studentDoc.id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              displayName = userData.displayName || displayName;
              photoURL = userData.photoURL || photoURL;
            }
          } catch (error) {
            // Continue with student data if user doc doesn't exist
          }

          players.push({
            uid: studentDoc.id,
            displayName,
            photoURL,
            level: studentData.level || 1
          });
        }

        setAllPlayers(players);
      } catch (error) {
        console.error('Error loading players:', error);
        setError('Failed to load players. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [isOpen, currentUser]);

  // Filter players based on search query and scope (client-side like VaultSiegeModal)
  const filteredPlayers = useMemo(() => {
    let filtered = [...allPlayers];

    // Filter by scope (class vs all)
    if (searchScope === 'class' && classStudentIds.size > 0) {
      // Only show players who are in the same class
      filtered = filtered.filter(player => classStudentIds.has(player.uid));
    }

    // Apply search query filter (like VaultSiegeModal)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(player => 
        player.displayName.toLowerCase().includes(query) ||
        player.uid.toLowerCase().includes(query) // This will match email if uid is email
      );
    }

    // Apply search query filter (like VaultSiegeModal)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(player => 
        player.displayName.toLowerCase().includes(query) ||
        player.uid.toLowerCase().includes(query) // This will match email if uid is email
      );
    }

    // Sort alphabetically by display name
    return filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [allPlayers, searchQuery, searchScope, classStudentIds]);

  const handleSelectPlayer = (player: PlayerResult) => {
    if (player.uid === currentUser?.uid) {
      setError('Cannot set yourself as rival');
      return;
    }
    setSelectedPlayer(player);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!selectedPlayer || !currentUser) return;
    
    setIsSetting(true);
    setError(null);
    
    try {
      const result = await setChosenRival(
        currentUser.uid,
        currentUser.displayName || currentUser.email || 'Unknown',
        selectedPlayer.uid,
        selectedPlayer.displayName
      );
      
      if (result.success) {
        onRivalUpdated();
        onClose();
      } else {
        setError(result.error || 'Failed to set rival');
      }
    } catch (error: any) {
      console.error('Error setting rival:', error);
      setError(error.message || 'Failed to set rival');
    } finally {
      setIsSetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Edit Rival</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {/* Search Scope */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Search Scope:
          </label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                value="class"
                checked={searchScope === 'class'}
                onChange={(e) => {
                  setSearchScope('class');
                  setSelectedPlayer(null);
                }}
              />
              My Class only
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                value="all"
                checked={searchScope === 'all'}
                onChange={(e) => {
                  setSearchScope('all');
                  setSelectedPlayer(null);
                }}
              />
              All Players
            </label>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: '1.5rem' }}>
            <input
              type="text"
              placeholder="Search by display name or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            />
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            borderRadius: '0.5rem',
            border: '1px solid #fecaca'
          }}>
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            Loading players...
          </div>
        )}

        {/* Search Results */}
        {!loading && (
          <div style={{ marginBottom: '1.5rem' }}>
            {searchQuery.trim() && (
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                {filteredPlayers.length} result{filteredPlayers.length !== 1 ? 's' : ''} found
                {!searchQuery.trim() && ` (${allPlayers.length} total)`}
              </div>
            )}
            {!searchQuery.trim() && (
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''} available
              </div>
            )}
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
              {filteredPlayers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  {searchQuery.trim() ? 'No players found' : 'No players available'}
                </div>
              ) : (
                filteredPlayers.map((player) => (
                <div
                  key={player.uid}
                  onClick={() => handleSelectPlayer(player)}
                  style={{
                    padding: '1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: selectedPlayer?.uid === player.uid ? '#eff6ff' : 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPlayer?.uid !== player.uid) {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPlayer?.uid !== player.uid) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  {player.photoURL ? (
                    <img
                      src={player.photoURL}
                      alt={player.displayName}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6b7280',
                        fontWeight: 'bold'
                      }}
                    >
                      {player.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500' }}>{player.displayName}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Level {player.level}
                    </div>
                  </div>
                  {selectedPlayer?.uid === player.uid && (
                    <div style={{ color: '#10b981', fontSize: '1.25rem' }}>✓</div>
                  )}
                </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Selected Player Info */}
        {selectedPlayer && (
          <div style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            backgroundColor: '#eff6ff',
            borderRadius: '0.5rem',
            border: '1px solid #bfdbfe'
          }}>
            <div style={{ fontWeight: '500', marginBottom: '0.5rem' }}>
              Selected: {selectedPlayer.displayName}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Level {selectedPlayer.level}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedPlayer || isSetting}
            style={{
              padding: '0.75rem 1.5rem',
              background: selectedPlayer && !isSetting ? '#dc2626' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: selectedPlayer && !isSetting ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            {isSetting ? 'Setting...' : 'Set Rival'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditRivalModal;

