import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot, serverTimestamp, runTransaction } from 'firebase/firestore';
import { checkInToSquad } from '../utils/squadStreamService';

interface DailyCheckInCardProps {
  squadId: string;
  currentUserId: string;
  squadMembers?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
}

interface CheckInData {
  dateKey: string;
  checkedInUserIds: string[];
  updatedAt: any;
  createdAt: any;
  awardedMilestones?: { [userId: string]: number };
}

const DailyCheckInCard: React.FC<DailyCheckInCardProps> = ({ squadId, currentUserId, squadMembers = [] }) => {
  const { currentUser } = useAuth();
  const [checkInData, setCheckInData] = useState<CheckInData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get today's date key (YYYY-MM-DD) in America/New_York timezone
  const getDateKey = (): string => {
    const now = new Date();
    // Convert to America/New_York timezone
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const year = nyTime.getFullYear();
    const month = String(nyTime.getMonth() + 1).padStart(2, '0');
    const day = String(nyTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dateKey = getDateKey();
  const checkInRef = doc(db, 'squads', squadId, 'dailyCheckins', dateKey);

  // Subscribe to today's check-in data
  useEffect(() => {
    setLoading(true);
    
    // Helper to check for Firestore internal errors (non-fatal)
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorCode = error?.code || '';
      return (
        errorString.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorCode === 'ca9' ||
        errorString.includes('ID: ca9') ||
        (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
      );
    };

    const unsubscribe = onSnapshot(
      checkInRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as CheckInData;
          setCheckInData({
            dateKey: data.dateKey || dateKey,
            checkedInUserIds: data.checkedInUserIds || [],
            updatedAt: data.updatedAt,
            createdAt: data.createdAt,
            awardedMilestones: data.awardedMilestones || {}
          });
        } else {
          setCheckInData({
            dateKey,
            checkedInUserIds: [],
            updatedAt: null,
            createdAt: null,
            awardedMilestones: {}
          });
        }
        setLoading(false);
      },
      (error) => {
        // Suppress Firestore internal assertion errors (non-fatal)
        if (isFirestoreInternalError(error)) {
          console.warn('Firestore internal error (non-fatal, suppressing):', error);
          // Try to fetch data once instead of using real-time listener
          getDoc(checkInRef).then((doc) => {
            if (doc.exists()) {
              const data = doc.data() as CheckInData;
              setCheckInData({
                dateKey: data.dateKey || dateKey,
                checkedInUserIds: data.checkedInUserIds || [],
                updatedAt: data.updatedAt,
                createdAt: data.createdAt,
                awardedMilestones: data.awardedMilestones || {}
              });
            } else {
              setCheckInData({
                dateKey,
                checkedInUserIds: [],
                updatedAt: null,
                createdAt: null,
                awardedMilestones: {}
              });
            }
            setLoading(false);
          }).catch((fetchError) => {
            console.error('Error fetching check-in data:', fetchError);
            setError('Failed to load check-in data');
            setLoading(false);
          });
          return;
        }
        
        console.error('Error listening to check-ins:', error);
        setError('Failed to load check-in data');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [squadId, dateKey]);

  const handleCheckIn = async () => {
    if (!currentUser) {
      setError('You must be logged in to check in');
      return;
    }

    if (checkingIn) return;

    setCheckingIn(true);
    setError(null);

    try {
      // Fetch the user's displayName from Firestore to ensure we have the correct name
      const { getDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      const displayName = userData?.displayName || currentUser.displayName || 'Unknown';
      
      console.log('[DailyCheckInCard] Check-in attempt:', {
        uid: currentUser.uid,
        displayName: displayName,
        currentUserDisplayName: currentUser.displayName,
        userDataDisplayName: userData?.displayName
      });

      const result = await checkInToSquad(squadId, currentUser.uid, displayName);
      
      if (result.success) {
        // Success - the real-time listener will update the UI
        console.log('Check-in successful:', result);
        
        // Create system message about the check-in
        const { createSystemMessage } = await import('../utils/squadStreamService');
        const count = result.count || 1;
        const totalPP = count * 50; // Total PP each checked-in member has earned
        const systemMessageText = count === 1
          ? `${displayName} checked in (+50 PP)`
          : `${displayName} checked in (+${totalPP} PP to all checked-in members)`;
        
        await createSystemMessage(squadId, systemMessageText, 'checkin');
      } else {
        setError(result.error || 'Failed to check in');
      }
    } catch (err: any) {
      console.error('Error checking in:', err);
      setError(err.message || 'Failed to check in');
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        border: '1px solid #e5e7eb',
        textAlign: 'center'
      }}>
        <p style={{ color: '#6b7280', margin: 0 }}>Loading check-in data...</p>
      </div>
    );
  }

  const checkedInCount = checkInData?.checkedInUserIds.length || 0;
  const maxMembers = 4;
  const progressPercent = (checkedInCount / maxMembers) * 100;
  const currentReward = checkedInCount * 50;
  const maxReward = maxMembers * 50; // 200 PP
  const hasCheckedIn = checkInData?.checkedInUserIds.includes(currentUserId) || false;

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: '#1f2937',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>✅</span>
          Daily Check-In
        </h3>
        <span style={{
          backgroundColor: hasCheckedIn ? '#10b981' : '#f3f4f6',
          color: hasCheckedIn ? 'white' : '#6b7280',
          padding: '0.25rem 0.75rem',
          borderRadius: '1rem',
          fontSize: '0.75rem',
          fontWeight: '500'
        }}>
          {checkedInCount}/{maxMembers} Checked In
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
          fontSize: '0.875rem',
          color: '#6b7280'
        }}>
          <span>Today's Progress</span>
          <span style={{ fontWeight: '600', color: '#1f2937' }}>
            {checkedInCount} / {maxMembers} members
          </span>
        </div>
        <div style={{
          backgroundColor: '#e5e7eb',
          borderRadius: '0.5rem',
          height: '0.75rem',
          overflow: 'hidden'
        }}>
          <div style={{
            backgroundColor: '#10b981',
            height: '100%',
            width: `${progressPercent}%`,
            transition: 'width 0.3s ease',
            borderRadius: '0.5rem'
          }} />
        </div>
      </div>

      {/* Reward Info */}
      <div style={{
        backgroundColor: '#fef3c7',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        marginBottom: '1rem',
        border: '1px solid #fde68a'
      }}>
        <div style={{
          fontSize: '0.875rem',
          color: '#92400e',
          fontWeight: '500',
          marginBottom: '0.25rem'
        }}>
          Current Reward
        </div>
        <div style={{
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: '#78350f'
        }}>
          {currentReward} PP {checkedInCount < maxMembers ? `(max ${maxReward})` : ''}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: '#92400e',
          marginTop: '0.25rem'
        }}>
          {checkedInCount === 0 
            ? 'Be the first to check in and earn 50 PP!'
            : checkedInCount < maxMembers
            ? `Each check-in adds +50 PP for all checked-in members`
            : 'Maximum reward reached! All members checked in.'}
        </div>
      </div>

      {/* Checked-In Members */}
      {checkedInCount > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '0.5rem'
          }}>
            Checked In Today:
          </div>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            {checkInData?.checkedInUserIds.map((userId) => {
              const member = squadMembers.find(m => m.uid === userId);
              const displayName = member?.displayName || userId.substring(0, 8);
              return (
                <div
                  key={userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    backgroundColor: '#f3f4f6',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '1rem',
                    fontSize: '0.75rem',
                    color: '#374151'
                  }}
                >
                  <span>✅</span>
                  <span>{userId === currentUserId ? 'You' : displayName}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {/* Check In Button */}
      <button
        onClick={handleCheckIn}
        disabled={hasCheckedIn || checkingIn}
        style={{
          width: '100%',
          backgroundColor: hasCheckedIn ? '#d1d5db' : '#4f46e5',
          color: 'white',
          border: 'none',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: hasCheckedIn || checkingIn ? 'not-allowed' : 'pointer',
          opacity: hasCheckedIn || checkingIn ? 0.6 : 1,
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          if (!hasCheckedIn && !checkingIn) {
            e.currentTarget.style.backgroundColor = '#4338ca';
          }
        }}
        onMouseOut={(e) => {
          if (!hasCheckedIn && !checkingIn) {
            e.currentTarget.style.backgroundColor = '#4f46e5';
          }
        }}
      >
        {checkingIn ? 'Checking In...' : hasCheckedIn ? '✓ Already Checked In' : 'Check In'}
      </button>
    </div>
  );
};

export default DailyCheckInCard;

