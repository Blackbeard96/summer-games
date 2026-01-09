import React from 'react';
import { useNavigate } from 'react-router-dom';

const SkillTree: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
          🌳 Skill Tree
        </h1>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '0.75rem',
        padding: '2rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb'
      }}>
        <p style={{ fontSize: '1.125rem', color: '#6b7280', textAlign: 'center' }}>
          Skill Tree coming soon! This is where you'll be able to unlock and upgrade your RR Candy abilities.
        </p>
      </div>
    </div>
  );
};

export default SkillTree;











