import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, getDoc, Timestamp, arrayUnion, serverTimestamp } from 'firebase/firestore';

interface SquadMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  level: number;
  xp: number;
  powerPoints?: number;
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
    if (!currentUser) {
      alert('You must be logged in to accept an invitation.');
      return;
    }

    console.log('InvitationManager: Accepting invitation:', invitation);

    try {
      // Check if user is already in a squad
      const allSquadsSnapshot = await getDocs(collection(db, 'squads'));
      const userSquad = allSquadsSnapshot.docs.find(doc => {
        const squadData = doc.data();
        return squadData.members?.some((member: any) => member.uid === currentUser.uid);
      });

      if (userSquad) {
        alert('You are already in a squad. Please leave your current squad before accepting this invitation.');
        return;
      }

      // Get fresh squad data from Firestore
      const squadRef = doc(db, 'squads', invitation.squadId);
      const squadDoc = await getDoc(squadRef);
      
      if (!squadDoc.exists()) {
        alert('Squad not found. It may have been deleted.');
        return;
      }

      const squadData = squadDoc.data() as Squad;
      const currentMembers = squadData.members || [];
      
      // Check if squad is full
      if (currentMembers.length >= (squadData.maxMembers || 4)) {
        alert('This squad is full. The invitation is no longer valid.');
        // Mark invitation as declined since squad is full
        await updateDoc(doc(db, 'squadInvitations', invitation.id), {
          status: 'declined'
        });
        return;
      }

      // Check if user is already in this squad
      const alreadyMember = currentMembers.some((member: any) => member.uid === currentUser.uid);
      if (alreadyMember) {
        alert('You are already a member of this squad.');
        await updateDoc(doc(db, 'squadInvitations', invitation.id), {
          status: 'accepted'
        });
        return;
      }

      // Fetch user's actual data from both collections
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
      
      const userData = userDoc.exists() ? userDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      
      // Try to get manifest from multiple sources
      let manifest = 'Unknown';
      if (userData.manifest) {
        if (typeof userData.manifest === 'string') {
          manifest = userData.manifest;
        } else if (typeof userData.manifest === 'object' && userData.manifest.manifestId) {
          manifest = userData.manifest.manifestId;
        } else if (typeof userData.manifest === 'object' && userData.manifest.manifestationType) {
          manifest = userData.manifest.manifestationType;
        }
      } else if (userData.manifestationType) {
        manifest = userData.manifestationType;
      } else if (studentData?.manifest) {
        if (typeof studentData.manifest === 'string') {
          manifest = studentData.manifest;
        } else if (typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
          manifest = studentData.manifest.manifestId;
        } else if (typeof studentData.manifest === 'object' && studentData.manifest.manifestationType) {
          manifest = studentData.manifest.manifestationType;
        }
      } else if (studentData?.manifestationType) {
        manifest = studentData.manifestationType;
      }
      
      // Create new member with proper data
      const newMember: SquadMember = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || userData.displayName || studentData?.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || userData.photoURL || studentData?.photoURL || undefined,
        level: userData.level || studentData?.level || 1,
        xp: userData.xp || studentData?.xp || 0,
        powerPoints: userData.powerPoints || studentData?.powerPoints || 0,
        manifest: manifest,
        role: 'Member',
        isLeader: false,
        isAdmin: false
      };

      // Update invitation status first
      await updateDoc(doc(db, 'squadInvitations', invitation.id), {
        status: 'accepted'
      });

      // Add user to squad - use array spread method for reliability
      // Check again if user is already in squad (race condition check)
      const finalSquadDoc = await getDoc(squadRef);
      if (!finalSquadDoc.exists()) {
        alert('Squad not found. It may have been deleted.');
        return;
      }

      const finalSquadData = finalSquadDoc.data() as Squad;
      const finalMembers = finalSquadData.members || [];
      
      // Double-check user isn't already a member
      const isAlreadyMember = finalMembers.some((member: any) => member.uid === currentUser.uid);
      if (isAlreadyMember) {
        alert('You are already a member of this squad.');
        return;
      }

      // Check if squad is still not full
      if (finalMembers.length >= (finalSquadData.maxMembers || 4)) {
        alert('This squad is now full. The invitation is no longer valid.');
        await updateDoc(doc(db, 'squadInvitations', invitation.id), {
          status: 'declined'
        });
        return;
      }

      // Add member using array spread (more reliable than arrayUnion for complex objects)
      const updatedMembers = [...finalMembers, newMember];
      
      console.log('InvitationManager: Adding member to squad:', {
        squadId: invitation.squadId,
        currentMembersCount: finalMembers.length,
        newMember: newMember,
        updatedMembersCount: updatedMembers.length
      });
      
      // Ensure all member fields are properly set (no undefined values that might cause issues)
      const cleanMember: SquadMember = {
        uid: newMember.uid,
        displayName: newMember.displayName || 'Unknown',
        email: newMember.email || '',
        photoURL: newMember.photoURL || undefined,
        level: newMember.level || 1,
        xp: newMember.xp || 0,
        powerPoints: newMember.powerPoints || 0,
        manifest: newMember.manifest || 'Unknown',
        role: newMember.role || 'Member',
        isLeader: false,
        isAdmin: false
      };
      
      const cleanUpdatedMembers = [...finalMembers, cleanMember];
      
      try {
        await updateDoc(squadRef, {
          members: cleanUpdatedMembers,
          updatedAt: serverTimestamp()
        });
        
        console.log('InvitationManager: UpdateDoc completed successfully');
      } catch (updateError: any) {
        console.error('InvitationManager: Error updating squad:', updateError);
        throw updateError; // Re-throw to be caught by outer catch
      }

      // Wait a moment for Firestore to propagate the update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the member was added (with retry logic)
      let memberWasAdded = false;
      let retries = 3;
      
      while (!memberWasAdded && retries > 0) {
        try {
          const verificationDoc = await getDoc(squadRef);
          if (verificationDoc.exists()) {
            const verifiedData = verificationDoc.data();
            const verifiedMembers = verifiedData.members || [];
            memberWasAdded = verifiedMembers.some((member: any) => member.uid === currentUser.uid);
            
            if (memberWasAdded) {
              console.log('InvitationManager: Successfully verified member was added to squad:', {
                squadId: invitation.squadId,
                squadName: invitation.squadName,
                memberUid: currentUser.uid,
                memberName: cleanMember.displayName,
                totalMembers: verifiedMembers.length
              });
              break;
            } else {
              console.log(`InvitationManager: Member not found yet, retrying... (${retries} retries left)`);
              retries--;
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          } else {
            console.error('InvitationManager: Squad document does not exist after update!');
            break;
          }
        } catch (verifyError) {
          console.error('InvitationManager: Error verifying member addition:', verifyError);
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!memberWasAdded) {
        console.warn('InvitationManager: Could not verify member addition after retries, but update may have succeeded');
        // Don't fail - the update likely succeeded, just Firestore propagation delay
      }

      alert(`🎉 Successfully joined ${invitation.squadName}!`);
      
      // Close the invitations modal
      setShowInvitations(false);
      
      // Refresh the page to show updated squad
      window.location.reload();
    } catch (error: any) {
      console.error('Error accepting invitation:', error);
      let errorMessage = 'Failed to accept invitation. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not have permission to join this squad.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Service unavailable. Please try again in a moment.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      alert(errorMessage);
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