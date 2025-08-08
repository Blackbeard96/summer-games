import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, getDoc, Timestamp } from 'firebase/firestore';

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

interface Squad {
  id: string;
  name: string;
  members: SquadMember[];
  leader: string;
  createdAt: Date;
  description?: string;
  maxMembers: number;
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

const InvitationManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [showInvitations, setShowInvitations] = useState(false);

  // Listen for incoming invitations
  useEffect(() => {
    if (!currentUser) return;

    console.log('InvitationManager: Setting up invitation listener for user:', currentUser.uid);

    const invitesQuery = query(
      collection(db, 'squadInvitations'),
      where('toUserId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      console.log('InvitationManager: Invitation snapshot received, docs:', snapshot.docs.length);
      
      const invitations: Invitation[] = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('InvitationManager: Invitation data:', { id: doc.id, ...data });
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt
        } as Invitation;
      });
      
      console.log('InvitationManager: Setting pending invitations:', invitations.length);
      setPendingInvitations(invitations);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const acceptInvitation = async (invitation: Invitation) => {
    if (!currentUser) return;

    console.log('InvitationManager: Accepting invitation:', invitation);

    try {
      // Update invitation status
      console.log('InvitationManager: Updating invitation status to accepted');
      await updateDoc(doc(db, 'squadInvitations', invitation.id), {
        status: 'accepted'
      });

      // Get squad data
      console.log('InvitationManager: Getting squad data for squadId:', invitation.squadId);
      const squadDoc = await getDoc(doc(db, 'squads', invitation.squadId));
      if (!squadDoc.exists()) {
        console.error('InvitationManager: Squad not found');
        return;
      }

      const squadData = squadDoc.data() as Squad;
      console.log('InvitationManager: Squad data retrieved:', squadData);
      
      // Add user to squad
      const newMember: SquadMember = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || undefined,
        level: 1, // Will be fetched from user data
        xp: 0,
        manifest: 'Unknown',
        role: 'Member',
        isLeader: false,
        isAdmin: false
      };

      await updateDoc(doc(db, 'squads', invitation.squadId), {
        members: [...squadData.members, newMember]
      });

      console.log(`Accepted invitation to ${invitation.squadName}`);
    } catch (error) {
      console.error('Error accepting invitation:', error);
    }
  };

  const declineInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, 'squadInvitations', invitationId), {
        status: 'declined'
      });
      console.log('Invitation declined');
    } catch (error) {
      console.error('Error declining invitation:', error);
    }
  };

  if (pendingInvitations.length === 0) return null;

  return (
    <>
      {/* Invitation Badge */}
      <div style={{
        position: 'fixed',
        top: '100px',
        right: '20px',
        zIndex: 1000
      }}>
        <button
          onClick={() => setShowInvitations(true)}
          style={{
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '60px',
            height: '60px',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            position: 'relative'
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>📬</div>
          {pendingInvitations.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 'bold'
            }}>
              {pendingInvitations.length}
            </div>
          )}
        </button>
      </div>

      {/* Invitations Modal */}
      {showInvitations && (
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
          zIndex: 1001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
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
                  Squad Invitations
                </h2>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  You have {pendingInvitations.length} pending invitation{pendingInvitations.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowInvitations(false)}
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

            {/* Invitations List */}
            <div style={{ display: 'grid', gap: '1rem' }}>
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} style={{
                  padding: '1.5rem',
                  backgroundColor: '#fef3c7',
                  borderRadius: '0.5rem',
                  border: '1px solid #f59e0b'
                }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>
                      Invitation to {invitation.squadName}
                    </h3>
                    <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                      From: {invitation.fromUserName}
                    </p>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: '0.875rem' }}>
                      Sent: {invitation.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      onClick={() => acceptInvitation(invitation)}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        flex: 1
                      }}
                    >
                      Accept Invitation
                    </button>
                    <button
                      onClick={() => declineInvitation(invitation.id)}
                      style={{
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        flex: 1
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
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
                onClick={() => setShowInvitations(false)}
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
      )}
    </>
  );
};

export default InvitationManager; 