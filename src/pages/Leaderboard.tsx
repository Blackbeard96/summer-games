import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

interface Student {
  id: string;
  displayName?: string;
  photoURL?: string;
  xp?: number;
  powerPoints?: number;
  manifestationType?: string;
  storyChapter?: number;
}

const Leaderboard = () => {
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    const fetchStudents = async () => {
      const q = query(collection(db, 'students'), orderBy('xp', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Student[];
      setStudents(list);
    };
    fetchStudents();
  }, []);

  const getManifestationColor = (type: string) => {
    const colors: {[key: string]: string} = {
      'Fire': '#dc2626',
      'Water': '#2563eb',
      'Earth': '#16a34a',
      'Air': '#7c3aed',
      'Imposition': '#fbbf24',
      'Memory': '#a78bfa',
      'Intelligence': '#34d399',
      'Dimensional': '#60a5fa',
      'Truth': '#f87171',
      'Creation': '#f59e0b'
    };
    return colors[type] || '#6b7280';
  };

  const getLevel = (xp: number) => {
    return Math.floor(xp / 50) + 1;
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Xiotein School Leaderboard
        </h1>
        <p style={{ 
          fontSize: '1.1rem', 
          color: '#6b7280',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          The most powerful manifestors at Xiotein School. Who will rise to the top?
        </p>
      </div>

      <div style={{ 
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        borderRadius: '1rem',
        padding: '1.5rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
      }}>
        {students.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>
            No students have manifested yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {students.map((student, index) => (
              <div key={student.id} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                padding: '1rem',
                background: index === 0 ? 'rgba(251, 191, 36, 0.2)' : 
                           index === 1 ? 'rgba(156, 163, 175, 0.2)' :
                           index === 2 ? 'rgba(180, 83, 9, 0.2)' : 'rgba(255,255,255,0.1)',
                border: index === 0 ? '1px solid rgba(251, 191, 36, 0.5)' :
                        index === 1 ? '1px solid rgba(156, 163, 175, 0.5)' :
                        index === 2 ? '1px solid rgba(180, 83, 9, 0.5)' : '1px solid rgba(255,255,255,0.2)',
                borderRadius: '0.5rem',
                color: 'white'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  minWidth: '60px'
                }}>
                  <span style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 'bold',
                    color: index === 0 ? '#fbbf24' : 
                           index === 1 ? '#9ca3af' :
                           index === 2 ? '#b45309' : 'white'
                  }}>
                    #{index + 1}
                  </span>
                  {index < 3 && (
                    <span style={{ fontSize: '1.5rem' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </span>
                  )}
                </div>
                
                <img
                  src={student.photoURL || `https://ui-avatars.com/api/?name=${student.displayName}&background=4f46e5&color=fff&size=48`}
                  alt="Avatar"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                />
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    marginBottom: '0.25rem'
                  }}>
                    <span style={{ 
                      fontWeight: 'bold', 
                      fontSize: '1.1rem',
                      color: '#fbbf24'
                    }}>
                      {student.displayName || 'Unnamed Student'}
                    </span>
                    {student.manifestationType && (
                      <span style={{ 
                        fontSize: '0.7rem',
                        padding: '0.2rem 0.4rem',
                        background: getManifestationColor(student.manifestationType),
                        color: 'white',
                        borderRadius: '0.25rem',
                        fontWeight: 'bold'
                      }}>
                        {student.manifestationType}
                      </span>
                    )}
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    fontSize: '0.875rem',
                    opacity: 0.8
                  }}>
                    <span>Level {getLevel(student.xp || 0)}</span>
                    <span>Chapter {student.storyChapter || 1}</span>
                  </div>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'flex-end',
                  gap: '0.25rem'
                }}>
                  <div style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: 'bold',
                    color: '#fbbf24'
                  }}>
                    {student.xp || 0} XP
                  </div>
                  <div style={{ 
                    fontSize: '0.875rem',
                    color: '#34d399'
                  }}>
                    {student.powerPoints || 0} PP
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard; 