import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import BadgeRewardModal from './BadgeRewardModal';

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

  const handleCloseModal = () => {
    // Remove the current notification from queue
    setQueue((prev) => prev.filter((notification) => notification.id !== activeNotification?.id));
  };

  if (!activeNotification) {
    return null;
  }

  return (
    <BadgeRewardModal
      isOpen={!!activeNotification}
      onClose={handleCloseModal}
      notificationId={activeNotification.id}
      badgeId={activeNotification.badgeId}
      badgeName={activeNotification.badgeName}
      description={activeNotification.description}
      imageUrl={activeNotification.imageUrl}
      xpReward={activeNotification.xpReward}
      ppReward={activeNotification.ppReward}
      awardedAt={activeNotification.awardedAt}
    />
  );
};

export default BadgeRewardNotifier;


