import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, doc, addDoc, updateDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';

interface SquadMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  level: number;
  xp: number;
  manifest?: string;
  role?: string;
  isLeader?: boolean;
  isAdmin?: boolean;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  squadId: string;
  squadName: string;
  currentMembers: SquadMember[];
}

interface Invitation {
  id: string;
  squadId: string;
  squadName: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
}

const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  squadId,
  squadName,
  currentMembers
}) => {
  const { currentUser } = useAuth();
  const [availablePlayers, setAvailablePlayers] = useState<SquadMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingInvites, setSendingInvites] = useState<string[]>([]);

  // Fetch available players and existing invitations
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const allUsers: SquadMember[] = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            displayName: data.displayName || data.email?.split('@')[0] || 'Unknown',
            email: data.email || '',
            photoURL: data.photoURL,
            level: data.level || 1,
            xp: data.xp || 0,
            manifest: data.manifest || data.manifestationType,
            role: data.role || 'Member'
          };
        });

        // Filter out current squad members and the current user
        const currentMemberIds = currentMembers.map(member => member.uid);
        const available = allUsers.filter(user => 
          !currentMemberIds.includes(user.uid) && user.uid !== currentUser.uid
        );

        setAvailablePlayers(available);

        // Fetch existing invitations for this squad
        const invitesQuery = query(
          collection(db, 'squadInvitations'),
          where('squadId', '==', squadId)
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
  }, [isOpen, currentUser, squadId, currentMembers]);

  const sendInvitation = async (player: SquadMember) => {
    if (!currentUser) return;

    setSendingInvites(prev => [...prev, player.uid]);
    
    try {
      const invitationData = {
        squadId,
        squadName,
        fromUserId: currentUser.uid,
        fromUserName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        toUserId: player.uid,
        toUserName: player.displayName,
        status: 'pending' as const,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'squadInvitations'), invitationData);
      console.log(`Invitation sent to ${player.displayName} with ID: ${docRef.id}`);
      
      // Add to local state
      setInvitations(prev => [...prev, { id: docRef.id, ...invitationData } as Invitation]);
      
    } catch (error) {
      console.error('Error sending invitation:', error);
    } finally {
      setSendingInvites(prev => prev.filter(id => id !== player.uid));
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, 'squadInvitations', invitationId), {
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
      zIndex: 1000
    }}>
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
      }}>
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
              Invite Players to {squadName}
            </h2>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Send invitations to available players
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

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '1.5rem', color: '#6b7280' }}>Loading...</div>
            </div>
          ) : (
            <>
              {/* Available Players */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
                  Available Players ({availablePlayers.length})
                </h3>
                
                {availablePlayers.length > 0 ? (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {availablePlayers.map((player) => {
                      const invited = isInvited(player.uid);
                      const sending = isSendingInvite(player.uid);
                      
                      return (
                        <div key={player.uid} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '1rem',
                          backgroundColor: invited ? '#f0fdf4' : '#f9fafb',
                          borderRadius: '0.5rem',
                          border: invited ? '1px solid #22c55e' : '1px solid #e5e7eb'
                        }}>
                          <img
                            src={player.photoURL || '/default-avatar.png'}
                            alt={player.displayName}
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '50%',
                              objectFit: 'cover'
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold' }}>{player.displayName}</div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              Level {player.level} • {player.manifest || 'Unknown Manifest'}
                            </div>
                          </div>
                          
                          {invited ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <span style={{
                                backgroundColor: '#22c55e',
                                color: 'white',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '1rem',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}>
                                Invited
                              </span>
                              <button
                                onClick={() => {
                                  const invitation = invitations.find(inv => inv.toUserId === player.uid);
                                  if (invitation) {
                                    cancelInvitation(invitation.id);
                                  }
                                }}
                                style={{
                                  backgroundColor: '#dc2626',
                                  color: 'white',
                                  border: 'none',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '0.375rem',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => sendInvitation(player)}
                              disabled={sending}
                              style={{
                                backgroundColor: sending ? '#9ca3af' : '#4f46e5',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.375rem',
                                cursor: sending ? 'not-allowed' : 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: '500'
                              }}
                            >
                              {sending ? 'Sending...' : 'Invite'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#6b7280'
                  }}>
                    No available players found
                  </div>
                )}
              </div>

              {/* Pending Invitations */}
              {invitations.filter(inv => inv.status === 'pending').length > 0 && (
                <div style={{
                  marginTop: '1.5rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
                    Pending Invitations ({invitations.filter(inv => inv.status === 'pending').length})
                  </h3>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {invitations
                      .filter(inv => inv.status === 'pending')
                      .map((invitation) => (
                        <div key={invitation.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          backgroundColor: '#fef3c7',
                          borderRadius: '0.375rem',
                          border: '1px solid #f59e0b'
                        }}>
                          <div>
                            <div style={{ fontWeight: '500' }}>
                              Invitation sent to {invitation.toUserName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              Sent {invitation.createdAt.toLocaleDateString()}
                            </div>
                          </div>
                          <button
                            onClick={() => cancelInvitation(invitation.id)}
                            style={{
                              backgroundColor: '#dc2626',
                              color: 'white',
                              border: 'none',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteModal; 