import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, doc, addDoc, updateDoc, query, where, getDocs, getDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { getLevelFromXP } from '../utils/leveling';

interface Player {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  level: number;
  xp: number;
  manifest?: string;
}

interface BattleInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  battleName: string;
  currentPlayers: string[]; // Array of user IDs already in battle
  chapterId?: number;
  chapterName?: string;
  challengeId?: string;
  challengeName?: string;
  challengeNumber?: number;
}

interface Invitation {
  id: string;
  gameId: string;
  battleName: string;
  chapterId?: number;
  chapterName?: string;
  challengeId?: string;
  challengeName?: string;
  challengeNumber?: number;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
}

const BattleInviteModal: React.FC<BattleInviteModalProps> = ({
  isOpen,
  onClose,
  gameId,
  battleName,
  currentPlayers,
  chapterId,
  chapterName,
  challengeId,
  challengeName,
  challengeNumber
}) => {
  const { currentUser } = useAuth();
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [squadMembers, setSquadMembers] = useState<Player[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingInvites, setSendingInvites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch available players, squad members, and existing invitations
  // Fetch chapter info from battle room if not provided
  useEffect(() => {
    if (!isOpen || !currentUser || chapterId) return; // If chapterId is already provided, skip

    const fetchChapterInfo = async () => {
      try {
        const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
        const battleRoomDoc = await getDoc(battleRoomRef);
        
        if (battleRoomDoc.exists()) {
          const battleRoomData = battleRoomDoc.data();
          if (battleRoomData.chapterId && battleRoomData.chapterName) {
            // We can't update props, but we can use this info when creating invitations
            // Store it in a ref or state if needed
            console.log('BattleInviteModal: Found chapter info in battle room:', {
              chapterId: battleRoomData.chapterId,
              chapterName: battleRoomData.chapterName
            });
          }
        }
      } catch (error) {
        console.error('Error fetching chapter info from battle room:', error);
      }
    };

    fetchChapterInfo();
  }, [isOpen, currentUser, gameId, chapterId]);

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        
        // Create a map of student data by UID
        const studentDataMap = new Map();
        studentsSnapshot.docs.forEach(doc => {
          studentDataMap.set(doc.id, doc.data());
        });
        
        const allUsers: Player[] = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          const studentData = studentDataMap.get(doc.id);
          
          // Get manifest from multiple sources
          let manifest = 'Unknown';
          if (data.manifest) {
            if (typeof data.manifest === 'string') {
              manifest = data.manifest;
            } else if (typeof data.manifest === 'object' && data.manifest.manifestId) {
              manifest = data.manifest.manifestId;
            } else if (typeof data.manifest === 'object' && data.manifest.manifestationType) {
              manifest = data.manifest.manifestationType;
            }
          } else if (data.manifestationType) {
            manifest = data.manifestationType;
          } else if (studentData?.manifest) {
            if (typeof studentData.manifest === 'string') {
              manifest = studentData.manifest;
            } else if (typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
              manifest = studentData.manifest.manifestId;
            }
          } else if (studentData?.manifestationType) {
            manifest = studentData.manifestationType;
          }
          
          // Get XP from both sources and use the higher value
          const userXP = data.xp || 0;
          const studentXP = studentData?.xp || 0;
          const xp = Math.max(userXP, studentXP);
          
          // Calculate level from XP to ensure accuracy
          const level = getLevelFromXP(xp);
          
          return {
            uid: doc.id,
            displayName: data.displayName || studentData?.displayName || data.email?.split('@')[0] || 'Unknown',
            email: data.email || '',
            photoURL: data.photoURL || studentData?.photoURL,
            level: level,
            xp: xp,
            manifest: manifest
          };
        });

        // Find current user's squad members
        const squadsSnapshot = await getDocs(collection(db, 'squads'));
        let userSquadMembers: Player[] = [];
        
        squadsSnapshot.docs.forEach(doc => {
          const squadData = doc.data();
          if (squadData.members && Array.isArray(squadData.members)) {
            const isUserInSquad = squadData.members.some((member: any) => member.uid === currentUser.uid);
            if (isUserInSquad) {
              // Get all members of this squad (excluding current user)
              squadData.members.forEach((member: any) => {
                if (member.uid !== currentUser.uid) {
                  // Find the user in allUsers (which already has accurate level calculated from XP)
                  const userData = allUsers.find(u => u.uid === member.uid);
                  if (userData && !currentPlayers.includes(member.uid)) {
                    userSquadMembers.push(userData);
                  }
                }
              });
            }
          }
        });

        // Filter out current battle players and the current user
        const available = allUsers.filter(user => 
          !currentPlayers.includes(user.uid) && 
          user.uid !== currentUser.uid &&
          !userSquadMembers.some(sm => sm.uid === user.uid) // Don't duplicate squad members
        );

        setSquadMembers(userSquadMembers);
        setAvailablePlayers(available);

        // Fetch existing invitations for this battle
        const invitesQuery = query(
          collection(db, 'battleInvitations'),
          where('gameId', '==', gameId)
        );
        const invitesSnapshot = await getDocs(invitesQuery);
        const invitesData: Invitation[] = invitesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt
          } as Invitation;
        });
        setInvitations(invitesData);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, currentUser, gameId, currentPlayers]);

  const sendInvitation = async (player: Player) => {
    if (!currentUser) {
      alert('You must be logged in to send an invitation.');
      return;
    }

    // Check if there's already a pending invitation
    const existingInvitesQuery = query(
      collection(db, 'battleInvitations'),
      where('gameId', '==', gameId),
      where('toUserId', '==', player.uid),
      where('status', '==', 'pending')
    );
    const existingInvites = await getDocs(existingInvitesQuery);
    
    if (!existingInvites.empty) {
      alert(`An invitation has already been sent to ${player.displayName}.`);
      return;
    }

    setSendingInvites(prev => [...prev, player.uid]);
    
    try {
      // Fetch chapter and challenge info from battle room if not provided
      let finalChapterId = chapterId;
      let finalChapterName = chapterName;
      let finalChallengeId = challengeId;
      let finalChallengeName = challengeName;
      let finalChallengeNumber = challengeNumber;
      
      if (!finalChapterId || !finalChapterName || !finalChallengeId || !finalChallengeName) {
        try {
          const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
          const battleRoomDoc = await getDoc(battleRoomRef);
          
          if (battleRoomDoc.exists()) {
            const battleRoomData = battleRoomDoc.data();
            if (battleRoomData.chapterId && battleRoomData.chapterName) {
              finalChapterId = finalChapterId || battleRoomData.chapterId;
              finalChapterName = finalChapterName || battleRoomData.chapterName;
            }
            if (battleRoomData.challengeId && battleRoomData.challengeName) {
              finalChallengeId = finalChallengeId || battleRoomData.challengeId;
              finalChallengeName = finalChallengeName || battleRoomData.challengeName;
              finalChallengeNumber = finalChallengeNumber || battleRoomData.challengeNumber;
            }
          }
        } catch (error) {
          console.error('Error fetching chapter/challenge info from battle room:', error);
        }
      }

      const invitationData = {
        gameId,
        battleName,
        chapterId: finalChapterId || undefined,
        chapterName: finalChapterName || undefined,
        challengeId: finalChallengeId || undefined,
        challengeName: finalChallengeName || undefined,
        challengeNumber: finalChallengeNumber || undefined,
        fromUserId: currentUser.uid,
        fromUserName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        toUserId: player.uid,
        toUserName: player.displayName,
        status: 'pending' as const,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'battleInvitations'), invitationData);
      console.log(`Battle invitation sent to ${player.displayName} with ID: ${docRef.id}`);
      
      // Add to local state
      const newInvitation: Invitation = {
        id: docRef.id,
        ...invitationData,
        createdAt: new Date() // For local display
      } as Invitation;
      setInvitations(prev => [...prev, newInvitation]);
      
      alert(`✅ Invitation sent to ${player.displayName}!`);
      
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      let errorMessage = 'Failed to send invitation. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not have permission to send invitations.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      alert(errorMessage);
    } finally {
      setSendingInvites(prev => prev.filter(id => id !== player.uid));
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, 'battleInvitations', invitationId), {
        status: 'declined'
      });
      
      // Update local state
      setInvitations(prev => prev.map(inv => 
        inv.id === invitationId ? { ...inv, status: 'declined' as const } : inv
      ));
    } catch (error) {
      console.error('Error canceling invitation:', error);
    }
  };

  const isInvited = (playerId: string) => {
    return invitations.some(inv => inv.toUserId === playerId && inv.status === 'pending');
  };

  const isSendingInvite = (playerId: string) => {
    return sendingInvites.includes(playerId);
  };

  // Filter players based on search query
  const filteredSquadMembers = squadMembers.filter(player =>
    player.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    player.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAvailablePlayers = availablePlayers.filter(player =>
    player.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    player.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 40000
    }}
    onClick={onClose}
    >
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        padding: '2rem',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>
              Invite Players to Battle
            </h2>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Send invitations to join {battleName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="text"
            placeholder="Search players..."
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

        {/* Player List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          paddingRight: '0.5rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Loading players...
            </div>
          ) : (
            <>
              {/* Squad Members Section */}
              {filteredSquadMembers.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: '#3b82f6',
                    marginBottom: '1rem'
                  }}>
                    👥 Squad Members
                  </h3>
                  {filteredSquadMembers.map((player) => (
                    <div
                      key={player.uid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem',
                        marginBottom: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        backgroundColor: '#f3f4f6'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          backgroundColor: '#d1d5db',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem'
                        }}>
                          {player.photoURL ? (
                            <img src={player.photoURL} alt={player.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span>👤</span>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            {player.displayName}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            Lv.{player.level} • {player.manifest || 'Unknown'}
                          </div>
                        </div>
                      </div>
                      {isInvited(player.uid) ? (
                        <button
                          onClick={() => {
                            const inv = invitations.find(inv => inv.toUserId === player.uid && inv.status === 'pending');
                            if (inv) cancelInvitation(inv.id);
                          }}
                          style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => sendInvitation(player)}
                          disabled={isSendingInvite(player.uid)}
                          style={{
                            backgroundColor: isSendingInvite(player.uid) ? '#9ca3af' : '#10b981',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            cursor: isSendingInvite(player.uid) ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          {isSendingInvite(player.uid) ? 'Sending...' : 'Invite'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Available Players Section */}
              <div>
                {filteredSquadMembers.length > 0 && (
                  <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: '#6b7280',
                    marginBottom: '1rem'
                  }}>
                    All Players
                  </h3>
                )}
                {filteredAvailablePlayers.length > 0 ? (
                  filteredAvailablePlayers.map((player) => (
                    <div
                      key={player.uid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem',
                        marginBottom: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          backgroundColor: '#d1d5db',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem'
                        }}>
                          {player.photoURL ? (
                            <img src={player.photoURL} alt={player.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span>👤</span>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            {player.displayName}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            Lv.{player.level} • {player.manifest || 'Unknown'}
                          </div>
                        </div>
                      </div>
                      {isInvited(player.uid) ? (
                        <button
                          onClick={() => {
                            const inv = invitations.find(inv => inv.toUserId === player.uid && inv.status === 'pending');
                            if (inv) cancelInvitation(inv.id);
                          }}
                          style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => sendInvitation(player)}
                          disabled={isSendingInvite(player.uid)}
                          style={{
                            backgroundColor: isSendingInvite(player.uid) ? '#9ca3af' : '#10b981',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            cursor: isSendingInvite(player.uid) ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          {isSendingInvite(player.uid) ? 'Sending...' : 'Invite'}
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    {searchQuery ? 'No players found matching your search.' : 'No available players.'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BattleInviteModal;

