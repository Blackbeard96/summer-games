import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import AssessmentGoalResultModal from './AssessmentGoalResultModal';
import { ArtifactReward } from '../types/assessmentGoals';

interface AssessmentGoalResultNotification {
  id: string;
  type: 'assessment_goal_result';
  message: string;
  assessmentId: string;
  assessmentTitle: string;
  goalScore: number;
  actualScore: number;
  maxScore?: number;
  outcome: 'hit' | 'miss' | 'exceed';
  ppChange: number;
  artifactsGranted?: ArtifactReward[];
  timestamp?: Timestamp;
  read: boolean;
}

const AssessmentGoalResultNotifier: React.FC = () => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AssessmentGoalResultNotification[]>([]);
  const [currentNotification, setCurrentNotification] = useState<AssessmentGoalResultNotification | null>(null);
  const [maxScore, setMaxScore] = useState<number>(100);

  // Get the first unread notification
  const activeNotification = useMemo(() => {
    return notifications.find(n => !n.read) || null;
  }, [notifications]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    // Listen for assessment_goal_result notifications
    const notificationsQuery = query(
      collection(db, 'students', currentUser.uid, 'notifications'),
      where('type', '==', 'assessment_goal_result'),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const newNotifications: AssessmentGoalResultNotification[] = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<AssessmentGoalResultNotification, 'id'>)
      }));

      // Sort by timestamp (newest first)
      newNotifications.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
      });

      setNotifications(newNotifications);
    }, (error) => {
      console.error('AssessmentGoalResultNotifier: Failed to fetch notifications', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // When a new notification appears, show the modal
  useEffect(() => {
    if (activeNotification && !currentNotification) {
      // Use maxScore from notification if available, otherwise fetch it
      if (activeNotification.maxScore) {
        setMaxScore(activeNotification.maxScore);
        setCurrentNotification(activeNotification);
      } else {
        // Fallback: Fetch assessment to get maxScore
        const fetchAssessment = async () => {
          try {
            const { getAssessment } = await import('../utils/assessmentGoalsFirestore');
            const assessment = await getAssessment(activeNotification.assessmentId);
            if (assessment) {
              setMaxScore(assessment.maxScore || 100);
            }
          } catch (error) {
            console.error('Error fetching assessment:', error);
            setMaxScore(100); // Default fallback
          }
          setCurrentNotification(activeNotification);
        };
        fetchAssessment();
      }
    }
  }, [activeNotification, currentNotification]);

  const handleCloseModal = () => {
    setCurrentNotification(null);
    // The notification will be marked as read by the modal component
  };

  if (!currentNotification) {
    return null;
  }

  return (
    <AssessmentGoalResultModal
      isOpen={!!currentNotification}
      onClose={handleCloseModal}
      notificationId={currentNotification.id}
      assessmentTitle={currentNotification.assessmentTitle}
      goalScore={currentNotification.goalScore}
      actualScore={currentNotification.actualScore}
      maxScore={maxScore}
      outcome={currentNotification.outcome}
      ppChange={currentNotification.ppChange}
      artifactsGranted={currentNotification.artifactsGranted}
    />
  );
};

export default AssessmentGoalResultNotifier;

