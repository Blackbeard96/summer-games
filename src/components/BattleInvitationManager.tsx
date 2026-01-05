import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDoc, Timestamp, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { joinBattleSession } from '../utils/battleSessionManager';
import { BattleSession, BattleParticipant } from '../types/battleSession';
import { sanitizeFirestoreData } from '../utils/firestoreSanitizer';

interface BattleInvitation {
  id: string;
  gameId: string;
  battleName: string;
  chapterId?: number;
  chapterName?: string;
  challengeId?: string;
  challengeName?: string;
  challengeNumber?: number; // e.g., 2 for Chapter 2-2, 3 for Chapter 2-3
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
}

const BattleInvitationManager: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [pendingInvitations, setPendingInvitations] = useState<BattleInvitation[]>([]);
  const [showingInvitation, setShowingInvitation] = useState<BattleInvitation | null>(null);

  // Listen for incoming battle invitations
  useEffect(() => {
    if (!currentUser) return;

    console.log('BattleInvitationManager: Setting up invitation listener for user:', currentUser.uid);

    const invitesQuery = query(
      collection(db, 'battleInvitations'),
      where('toUserId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    // Helper to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815');
    };

    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      try {
        console.log('BattleInvitationManager: Invitation snapshot received, docs:', snapshot.docs.length);
        
        const invitations: BattleInvitation[] = snapshot.docs.map(doc => {
          const data = doc.data();
          console.log('BattleInvitationManager: Invitation data:', { id: doc.id, ...data });
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt
          } as BattleInvitation;
        });
        
        console.log('BattleInvitationManager: Setting pending invitations:', invitations.length);
        setPendingInvitations(invitations);
        
        // Show the most recent invitation
        if (invitations.length > 0) {
          const mostRecent = invitations.sort((a, b) => 
            b.createdAt.getTime() - a.createdAt.getTime()
          )[0];
          setShowingInvitation(mostRecent);
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          return; // Suppress Firestore internal errors
        }
        console.error('BattleInvitationManager: Error processing invitation snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        return; // Suppress Firestore internal errors
      }
      console.error('BattleInvitationManager: Error in invitation listener:', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const acceptInvitation = async (invitation: BattleInvitation) => {
    if (!currentUser) {
      alert('You must be logged in to accept an invitation.');
      return;
    }

      console.log('BattleInvitationManager: Accepting invitation:', invitation);

    try {
      const battleId = invitation.gameId;
      
      if (!battleId) {
        throw new Error('Battle ID is missing from invitation');
      }
      
      if (!currentUser?.uid) {
        throw new Error('User ID is missing');
      }
      
      console.log('✅ BattleInvitationManager: Validating battle session exists:', battleId);
      
      // Check if battle session exists
      const battleSessionRef = doc(db, 'battleSessions', battleId);
      const battleSessionDoc = await getDoc(battleSessionRef);
      
      if (!battleSessionDoc.exists()) {
        console.error('❌ BattleInvitationManager: Battle session does not exist:', battleId);
        alert('This battle has ended or no longer exists.');
        await updateDoc(doc(db, 'battleInvitations', invitation.id), {
          status: 'declined'
        });
        setShowingInvitation(null);
        return;
      }
      
      console.log('✅ BattleInvitationManager: Battle session exists');

      const battleSession = battleSessionDoc.data() as BattleSession;
      const currentParticipants = battleSession.participants || [];
      
      // Check if battle is full (max 4 players)
      if (currentParticipants.length >= 4) {
        alert('This battle is full. The invitation is no longer valid.');
        await updateDoc(doc(db, 'battleInvitations', invitation.id), {
          status: 'declined'
        });
        setShowingInvitation(null);
        return;
      }

      // Check if user is already in this battle
      if (currentParticipants.some((p: BattleParticipant) => p.uid === currentUser.uid)) {
        alert('You are already in this battle.');
        await updateDoc(doc(db, 'battleInvitations', invitation.id), {
          status: 'accepted'
        });
        setShowingInvitation(null);
        return;
      }

      // Update invitation status AFTER successful join (moved to end of function)
      // We'll update it after the join succeeds

      // Get user data for joining
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const { getLevelFromXP } = await import('../utils/leveling');
      const playerLevel = getLevelFromXP(studentData.xp || 0);
      
      // Get vault data for ally creation
      let vaultData: any = null;
      try {
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        const vaultDoc = await getDoc(vaultRef);
        if (vaultDoc.exists()) {
          vaultData = vaultDoc.data();
        }
      } catch (error) {
        console.warn('BattleInvitationManager: Could not fetch vault data:', error);
      }
      
      // Prepare vault stats
      const maxPP = vaultData?.capacity || 1000;
      const currentPP = vaultData?.currentPP || studentData.powerPoints || 0;
      const shieldStrength = vaultData?.shieldStrength || 0;
      const maxShieldStrength = vaultData?.maxShieldStrength || 100;
      const maxVaultHealth = Math.floor(maxPP * 0.1);
      const currentVaultHealth = vaultData?.vaultHealth !== undefined 
        ? Math.min(vaultData.vaultHealth, maxVaultHealth)
        : Math.min(currentPP, maxVaultHealth);
      
      // Prepare participant data - ensure no undefined values
      const displayName = studentData.displayName || currentUser.displayName || 'Player';
      const photoURL = studentData.photoURL || currentUser.photoURL || undefined; // Will be filtered out if undefined
      
      // Debug log before joining
      console.log('BattleInvitationManager: Joining battle session with data:', {
        uid: currentUser.uid,
        displayName,
        photoURL: photoURL || '(not provided)',
        level: playerLevel,
        currentPP,
        maxPP,
        shieldStrength,
        maxShieldStrength,
        currentVaultHealth,
        maxVaultHealth
      });
      
      // Join battle session with vault data
      console.log('✅ BattleInvitationManager: Calling joinBattleSession...');
      try {
        await joinBattleSession(battleId, {
          uid: currentUser.uid,
          displayName,
          ...(photoURL && { photoURL }), // Only include if defined
          level: playerLevel,
          currentPP,
          maxPP,
          shieldStrength,
          maxShieldStrength,
          currentVaultHealth,
          maxVaultHealth
        });
        console.log('✅ BattleInvitationManager: joinBattleSession completed successfully');
      } catch (joinError: any) {
        console.error('❌ BattleInvitationManager: joinBattleSession failed:', joinError);
        console.error('❌ joinBattleSession error details:', {
          message: joinError?.message,
          code: joinError?.code,
          stack: joinError?.stack
        });
        throw joinError; // Re-throw to be caught by outer catch
      }
      
      // Also add to islandRaidBattleRooms for backward compatibility
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', battleId);
      const battleRoomDoc = await getDoc(battleRoomRef);
      
      if (battleRoomDoc.exists()) {
        // Build player object with no undefined values
        const newPlayerRaw: any = {
          id: currentUser.uid,
          name: studentData.displayName || currentUser.displayName || 'Player',
          currentPP: studentData.powerPoints || 0,
          maxPP: 1000,
          shieldStrength: 0,
          maxShieldStrength: 0,
          level: playerLevel,
          isPlayer: true
        };
        
        // Only add avatar if it exists
        const avatar = studentData.photoURL || currentUser.photoURL || '👤';
        if (avatar) {
          newPlayerRaw.avatar = avatar;
        }
        
        // Sanitize before writing
        const newPlayer = sanitizeFirestoreData(newPlayerRaw);
        
        console.log('BattleInvitationManager: Adding to islandRaidBattleRooms:', JSON.stringify(newPlayer));
        
        await updateDoc(battleRoomRef, {
          players: arrayUnion(currentUser.uid),
          allies: arrayUnion(newPlayer),
          updatedAt: serverTimestamp()
        });
      }

      // Wait a moment to ensure the update is processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the player was added to battle session
      const verifyDoc = await getDoc(battleSessionRef);
      if (verifyDoc.exists()) {
        const verifyData = verifyDoc.data() as BattleSession;
        const participants = verifyData.participants || [];
        if (!participants.some((p: BattleParticipant) => p.uid === currentUser.uid)) {
          console.error('BattleInvitationManager: Player was not added to battle session');
          // Player should have been added by joinBattleSession, but if not, log error
          console.warn('BattleInvitationManager: Retrying join...');
          await joinBattleSession(battleId, {
            uid: currentUser.uid,
            displayName: studentData.displayName || currentUser.displayName || 'Player',
            photoURL: studentData.photoURL || currentUser.photoURL,
            level: playerLevel
          });
        } else {
          console.log('✅ BattleInvitationManager: Player successfully joined battle session');
        }
      }

      // Update invitation status to accepted AFTER successful join
      await updateDoc(doc(db, 'battleInvitations', invitation.id), {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });

      // Close the invitation modal
      setShowingInvitation(null);

      // Check if this is a chapter battle
      if (battleSession.chapterId) {
        // Use challenge info from invitation or battle session
        const challengeId = invitation.challengeId || battleSession.challengeId;
        const challengeName = invitation.challengeName || battleSession.challengeName;
        const challengeNumber = invitation.challengeNumber || battleSession.challengeNumber;
        
        // Fallback: Determine which challenge this battle belongs to based on gameId pattern
        let finalChallengeId = challengeId;
        if (!finalChallengeId) {
          if (invitation.gameId.includes('ch2-2-battle')) {
            finalChallengeId = 'ch2-rival-selection'; // Chapter 2-2
          } else if (invitation.gameId.includes('chapter2-3')) {
            finalChallengeId = 'ch2-team-trial'; // Chapter 2-3
          }
        }

        // Store battle info in sessionStorage for ChapterDetail to pick up
        if (finalChallengeId) {
          sessionStorage.setItem('joinBattle', JSON.stringify({
            gameId: invitation.gameId,
            challengeId: finalChallengeId,
            challengeName: challengeName,
            challengeNumber: challengeNumber,
            chapterId: battleSession.chapterId || invitation.chapterId || 2
          }));
        }

        // Navigate to chapters page - ChapterDetail will detect the sessionStorage and open the battle
        console.log('BattleInvitationManager: Navigating to chapters page for chapter battle');
        navigate('/chapters');
      } else {
        // Regular Island Raid battle - check if it's a battle room or game
        // Battle rooms use islandRaidBattleRooms, games use islandRaidGames
        // For now, most battles use battle rooms, so we'll navigate to a special route
        // or we can check the battle room and redirect accordingly
        console.log('BattleInvitationManager: Navigating to Island Raid battle:', invitation.gameId);
        
        // Check if this is a battle room (most common case)
        const battleRoomCheck = await getDoc(doc(db, 'islandRaidBattleRooms', invitation.gameId));
        if (battleRoomCheck.exists()) {
          // This is a battle room - we need to handle it differently
          // For now, store it in sessionStorage and navigate to a page that can handle it
          sessionStorage.setItem('joinIslandRaidBattle', JSON.stringify({
            gameId: invitation.gameId,
            battleName: invitation.battleName
          }));
          // Navigate to Island Raid page - it should detect and open the battle
          navigate('/island-raid');
        } else {
          // This is a regular game - navigate to the game route
          navigate(`/island-raid/game/${invitation.gameId}`);
        }
      }

    } catch (error: any) {
      console.error('❌ BattleInvitationManager: Error accepting battle invitation:', error);
      console.error('❌ Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        invitationId: invitation.id,
        gameId: invitation.gameId,
        userId: currentUser?.uid
      });
      
      // Show more detailed error message
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to join battle: ${errorMessage}. Please try again.`);
      
      // Update invitation status to declined on error
      try {
        await updateDoc(doc(db, 'battleInvitations', invitation.id), {
          status: 'declined'
        });
      } catch (updateError) {
        console.error('Error updating invitation status:', updateError);
      }
    }
  };

  const declineInvitation = async (invitation: BattleInvitation) => {
    try {
      await updateDoc(doc(db, 'battleInvitations', invitation.id), {
        status: 'declined'
      });
      setShowingInvitation(null);
    } catch (error) {
      console.error('Error declining invitation:', error);
    }
  };

  // Close invitation when it's no longer pending
  useEffect(() => {
    if (showingInvitation) {
      const stillPending = pendingInvitations.find(inv => inv.id === showingInvitation.id);
      if (!stillPending) {
        setShowingInvitation(null);
      }
    }
  }, [pendingInvitations, showingInvitation]);

  if (!showingInvitation) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      borderRadius: '1rem',
      padding: '2rem',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      zIndex: 10001,
      maxWidth: '400px',
      width: '90%',
      border: '3px solid #3b82f6'
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          fontSize: '3rem',
          marginBottom: '1rem'
        }}>
          ⚔️
        </div>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#1f2937'
        }}>
          Battle Invitation!
        </h2>
        <p style={{
          color: '#6b7280',
          marginBottom: '1rem'
        }}>
          {showingInvitation.fromUserName} invites you to join:
        </p>
        {showingInvitation.chapterId && showingInvitation.challengeName && (
          <div style={{
            backgroundColor: '#fef3c7',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            marginBottom: '0.75rem',
            border: '1px solid #fbbf24'
          }}>
            <div style={{
              fontSize: '0.875rem',
              color: '#92400e',
              fontWeight: 'bold'
            }}>
              📖 Chapter {showingInvitation.chapterId}{showingInvitation.challengeNumber ? `-${showingInvitation.challengeNumber}` : ''}: {showingInvitation.challengeName}
            </div>
          </div>
        )}
        <div style={{
          backgroundColor: '#eff6ff',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem'
        }}>
          <div style={{
            fontWeight: 'bold',
            color: '#1e40af',
            fontSize: '1.125rem'
          }}>
            {showingInvitation.battleName}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem'
      }}>
        <button
          onClick={() => declineInvitation(showingInvitation!)}
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '2px solid #e5e7eb',
            backgroundColor: 'white',
            color: '#6b7280',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          Decline
        </button>
        <button
          onClick={() => acceptInvitation(showingInvitation!)}
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: '#10b981',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#10b981';
          }}
        >
          Join Battle
        </button>
      </div>
    </div>
  );
};

export default BattleInvitationManager;

