import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { debug } from '../utils/debug';
import { endSession } from '../utils/inSessionService';
import {
  getClassroomIdsForEnrolledStudent,
  getLiveSessionSnapshotsForClassIds,
} from '../utils/classroomQueries';

interface InSessionRoom {
  id: string;
  classId: string;
  className: string;
  hostUid?: string;
  status: 'open' | 'active' | 'closed' | 'live' | 'ended';
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
  const { currentUser, isAdmin: isAdminUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSession, setActiveSession] = useState<InSessionRoom | null>(null);
  const isHostOfActiveSession = Boolean(activeSession?.hostUid && currentUser?.uid && activeSession.hostUid === currentUser.uid);
  const [isJoining, setIsJoining] = useState(false);
  const [isInSession, setIsInSession] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [dismissedSessionIds, setDismissedSessionIds] = useState<Set<string>>(new Set());
  const previousSessionIdRef = useRef<string | null>(null); // Track previous session ID to prevent unnecessary updates
  const previousMembershipRef = useRef<boolean | null>(null); // Track previous membership state to prevent flickering

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
        const userClassrooms = await getClassroomIdsForEnrolledStudent(userId);

        debug.once('user-classrooms-loaded', 'InSessionNotification', 'User classrooms loaded', {
          userId,
          classrooms: userClassrooms,
          count: userClassrooms.length
        });

