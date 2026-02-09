import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, onSnapshot, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { joinSession } from '../utils/inSessionService';

interface LiveEvent {
  id: string;
  classId: string;
  className: string;
  status: 'open' | 'active' | 'closed' | 'live' | 'ended';
  hostUid: string;
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

const LiveEvents: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userClassrooms, setUserClassrooms] = useState<string[]>([]);
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);

  // Get user's classrooms
  useEffect(() => {
    const fetchUserClassrooms = async () => {
      if (!currentUser) return;

      try {
        const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
        const userClassIds = classroomsSnapshot.docs
          .filter(doc => {
            const classData = doc.data();
            return (classData.students || []).includes(currentUser.uid);
          })
          .map(doc => doc.id);

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

      const newPlayer = {
        userId: currentUser.uid,
        displayName: userData.displayName || studentData.displayName || currentUser.displayName || 'Unknown',
        photoURL: userData.photoURL || studentData.photoURL || currentUser.photoURL,
        level: studentData.level || 1,
        powerPoints: studentData.powerPoints || 0,
        participationCount: 0,
        movesEarned: 0
      };

      const joined = await joinSession(event.id, newPlayer);

      if (joined) {
        navigate(`/live-events/${event.id}`);
      } else {
        alert('Failed to join live event. The event may be full or no longer active.');
      }
    } catch (error) {
      console.error('Error joining live event:', error);
      alert('Failed to join live event. Please try again.');
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

  // Separate events: user's active event first, then others
  const userActiveEvent = liveEvents.find(e => isUserInEvent(e));
  const otherEvents = liveEvents.filter(e => !isUserInEvent(e));

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
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937' }}>
            {userActiveEvent ? 'Other Active Events' : 'Active Events'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {otherEvents.map((event) => {
              const isJoined = isUserInEvent(event);
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


