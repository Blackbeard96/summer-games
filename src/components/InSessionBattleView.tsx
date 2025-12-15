import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { getLevelFromXP } from '../utils/leveling';
import InSessionBattle from './InSessionBattle';

interface Student {
  id: string;
  displayName: string;
  email: string;
  powerPoints: number;
  photoURL?: string;
  level?: number;
  xp?: number;
}

const InSessionBattleView: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId || !currentUser) return;

    const loadSession = async () => {
      try {
        const sessionRef = doc(db, 'inSessionRooms', sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (!sessionDoc.exists()) {
          alert('Session not found.');
          navigate('/home');
          return;
        }

        const sessionData = sessionDoc.data();
        setSession(sessionData);

        // Load all students in the class
        const classRef = doc(db, 'classrooms', sessionData.classId);
        const classDoc = await getDoc(classRef);

        if (classDoc.exists()) {
          const classData = classDoc.data();
          const studentIds = classData.students || [];

          // Load student data
          const studentsData: Student[] = [];
          for (const studentId of studentIds) {
            try {
              const [studentDoc, userDoc] = await Promise.all([
                getDoc(doc(db, 'students', studentId)),
                getDoc(doc(db, 'users', studentId))
              ]);

              const studentData = studentDoc.exists() ? studentDoc.data() : {};
              const userData = userDoc.exists() ? userDoc.data() : {};

              const level = getLevelFromXP(studentData.xp || 0);
              studentsData.push({
                id: studentId,
                displayName: userData.displayName || studentData.displayName || 'Unknown',
                email: userData.email || studentData.email || '',
                powerPoints: studentData.powerPoints || 0,
                photoURL: userData.photoURL || studentData.photoURL,
                level,
                xp: studentData.xp || 0
              });
            } catch (error) {
              console.error(`Error loading student ${studentId}:`, error);
            }
          }

          setStudents(studentsData);
        }

        // Listen for session updates
        const unsubscribe = onSnapshot(sessionRef, (doc) => {
          if (doc.exists()) {
            setSession(doc.data());
          }
        });

        setLoading(false);
        return () => unsubscribe();
      } catch (error) {
        console.error('Error loading session:', error);
        alert('Failed to load session.');
        navigate('/home');
      }
    };

    loadSession();
  }, [sessionId, currentUser, navigate]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Session not found.</div>
      </div>
    );
  }

  return (
    <InSessionBattle
      sessionId={sessionId!}
      classId={session.classId}
      className={session.className}
      students={students}
      onEndSession={() => navigate('/home')}
    />
  );
};

export default InSessionBattleView;


