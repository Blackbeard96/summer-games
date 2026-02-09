import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import RewardNotificationModal, { RewardData } from './RewardNotificationModal';

interface BadgeNotification {
  id: string;
  badgeId: string;
  badgeName: string;
  description?: string;
  imageUrl?: string;
  xpReward?: number;
  ppReward?: number;
  originalPP?: number;
  newPP?: number;
  artifactRewards?: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  awardedAt?: any;
  read?: boolean;
}

interface PPApprovalNotification {
  id: string;
  type: 'pp_change_approved';
  message: string;
  changeAmount: number;
  originalPP?: number;
  newTotal: number;
  scorekeeperName?: string;
  timestamp?: any;
  read?: boolean;
}

const RewardNotifier: React.FC = () => {
  const { currentUser } = useAuth();
  const [badgeQueue, setBadgeQueue] = useState<BadgeNotification[]>([]);
  const [ppQueue, setPPQueue] = useState<PPApprovalNotification[]>([]);
  const [currentReward, setCurrentReward] = useState<RewardData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Listen for badge notifications
  useEffect(() => {
    if (!currentUser) {
      setBadgeQueue([]);
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

      setBadgeQueue(notifications);
    }, (error) => {
      console.error('RewardNotifier: Failed to fetch badge notifications', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Listen for PP approval notifications
  useEffect(() => {
    if (!currentUser) {
      setPPQueue([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'students', currentUser.uid, 'notifications'),
      where('type', '==', 'pp_change_approved'),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const notifications: PPApprovalNotification[] = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          type: 'pp_change_approved' as const,
          message: data.message || '',
          changeAmount: data.changeAmount || 0,
          originalPP: data.originalPP,
          newTotal: data.newTotal || 0,
          scorekeeperName: data.scorekeeperName,
          timestamp: data.timestamp,
          read: data.read || false
        };
      });

      // Sort by timestamp descending so newest first
      notifications.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
      });

      setPPQueue(notifications);
    }, (error) => {
      console.error('RewardNotifier: Failed to fetch PP approval notifications', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Process queues and show modals
  useEffect(() => {
    // Priority: Badge notifications first, then PP approvals
    if (badgeQueue.length > 0 && !isModalOpen) {
      const badge = badgeQueue[0];
      
      // Fetch current student data to get original PP
      const fetchStudentData = async () => {
        try {
          const studentRef = doc(db, 'students', currentUser!.uid);
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          
          const reward: RewardData = {
            badgeId: badge.badgeId,
            badgeName: badge.badgeName,
            badgeDescription: badge.description,
            badgeImageUrl: badge.imageUrl,
            xpReward: badge.xpReward || 0,
            awardedAt: badge.awardedAt,
            notificationId: badge.id,
            notificationType: 'badge',
            originalPP: badge.originalPP !== undefined ? badge.originalPP : (studentData.powerPoints || 0),
            newPP: badge.newPP !== undefined ? badge.newPP : ((studentData.powerPoints || 0) + (badge.ppReward || 0)),
            ppChange: badge.ppReward || 0,
            artifacts: badge.artifactRewards || []
          };
          
          setCurrentReward(reward);
          setIsModalOpen(true);
        } catch (error) {
          console.error('Error fetching student data for badge reward:', error);
          // Fallback: show modal without PP data
          const reward: RewardData = {
            badgeId: badge.badgeId,
            badgeName: badge.badgeName,
            badgeDescription: badge.description,
            badgeImageUrl: badge.imageUrl,
            xpReward: badge.xpReward || 0,
            awardedAt: badge.awardedAt,
            notificationId: badge.id,
            notificationType: 'badge',
            originalPP: badge.originalPP,
            newPP: badge.newPP,
            ppChange: badge.ppReward || 0,
            artifacts: badge.artifactRewards || []
          };
          setCurrentReward(reward);
          setIsModalOpen(true);
        }
      };
      
      fetchStudentData();
    } else if (ppQueue.length > 0 && !isModalOpen && badgeQueue.length === 0) {
      const ppNotif = ppQueue[0];
      
      // Fetch current student data to get original PP
      const fetchStudentData = async () => {
        try {
          const studentRef = doc(db, 'students', currentUser!.uid);
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          
          const reward: RewardData = {
            ppChange: ppNotif.changeAmount,
            originalPP: ppNotif.originalPP !== undefined ? ppNotif.originalPP : (studentData.powerPoints || 0),
            newPP: ppNotif.newTotal,
            awardedAt: ppNotif.timestamp,
            notificationId: ppNotif.id,
            notificationType: 'pp_approval',
            scorekeeperName: ppNotif.scorekeeperName
          };
          
          setCurrentReward(reward);
          setIsModalOpen(true);
        } catch (error) {
          console.error('Error fetching student data for PP reward:', error);
          // Fallback: use notification data
          const reward: RewardData = {
            ppChange: ppNotif.changeAmount,
            originalPP: ppNotif.originalPP,
            newPP: ppNotif.newTotal,
            awardedAt: ppNotif.timestamp,
            notificationId: ppNotif.id,
            notificationType: 'pp_approval',
            scorekeeperName: ppNotif.scorekeeperName
          };
          setCurrentReward(reward);
          setIsModalOpen(true);
        }
      };
      
      fetchStudentData();
    }
  }, [badgeQueue, ppQueue, isModalOpen, currentUser]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Remove the current notification from queue after a short delay
    setTimeout(() => {
      if (currentReward?.notificationType === 'badge') {
        setBadgeQueue((prev) => prev.filter((n) => n.id !== currentReward.notificationId));
      } else if (currentReward?.notificationType === 'pp_approval') {
        setPPQueue((prev) => prev.filter((n) => n.id !== currentReward.notificationId));
      }
      setCurrentReward(null);
    }, 300);
  };

  if (!currentReward) {
    return null;
  }

  return (
    <RewardNotificationModal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      reward={currentReward}
    />
  );
};

export default RewardNotifier;

