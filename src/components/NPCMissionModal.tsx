/**
 * NPC Mission Modal
 * 
 * Shows missions available from a specific NPC (Sonido, Zeke, Luz, Kon)
 * Skill Missions first, then STORY, Demo, Sovereign, Profile, and Side missions
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  getMissionTemplates, 
  getPlayerMissions, 
  getPlayerStoryProgress,
  acceptMission,
  redoDemoMission,
  getMissionStatus,
  getActiveStoryMissionForChapter,
  getProfileJourneyContent,
  saveProfileJourneyText,
  sortMissionsForHubList
} from '../utils/missionsService';
import { MissionTemplate, PlayerMission, DeliveryChannel } from '../types/missions';
import { getMissionRewardPreviewLines } from '../utils/missionRewardPreview';
import { getClassroomIdsForEnrolledStudent } from '../utils/classroomQueries';
import { isSkillMissionVisibleToStudentClasses } from '../utils/missionAdminHelpers';

function MissionRewardsPreview({ mission }: { mission: MissionTemplate }) {
  const lines = getMissionRewardPreviewLines(mission);
  if (lines.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: '0.85rem',
        padding: '0.6rem 0.75rem',
        borderRadius: '0.35rem',
        background: 'rgba(0, 0, 0, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          color: '#9ca3af',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Rewards
      </div>
      <ul
        style={{
          margin: '0.35rem 0 0',
          paddingLeft: '1.1rem',
          color: '#e5e7eb',
          fontSize: '0.8rem',
          lineHeight: 1.45,
        }}
      >
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Completed missions collapse to a compact row; Expand restores full card. */
function CollapsibleHubMissionCard({
  title,
  status,
  backgroundColor,
  borderColor,
  titleSize = '1rem',
  headerExtra,
  expanded,
  onToggleExpanded,
  children,
}: {
  title: React.ReactNode;
  status: 'available' | 'active' | 'completed';
  backgroundColor: string;
  borderColor: string;
  titleSize?: string;
  headerExtra?: React.ReactNode;
  expanded: boolean;
  onToggleExpanded: () => void;
  children: React.ReactNode;
}) {
  const minimized = status === 'completed' && !expanded;
  return (
    <div
      style={{
        backgroundColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '0.5rem',
        padding: minimized ? '0.65rem 1rem' : '1rem',
        marginBottom: '1rem',
        opacity: minimized ? 0.88 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: minimized ? 0 : '0.5rem',
        }}
      >
        <h4 style={{ color: 'white', margin: 0, fontSize: titleSize, flex: 1, minWidth: 0 }}>
          {title}
        </h4>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          {headerExtra}
          {status === 'active' && (
            <span
              style={{
                backgroundColor: borderColor,
                color: borderColor === '#fbbf24' || borderColor === '#a78bfa' ? '#1f2937' : 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
              }}
            >
              ACTIVE
            </span>
          )}
          {status === 'completed' && (
            <span
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
              }}
            >
              ✓ COMPLETED
            </span>
          )}
          {status === 'completed' && (
            <button
              type="button"
              onClick={onToggleExpanded}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#e5e7eb',
                border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: '0.35rem',
                padding: '0.2rem 0.55rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {minimized ? 'Expand' : 'Minimize'}
            </button>
          )}
        </div>
      </div>
      {!minimized && children}
    </div>
  );
}

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
  const { currentUser, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sideMissions, setSideMissions] = useState<MissionTemplate[]>([]);
  const [skillMissions, setSkillMissions] = useState<MissionTemplate[]>([]);
  const [sovereignMissions, setSovereignMissions] = useState<MissionTemplate[]>([]);
  const [demoMissions, setDemoMissions] = useState<MissionTemplate[]>([]);
  const [storyMissions, setStoryMissions] = useState<MissionTemplate[]>([]);
  const [profileMissions, setProfileMissions] = useState<MissionTemplate[]>([]);
  const [playerMissions, setPlayerMissions] = useState<PlayerMission[]>([]);
  const [journeyStageContent, setJourneyStageContent] = useState<Record<string, string>>({});
  const [profileMissionDraft, setProfileMissionDraft] = useState<Record<string, string>>({});
  const [savingProfileMissionId, setSavingProfileMissionId] = useState<string | null>(null);
  const [currentChapterId, setCurrentChapterId] = useState<string>('chapter_1');
  const [activeStoryMission, setActiveStoryMission] = useState<PlayerMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptingMissionId, setAcceptingMissionId] = useState<string | null>(null);
  const [redoingMissionId, setRedoingMissionId] = useState<string | null>(null);
  /** Completed missions start minimized; ids here are expanded back to full size. */
  const [expandedCompletedIds, setExpandedCompletedIds] = useState<Record<string, boolean>>({});

  const toggleCompletedExpanded = (missionId: string) => {
    setExpandedCompletedIds((prev) => ({ ...prev, [missionId]: !prev[missionId] }));
  };

  useEffect(() => {
    if (!isOpen) return;

    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!currentUser) {
      setLoading(false);
      return;
    }

    let cancelled = false;

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

        // Fetch all HUB_NPC missions for this NPC (SIDE, SKILL, DEMO, SOVEREIGN, STORY, PROFILE) in one query
        const allMissionsData = await getMissionTemplates({
          npc,
          deliveryChannel: 'HUB_NPC'
        });
        const enrolledClassIds = await getClassroomIdsForEnrolledStudent(currentUser.uid);
        // getMissionTemplates already excludes unpublished drafts from hub lists
        const publishedHub = allMissionsData;

        setSideMissions(
          sortMissionsForHubList(publishedHub.filter((m) => m.missionCategory === 'SIDE'))
        );
        setSkillMissions(
          sortMissionsForHubList(
            publishedHub.filter(
              (m) =>
                m.missionCategory === 'SKILL' &&
                isSkillMissionVisibleToStudentClasses(m, enrolledClassIds, { isAdmin })
            )
          )
        );
        setSovereignMissions(
          sortMissionsForHubList(publishedHub.filter((m) => m.missionCategory === 'SOVEREIGN'))
        );
        setDemoMissions(
          sortMissionsForHubList(publishedHub.filter((m) => m.missionCategory === 'DEMO'))
        );
        const profileList = publishedHub.filter((m) => m.missionCategory === 'PROFILE');
        setProfileMissions(profileList);

        // STORY: show every HUB_NPC story mission for this NPC — not only the chapter matching
        // `playerStoryProgress.currentChapterId`. Custom chapter ids (e.g. Manifest_Level_2) would
        // otherwise never appear while the player is still on chapter_1 in the main story tracker.
        const hubStory = publishedHub.filter((m) => m.missionCategory === 'STORY');
        const curChapter = progress?.currentChapterId;
        if (curChapter) {
          const forCur = hubStory.filter((m) => m.story?.chapterId === curChapter);
          const other = hubStory.filter((m) => m.story?.chapterId !== curChapter);
          setStoryMissions([
            ...sortMissionsForHubList(forCur),
            ...sortMissionsForHubList(other),
          ]);
        } else {
          setStoryMissions(sortMissionsForHubList(hubStory));
        }

        // Load existing journey stage content for Profile missions (pre-fill text areas)
        const content = await getProfileJourneyContent(currentUser.uid);
        setJourneyStageContent(content);
        const draft: Record<string, string> = {};
        profileList.forEach(m => {
          const stageId = m.profile?.journeyStageId;
          if (stageId) draft[m.id] = content[stageId] ?? '';
        });
        setProfileMissionDraft(draft);
      } catch (error) {
        console.error('Error loading missions:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadMissions();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser, npc, authLoading, isAdmin]);

  const handleAcceptMission = async (missionId: string) => {
    if (!currentUser || acceptingMissionId) return;

    setAcceptingMissionId(missionId);
    try {
      const result = await acceptMission(currentUser.uid, missionId, 'HUB_NPC', { isAdmin });
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

        // Demo missions with a sequence should start immediately after accept
        const demoMission = demoMissions.find((m) => m.id === missionId);
        if (demoMission?.sequence && demoMission.sequence.length > 0) {
          onClose();
          navigate(`/mission/${encodeURIComponent(missionId)}/play`);
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

  const handleRedoDemoMission = async (mission: MissionTemplate) => {
    if (!currentUser || redoingMissionId || acceptingMissionId) return;
    if (mission.missionCategory !== 'DEMO' && mission.missionCategory !== 'SKILL') return;
    if (!(mission.sequence && mission.sequence.length > 0)) {
      alert('This mission has no playable steps yet.');
      return;
    }

    setRedoingMissionId(mission.id);
    try {
      const result = await redoDemoMission(currentUser.uid, mission.id, 'HUB_NPC', { isAdmin });
      if (!result.success) {
        alert(result.error || 'Failed to restart mission');
        return;
      }
      const playerMissionsData = await getPlayerMissions(currentUser.uid);
      setPlayerMissions(playerMissionsData);
      onClose();
      navigate(`/mission/${encodeURIComponent(mission.id)}/play`);
    } catch (error) {
      console.error('Error replaying mission:', error);
      alert('Failed to restart mission');
    } finally {
      setRedoingMissionId(null);
    }
  };

  const handleAcceptProfileMissionAndSave = async (mission: MissionTemplate) => {
    if (!currentUser || !mission.profile || savingProfileMissionId) return;
    const text = (profileMissionDraft[mission.id] ?? '').trim();
    if (!text) {
      alert('Please add your reflection text above — it will appear on your Profile\'s Journey.');
      return;
    }
    setSavingProfileMissionId(mission.id);
    try {
      await saveProfileJourneyText(currentUser.uid, mission.profile.journeyStageId, text);
      setJourneyStageContent(prev => ({ ...prev, [mission.profile!.journeyStageId]: text }));
      const result = await acceptMission(currentUser.uid, mission.id, 'HUB_NPC', { isAdmin });
      if (result.success) {
        const playerMissionsData = await getPlayerMissions(currentUser.uid);
        setPlayerMissions(playerMissionsData);
      } else {
        alert(result.error || 'Failed to accept mission');
      }
    } catch (error) {
      console.error('Error saving profile journey text or accepting mission:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setSavingProfileMissionId(null);
    }
  };

  const handleUpdateProfileJourneyText = async (mission: MissionTemplate) => {
    if (!currentUser || !mission.profile || savingProfileMissionId) return;
    const text = (profileMissionDraft[mission.id] ?? '').trim();
    setSavingProfileMissionId(mission.id);
    try {
      await saveProfileJourneyText(currentUser.uid, mission.profile.journeyStageId, text);
      setJourneyStageContent(prev => ({ ...prev, [mission.profile!.journeyStageId]: text }));
    } catch (error) {
      console.error('Error updating profile journey text:', error);
      alert('Failed to update. Please try again.');
    } finally {
      setSavingProfileMissionId(null);
    }
  };

  const getMissionPlayerStatus = (missionId: string): 'available' | 'active' | 'completed' => {
    const playerMission = playerMissions.find(pm => pm.missionId === missionId);
    if (!playerMission) return 'available';
    if (playerMission.status === 'completed') return 'completed';
    return 'active';
  };

  const noNpcMissionsAvailable =
    storyMissions.length === 0 &&
    sovereignMissions.length === 0 &&
    demoMissions.length === 0 &&
    skillMissions.length === 0 &&
    sideMissions.length === 0 &&
    profileMissions.length === 0;

  if (!isOpen) return null;

  return (
    <div className="mst-popup-overlay"
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
    ><button type="button" className="mst-popup-close" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>×</button>
      <div className="mst-popup-panel"
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

        {authLoading || (currentUser && loading) ? (
          <div style={{ textAlign: 'center', color: 'white', padding: '2rem' }}>
            {authLoading ? 'Checking sign-in…' : 'Loading missions...'}
          </div>
        ) : !currentUser ? (
          <div style={{ textAlign: 'center', color: '#e5e7eb', padding: '2rem' }}>
            <p style={{ marginBottom: '1rem' }}>Sign in to view and accept missions from this guide.</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/login');
              }}
              style={{
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.6rem 1.25rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Go to Login
            </button>
          </div>
        ) : (
          <>
            {/* SKILL Missions Section (class-gated) */}
            {skillMissions.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#f59e0b', marginBottom: '1rem', fontSize: '1.25rem' }}>
                  Skill Missions
                </h3>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  Class skills — may unlock Skill Moves, Skill Trees, and other abilities.
                </p>
                {skillMissions.map((mission, skillIndex) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const displayNum = skillIndex + 1;

                  return (
                    <CollapsibleHubMissionCard
                      key={mission.id}
                      title={
                        <>
                          <span style={{ color: '#fcd34d', fontWeight: 800, marginRight: '0.35rem' }}>
                            {displayNum}.
                          </span>
                          {mission.title}
                        </>
                      }
                      status={status}
                      backgroundColor="rgba(245, 158, 11, 0.1)"
                      borderColor="#f59e0b"
                      expanded={!!expandedCompletedIds[mission.id]}
                      onToggleExpanded={() => toggleCompletedExpanded(mission.id)}
                    >
                      <p style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        {mission.description}
                      </p>
                      <MissionRewardsPreview mission={mission} />
                      {status === 'available' && (
                        <button
                          onClick={() => handleAcceptMission(mission.id)}
                          disabled={acceptingMissionId === mission.id}
                          style={{
                            backgroundColor: '#d97706',
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {mission.sequence && mission.sequence.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(`/mission/${encodeURIComponent(mission.id)}/play`);
                              }}
                              style={{
                                backgroundColor: '#d97706',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Continue mission →
                            </button>
                          ) : (
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                              This mission has no playable steps yet. Check back later or contact an admin.
                            </p>
                          )}
                        </div>
                      )}
                      {status === 'completed' && mission.sequence && mission.sequence.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleRedoDemoMission(mission)}
                          disabled={redoingMissionId === mission.id || acceptingMissionId === mission.id}
                          style={{
                            backgroundColor: 'transparent',
                            color: '#fbbf24',
                            border: '1px solid #f59e0b',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor:
                              redoingMissionId === mission.id || acceptingMissionId === mission.id
                                ? 'not-allowed'
                                : 'pointer',
                            fontWeight: 'bold',
                            opacity:
                              redoingMissionId === mission.id || acceptingMissionId === mission.id
                                ? 0.5
                                : 1,
                          }}
                        >
                          {redoingMissionId === mission.id ? 'Restarting…' : 'Replay mission'}
                        </button>
                      )}
                    </CollapsibleHubMissionCard>
                  );
                })}
              </div>
            )}

            {/* STORY Missions Section */}
            {storyMissions.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#fbbf24', marginBottom: '1rem', fontSize: '1.25rem' }}>
                  📜 STORY — Main Objective
                </h3>
                {storyMissions.map((mission) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const storyBg = status === 'active' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(59, 130, 246, 0.1)';
                  const storyBorder = status === 'active' ? '#fbbf24' : '#3b82f6';

                  return (
                    <CollapsibleHubMissionCard
                      key={mission.id}
                      title={mission.title}
                      status={status}
                      backgroundColor={storyBg}
                      borderColor={storyBorder}
                      titleSize="1.1rem"
                      headerExtra={
                        mission.story?.chapterId &&
                        mission.story.chapterId !== currentChapterId ? (
                          <span
                            style={{
                              backgroundColor: 'rgba(156, 163, 175, 0.35)',
                              color: '#e5e7eb',
                              padding: '0.2rem 0.45rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                            }}
                            title="Story arc chapter (may differ from your current Journey chapter)"
                          >
                            Arc: {mission.story.chapterId}
                          </span>
                        ) : undefined
                      }
                      expanded={!!expandedCompletedIds[mission.id]}
                      onToggleExpanded={() => toggleCompletedExpanded(mission.id)}
                    >
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {mission.sequence && mission.sequence.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(`/mission/${encodeURIComponent(mission.id)}/play`);
                              }}
                              style={{
                                backgroundColor: '#fbbf24',
                                color: '#1f2937',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Continue mission →
                            </button>
                          ) : mission.playerJourneyLink ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate('/chapters');
                              }}
                              style={{
                                backgroundColor: '#fbbf24',
                                color: '#1f2937',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Open Player Journey
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate('/chapters');
                              }}
                              style={{
                                backgroundColor: '#fbbf24',
                                color: '#1f2937',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Track in Journey
                            </button>
                          )}
                        </div>
                      )}
                    </CollapsibleHubMissionCard>
                  );
                })}
              </div>
            )}

            {/* Demo Missions — showcase what MST can do */}
            {demoMissions.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#67e8f9', marginBottom: '0.35rem', fontSize: '1.25rem' }}>
                  Demo Missions
                </h3>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0 0 1rem', lineHeight: 1.45 }}>
                  Try features and see what the MST Game is about.
                </p>
                {demoMissions.map((mission, demoIndex) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const displayNum = demoIndex + 1;
                  return (
                    <CollapsibleHubMissionCard
                      key={mission.id}
                      title={
                        <>
                          <span style={{ color: '#a5f3fc', fontWeight: 800, marginRight: '0.35rem' }}>
                            {displayNum}.
                          </span>
                          {mission.title}
                        </>
                      }
                      status={status}
                      backgroundColor="rgba(6, 182, 212, 0.12)"
                      borderColor="#06b6d4"
                      expanded={!!expandedCompletedIds[mission.id]}
                      onToggleExpanded={() => toggleCompletedExpanded(mission.id)}
                    >
                      <p style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        {mission.description}
                      </p>
                      <MissionRewardsPreview mission={mission} />
                      {status === 'available' && (
                        <button
                          onClick={() => handleAcceptMission(mission.id)}
                          disabled={acceptingMissionId === mission.id}
                          style={{
                            backgroundColor: '#0891b2',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor: acceptingMissionId === mission.id ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold',
                            opacity: acceptingMissionId === mission.id ? 0.5 : 1
                          }}
                        >
                          {acceptingMissionId === mission.id ? 'Starting…' : 'Start Demo'}
                        </button>
                      )}
                      {status === 'active' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {mission.sequence && mission.sequence.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(`/mission/${encodeURIComponent(mission.id)}/play`);
                              }}
                              style={{
                                backgroundColor: '#67e8f9',
                                color: '#0f172a',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Continue demo →
                            </button>
                          ) : (
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af' }}>
                              This demo has no playable steps yet. Check back later or contact an admin.
                            </p>
                          )}
                        </div>
                      )}
                      {status === 'completed' && mission.sequence && mission.sequence.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleRedoDemoMission(mission)}
                          disabled={redoingMissionId === mission.id || acceptingMissionId === mission.id}
                          style={{
                            backgroundColor: 'transparent',
                            color: '#67e8f9',
                            border: '1px solid #06b6d4',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor:
                              redoingMissionId === mission.id || acceptingMissionId === mission.id
                                ? 'not-allowed'
                                : 'pointer',
                            fontWeight: 'bold',
                            opacity:
                              redoingMissionId === mission.id || acceptingMissionId === mission.id
                                ? 0.5
                                : 1,
                          }}
                        >
                          {redoingMissionId === mission.id ? 'Restarting…' : 'Redo demo'}
                        </button>
                      )}
                    </CollapsibleHubMissionCard>
                  );
                })}
              </div>
            )}

            {/* Sovereign Missions — optional lore for Home Page heroes in The Sovereign */}
            {sovereignMissions.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#c4b5fd', marginBottom: '0.35rem', fontSize: '1.25rem' }}>
                  Sovereign Missions
                </h3>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0 0 1rem', lineHeight: 1.45 }}>
                  Background stories for the Home Page heroes in The Sovereign.
                </p>
                {sovereignMissions.map((mission, sovereignIndex) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const displayNum = sovereignIndex + 1;
                  return (
                    <CollapsibleHubMissionCard
                      key={mission.id}
                      title={
                        <>
                          <span style={{ color: '#ddd6fe', fontWeight: 800, marginRight: '0.35rem' }}>
                            {displayNum}.
                          </span>
                          {mission.title}
                        </>
                      }
                      status={status}
                      backgroundColor="rgba(139, 92, 246, 0.12)"
                      borderColor="#8b5cf6"
                      expanded={!!expandedCompletedIds[mission.id]}
                      onToggleExpanded={() => toggleCompletedExpanded(mission.id)}
                    >
                      <p style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        {mission.description}
                      </p>
                      <MissionRewardsPreview mission={mission} />
                      {status === 'available' && (
                        <button
                          onClick={() => handleAcceptMission(mission.id)}
                          disabled={acceptingMissionId === mission.id}
                          style={{
                            backgroundColor: '#7c3aed',
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {mission.sequence && mission.sequence.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(`/mission/${encodeURIComponent(mission.id)}/play`);
                              }}
                              style={{
                                backgroundColor: '#a78bfa',
                                color: '#1f2937',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Continue mission →
                            </button>
                          ) : mission.playerJourneyLink ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate('/chapters');
                              }}
                              style={{
                                backgroundColor: '#a78bfa',
                                color: '#1f2937',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Open Player Journey
                            </button>
                          ) : (
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                              This mission has no playable steps yet. Check back later or contact an admin.
                            </p>
                          )}
                        </div>
                      )}
                    </CollapsibleHubMissionCard>
                  );
                })}
              </div>
            )}

            {/* PROFILE Missions Section — add to Player's Journey on Profile */}
            {profileMissions.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#10b981', marginBottom: '1rem', fontSize: '1.25rem' }}>
                  📋 Profile — Player&apos;s Journey
                </h3>
                {profileMissions.map((mission) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const draftText = profileMissionDraft[mission.id] ?? '';
                  const isSaving = savingProfileMissionId === mission.id;
                  return (
                    <CollapsibleHubMissionCard
                      key={mission.id}
                      title={mission.title}
                      status={status}
                      backgroundColor="rgba(16, 185, 129, 0.1)"
                      borderColor="#10b981"
                      titleSize="1.1rem"
                      expanded={!!expandedCompletedIds[mission.id]}
                      onToggleExpanded={() => toggleCompletedExpanded(mission.id)}
                    >
                      <p style={{ color: '#d1d5db', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{mission.description}</p>
                      <MissionRewardsPreview mission={mission} />
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: '600' }}>
                          Your reflection (appears on your Profile&apos;s Journey)
                        </label>
                        <textarea
                          value={draftText}
                          onChange={(e) => setProfileMissionDraft(prev => ({ ...prev, [mission.id]: e.target.value }))}
                          placeholder="Type your reflection here — it will show on your Power Card under this journey stage..."
                          rows={4}
                          maxLength={2000}
                          disabled={status === 'completed'}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(16, 185, 129, 0.5)',
                            background: 'rgba(0,0,0,0.2)',
                            color: '#fff',
                            fontSize: '0.9rem',
                            resize: 'vertical',
                            boxSizing: 'border-box'
                          }}
                        />
                        {status !== 'completed' && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            {draftText.length}/2000 characters
                          </div>
                        )}
                      </div>
                      {status === 'available' && (
                        <button
                          onClick={() => handleAcceptProfileMissionAndSave(mission)}
                          disabled={isSaving || !draftText.trim()}
                          style={{
                            backgroundColor: draftText.trim() ? '#10b981' : '#6b7280',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor: isSaving || !draftText.trim() ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold',
                            opacity: isSaving ? 0.7 : 1
                          }}
                        >
                          {isSaving ? 'Saving...' : 'Accept & Save to Profile'}
                        </button>
                      )}
                      {status === 'active' && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleUpdateProfileJourneyText(mission)}
                            disabled={isSaving}
                            style={{
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              padding: '0.5rem 1rem',
                              borderRadius: '0.5rem',
                              cursor: isSaving ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              opacity: isSaving ? 0.7 : 1
                            }}
                          >
                            {isSaving ? 'Updating...' : 'Update reflection'}
                          </button>
                          <button
                            onClick={() => { window.location.href = '/profile'; }}
                            style={{ backgroundColor: 'rgba(16, 185, 129, 0.6)', color: 'white', border: '1px solid #10b981', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            View on Profile
                          </button>
                        </div>
                      )}
                      {status === 'completed' && (
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>This reflection is on your Profile.</p>
                      )}
                    </CollapsibleHubMissionCard>
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
                {sideMissions.map((mission, sideIndex) => {
                  const status = getMissionPlayerStatus(mission.id);
                  const displayNum = sideIndex + 1;

                  return (
                    <CollapsibleHubMissionCard
                      key={mission.id}
                      title={
                        <>
                          <span style={{ color: '#93c5fd', fontWeight: 800, marginRight: '0.35rem' }}>
                            {displayNum}.
                          </span>
                          {mission.title}
                        </>
                      }
                      status={status}
                      backgroundColor="rgba(59, 130, 246, 0.1)"
                      borderColor="#3b82f6"
                      expanded={!!expandedCompletedIds[mission.id]}
                      onToggleExpanded={() => toggleCompletedExpanded(mission.id)}
                    >
                      <p style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        {mission.description}
                      </p>
                      <MissionRewardsPreview mission={mission} />
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {mission.sequence && mission.sequence.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(`/mission/${encodeURIComponent(mission.id)}/play`);
                              }}
                              style={{
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Continue mission →
                            </button>
                          ) : mission.playerJourneyLink ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate('/chapters');
                              }}
                              style={{
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Open Player Journey
                            </button>
                          ) : (
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                              This mission has no playable steps yet. Check back later or contact an admin.
                            </p>
                          )}
                        </div>
                      )}
                    </CollapsibleHubMissionCard>
                  );
                })}
              </div>
            )}

            {noNpcMissionsAvailable && (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem', lineHeight: 1.55 }}>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#d1d5db' }}>
                  No missions are available from {npcName} yet.
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>
                  In Mission Admin, set <strong style={{ color: '#e5e7eb' }}>NPC</strong> to {npcName},{' '}
                  check <strong style={{ color: '#e5e7eb' }}>HUB_NPC</strong>, and save. STORY, Demo, Sovereign, Skill, SIDE, and
                  Profile missions all appear here once assigned.
                </p>
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

