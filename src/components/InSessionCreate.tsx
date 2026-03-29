import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { LiveEventModeType, EnergyType } from '../types/season1';
import { getEnergyTypeForMode } from '../utils/season1Energy';

const InSessionCreate: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [className, setClassName] = useState('');
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveEventMode, setLiveEventMode] = useState<LiveEventModeType>('class_flow');
  const [goalLinkingEnabled, setGoalLinkingEnabled] = useState(true);
  const [neutralEnergyOverride, setNeutralEnergyOverride] = useState<EnergyType>('kinetic');

  useEffect(() => {
    if (!currentUser) return;

    const fetchUserClass = async () => {
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const userClassId = studentData.classId || studentData.class || '';
          const userClassName = studentData.className || userClassId;
          
          setClassId(userClassId);
          setClassName(userClassName);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user class:', error);
        setLoading(false);
      }
    };

    fetchUserClass();
  }, [currentUser]);

  const handleCreateRoom = async () => {
    if (!currentUser || !classId) {
      alert('You must be assigned to a class to create a session room.');
      return;
    }

    try {
      const energyTypeAwarded =
        liveEventMode === 'neutral_flow'
          ? neutralEnergyOverride
          : getEnergyTypeForMode(liveEventMode);

      const roomData = {
        classId,
        className,
        teacherId: currentUser.uid,
        status: 'open' as const,
        /** Season 1 — live event taxonomy (defaults safe for older clients). */
        liveEventMode,
        goalLinkingEnabled,
        energyTypeAwarded,
        ...(liveEventMode === 'neutral_flow' ? { neutralFlowEnergyType: neutralEnergyOverride } : {}),
        players: [{
          userId: currentUser.uid,
          displayName: currentUser.displayName || 'Teacher',
          photoURL: currentUser.photoURL,
          isReady: false,
          isTeacher: true
        }],
        activeLaws: [],
        battleLog: ['📚 In Session Battle Started!', `🌊 Season 1 mode: ${liveEventMode.replace(/_/g, ' ')}`],
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'inSessionRooms'), roomData);
      navigate(`/in-session/room/${docRef.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create session room. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!classId) {
    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '2rem'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>No Class Assigned</h2>
          <p style={{ color: '#6b7280' }}>
            You need to be assigned to a class to create a session room.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '1rem',
        padding: '2rem'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Create In Session Room</h2>
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
            Class: <strong>{className}</strong>
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            All students from this class will be able to join and battle each other.
            You can create laws using Power Card moves that all players must follow.
          </p>
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Live event mode (Season 1)</label>
          <select
            value={liveEventMode}
            onChange={(e) => setLiveEventMode(e.target.value as LiveEventModeType)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 8, border: '1px solid #d1d5db' }}
          >
            <option value="class_flow">Class Flow — timed sprints &amp; participation (Kinetic)</option>
            <option value="battle_royale">Battle Royale — Kinetic</option>
            <option value="quiz">Quiz — Mental</option>
            <option value="reflection">Reflection — Emotional</option>
            <option value="goal_setting">Goal Setting — Spiritual</option>
            <option value="neutral_flow">Neutral Flow — configurable energy</option>
          </select>
          {liveEventMode === 'neutral_flow' && (
            <select
              value={neutralEnergyOverride}
              onChange={(e) => setNeutralEnergyOverride(e.target.value as EnergyType)}
              style={{ width: '100%', marginTop: 8, padding: '0.5rem', borderRadius: 8, border: '1px solid #d1d5db' }}
            >
              <option value="kinetic">Kinetic</option>
              <option value="mental">Mental</option>
              <option value="emotional">Emotional</option>
              <option value="spiritual">Spiritual</option>
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '0.9rem' }}>
            <input type="checkbox" checked={goalLinkingEnabled} onChange={(e) => setGoalLinkingEnabled(e.target.checked)} />
            Link player responses to goals (Season 1)
          </label>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={handleCreateRoom}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              flex: 1
            }}
          >
            Create Room
          </button>
          <button
            onClick={() => navigate('/in-session')}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default InSessionCreate;







