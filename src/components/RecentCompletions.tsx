import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

interface Completion {
  id: string;
  userId: string;
  displayName: string;
  photoURL: string;
  challenge: string;
  manifestationType?: string;
  character?: string;
  timestamp: any;
}

const RecentCompletions = () => {
  const [completions, setCompletions] = useState<Completion[]>([]);

  useEffect(() => {
    const fetchCompletions = async () => {
      const q = query(
        collection(db, 'challengeCompletions'),
        orderBy('timestamp', 'desc'),
        limit(5)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Completion[];
      setCompletions(list);
    };

    fetchCompletions();
  }, []);

  const getCharacterIcon = (character: string) => {
    const icons: {[key: string]: string} = {
      'Sage': '🧙‍♂️',
      'Alejandra': '🌟',
      'Greg': '💪',
      'Allen': '🔥',
      'Khalil': '🐍'
    };
    return icons[character] || '✨';
  };

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

  return (
    <div style={{ 
      padding: '1.5rem', 
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', 
      color: 'white',
      borderRadius: '1rem',
      boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
    }}>
      <h2 style={{ 
        fontSize: '1.25rem', 
        fontWeight: 'bold', 
        marginBottom: '1rem',
        textAlign: 'center',
        color: '#fbbf24'
      }}>
        Recent Manifestations
      </h2>
      {completions.length === 0 ? (
        <p style={{ textAlign: 'center', opacity: 0.7, fontStyle: 'italic' }}>
          No manifestations yet. Be the first to complete a challenge!
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {completions.map((completion) => (
            <div key={completion.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              padding: '0.75rem',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <img
                src={completion.photoURL || `https://ui-avatars.com/api/?name=${completion.displayName}&background=4f46e5&color=fff&size=32`}
                alt="Avatar"
                style={{
                  width: '32px',
                  height: '32px',
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
                    fontSize: '0.875rem',
                    color: '#fbbf24'
                  }}>
                    {completion.displayName}
                  </span>
                  {completion.character && (
                    <span style={{ fontSize: '1rem' }}>
                      {getCharacterIcon(completion.character)}
                    </span>
                  )}
                </div>
                <div style={{ 
                  fontSize: '0.8rem', 
                  opacity: 0.9,
                  marginBottom: '0.25rem'
                }}>
                  {completion.challenge}
                </div>
                {completion.manifestationType && (
                  <span style={{ 
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.4rem',
                    background: getManifestationColor(completion.manifestationType),
                    color: 'white',
                    borderRadius: '0.25rem',
                    fontWeight: 'bold'
                  }}>
                    {completion.manifestationType}
                  </span>
                )}
              </div>
              <div style={{ 
                fontSize: '0.7rem', 
                opacity: 0.7,
                textAlign: 'right',
                minWidth: '60px'
              }}>
                {completion.timestamp?.toDate ? 
                  completion.timestamp.toDate().toLocaleDateString() : 
                  'Just now'
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentCompletions; 