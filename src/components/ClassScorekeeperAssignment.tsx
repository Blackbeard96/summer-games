import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  assignScorekeeperToClass,
  isScorekeeperForClass,
  removeScorekeeperFromClass,
} from '../utils/roleManagement';

interface ClassStudent {
  id: string;
  displayName: string;
  email: string;
  isScorekeeperForClass: boolean;
}

interface ClassScorekeeperAssignmentProps {
  classId: string;
  className?: string;
  adminUserId: string;
}

/**
 * Admin-only panel to assign / remove class scorekeepers for the selected classroom.
 */
const ClassScorekeeperAssignment: React.FC<ClassScorekeeperAssignmentProps> = ({
  classId,
  className,
  adminUserId,
}) => {
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!classId || classId === 'admin-all-classes') {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const classSnap = await getDoc(doc(db, 'classrooms', classId));
      if (!classSnap.exists()) {
        setStudents([]);
        setError('Classroom not found.');
        return;
      }
      const roster: string[] = Array.isArray(classSnap.data().students)
        ? classSnap.data().students.filter((id: unknown) => typeof id === 'string' && id)
        : [];

      const rows: ClassStudent[] = await Promise.all(
        roster.map(async (uid) => {
          let displayName = 'Unknown Player';
          let email = '';
          try {
            const studentSnap = await getDoc(doc(db, 'students', uid));
            if (studentSnap.exists()) {
              const d = studentSnap.data();
              displayName = d.displayName || d.name || displayName;
              email = d.email || email;
            }
          } catch {
            /* ignore */
          }
          if (!email || displayName === 'Unknown Player') {
            try {
              const userSnap = await getDoc(doc(db, 'users', uid));
              if (userSnap.exists()) {
                const d = userSnap.data();
                displayName = d.displayName || displayName;
                email = d.email || email;
              }
            } catch {
              /* ignore */
            }
          }

          let sk = false;
          try {
            const roleSnap = await getDoc(doc(db, 'userRoles', uid));
            sk = isScorekeeperForClass(roleSnap.exists() ? roleSnap.data() : null, classId);
          } catch {
            sk = false;
          }

          return { id: uid, displayName, email, isScorekeeperForClass: sk };
        })
      );

      rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setStudents(rows);
    } catch (e) {
      console.error('ClassScorekeeperAssignment load failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to load class roster');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  }, [students, query]);

  const scorekeeperCount = students.filter((s) => s.isScorekeeperForClass).length;

  const handleAssign = async (studentId: string, name: string) => {
    setBusyId(studentId);
    setError(null);
    setMessage(null);
    const result = await assignScorekeeperToClass(studentId, classId, adminUserId);
    setBusyId('');
    if (!result.ok) {
      setError(result.error || 'Could not assign scorekeeper');
      return;
    }
    setMessage(`${name} is now a scorekeeper for ${className || 'this class'}.`);
    await load();
  };

  const handleRemove = async (studentId: string, name: string) => {
    setBusyId(studentId);
    setError(null);
    setMessage(null);
    const result = await removeScorekeeperFromClass(studentId, classId, adminUserId);
    setBusyId('');
    if (!result.ok) {
      setError(result.error || 'Could not remove scorekeeper');
      return;
    }
    setMessage(`Removed scorekeeper access for ${name}.`);
    await load();
  };

  if (!classId || classId === 'admin-all-classes') {
    return (
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          border: '1px solid rgba(212, 168, 79, 0.45)',
          background: 'rgba(8, 13, 23, 0.92)',
          color: '#e5e7eb',
        }}
      >
        <strong style={{ color: '#f0c96a' }}>Assign Class Scorekeepers</strong>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#9ca3af' }}>
          Select a specific class above to make a student the scorekeeper for that class.
        </p>
        <Link
          to="/admin?tab=roles"
          style={{ display: 'inline-block', marginTop: '0.75rem', color: '#93c5fd', fontWeight: 600 }}
        >
          Open full Role Manager →
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: '1.5rem',
        padding: '1.25rem 1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid rgba(212, 168, 79, 0.5)',
        background: 'linear-gradient(165deg, rgba(10, 16, 28, 0.98), rgba(7, 11, 18, 0.98))',
        color: '#e5e7eb',
        boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#f0c96a', letterSpacing: '0.04em' }}>
            📊 Assign Class Scorekeepers
          </h2>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: '#9ca3af' }}>
            Choose a player in <strong style={{ color: '#e5e7eb' }}>{className || classId}</strong> who
            can add/subtract PP for classmates (changes still need admin approval).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#6ee7b7',
              border: '1px solid rgba(52, 211, 153, 0.45)',
              borderRadius: '999px',
              padding: '0.25rem 0.75rem',
            }}
          >
            {scorekeeperCount} scorekeeper{scorekeeperCount === 1 ? '' : 's'}
          </span>
          <Link
            to="/admin?tab=roles"
            style={{ fontSize: '0.85rem', color: '#93c5fd', fontWeight: 600, textDecoration: 'none' }}
          >
            Full Role Manager →
          </Link>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter students by name or email..."
        style={{
          width: '100%',
          maxWidth: '28rem',
          marginBottom: '0.85rem',
          padding: '0.6rem 0.85rem',
          borderRadius: '0.5rem',
          border: '1px solid rgba(212, 168, 79, 0.35)',
          background: 'rgba(5, 8, 14, 0.9)',
          color: '#f3f4f6',
        }}
      />

      {error && (
        <div style={{ color: '#fca5a5', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</div>
      )}
      {message && (
        <div style={{ color: '#6ee7b7', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{message}</div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', padding: '1rem 0' }}>Loading class roster…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9ca3af', padding: '1rem 0' }}>
          No students found in this class. Add students in Classroom Management first.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '0.5rem',
            maxHeight: '280px',
            overflowY: 'auto',
            paddingRight: '0.25rem',
          }}
        >
          {filtered.map((student) => (
            <div
              key={student.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                padding: '0.65rem 0.85rem',
                borderRadius: '0.5rem',
                border: student.isScorekeeperForClass
                  ? '1px solid rgba(52, 211, 153, 0.45)'
                  : '1px solid rgba(255,255,255,0.08)',
                background: student.isScorekeeperForClass
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#f9fafb' }}>{student.displayName}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {student.email || student.id}
                  {student.isScorekeeperForClass ? ' · Scorekeeper' : ''}
                </div>
              </div>
              {student.isScorekeeperForClass ? (
                <button
                  type="button"
                  disabled={busyId === student.id}
                  onClick={() => handleRemove(student.id, student.displayName)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '0.4rem',
                    border: '1px solid rgba(248, 113, 113, 0.55)',
                    background: 'rgba(127, 29, 29, 0.35)',
                    color: '#fecaca',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: busyId === student.id ? 'wait' : 'pointer',
                    opacity: busyId === student.id ? 0.6 : 1,
                  }}
                >
                  {busyId === student.id ? '…' : 'Remove Scorekeeper'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === student.id}
                  onClick={() => handleAssign(student.id, student.displayName)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '0.4rem',
                    border: '1px solid rgba(52, 211, 153, 0.55)',
                    background: 'rgba(6, 95, 70, 0.55)',
                    color: '#d1fae5',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: busyId === student.id ? 'wait' : 'pointer',
                    opacity: busyId === student.id ? 0.6 : 1,
                  }}
                >
                  {busyId === student.id ? '…' : 'Make Scorekeeper'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassScorekeeperAssignment;
