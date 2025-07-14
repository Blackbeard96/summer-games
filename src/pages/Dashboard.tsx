import React from 'react';
import ChallengeTracker from '../components/ChallengeTracker';
import RecentCompletions from '../components/RecentCompletions';

const Dashboard = () => {
  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Welcome to Xiotein School
        </h1>
        <p style={{ 
          fontSize: '1.1rem', 
          color: '#6b7280', 
          maxWidth: '600px', 
          margin: '0 auto',
          lineHeight: '1.6'
        }}>
          You have been chosen to manifest your truth. Complete challenges to unlock your potential and advance through the chapters of your story.
        </p>
      </div>
      
      <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
        <ChallengeTracker />
        <RecentCompletions />
      </div>
    </div>
  );
};

export default Dashboard; 