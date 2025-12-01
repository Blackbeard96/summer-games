import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface BadgeNotification {
  id: string;
  badgeId: string;
  badgeName: string;
  description?: string;
  imageUrl?: string;
  xpReward?: number;
  ppReward?: number;
  awardedAt?: any;
  read?: boolean;
}

const formatDate = (timestamp: any) => {
  if (!timestamp) return '';
  try {
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleString();
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.warn('BadgeRewardNotifier: Failed to format date', error);
    return '';
  }
};

const BadgeRewardNotifier: React.FC = () => {
  const { currentUser } = useAuth();
  const [queue, setQueue] = useState<BadgeNotification[]>([]);
  const activeNotification = useMemo(() => (queue.length > 0 ? queue[0] : null), [queue]);

  useEffect(() => {
    if (!currentUser) {
      setQueue([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'students', currentUser.uid, 'badgeNotifications'),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const notifications: BadgeNotification[] = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<BadgeNotification, 'id'>)
      }));

      // Sort by awardedAt descending so newest first
      notifications.sort((a, b) => {
        const dateA = a.awardedAt?.toMillis ? a.awardedAt.toMillis() : new Date(a.awardedAt || 0).getTime();
        const dateB = b.awardedAt?.toMillis ? b.awardedAt.toMillis() : new Date(b.awardedAt || 0).getTime();
        return dateB - dateA;
      });

      setQueue(notifications);
    }, (error) => {
      console.error('BadgeRewardNotifier: Failed to fetch notifications', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const acknowledgeNotification = async () => {
    if (!currentUser || !activeNotification) {
      setQueue((prev) => prev.slice(1));
      return;
    }

    try {
      const notificationRef = doc(db, 'students', currentUser.uid, 'badgeNotifications', activeNotification.id);
      await updateDoc(notificationRef, {
        read: true,
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error('BadgeRewardNotifier: Failed to mark notification as read', error);
    } finally {
      setQueue((prev) => prev.filter((notification) => notification.id !== activeNotification.id));
    }
  };

  if (!activeNotification) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(17, 24, 39, 0.65)',
      zIndex: 100000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '450px',
        width: '100%',
        color: 'white',
        boxShadow: '0 20px 60px rgba(79, 70, 229, 0.35)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏅</div>
        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>New Badge Earned!</h2>
        <p style={{ marginTop: '0.5rem', fontSize: '1rem', opacity: 0.9 }}>
          {formatDate(activeNotification.awardedAt)}
        </p>

        <div style={{
          marginTop: '1.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          borderRadius: '0.75rem',
          padding: '1.5rem'
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {activeNotification.badgeName}
          </div>
          {activeNotification.description && (
            <p style={{ fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              {activeNotification.description}
            </p>
          )}
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
            {`+${activeNotification.xpReward ?? 0} XP • +${activeNotification.ppReward ?? 0} PP`}
          </div>
        </div>

        <button
          onClick={acknowledgeNotification}
          style={{
            marginTop: '1.5rem',
            backgroundColor: 'white',
            color: '#4f46e5',
            border: 'none',
            borderRadius: '9999px',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '1rem',
            boxShadow: '0 10px 30px rgba(255, 255, 255, 0.25)'
          }}
        >
          Awesome!
        </button>
      </div>
    </div>
  );
};

export default BadgeRewardNotifier;


