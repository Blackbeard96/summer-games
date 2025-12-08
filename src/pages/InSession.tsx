import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, collection, getDocs, query, where, onSnapshot, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { InSessionRoom } from '../types/inSession';

const InSession: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [userClass, setUserClass] = useState<string | null>(null);
  const [room, setRoom] = useState<InSessionRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    let unsubscribe: (() => void) | null = null;

    const fetchUserClass = async () => {
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const classId = studentData.classId || studentData.class || null;
          setUserClass(classId);
          
          // Check if user is a teacher
          const isUserTeacher = studentData.role === 'teacher' || studentData.isTeacher === true;
          setIsTeacher(isUserTeacher);

          // If class exists, try to find or create room
          if (classId) {
            unsubscribe = await findOrCreateRoom(classId, isUserTeacher);
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user class:', error);
        setLoading(false);
      }
    };

    fetchUserClass();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  const findOrCreateRoom = async (classId: string, isUserTeacher: boolean): Promise<(() => void) | null> => {
    try {
      // Check if room exists for this class
      const roomsRef = collection(db, 'inSessionRooms');
      const q = query(roomsRef, where('classId', '==', classId), where('status', 'in', ['open', 'active']));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Room exists, join it
        const roomDoc = snapshot.docs[0];
        const roomData = roomDoc.data();
        setRoom({
          id: roomDoc.id,
          ...roomData,
          createdAt: roomData.createdAt?.toDate() || new Date(),
          startedAt: roomData.startedAt?.toDate(),
          endedAt: roomData.endedAt?.toDate(),
          players: roomData.players || [],
          activeLaws: roomData.activeLaws || []
        } as InSessionRoom);

        // Listen for room updates
        const unsubscribe = onSnapshot(doc(db, 'inSessionRooms', roomDoc.id), (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setRoom({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
              startedAt: data.startedAt?.toDate(),
              endedAt: data.endedAt?.toDate(),
              players: data.players || [],
              activeLaws: data.activeLaws || []
            } as InSessionRoom);
          }
        }, (error) => {
          // Suppress Firestore internal assertion errors (known Firefox issue)
          if (error.message?.includes('INTERNAL ASSERTION FAILED') || 
              error.message?.includes('Unexpected state')) {
            return;
          }
          console.error('Error listening to room updates:', error);
        });

        return unsubscribe;
      } else if (isUserTeacher) {
        // Teacher can create a new room
        // This will be handled by a separate "Create Room" action
        console.log('No room found. Teacher can create one.');
      }
      return null;
    } catch (error) {
      console.error('Error finding/creating room:', error);
      return null;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading In Session...</div>
      </div>
    );
  }

  if (!userClass) {
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
            You need to be assigned to a class to access In Session mode.
          </p>
          <p style={{ color: '#6b7280' }}>
            Please contact your teacher or administrator to be added to a class.
          </p>
        </div>
      </div>
    );
  }

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
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📚 In Session</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
          Battle your classmates and create laws that everyone must follow!
        </p>
        <p style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '0.5rem' }}>
          Class: {userClass}
        </p>
      </div>

      {room ? (
        <div>
          <h2 style={{ marginBottom: '1rem' }}>Active Session Room</h2>
          <div style={{
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '1rem',
            padding: '1.5rem'
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>{room.className}</h3>
              <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Status: <strong>{room.status === 'open' ? '⏳ Open' : room.status === 'active' ? '🔥 Active' : '🔒 Closed'}</strong>
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Players: {room.players.length}
              </div>
            </div>
            <button
              onClick={() => navigate(`/in-session/room/${room.id}`)}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Enter Session Room
            </button>
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
          <h2 style={{ marginBottom: '1rem' }}>No Active Session</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            {isTeacher 
              ? 'Create a new session room for your class to begin.'
              : 'Waiting for your teacher to start a session...'}
          </p>
          {isTeacher && (
            <button
              onClick={() => navigate('/in-session/create')}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Create Session Room
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default InSession;