        return userClassrooms;
      } catch (error) {
        debug.error('InSessionNotification', 'Error fetching user classrooms', error);
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
          debug.throttle('refresh-classrooms', 5000, 'InSessionNotification', 'Refreshing user classrooms cache');
          try {
            userClassroomsCache = await getUserClassrooms(userId);
            debug.throttle('classrooms-refreshed', 5000, 'InSessionNotification', 'User classrooms after refresh', {
              userId,
              classrooms: userClassroomsCache,
              count: userClassroomsCache.length
            });
          } catch (classroomError) {
            // Suppress Firestore internal assertion errors
            if (classroomError instanceof Error && 
                (classroomError.message?.includes('INTERNAL ASSERTION FAILED') || 
                 classroomError.message?.includes('Unexpected state'))) {
              debug.once('firestore-error-classrooms', 'InSessionNotification', 'Firestore error suppressed, using cached classrooms');
            } else {
              debug.error('InSessionNotification', 'Error refreshing classrooms', classroomError);
            }
          }
        }

        // Per-class queries only — collection-wide inSessionRooms + status fails rules for students
        let sessionDocs = [] as Awaited<ReturnType<typeof getLiveSessionSnapshotsForClassIds>>;
        try {
          const DEBUG_SESSION = process.env.REACT_APP_DEBUG_SESSION === 'true';
          if (DEBUG_SESSION) {
            debug.log('InSessionNotification', '🔍 Session discovery (per classId)', {
              classIds: userClassroomsCache,
              queryStatus: ['active', 'live'],
            });
          }

          sessionDocs = await getLiveSessionSnapshotsForClassIds(userClassroomsCache, ['active', 'live']);

          if (DEBUG_SESSION) {
            debug.log('InSessionNotification', '📊 Session discovery results', {
              totalSessions: sessionDocs.length,
              sessions: sessionDocs.map((d) => ({
                id: d.id,
                classId: d.data().classId,
                status: d.data().status,
                playersCount: d.data().players?.length || 0,
              })),
            });
          }
        } catch (queryError) {
          if (queryError instanceof Error &&
              (queryError.message?.includes('INTERNAL ASSERTION FAILED') ||
                queryError.message?.includes('Unexpected state'))) {
            debug.once('firestore-query-error', 'InSessionNotification', 'Firestore query error suppressed, skipping check');
            return;
          }
          if (
            queryError instanceof Error &&
            (queryError.message.includes('permission') || queryError.message.includes('Permission'))
          ) {
            debug.error('InSessionNotification', 'Session discovery permission error (check rules / deployment)', queryError);
            return;
          }
          throw queryError;
        }

        debug.throttle('active-sessions-count', 2000, 'InSessionNotification', 'Found active sessions', sessionDocs.length);

        if (sessionDocs.length > 0) {
          const allSessions = sessionDocs.map(
            (docSnap) =>
              ({
                id: docSnap.id,
                ...docSnap.data(),
              }) as InSessionRoom
          );

          debug.throttle('all-active-sessions-group', 2000, 'InSessionNotification', `All Active Sessions (${allSessions.length})`, {
            sessions: allSessions.map((s) => ({
              id: s.id,
              classId: s.classId,
              className: s.className,
              playersCount: s.players?.length || 0,
              playerIds: s.players?.map((p: any) => p.userId) || [],
            })),
          });

          const userSessions = allSessions;
          debug.throttle('filtered-classrooms', 2000, 'InSessionNotification', 'Filtered by classrooms', {
            userClassrooms: userClassroomsCache,
            filteredCount: userSessions.length,
            allSessionsCount: allSessions.length,
          });

          // Throttle group creation to prevent infinite nesting
          debug.throttle('user-sessions-group', 2000, 'InSessionNotification', `User Sessions (${userSessions.length})`, {
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
            // Check if user is on ANY of their class's live event session pages (not just the "latest" one)
            const pathMatch = location.pathname.match(/^\/live-events\/([^/]+)/) || location.pathname.match(/^\/in-session\/([^/]+)/);
            const pathSessionId = pathMatch?.[1] || null;
            const isOnSessionPage = pathSessionId != null && userSessions.some(s => s.id === pathSessionId);

            // Get the most recently started session (for showing join/rejoin when notification is visible)
            const latestSession = userSessions.sort((a, b) => {
              const aTime = a.startedAt?.toMillis?.() || 0;
              const bTime = b.startedAt?.toMillis?.() || 0;
              return bTime - aTime;
            })[0];

            // Check if user is in the session players list (STABLE CHECK - use actual Firestore data)
            const userInSession = latestSession.players?.some(p => p.userId === userId) || false;
            const activeViewers = latestSession.activeViewers || [];
            const userIsInActiveViewers = activeViewers.includes(userId);

            // STABLE MEMBERSHIP CHECK: Use ref to track previous membership state to prevent flickering
            const isMembershipStable = previousMembershipRef.current === null || previousMembershipRef.current === userInSession;

            // Use throttled log instead of group to prevent nesting
            debug.throttle('session-check', 2000, 'InSessionNotification', 'Session Check', {
              sessionId: latestSession.id,
              className: latestSession.className,
              classId: latestSession.classId,
              userInSession,
              isOnSessionPage,
              pathSessionId,
              userIsInActiveViewers,
              currentPath: location.pathname,
              playersCount: latestSession.players?.length || 0,
              activeViewersCount: activeViewers.length,
              currentUserId: userId,
              playerIds: latestSession.players?.map((p: any) => p.userId) || [],
              activeViewerIds: activeViewers,
              previousSessionId: previousSessionIdRef.current,
              isMembershipStable,
              previousMembership: previousMembershipRef.current
            });

            setIsInSession(userInSession);

            // PRIMARY RULE: If user is on the session page (viewing ANY of their class's live events) OR actively viewing, hide the notification
            // Once a player is in a Live Event (on the session page), the pop-up reminder goes away
            if (isOnSessionPage || userIsInActiveViewers) {
              debug.log('InSessionNotification', 'Hiding notification - user is on session page or in active viewers', {
                isOnSessionPage,
                pathSessionId,
                userIsInActiveViewers,
                currentPath: location.pathname
              });
              previousSessionIdRef.current = latestSession.id;
              previousMembershipRef.current = userInSession;
              if (activeSession !== null) {
                setActiveSession(null);
              }
              return;
            }

            // STABLE LOGIC: Only update notification if:
            // 1. Session ID changed, OR
            // 2. Membership status changed AND is stable (not flickering)
            const sessionIdChanged = previousSessionIdRef.current !== latestSession.id;
            const membershipChanged = previousMembershipRef.current !== userInSession;
            const shouldUpdate = sessionIdChanged || (membershipChanged && isMembershipStable);

            if (shouldUpdate) {
              const isDismissed = dismissedSessionIds.has(latestSession.id);
              if (isDismissed) {
                setActiveSession(null);
                previousSessionIdRef.current = latestSession.id;
                previousMembershipRef.current = userInSession;
                return;
              }
              if (!userInSession) {
                // User hasn't joined the session - show notification to join
                debug.log('InSessionNotification', '✅ Showing join notification - user not in session', {
                  sessionId: latestSession.id,
                  userId,
                  playerIds: latestSession.players?.map((p: any) => p.userId) || [],
                  reason: sessionIdChanged ? 'sessionId changed' : 'membership changed'
                });
                previousSessionIdRef.current = latestSession.id;
                previousMembershipRef.current = userInSession;
                setActiveSession(latestSession);
              } else {
                // User is in session but NOT on the session page - show notification to rejoin
                debug.log('InSessionNotification', '✅ Showing rejoin notification - user not on session page', {
                  sessionId: latestSession.id,
                  reason: sessionIdChanged ? 'sessionId changed' : 'membership changed'
                });
                previousSessionIdRef.current = latestSession.id;
                previousMembershipRef.current = userInSession;
                setActiveSession(latestSession);
              }
            } else {
              // State is stable - don't update (prevents flickering)
              debug.log('InSessionNotification', '⏸️ Skipping update - state is stable', {
                sessionId: latestSession.id,
                previousSessionId: previousSessionIdRef.current,
                userInSession,
                previousMembership: previousMembershipRef.current
              });
            }
          } else {
            debug.log('InSessionNotification', 'No sessions found for user classrooms');
            // Only clear if we had a session before (prevents unnecessary state updates)
            if (previousSessionIdRef.current !== null) {
              previousSessionIdRef.current = null;
              setActiveSession(null);
            }
            setIsInSession(false);
          }
        } else {
          debug.throttle('no-active-sessions', 5000, 'InSessionNotification', 'No active sessions found');
          // Only clear if we had a session before (prevents unnecessary state updates)
          if (previousSessionIdRef.current !== null) {
            previousSessionIdRef.current = null;
            setActiveSession(null);
          }
          setIsInSession(false);
        }
      } catch (error) {
        // Suppress Firestore internal assertion errors
        if (error instanceof Error && 
            (error.message?.includes('INTERNAL ASSERTION FAILED') || 
             error.message?.includes('Unexpected state'))) {
          debug.once('firestore-error-suppressed', 'InSessionNotification', 'Firestore error suppressed in checkForActiveSessions');
          return; // Skip this check if there's a Firestore error
        }
        debug.error('InSessionNotification', 'Error checking for sessions', error);
        // Don't clear activeSession on error - keep showing if we had one
        // This ensures the notification persists even if there's a temporary error
      }
    };

    const setupSessionListener = async () => {
      try {
        // Get user's classrooms and cache them
        userClassroomsCache = await getUserClassrooms(currentUser.uid);

        debug.once('setup-complete', 'InSessionNotification', 'Setup complete', {
          userId: currentUser.uid,
          userEmail: currentUser.email,
          classrooms: userClassroomsCache,
          classroomCount: userClassroomsCache.length
        });

        // Even if user has no classrooms, still check for sessions (in case of data inconsistency)
        // Initial check immediately (don't await - fire and forget to avoid blocking)
        debug.once('initial-check', 'InSessionNotification', 'Performing initial session check...');
        checkForActiveSessions(currentUser.uid).catch(err => {
          debug.error('InSessionNotification', 'Error in initial check', err);
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
            debug.error('InSessionNotification', 'Error in polling check', err);
          });
        }, 1500);

        // Real-time listener disabled to prevent Firestore internal assertion errors
        // Polling is more reliable and doesn't cause these errors
      } catch (error) {
        debug.error('InSessionNotification', 'Error setting up session listener', error);
        // Still set up polling even if listener setup fails
        // Initial check immediately
        checkForActiveSessions(currentUser.uid).catch(err => {
          debug.error('InSessionNotification', 'Error in initial check (fallback)', err);
        });
        pollInterval = setInterval(() => {
          checkForActiveSessions(currentUser.uid).catch(err => {
            debug.error('InSessionNotification', 'Error in polling check (fallback)', err);
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
  }, [currentUser, location, dismissedSessionIds]); // Use location object instead of location.pathname to ensure re-evaluation on route changes

  const handleJoinSession = async () => {
    if (!currentUser || !activeSession || isJoining) return;

    setIsJoining(true);
    try {
      // Get user data
      const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const userData = userDoc.exists() ? userDoc.data() : {};

      // Ensure displayName is always a valid string
      const displayName = userData.displayName || studentData.displayName || currentUser.displayName || 'Unknown Player';
      if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
        throw new Error('Invalid player name. Please update your profile.');
      }

      const plRaw = studentData.powerLevel;
      const powerLevel =
        typeof plRaw === 'number' && Number.isFinite(plRaw) ? Math.floor(plRaw) : null;

      const newPlayer = {
        userId: currentUser.uid,
        displayName: displayName.trim(),
        photoURL: userData.photoURL || studentData.photoURL || currentUser.photoURL,
        level: studentData.level || 1,
        powerLevel,
        powerPoints: studentData.powerPoints || 0,
        participationCount: 0,
        movesEarned: 0
      };

      // Validate player data before attempting join
      if (!newPlayer.userId || typeof newPlayer.userId !== 'string') {
        throw new Error('Invalid user ID. Please log in again.');
      }

      // Use session service to join (idempotent)
      const { joinSession } = await import('../utils/inSessionService');
      
      console.log('[InSessionNotification] Attempting to join session:', {
        sessionId: activeSession.id,
        playerId: newPlayer.userId,
        playerName: newPlayer.displayName,
        sessionStatus: activeSession.status,
        playerLevel: newPlayer.level,
        playerPP: newPlayer.powerPoints
      });
      
      const result = await joinSession(activeSession.id, newPlayer);
      
      if (result.success) {
        debug.log('InSessionNotification', `User ${currentUser.uid} joined session ${activeSession.id}`);
        // Immediately hide notification since user is joining
        setActiveSession(null);
        setIsInSession(true);
        // Navigate to session battle view
        navigate(`/live-events/${activeSession.id}`);
      } else {
        console.error('[InSessionNotification] Failed to join session:', {
          sessionId: activeSession.id,
          error: result.error,
          playerId: newPlayer.userId
        });
        const errorMessage = result.error || 'Please try again.';
        alert(`Failed to join live event: ${errorMessage}`);
      }
    } catch (error: any) {
      debug.error('InSessionNotification', 'Error joining session', error);
      const errorMessage = error?.message || 'An unexpected error occurred. Please try again.';
      alert(`Failed to join session: ${errorMessage}`);
    } finally {
      setIsJoining(false);
    }
  };

  const handleDismiss = () => {
    if (!activeSession?.id) return;
    setDismissedSessionIds(prev => {
      const next = new Set(prev);
      next.add(activeSession.id);
      return next;
    });
    setActiveSession(null);
  };

  const handleEndSession = async () => {
    if (!currentUser || !activeSession || isEnding) return;

    // Confirm with admin before ending session
      if (!window.confirm(`Are you sure you want to end the live event "${activeSession.className}"? This will end the event for all ${activeSession.players.length} player(s).`)) {
      return;
    }

    setIsEnding(true);
    try {
      const success = await endSession(activeSession.id, currentUser.uid, currentUser.email || undefined);
      
      if (success) {
        debug.log('InSessionNotification', `Session ${activeSession.id} ended by ${isHostOfActiveSession ? 'host' : 'admin'} ${currentUser.uid}`);
        // Navigate to the live event page so the host/admin sees the session summary modal
        const endedSessionId = activeSession.id;
        setActiveSession(null);
        navigate(`/live-events/${endedSessionId}`);
      } else {
        alert('Failed to end session. You may not have permission to end this session, or the session may have already ended.');
      }
    } catch (error) {
      debug.error('InSessionNotification', 'Error ending session', error);
      alert('Failed to end session. Please try again.');
    } finally {
      setIsEnding(false);
    }
  };

  if (!activeSession) {
    return null;
  }

  // Always render the notification if there's an active session
  // This ensures it's visible even if there are temporary state issues
  debug.throttle('rendering-notification', 2000, 'InSessionNotification', 'Rendering notification', {
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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <button
              onClick={handleDismiss}
              aria-label="Close live event notification"
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: '999px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontWeight: 700,
                flexShrink: 0
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '2rem' }}>📚</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
                {isInSession ? '📚 Rejoin Live Event' : '📚 Live Event Active - Join Now!'}
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', opacity: 0.9 }}>
                {activeSession.className} - {activeSession.players.length} player{activeSession.players.length !== 1 ? 's' : ''} {isInSession ? 'in event' : 'joined'}
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={isInSession ? () => navigate(`/live-events/${activeSession.id}`) : handleJoinSession}
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
            {isJoining ? 'Joining...' : isInSession ? '🎮 Rejoin Live Event' : '🎮 Join Live Event'}
          </button>
          {(isAdminUser || isHostOfActiveSession) && (
            <button
              onClick={handleEndSession}
              disabled={isEnding}
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: isEnding ? 'not-allowed' : 'pointer',
                opacity: isEnding ? 0.6 : 1,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {isEnding ? 'Ending...' : '⏹️ End Live Event'}
            </button>
          )}
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

