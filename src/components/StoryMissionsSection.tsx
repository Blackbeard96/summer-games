/**
 * Story Missions Section
 * 
 * Displays story missions for the current chapter in Player Journey tab
 * Shows missions ordered by story.order with status badges and CTAs
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getMissionTemplates,
  getPlayerMissions,
  getPlayerStoryProgress,
  acceptMission,
  getMissionStatus,
  checkPrerequisites,
  checkGating
} from '../utils/missionsService';
import { MissionTemplate, PlayerMission } from '../types/missions';

interface StoryMissionsSectionProps {
  chapterId: string; // e.g. "chapter_1", "chapter_2"
  chapterTitle: string;
}

const StoryMissionsSection: React.FC<StoryMissionsSectionProps> = ({
  chapterId,
  chapterTitle
}) => {
  const { currentUser } = useAuth();
  const [storyMissions, setStoryMissions] = useState<MissionTemplate[]>([]);
  const [playerMissions, setPlayerMissions] = useState<PlayerMission[]>([]);
  const [missionStatuses, setMissionStatuses] = useState<{ [missionId: string]: 'available' | 'active' | 'completed' | 'locked' }>({});
  const [loading, setLoading] = useState(true);
  const [acceptingMissionId, setAcceptingMissionId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const loadMissions = async () => {
      setLoading(true);
      try {
        // Get story missions for this chapter
        const missions = await getMissionTemplates({
          category: 'STORY',
          chapterId,
          deliveryChannel: 'PLAYER_JOURNEY'
        });

        // Sort by story.order
        missions.sort((a, b) => {
          const orderA = a.story?.order || 999;
          const orderB = b.story?.order || 999;
          return orderA - orderB;
        });

        setStoryMissions(missions);

        // Get player missions
        const playerMissionsData = await getPlayerMissions(currentUser.uid);
        setPlayerMissions(playerMissionsData);

        // Get status for each mission
        const statuses: { [missionId: string]: 'available' | 'active' | 'completed' | 'locked' } = {};
        for (const mission of missions) {
          const playerMission = playerMissionsData.find(pm => pm.missionId === mission.id);
          
          if (playerMission) {
            if (playerMission.status === 'completed') {
              statuses[mission.id] = 'completed';
            } else {
              statuses[mission.id] = 'active';
            }
          } else {
            // Check prerequisites and gating
            const prerequisitesMet = await checkPrerequisites(currentUser.uid, mission);
            const gatingCheck = await checkGating(currentUser.uid, mission);
            
            if (prerequisitesMet && gatingCheck.met) {
              statuses[mission.id] = 'available';
            } else {
              statuses[mission.id] = 'locked';
            }
          }
        }
        setMissionStatuses(statuses);
      } catch (error) {
        console.error('Error loading story missions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMissions();
  }, [currentUser, chapterId]);

  const handleAcceptMission = async (missionId: string) => {
    if (!currentUser || acceptingMissionId) return;

    setAcceptingMissionId(missionId);
    try {
      const result = await acceptMission(currentUser.uid, missionId, 'PLAYER_JOURNEY');
      if (result.success) {
        // Reload missions
        const playerMissionsData = await getPlayerMissions(currentUser.uid);
        setPlayerMissions(playerMissionsData);
        
        // Update status
        setMissionStatuses(prev => ({
          ...prev,
          [missionId]: 'active'
        }));
      } else {
        alert(result.error || 'Failed to accept mission');
      }
    } catch (error) {
      console.error('Error accepting mission:', error);
      alert('Failed to accept mission');
    } finally {
      setAcceptingMissionId(null);
    }
  };

  const getStatusBadge = (status: 'available' | 'active' | 'completed' | 'locked') => {
    switch (status) {
      case 'available':
        return (
          <span style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: 'bold'
          }}>
            Available
          </span>
        );
      case 'active':
        return (
          <span style={{
            backgroundColor: '#fbbf24',
            color: '#1f2937',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: 'bold'
          }}>
            Active
          </span>
        );
      case 'completed':
        return (
          <span style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: 'bold'
          }}>
            ✓ Completed
          </span>
        );
      case 'locked':
        return (
          <span style={{
            backgroundColor: '#6b7280',
            color: 'white',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: 'bold'
          }}>
            Locked
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
        Loading story missions...
      </div>
    );
  }

  if (storyMissions.length === 0) {
    return null; // Don't show section if no story missions
  }

  // Check if chapter is complete
  const requiredMissions = storyMissions.filter(m => m.story?.required !== false);
  const completedRequiredMissions = requiredMissions.filter(m => 
    missionStatuses[m.id] === 'completed'
  );
  const isChapterComplete = completedRequiredMissions.length === requiredMissions.length;

  return (
    <div style={{
      marginBottom: '2rem',
      padding: '1.5rem',
      background: 'rgba(31, 41, 55, 0.9)',
      borderRadius: '1rem',
      border: '2px solid rgba(251, 191, 36, 0.3)'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ 
          color: '#fbbf24', 
          margin: 0, 
          fontSize: '1.5rem',
          marginBottom: '0.5rem'
        }}>
          📜 Story Missions — {chapterTitle}
        </h2>
        {isChapterComplete ? (
          <div style={{
            padding: '1rem',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '2px solid #10b981',
            borderRadius: '0.5rem',
            color: '#10b981',
            fontWeight: 'bold',
            marginTop: '1rem'
          }}>
            ✓ Chapter Complete! Next chapter unlocked.
          </div>
        ) : (
          <p style={{ color: '#d1d5db', margin: 0, fontSize: '0.9rem' }}>
            Complete all required missions to unlock the next chapter.
            ({completedRequiredMissions.length}/{requiredMissions.length} completed)
          </p>
        )}
      </div>

      {/* Mission List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {storyMissions.map((mission) => {
          const status = missionStatuses[mission.id] || 'locked';
          const isRequired = mission.story?.required !== false;

          return (
            <div
              key={mission.id}
              style={{
                background: status === 'active' 
                  ? 'rgba(251, 191, 36, 0.1)' 
                  : status === 'completed'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(59, 130, 246, 0.1)',
                border: `2px solid ${
                  status === 'active' 
                    ? '#fbbf24' 
                    : status === 'completed'
                    ? '#10b981'
                    : status === 'locked'
                    ? '#6b7280'
                    : '#3b82f6'
                }`,
                borderRadius: '0.5rem',
                padding: '1rem'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'start',
                marginBottom: '0.5rem'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h3 style={{ color: 'white', margin: 0, fontSize: '1.1rem' }}>
                      {mission.title}
                    </h3>
                    {isRequired && (
                      <span style={{
                        backgroundColor: '#ef4444',
                        color: 'white',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}>
                        Required
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#d1d5db', margin: 0, fontSize: '0.9rem' }}>
                    {mission.description}
                  </p>
                </div>
                {getStatusBadge(status)}
              </div>

              {/* CTA Buttons */}
              <div style={{ marginTop: '1rem' }}>
                {status === 'available' && (
                  <button
                    onClick={() => handleAcceptMission(mission.id)}
                    disabled={acceptingMissionId === mission.id}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      cursor: acceptingMissionId === mission.id ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      opacity: acceptingMissionId === mission.id ? 0.5 : 1
                    }}
                  >
                    {acceptingMissionId === mission.id ? 'Accepting...' : 'Accept Mission'}
                  </button>
                )}
                {status === 'active' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ 
                      color: '#fbbf24', 
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      ✓ Mission Active
                    </span>
                  </div>
                )}
                {status === 'completed' && (
                  <span style={{ 
                    color: '#10b981', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    ✓ Mission Completed
                  </span>
                )}
                {status === 'locked' && (
                  <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    Complete previous missions to unlock
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StoryMissionsSection;

