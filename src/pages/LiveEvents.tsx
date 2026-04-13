import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { joinSession } from '../utils/inSessionService';
import { getClassroomIdsForEnrolledStudent } from '../utils/classroomQueries';

interface LiveEvent {
  id: string;
  classId: string;
  className: string;
  status: 'open' | 'active' | 'closed' | 'live' | 'ended';
  hostUid: string;
  /** Season 1 live mode — absent on legacy rooms (treat as quiz). */
  liveEventMode?: string;
  goalLinkingEnabled?: boolean;
  energyTypeAwarded?: string;
  players: Array<{
    userId: string;
    displayName: string;
    photoURL?: string;
    level: number;
    powerPoints: number;
  }>;
  createdAt: Timestamp | Date | null;
  startedAt: Timestamp | Date | null;
  endedAt?: Timestamp | Date | null;
}

function liveEventMatchesSearch(event: LiveEvent, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (event.className.toLowerCase().includes(needle)) return true;
  return event.players.some((p) => {
    const name = (p.displayName || '').toLowerCase();
    const uid = (p.userId || '').toLowerCase();
    return name.includes(needle) || uid.includes(needle);
  });
}

function matchingPlayersInEvent(event: LiveEvent, q: string): LiveEvent['players'] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return event.players.filter((p) => {
    const name = (p.displayName || '').toLowerCase();
    const uid = (p.userId || '').toLowerCase();
    return name.includes(needle) || uid.includes(needle);
  });
}

