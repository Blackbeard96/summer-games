import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { getLevelFromXP } from '../utils/leveling';
import InSessionBattle from './InSessionBattle';
import LiveEventExam from './LiveEventExam';
import { isExamLiveEventMode } from '../types/liveEventExam';

interface Student {
  id: string;
  displayName: string;
  email: string;
  powerPoints: number;
  photoURL?: string;
  level?: number;
  xp?: number;
  powerLevel?: number | null;
}

const InSessionBattleView: React.FC = () => {
  // Support both eventId (new route) and sessionId (backward compatibility)
  const { eventId, sessionId: sessionIdParam } = useParams<{ eventId?: string; sessionId?: string }>();
  const sessionId = eventId || sessionIdParam;
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

        // Load roster members from targeted classes (legacy classId OR universal classIds),
        // then fallback to session players so Universal Event sessions always load.
        const studentIdsFromClasses = new Set<string>();
        const classNameFallbackByStudentId: Record<string, string> = {};
        const targetClassIds: string[] = [];
        if (typeof sessionData.classId === 'string' && sessionData.classId.trim()) {
          targetClassIds.push(sessionData.classId.trim());
        }
        if (Array.isArray(sessionData.classIds)) {
          for (const id of sessionData.classIds) {
            if (typeof id === 'string' && id.trim()) targetClassIds.push(id.trim());
          }
        }

        const dedupedClassIds = Array.from(new Set(targetClassIds));
        for (const classId of dedupedClassIds) {
          try {
            const classDoc = await getDoc(doc(db, 'classrooms', classId));
            if (!classDoc.exists()) continue;
            const classData = classDoc.data() as {
              students?: string[];
              studentDisplayNames?: Record<string, string>;
            };
            const classStudents = Array.isArray(classData.students) ? classData.students : [];
            classStudents.forEach((id) => studentIdsFromClasses.add(id));
            const rosterNames =
              classData.studentDisplayNames && typeof classData.studentDisplayNames === 'object'
                ? classData.studentDisplayNames
                : {};
            Object.keys(rosterNames).forEach((sid) => {
              if (!classNameFallbackByStudentId[sid]) {
                classNameFallbackByStudentId[sid] = String(rosterNames[sid]);
              }
            });
          } catch (classLoadError) {
            console.warn(`Failed to load classroom ${classId} for session roster`, classLoadError);
          }
        }

        // Build a fallback map from current live-session players (works even when profile reads are denied).
        const sessionPlayers = Array.isArray(sessionData.players) ? sessionData.players : [];
        const sessionPlayerMap = new Map<string, any>(
          sessionPlayers.map((p: any) => [p.userId, p])
        );
        sessionPlayers.forEach((p: any) => {
          if (p?.userId) studentIdsFromClasses.add(String(p.userId));
        });

        const rosterStudentIds = Array.from(studentIdsFromClasses);
        const studentsData: Student[] = await Promise.all(
          rosterStudentIds.map(async (studentId, index) => {
            const sessionPlayer = sessionPlayerMap.get(studentId);
            const fallbackName =
              sessionPlayer?.displayName ||
              classNameFallbackByStudentId[studentId] ||
              `Student ${index + 1}`;

            const base: Student = {
              id: studentId,
              displayName: fallbackName,
              email: '',
              powerPoints: sessionPlayer?.powerPoints || 0,
              photoURL: sessionPlayer?.photoURL,
              level: sessionPlayer?.level || 1,
              xp: undefined,
            };

            try {
              const [studentDoc, userDoc] = await Promise.all([
                getDoc(doc(db, 'students', studentId)),
                getDoc(doc(db, 'users', studentId))
              ]);

              const studentData = studentDoc.exists() ? studentDoc.data() : {};
              const userData = userDoc.exists() ? userDoc.data() : {};
              const level = getLevelFromXP(studentData.xp || 0);

              const plRaw = studentData.powerLevel;
              const powerLevel =
                typeof plRaw === 'number' && Number.isFinite(plRaw) ? Math.floor(plRaw) : null;

              return {
                ...base,
                displayName: userData.displayName || studentData.displayName || base.displayName,
                email: userData.email || studentData.email || '',
                powerPoints: studentData.powerPoints || base.powerPoints,
                photoURL: userData.photoURL || studentData.photoURL || base.photoURL,
                level: level || base.level,
                xp: studentData.xp || base.xp,
                powerLevel
              };
            } catch (error) {
              // Expected for non-admin students due profile access rules; keep fallback row visible.
              console.warn(`Roster fallback used for ${studentId}`, error);
              return base;
            }
          })
        );

        setStudents(studentsData);

        // Listen for session updates
        const unsubscribe = onSnapshot(sessionRef, (doc) => {
          if (!doc.exists()) {
            navigate('/home');
            return;
          }

          const data = doc.data();

          // If session was ended by admin, end it for everyone
          if (data?.status === 'closed') {
            // Avoid looping re-renders / double nav
            console.log('[InSessionBattleView] Session closed by admin - returning to home', { sessionId });
            navigate('/home', { replace: true });
            return;
          }

          setSession(data);
        });

        setLoading(false);
        return () => unsubscribe();
      } catch (error) {
        console.error('Error loading session:', error);
        setLoading(false);
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

  if (isExamLiveEventMode(session.liveEventMode)) {
    return (
      <LiveEventExam
        sessionId={sessionId!}
        classId={session.classId || ''}
        className={session.className}
        students={students.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          email: s.email,
        }))}
        onEndSession={() => navigate('/home')}
      />
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



