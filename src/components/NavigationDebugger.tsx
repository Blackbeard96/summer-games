import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NavigationDebugger: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [navigationLog, setNavigationLog] = useState<string[]>([]);

  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: Navigated to ${location.pathname}`;
    setNavigationLog(prev => [...prev.slice(-9), logEntry]); // Keep last 10 entries
  }, [location.pathname]);

  const testNavigation = (path: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: Attempting navigation to ${path}`;
    setNavigationLog(prev => [...prev.slice(-9), logEntry]);
    
    try {
      navigate(path);
    } catch (error) {
      const errorEntry = `${timestamp}: Navigation error - ${error}`;
      setNavigationLog(prev => [...prev.slice(-9), errorEntry]);
    }
  };

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '1rem',
      borderRadius: '0.5rem',
      fontSize: '0.8rem',
      maxWidth: '300px',
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981' }}>🧭 Navigation Debug</h4>
      
      <div style={{ marginBottom: '0.5rem' }}>
        <strong>Current Path:</strong> {location.pathname}
      </div>
      
      <div style={{ marginBottom: '0.5rem' }}>
        <strong>User:</strong> {currentUser?.email || 'Not logged in'}
      </div>
      
      <div style={{ marginBottom: '1rem' }}>
        <strong>Navigation Log:</strong>
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '0.5rem', 
          borderRadius: '0.25rem',
          maxHeight: '150px',
          overflow: 'auto',
          fontSize: '0.7rem'
        }}>
          {navigationLog.map((entry, index) => (
            <div key={index} style={{ marginBottom: '0.25rem' }}>
              {entry}
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <button
          onClick={() => testNavigation('/')}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.7rem',
            cursor: 'pointer'
          }}
        >
          Test: Dashboard
        </button>
        
        <button
          onClick={() => testNavigation('/profile')}
          style={{
            background: '#8b5cf6',
            color: 'white',
            border: 'none',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.7rem',
            cursor: 'pointer'
          }}
        >
          Test: Profile
        </button>
        
        <button
          onClick={() => testNavigation('/admin')}
          style={{
            background: '#dc2626',
            color: 'white',
            border: 'none',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.7rem',
            cursor: 'pointer'
          }}
        >
          Test: Admin
        </button>
        
        <button
          onClick={() => testNavigation('/chapters')}
          style={{
            background: '#10b981',
            color: 'white',
            border: 'none',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.7rem',
            cursor: 'pointer'
          }}
        >
          Test: Chapters
        </button>
      </div>
      
      <button
        onClick={() => setNavigationLog([])}
        style={{
          background: '#6b7280',
          color: 'white',
          border: 'none',
          padding: '0.25rem 0.5rem',
          borderRadius: '0.25rem',
          fontSize: '0.7rem',
          cursor: 'pointer',
          marginTop: '0.5rem',
          width: '100%'
        }}
      >
        Clear Log
      </button>
    </div>
  );
};

export default NavigationDebugger;