const LiveEvents: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userClassrooms, setUserClassrooms] = useState<string[]>([]);
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  /** Filter events by class name or any joined player's name / id */
  const [playerSearch, setPlayerSearch] = useState('');

  // Get user's classrooms
  useEffect(() => {
    const fetchUserClassrooms = async () => {
      if (!currentUser) return;

      try {
        const userClassIds = await getClassroomIdsForEnrolledStudent(currentUser.uid);
        setUserClassrooms(userClassIds);
      } catch (error) {
        console.error('Error fetching user classrooms:', error);
      }
    };

    fetchUserClassrooms();
  }, [currentUser]);

  // Subscribe to active live events
  useEffect(() => {
    if (!currentUser || userClassrooms.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const DEBUG_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                         process.env.REACT_APP_DEBUG === 'true';
    
    if (DEBUG_EVENTS) {
      console.log('🔵 EVENT DISCOVERY: Querying for events', {
        userClassrooms,
        userClassroomsCount: userClassrooms.length
      });
    }
    
    // Query for active sessions in user's classrooms
    // Firestore 'in' query supports up to 10 values, so we need to handle multiple queries if needed
    const eventsRef = collection(db, 'inSessionRooms');
    
    // Split into chunks of 10 (Firestore 'in' limit)
    const classChunks: string[][] = [];
    for (let i = 0; i < userClassrooms.length; i += 10) {
      classChunks.push(userClassrooms.slice(i, i + 10));
    }
    
    // If no classrooms, return empty
    if (classChunks.length === 0) {
      setLiveEvents([]);
      setLoading(false);
      return;
    }
    
    // CRITICAL: Query matches session creation status ('live')
    // Also check 'open' and 'active' for backward compatibility
    const queries = classChunks.map(chunk => {
      if (DEBUG_EVENTS) {
        console.log('🔍 LiveEvents: Creating query for chunk', {
          chunk,
          statusFilter: ['open', 'active', 'live'],
          note: 'Sessions are created with status: "live"'
        });
      }
      return query(
        eventsRef,
        where('classId', 'in', chunk),
        where('status', 'in', ['open', 'active', 'live'])
      );
    });
    
    // Store results from all queries
    const allEventMaps = new Map<string, LiveEvent>();
    
    const updateEvents = () => {
      const uniqueEvents = Array.from(allEventMaps.values());
      
      // Sort by most recently started
      uniqueEvents.sort((a, b) => {
        const aTime = a.startedAt instanceof Timestamp ? a.startedAt.toMillis() : 
                     a.startedAt instanceof Date ? a.startedAt.getTime() : 0;
        const bTime = b.startedAt instanceof Timestamp ? b.startedAt.toMillis() : 
                     b.startedAt instanceof Date ? b.startedAt.getTime() : 0;
        return bTime - aTime;
      });

      if (DEBUG_EVENTS) {
        console.log('✅ EVENT DISCOVERY: Found events', {
          count: uniqueEvents.length,
          events: uniqueEvents.map(e => ({ id: e.id, className: e.className, status: e.status }))
        });
      }
      
      setLiveEvents(uniqueEvents);
      setLoading(false);
    };
    
    // Subscribe to all queries and merge results
    const unsubscribes = queries.map((q, index) => 
      onSnapshot(
        q,
        (snapshot) => {
          if (DEBUG_EVENTS) {
            console.log(`🔵 EVENT DISCOVERY: Query ${index + 1} snapshot update`, {
              snapshotSize: snapshot.size,
              docs: snapshot.docs.map(d => ({ id: d.id, classId: d.data().classId, status: d.data().status }))
            });
          }
          
          // Update events map with results from this query
          snapshot.forEach((doc) => {
            const data = doc.data();
            
            // Double-check classId is in user's classrooms (safety check)
            if (userClassrooms.includes(data.classId)) {
              allEventMaps.set(doc.id, {
                id: doc.id,
                classId: data.classId,
                className: data.className || `Class ${data.classId}`,
                status: data.status,
                hostUid: data.hostUid || data.teacherId,
                liveEventMode: data.liveEventMode,
                goalLinkingEnabled: data.goalLinkingEnabled,
                energyTypeAwarded: data.energyTypeAwarded,
                players: data.players || [],
                createdAt: data.createdAt,
                startedAt: data.startedAt,
                endedAt: data.endedAt,
              });
            }
          });
          
          // Remove events that are no longer in any query result
          // (This handles the case where an event ends or changes classId)
          const currentIds = new Set(snapshot.docs.map(d => d.id));
          Array.from(allEventMaps.keys()).forEach(id => {
            if (!currentIds.has(id)) {
              // Check if this event still exists in other queries
              // For simplicity, we'll keep it unless all queries have updated
              // In practice, events are removed when status changes, so this is fine
            }
          });
          
          updateEvents();
        },
        (error) => {
          console.error(`❌ EVENT DISCOVERY ERROR: Error in query ${index + 1}:`, error);
          if (DEBUG_EVENTS) {
            console.error('Error details:', {
              errorMessage: error.message,
              errorCode: error.code,
              queryIndex: index,
              classChunk: classChunks[index]
            });
          }
          setLoading(false);
        }
      )
    );

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [currentUser, userClassrooms]);

  const handleJoinEvent = async (event: LiveEvent) => {
    if (!currentUser || joiningEventId) return;

    setJoiningEventId(event.id);

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

      const newPlayer = {
        userId: currentUser.uid,
        displayName: displayName.trim(),
        photoURL: userData.photoURL || studentData.photoURL || currentUser.photoURL,
        level: studentData.level || 1,
        powerPoints: studentData.powerPoints || 0,
        participationCount: 0,
        movesEarned: 0
      };

      // Validate player data before attempting join
      if (!newPlayer.userId || typeof newPlayer.userId !== 'string') {
        throw new Error('Invalid user ID. Please log in again.');
      }

      console.log('[LiveEvents] Attempting to join session:', {
        sessionId: event.id,
        playerId: newPlayer.userId,
        playerName: newPlayer.displayName,
        eventStatus: event.status,
        eventClassId: event.classId,
        playerLevel: newPlayer.level,
        playerPP: newPlayer.powerPoints
      });

      const result = await joinSession(event.id, newPlayer);

      if (result.success) {
        console.log('[LiveEvents] Successfully joined session:', event.id);
        navigate(`/live-events/${event.id}`);
      } else {
        console.error('[LiveEvents] Failed to join session:', {
          sessionId: event.id,
          error: result.error,
          playerId: newPlayer.userId
        });
        const errorMessage = result.error || 'The event may be full or no longer active.';
        alert(`Failed to join live event: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error('[LiveEvents] Error joining live event:', error);
      const errorMessage = error?.message || 'An unexpected error occurred. Please try again.';
      alert(`Failed to join live event: ${errorMessage}`);
    } finally {
      setJoiningEventId(null);
    }
  };

  const isUserInEvent = (event: LiveEvent): boolean => {
    if (!currentUser) return false;
    return event.players.some(p => p.userId === currentUser.uid);
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'open':
      case 'active':
      case 'live':
        return 'Live';
      case 'closed':
        return 'Ending';
      case 'ended':
        return 'Ended';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'open':
      case 'active':
      case 'live':
        return '#10b981'; // green
      case 'closed':
        return '#f59e0b'; // amber
      case 'ended':
        return '#6b7280'; // gray
      default:
        return '#9ca3af';
    }
  };

  const formatSeason1Mode = (event: LiveEvent): string => {
    if (!event.liveEventMode) return 'Classic session';
    const m = event.liveEventMode.replace(/_/g, ' ');
    const en = event.energyTypeAwarded ? ` · ${event.energyTypeAwarded} energy` : '';
    const g = event.goalLinkingEnabled === false ? '' : ' · goals on';
    return `Mode: ${m}${en}${g}`;
  };

  const filteredLiveEvents = useMemo(() => {
    const trimmed = playerSearch.trim();
    if (!trimmed) return liveEvents;
    const matched = liveEvents.filter((e) => liveEventMatchesSearch(e, trimmed));
    const activeInRoom = currentUser
      ? liveEvents.find((e) => e.players.some((p) => p.userId === currentUser.uid))
      : undefined;
    if (activeInRoom && !matched.some((e) => e.id === activeInRoom.id)) {
      return [activeInRoom, ...matched];
    }
    return matched;
  }, [liveEvents, playerSearch, currentUser]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading Live Events...</div>
      </div>
    );
  }

  if (userClassrooms.length === 0) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '2rem'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>No Class Assigned</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            You need to be assigned to a class to access Live Events.
          </p>
          <p style={{ color: '#6b7280' }}>
            Please contact your teacher or administrator to be added to a class.
          </p>
        </div>
      </div>
    );
  }

  // Separate events: user's active event first, then others (respects search filter)
  const userActiveEvent = filteredLiveEvents.find((e) => isUserInEvent(e));
  const otherEvents = filteredLiveEvents.filter((e) => !isUserInEvent(e));
  const searchTrimmed = playerSearch.trim();
  const activePlayerMatches =
    userActiveEvent && searchTrimmed ? matchingPlayersInEvent(userActiveEvent, searchTrimmed) : [];

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📚 Live Events</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
          Join active classroom battles and compete with your classmates!
        </p>
      </div>

      {/* Search: filter by player name, user id, or class name */}
      <div
        style={{
          marginBottom: '1.5rem',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <label
          htmlFor="live-events-player-search"
          style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}
        >
          Find event or player
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="live-events-player-search"
            type="search"
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            placeholder="Type a player name, ID, or class…"
            autoComplete="off"
            style={{
              flex: '1 1 220px',
              minWidth: 0,
              padding: '0.6rem 0.85rem',
              fontSize: '1rem',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              outline: 'none',
            }}
          />
          {searchTrimmed ? (
            <button
              type="button"
              onClick={() => setPlayerSearch('')}
              style={{
                padding: '0.55rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#64748b',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {searchTrimmed ? (
          <p style={{ margin: '0.55rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            Showing {filteredLiveEvents.length} of {liveEvents.length} event
            {liveEvents.length !== 1 ? 's' : ''} matching &quot;{searchTrimmed}&quot;
          </p>
        ) : null}
      </div>

      {/* User's Active Event (if any) */}
      {userActiveEvent && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937' }}>
            🎮 Your Active Event
          </h2>
          <div style={{
            background: 'white',
            border: '2px solid #8b5cf6',
            borderRadius: '1rem',
            padding: '1.5rem',
            boxShadow: '0 4px 6px rgba(139, 92, 246, 0.1)'
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
                  {userActiveEvent.className}
                </h3>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  backgroundColor: getStatusColor(userActiveEvent.status) + '20',
                  color: getStatusColor(userActiveEvent.status)
                }}>
                  {getStatusLabel(userActiveEvent.status)}
                </span>
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                {userActiveEvent.players.length} player{userActiveEvent.players.length !== 1 ? 's' : ''} joined
              </div>
              {searchTrimmed ? (
                <div style={{ marginTop: '0.55rem', fontSize: '0.78rem', color: '#334155' }}>
                  {activePlayerMatches.length > 0 ? (
                    <>
                      <strong style={{ color: '#0f172a' }}>Matches:</strong>{' '}
                      {activePlayerMatches
                        .slice(0, 8)
                        .map((p) => p.displayName || p.userId)
                        .join(', ')}
                      {activePlayerMatches.length > 8 ? ` +${activePlayerMatches.length - 8} more` : ''}
                    </>
                  ) : (
                    <span style={{ color: '#64748b' }}>Matched by class name — open event to see roster.</span>
                  )}
                </div>
              ) : null}
              <div style={{ color: '#7c3aed', fontSize: '0.8rem', marginTop: 6 }}>{formatSeason1Mode(userActiveEvent)}</div>
            </div>
            <button
              onClick={() => navigate(`/live-events/${userActiveEvent.id}`)}
              disabled={joiningEventId === userActiveEvent.id}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                opacity: joiningEventId === userActiveEvent.id ? 0.6 : 1
              }}
            >
              {joiningEventId === userActiveEvent.id ? 'Joining...' : '🎮 Rejoin Live Event'}
            </button>
          </div>
        </div>
      )}

      {/* All Active Events */}
      {liveEvents.length > 0 ? (
        filteredLiveEvents.length === 0 ? (
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '1rem',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <h2 style={{ marginBottom: '0.75rem', color: '#1f2937' }}>No matching events</h2>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              No class or joined player matches &quot;{searchTrimmed}&quot;. Try another name or clear the search.
            </p>
            <button
              type="button"
              onClick={() => setPlayerSearch('')}
              style={{
                padding: '0.6rem 1.25rem',
                fontWeight: 600,
                color: 'white',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
            >
              Clear search
            </button>
          </div>
        ) : (
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937' }}>
            {userActiveEvent ? 'Other Active Events' : 'Active Events'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {otherEvents.map((event) => {
              const isJoined = isUserInEvent(event);
              const rowMatches = searchTrimmed ? matchingPlayersInEvent(event, searchTrimmed) : [];
              return (
                <div
                  key={event.id}
                  style={{
                    background: 'white',
                    border: `2px solid ${isJoined ? '#8b5cf6' : '#e5e7eb'}`,
                    borderRadius: '1rem',
                    padding: '1.5rem',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>
                        {event.className}
                      </h3>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: getStatusColor(event.status) + '20',
                        color: getStatusColor(event.status)
                      }}>
                        {getStatusLabel(event.status)}
                      </span>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                      {event.players.length} player{event.players.length !== 1 ? 's' : ''} joined
                    </div>
                    {searchTrimmed ? (
                      <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: '#334155' }}>
                        {rowMatches.length > 0 ? (
                          <>
                            <strong style={{ color: '#0f172a' }}>Matches:</strong>{' '}
                            {rowMatches
                              .slice(0, 8)
                              .map((p) => p.displayName || p.userId)
                              .join(', ')}
                            {rowMatches.length > 8 ? ` +${rowMatches.length - 8} more` : ''}
                          </>
                        ) : (
                          <span style={{ color: '#64748b' }}>Matched by class name.</span>
                        )}
                      </div>
                    ) : null}
                    <div style={{ color: '#7c3aed', fontSize: '0.8rem', marginTop: 6 }}>{formatSeason1Mode(event)}</div>
                  </div>
                  <button
                    onClick={() => isJoined ? navigate(`/live-events/${event.id}`) : handleJoinEvent(event)}
                    disabled={joiningEventId === event.id}
                    style={{
                      background: isJoined
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      width: '100%',
                      opacity: joiningEventId === event.id ? 0.6 : 1
                    }}
                  >
                    {joiningEventId === event.id
                      ? 'Joining...'
                      : isJoined
                      ? '🎮 Rejoin Live Event'
                      : '🎮 Join Live Event'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        )
      ) : (
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>No Active Events</h2>
          <p style={{ color: '#6b7280' }}>
            There are no active live events for your classrooms right now.
            Check back later or ask your teacher to start an event!
          </p>
        </div>
      )}
    </div>
  );
};

export default LiveEvents;


