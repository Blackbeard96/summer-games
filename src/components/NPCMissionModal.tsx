/**
 * NPC Mission Modal
 * 
 * Shows missions available from a specific NPC (Sonido, Zeke, Luz, Kon)
 * Displays STORY missions pinned at top, then SIDE missions below
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  getMissionTemplates, 
  getPlayerMissions, 
  getPlayerStoryProgress,
  acceptMission,
  getMissionStatus,
  getActiveStoryMissionForChapter
} from '../utils/missionsService';
import { MissionTemplate, PlayerMission, DeliveryChannel } from '../types/missions';

interface NPCMissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  npc: 'sonido' | 'zeke' | 'luz' | 'kon';
  npcName: string;
  npcImage?: string;
}

const NPCMissionModal: React.FC<NPCMissionModalProps> = ({
  isOpen,
  onClose,
  npc,
  npcName,
  npcImage
}) => {
  const { currentUser } = useAuth();
  const [sideMissions, setSideMissions] = useState<MissionTemplate[]>([]);
  const [storyMissions, setStoryMissions] = useState<MissionTemplate[]>([]);
  const [playerMissions, setPlayerMissions] = useState<PlayerMission[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<string>('chapter_1');
  const [activeStoryMission, setActiveStoryMission] = useState<PlayerMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptingMissionId, setAcceptingMissionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const loadMissions = async () => {
      setLoading(true);
      try {
        // Get player story progress
        const progress = await getPlayerStoryProgress(currentUser.uid);
        if (progress) {
          setCurrentChapterId(progress.currentChapterId);
        }

        // Get active story mission for current chapter
        if (progress) {
          const active = await getActiveStoryMissionForChapter(
            currentUser.uid,
            progress.currentChapterId
          );
          setActiveStoryMission(active);
        }

        // Get player missions
        const playerMissionsData = await getPlayerMissions(currentUser.uid);
        setPlayerMissions(playerMissionsData);

        // Fetch SIDE missions for this NPC
        const sideMissionsData = await getMissionTemplates({
          category: 'SIDE',
          npc,
          deliveryChannel: 'HUB_NPC'
        });
        // Limit to 3
        setSideMissions(sideMissionsData.slice(0, 3));

        // Fetch STORY missions for this NPC and current chapter
        if (progress) {
          const storyMissionsData = await getMissionTemplates({
            category: 'STORY',
            npc,
            chapterId: progress.currentChapterId,
            deliveryChannel: 'HUB_NPC'
          });
          setStoryMissions(storyMissionsData);
        }
      } catch (error) {
        console.error('Error loading missions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMissions();
  }, [isOpen, currentUser, npc]);

  const handleAcceptMission = async (missionId: string) => {
    if (!currentUser || acceptingMissionId) return;

    setAcceptingMissionId(missionId);
    try {
      const result = await acceptMission(currentUser.uid, missionId, 'HUB_NPC');
      if (result.success) {
        // Reload missions
        const playerMissionsData = await getPlayerMissions(currentUser.uid);
        setPlayerMissions(playerMissionsData);
        
        // Reload active story mission
        const progress = await getPlayerStoryProgress(currentUser.uid);
        if (progress) {
          const active = await getActiveStoryMissionForChapter(
            currentUser.uid,
            progress.currentChapterId
          );
          setActiveStoryMission(active);
        }
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

  const getMissionPlayerStatus = (missionId: string): 'available' | 'active' | 'completed' => {
    const playerMission = playerMissions.find(pm => pm.missionId === missionId);
    if (!playerMission) return 'available';
    if (playerMission.status === 'completed') return 'completed';
    return 'active';
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '2rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '2px solid #3b82f6'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          {npcImage && (
            <img
              src={npcImage}
              alt={npcName}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                marginBottom: '1rem',
                objectFit: 'cover'
              }}
            />
          )}
          <h2 style={{ color: 'white', margin: 0, fontSize: '1.75rem' }}>
            {npcName}'s Missions
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'white', padding: '2rem' }}>
            Loading missions...
          </div>
        ) : (
          <>
            {/* STORY Missions Section */}
            {storyMissions.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#fbbf24', marginBottom: '1rem', fontSize: '1.25rem' }}>
                  📜 STORY — Main Objective
                </h3>
                {storyMissions.map((mission) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const isActive = activeStoryMission?.missionId === mission.id;
                  
                  return (
                    <div
                      key={mission.id}
                      style={{
                        backgroundColor: status === 'active' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                        border: `2px solid ${status === 'active' ? '#fbbf24' : '#3b82f6'}`,
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        marginBottom: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h4 style={{ color: 'white', margin: 0, fontSize: '1.1rem' }}>
                          {mission.title}
                        </h4>
                        {status === 'active' && (
                          <span style={{ 
                            backgroundColor: '#fbbf24', 
                            color: '#1f2937',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            ACTIVE
                          </span>
                        )}
                        {status === 'completed' && (
                          <span style={{ 
                            backgroundColor: '#10b981', 
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            ✓ COMPLETED
                          </span>
                        )}
                      </div>
                      <p style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.9rem' }}>
                        {mission.description}
                      </p>
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
                        <button
                          onClick={() => {
                            // Navigate to Player Journey to track
                            window.location.href = '/chapters';
                          }}
                          style={{
                            backgroundColor: '#fbbf24',
                            color: '#1f2937',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          Track Mission
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* SIDE Missions Section */}
            {sideMissions.length > 0 && (
              <div>
                <h3 style={{ color: '#3b82f6', marginBottom: '1rem', fontSize: '1.25rem' }}>
                  Side Missions
                </h3>
                {sideMissions.map((mission) => {
                  const status = getMissionPlayerStatus(mission.id);
                  
                  return (
                    <div
                      key={mission.id}
                      style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '2px solid #3b82f6',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        marginBottom: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h4 style={{ color: 'white', margin: 0, fontSize: '1rem' }}>
                          {mission.title}
                        </h4>
                        {status === 'active' && (
                          <span style={{ 
                            backgroundColor: '#3b82f6', 
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            ACTIVE
                          </span>
                        )}
                        {status === 'completed' && (
                          <span style={{ 
                            backgroundColor: '#10b981', 
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            ✓ COMPLETED
                          </span>
                        )}
                      </div>
                      <p style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        {mission.description}
                      </p>
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
                    </div>
                  );
                })}
              </div>
            )}

            {storyMissions.length === 0 && sideMissions.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
                Under Construction - Missions Coming Soon
              </div>
            )}
          </>
        )}

        {/* Close Button */}
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default NPCMissionModal;

