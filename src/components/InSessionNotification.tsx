import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, doc, getDoc, updateDoc, arrayUnion, serverTimestamp, getDocs } from 'firebase/firestore';

interface InSessionRoom {
  id: string;
  classId: string;
  className: string;
  status: 'open' | 'active' | 'closed';
  players: Array<{
    userId: string;
    displayName: string;
    photoURL?: string;
    level: number;
    powerPoints: number;
    participationCount: number;
    movesEarned: number;
  }>;
  activeViewers?: string[]; // Array of user IDs who are actively viewing the session
  createdAt: any;
  startedAt: any;
}

const InSessionNotification: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSession, setActiveSession] = useState<InSessionRoom | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isInSession, setIsInSession] = useState(false);

  // Get user's classrooms and listen for active sessions
  useEffect(() => {
    if (!currentUser) {
      setActiveSession(null);
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;
    let userClassroomsCache: string[] = [];

    // Function to get user's classrooms
    const getUserClassrooms = async (userId: string): Promise<string[]> => {
      try {
        const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
        const userClassrooms = classroomsSnapshot.docs
          .filter(doc => {
            const classData = doc.data();
            return (classData.students || []).includes(userId);
          })
          .map(doc => doc.id);
        
        console.log('[InSessionNotification] User classrooms:', {
          userId,
          classrooms: userClassrooms,
          count: userClassrooms.length
        });
        
        return userClassrooms;
      } catch (error) {
        console.error('[InSessionNotification] Error fetching user classrooms:', error);
        return [];
      }
    };

    // Function to check for active sessions (used by both listener and polling)
    const checkForActiveSessions = async (userId: string) => {
      try {
        // Always refresh user classrooms cache on first check or periodically
        // This ensures we pick up classroom changes immediately
        const shouldRefreshClassrooms = userClassroomsCache.length === 0 || 
          (Math.random() < 0.15); // 15% chance to refresh on each check
        
        if (shouldRefreshClassrooms) {
          console.log('[InSessionNotification] Refreshing user classrooms cache...');
          try {
            userClassroomsCache = await getUserClassrooms(userId);
            console.log('[InSessionNotification] User classrooms after refresh:', {
              userId,
              classrooms: userClassroomsCache,
              count: userClassroomsCache.length
            });
          } catch (classroomError) {
            // Suppress Firestore internal assertion errors
            if (classroomError instanceof Error && 
                (classroomError.message?.includes('INTERNAL ASSERTION FAILED') || 
                 classroomError.message?.includes('Unexpected state'))) {
              console.log('[InSessionNotification] Firestore error suppressed, using cached classrooms');
            } else {
              console.error('[InSessionNotification] Error refreshing classrooms:', classroomError);
            }
          }
        }

        // Get all active sessions
        let sessionsSnapshot;
        try {
          sessionsSnapshot = await getDocs(query(
            collection(db, 'inSessionRooms'),
            where('status', '==', 'active')
          ));
        } catch (queryError) {
          // Suppress Firestore internal assertion errors
          if (queryError instanceof Error && 
              (queryError.message?.includes('INTERNAL ASSERTION FAILED') || 
               queryError.message?.includes('Unexpected state'))) {
            console.log('[InSessionNotification] Firestore query error suppressed, skipping check');
            return; // Skip this check if there's a Firestore error
          }
          throw queryError; // Re-throw if it's a different error
        }

        console.log('[InSessionNotification] Found active sessions:', sessionsSnapshot.size);

        if (!sessionsSnapshot.empty) {
          // Get all active sessions
          const allSessions = sessionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as InSessionRoom));

          console.log('[InSessionNotification] All active sessions:', allSessions.map(s => ({
            id: s.id,
            classId: s.classId,
            className: s.className,
            playersCount: s.players?.length || 0,
            playerIds: s.players?.map((p: any) => p.userId) || []
          })));

          // Filter to sessions in user's classrooms
          // If user has no classrooms in cache, check all sessions (fallback for data inconsistency)
          // This ensures the notification shows even if classroom data is temporarily unavailable
          let userSessions: InSessionRoom[] = [];
          
          if (userClassroomsCache.length > 0) {
            // Filter by user's classrooms
            userSessions = allSessions.filter(session => userClassroomsCache.includes(session.classId));
            console.log('[InSessionNotification] Filtered by classrooms:', {
              userClassrooms: userClassroomsCache,
              filteredCount: userSessions.length,
              allSessionsCount: allSessions.length
            });
            
            // If no sessions found in user's classrooms, check all sessions as fallback
            // This handles cases where classroom data might be inconsistent
            if (userSessions.length === 0 && allSessions.length > 0) {
              console.log('[InSessionNotification] No sessions in user classrooms, checking all sessions as fallback');
              userSessions = allSessions;
            }
          } else {
            // No classrooms found - check all sessions as fallback
            // This handles cases where classroom data might be inconsistent or not yet loaded
            console.log('[InSessionNotification] No classrooms in cache, checking all active sessions as fallback');
            userSessions = allSessions;
          }

          console.log('[InSessionNotification] User sessions (filtered):', {
            userSessions: userSessions.map(s => ({
              id: s.id,
              classId: s.classId,
              className: s.className,
              playersCount: s.players?.length || 0
            })),
            userClassrooms: userClassroomsCache,
            allSessionsCount: allSessions.length,
            filteredCount: userSessions.length
          });

          if (userSessions.length > 0) {
            // Get the most recently started session
            const latestSession = userSessions.sort((a, b) => {
              const aTime = a.startedAt?.toMillis?.() || 0;
              const bTime = b.startedAt?.toMillis?.() || 0;
              return bTime - aTime;
            })[0];

            // Check if user is in the session players list
            const userInSession = latestSession.players?.some(p => p.userId === userId) || false;
            
            // Check if user is actively viewing the session page
            // This is the PRIMARY check - if user is on the session page, hide notification
            const isOnSessionPage = location.pathname.startsWith(`/in-session/${latestSession.id}`);
            const activeViewers = latestSession.activeViewers || [];
            const userIsInActiveViewers = activeViewers.includes(userId);
            
            console.log('[InSessionNotification] Session check:', {
              sessionId: latestSession.id,
              className: latestSession.className,
              classId: latestSession.classId,
              userInSession,
              isOnSessionPage,
              userIsInActiveViewers,
              currentPath: location.pathname,
              playersCount: latestSession.players?.length || 0,
              activeViewersCount: activeViewers.length,
              currentUserId: userId,
              playerIds: latestSession.players?.map((p: any) => p.userId) || [],
              activeViewerIds: activeViewers
            });
            
            setIsInSession(userInSession);

            // PRIMARY RULE: If user is on the session page, ALWAYS hide the notification
            // This prevents the notification from flickering or reappearing when the user is already viewing the session
            if (isOnSessionPage) {
              console.log('[InSessionNotification] ❌ Hiding notification - user is on session page');
              setActiveSession(null);
              return; // Exit early - don't check anything else
            }

            // SECONDARY RULES: Only show notification if user is NOT on the session page
            // Show notification if:
            // 1. User is NOT in the session players list (hasn't joined) - show "Join Session"
            // 2. User is in the session but NOT on the session page (left the session view) - show "Rejoin Session"
            if (!userInSession) {
              // User hasn't joined the session - show notification to join
              console.log('[InSessionNotification] ✅ Showing join notification - user not in session', {
                sessionId: latestSession.id,
                userId,
                playerIds: latestSession.players?.map((p: any) => p.userId) || []
              });
              setActiveSession(latestSession);
            } else {
              // User is in session but NOT on the session page - show notification to rejoin
              console.log('[InSessionNotification] ✅ Showing rejoin notification - user not on session page');
              setActiveSession(latestSession);
            }
          } else {
            console.log('[InSessionNotification] No sessions found for user classrooms');
            setActiveSession(null);
            setIsInSession(false);
          }
        } else {
          console.log('[InSessionNotification] No active sessions found');
          setActiveSession(null);
          setIsInSession(false);
        }
      } catch (error) {
        // Suppress Firestore internal assertion errors
        if (error instanceof Error && 
            (error.message?.includes('INTERNAL ASSERTION FAILED') || 
             error.message?.includes('Unexpected state'))) {
          console.log('[InSessionNotification] Firestore error suppressed in checkForActiveSessions');
          return; // Skip this check if there's a Firestore error
        }
        console.error('[InSessionNotification] Error checking for sessions:', error);
        // Don't clear activeSession on error - keep showing if we had one
        // This ensures the notification persists even if there's a temporary error
      }
    };

    const setupSessionListener = async () => {
      try {
        // Get user's classrooms and cache them
        userClassroomsCache = await getUserClassrooms(currentUser.uid);

        console.log('[InSessionNotification] Setup complete:', {
          userId: currentUser.uid,
          userEmail: currentUser.email,
          classrooms: userClassroomsCache,
          classroomCount: userClassroomsCache.length
        });

        // Even if user has no classrooms, still check for sessions (in case of data inconsistency)
        // Initial check immediately (don't await - fire and forget to avoid blocking)
        console.log('[InSessionNotification] Performing initial session check...');
        checkForActiveSessions(currentUser.uid).catch(err => {
          console.error('[InSessionNotification] Error in initial check:', err);
        });

        // Set up polling as the ONLY mechanism (every 1.5 seconds for faster updates)
        // Disabled real-time listener to avoid Firestore internal assertion errors
        pollInterval = setInterval(() => {
          checkForActiveSessions(currentUser.uid).catch(err => {
            // Suppress Firestore internal assertion errors
            if (err instanceof Error && 
                (err.message?.includes('INTERNAL ASSERTION FAILED') || 
                 err.message?.includes('Unexpected state'))) {
              return;
            }
            console.error('[InSessionNotification] Error in polling check:', err);
          });
        }, 1500);

        // Real-time listener disabled to prevent Firestore internal assertion errors
        // Polling is more reliable and doesn't cause these errors
      } catch (error) {
        console.error('[InSessionNotification] Error setting up session listener:', error);
        // Still set up polling even if listener setup fails
        // Initial check immediately
        checkForActiveSessions(currentUser.uid).catch(err => {
          console.error('[InSessionNotification] Error in initial check (fallback):', err);
        });
        pollInterval = setInterval(() => {
          checkForActiveSessions(currentUser.uid).catch(err => {
            console.error('[InSessionNotification] Error in polling check (fallback):', err);
          });
        }, 1500);
      }
    };

    setupSessionListener();

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [currentUser, location]); // Use location object instead of location.pathname to ensure re-evaluation on route changes

  const handleJoinSession = async () => {
    if (!currentUser || !activeSession || isJoining) return;

    setIsJoining(true);
    try {
      // Get user data
      const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const userData = userDoc.exists() ? userDoc.data() : {};

      const newPlayer = {
        userId: currentUser.uid,
        displayName: userData.displayName || studentData.displayName || currentUser.displayName || 'Unknown',
        photoURL: userData.photoURL || studentData.photoURL || currentUser.photoURL,
        level: studentData.level || 1,
        powerPoints: studentData.powerPoints || 0,
        participationCount: 0,
        movesEarned: 0
      };

      // Add player to session and mark as active viewer
      const sessionRef = doc(db, 'inSessionRooms', activeSession.id);
      await updateDoc(sessionRef, {
        players: arrayUnion(newPlayer),
        activeViewers: arrayUnion(currentUser.uid), // Add to active viewers when joining
        updatedAt: serverTimestamp()
      });

      // Update battle log
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        const updatedLog = [...(data.battleLog || []), `👋 ${newPlayer.displayName} joined the session!`];
        await updateDoc(sessionRef, {
          battleLog: updatedLog
        });
      }

      // Navigate to session battle view
      navigate(`/in-session/${activeSession.id}`);
    } catch (error) {
      // Suppress Firestore internal assertion errors (known issue)
      if (error instanceof Error && 
          (error.message?.includes('INTERNAL ASSERTION FAILED') || 
           error.message?.includes('Unexpected state'))) {
        // Still navigate even if there's an internal assertion error
        navigate(`/in-session/${activeSession.id}`);
        return;
      }
      console.error('Error joining session:', error);
      alert('Failed to join session. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleDismiss = () => {
    // Don't allow dismissing - notification stays active as long as session is active
    // This ensures students always see when their class is in session
  };

  if (!activeSession) {
    return null;
  }

  // Always render the notification if there's an active session
  // This ensures it's visible even if there are temporary state issues
  console.log('[InSessionNotification] Rendering notification:', {
    sessionId: activeSession.id,
    className: activeSession.className,
    isInSession,
    isJoining,
    playersCount: activeSession.players?.length || 0,
    currentUserId: currentUser?.uid
  });

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: 10000,
      maxWidth: '400px',
      width: '90%',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: '0 10px 25px rgba(139, 92, 246, 0.4)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        color: 'white'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontSize: '2rem' }}>📚</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
                {isInSession ? '📚 Rejoin Session' : '📚 Class In Session - Join Now!'}
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', opacity: 0.9 }}>
                {activeSession.className} - {activeSession.players.length} player{activeSession.players.length !== 1 ? 's' : ''} {isInSession ? 'in session' : 'joined'}
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={isInSession ? () => navigate(`/in-session/${activeSession.id}`) : handleJoinSession}
            disabled={isJoining}
            style={{
              flex: 1,
              background: 'white',
              color: '#8b5cf6',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: isJoining ? 'not-allowed' : 'pointer',
              opacity: isJoining ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {isJoining ? 'Joining...' : isInSession ? '🎮 Rejoin Session' : '🎮 Join Session'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default InSessionNotification;

