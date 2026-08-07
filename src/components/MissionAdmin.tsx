/**
 * Mission Admin Component
 * 
 * Allows admins to:
 * - Create/edit missions
 * - Designate missions as STORY, SIDE, Sovereign (SOVEREIGN), or PROFILE
 * - Set chapter metadata for story missions
 * - Assign NPCs and delivery channels
 */

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy, serverTimestamp, writeBatch, getDoc as getDocFn } from 'firebase/firestore';
import { db } from '../firebase';
import {
  MissionTemplate,
  MissionCategory,
  DeliveryChannel,
  PlayerJourneyLink,
  MissionSequenceStep,
  ProfileMetadata,
  ProfileJourneyStageId,
  normalizeMissionCategory,
  JOURNEY_MISSION_TYPES,
  type JourneyMissionType,
} from '../types/missions';
import { CHAPTERS, ChapterChallenge } from '../types/chapters';
import MissionSequenceBuilder from './MissionSequenceBuilder';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import { deleteAllPlayerMissionDocsForMissionTemplate, parseMissionRewardsFromDoc } from '../utils/missionsService';
import type { BattlePassTierRewardEntry } from '../types/season1';
import { legacyMissionRewardsToEntries } from '../utils/missionBattlePassRewards';
import MissionRewardsBattlePassEditor, {
  validateMissionRewardEntries,
  serializeMissionRewardEntries,
} from './admin/MissionRewardsBattlePassEditor';
import {
  filterMissionsForAdmin,
  getJourneyChapterLabel,
  isMissionPublished,
  missionPpReward,
  missionXpReward,
  sortJourneyMissions,
  categoryBadgeForFilter,
  mergeJourneyMissionsForAdmin,
  isHardcodedJourneyMissionId,
  challengeIdFromJourneyMissionId,
  type MissionAdminFilter,
} from '../utils/missionAdminHelpers';
import {
  uploadMissionPreviewImage,
  validateMissionPreviewImage,
  deleteMissionMedia,
} from '../utils/missionStorage';
import {
  loadAllJourneyChallengeMedia,
  saveJourneyChallengePreviewImage,
  removeJourneyChallengeImage,
  type JourneyChallengeMedia,
} from '../utils/journeyChallengeMedia';
import { resolveJourneyChallengePreviewUrl } from '../utils/journeyChallengePreviewDefaults';

const PROFILE_JOURNEY_STAGE_OPTIONS: Array<{ value: ProfileJourneyStageId; label: string }> = [
  { value: 'ordinary-world', label: '1. Ordinary World' },
  { value: 'call-to-adventure', label: '2. Call to Adventure' },
  { value: 'meeting-mentor', label: '3. Meeting the Mentor' },
  { value: 'tests-allies-enemies', label: '4. Tests, Allies, Enemies' },
  { value: 'approaching-cave', label: '5. Approaching the Cave' },
  { value: 'ordeal', label: '6. The Ordeal' },
  { value: 'road-back', label: '7. The Road Back' },
  { value: 'resurrection', label: '8. Resurrection' },
];

/** Survives Admin remounts so create-mission work is not wiped mid-edit. */
const MISSION_CREATE_DRAFT_KEY = 'missionAdmin.createDraft.v1';
const MISSION_ADMIN_UI_KEY = 'missionAdmin.ui.v1';

type MissionCreateFormData = {
  title: string;
  description: string;
  npc: string;
  missionCategory: MissionCategory;
  deliveryChannels: DeliveryChannel[];
  storyChapterId: string;
  storyOrder: number;
  storyRequired: boolean;
  storyPrerequisites: string;
  profileJourneyStageId: ProfileJourneyStageId;
  profileOrder: number;
  linkedJourneyStep: string;
  hubDisplayOrder: string;
};

type MissionCreateDraftPersist = {
  formData: MissionCreateFormData;
  rewardEntries: BattlePassTierRewardEntry[];
  sequence: MissionSequenceStep[];
  draftMissionId: string | null;
};

function readMissionCreateDraft(): MissionCreateDraftPersist | null {
  try {
    const raw = sessionStorage.getItem(MISSION_CREATE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MissionCreateDraftPersist;
  } catch {
    return null;
  }
}

function writeMissionCreateDraft(draft: MissionCreateDraftPersist): void {
  try {
    sessionStorage.setItem(MISSION_CREATE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

function clearMissionCreateDraft(): void {
  try {
    sessionStorage.removeItem(MISSION_CREATE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function readMissionAdminUi(): { listFilter?: MissionAdminFilter; showCreateModal?: boolean } {
  try {
    const raw = sessionStorage.getItem(MISSION_ADMIN_UI_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as { listFilter?: MissionAdminFilter; showCreateModal?: boolean };
  } catch {
    return {};
  }
}

function writeMissionAdminUi(ui: { listFilter: MissionAdminFilter; showCreateModal: boolean }): void {
  try {
    sessionStorage.setItem(MISSION_ADMIN_UI_KEY, JSON.stringify(ui));
  } catch {
    /* ignore */
  }
}

function usesHubDisplayOrder(category: MissionCategory): boolean {
  return category === 'SIDE' || category === 'SOVEREIGN' || category === 'DEMO';
}

function missionCategoryListChrome(category: MissionCategory): {
  panelBg: string;
  borderColor: string;
  badgeBg: string;
  badgeColor: string;
} {
  switch (category) {
    case 'STORY':
      return {
        panelBg: 'rgba(251, 191, 36, 0.1)',
        borderColor: '#fbbf24',
        badgeBg: '#fbbf24',
        badgeColor: '#1f2937',
      };
    case 'PROFILE':
      return {
        panelBg: 'rgba(16, 185, 129, 0.1)',
        borderColor: '#10b981',
        badgeBg: '#10b981',
        badgeColor: 'white',
      };
    case 'SOVEREIGN':
      return {
        panelBg: 'rgba(139, 92, 246, 0.12)',
        borderColor: '#8b5cf6',
        badgeBg: '#7c3aed',
        badgeColor: 'white',
      };
    case 'DEMO':
      return {
        panelBg: 'rgba(6, 182, 212, 0.12)',
        borderColor: '#06b6d4',
        badgeBg: '#0891b2',
        badgeColor: 'white',
      };
    default:
      return {
        panelBg: 'rgba(59, 130, 246, 0.1)',
        borderColor: '#3b82f6',
        badgeBg: '#3b82f6',
        badgeColor: 'white',
      };
  }
}

function missionCategoryBadgeLabel(category: MissionCategory): string {
  if (category === 'SOVEREIGN') return 'Sovereign';
  if (category === 'DEMO') return 'Demo';
  return category;
}

const MissionAdmin: React.FC = () => {
  const [missions, setMissions] = useState<MissionTemplate[]>([]);
  const [selectedMission, setSelectedMission] = useState<MissionTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeletingMission, setIsDeletingMission] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(() => !!readMissionAdminUi().showCreateModal);
  const [listFilter, setListFilter] = useState<MissionAdminFilter>(() => {
    const stored = readMissionAdminUi().listFilter;
    return stored || 'all';
  });
  const [previewMission, setPreviewMission] = useState<MissionTemplate | null>(null);
  const [imageEditMission, setImageEditMission] = useState<MissionTemplate | null>(null);
  const [journeyMedia, setJourneyMedia] = useState<Record<string, JourneyChallengeMedia>>({});

  useEffect(() => {
    loadMissions();
  }, []);

  useEffect(() => {
    writeMissionAdminUi({ listFilter, showCreateModal });
  }, [listFilter, showCreateModal]);

  const loadMissions = async () => {
    // Don't blank the whole Mission Admin UI (that unmounts an open create modal).
    // Only show the initial loading gate when we have nothing to display yet.
    const isInitialLoad = missions.length === 0 && !showCreateModal;
    if (isInitialLoad) setLoading(true);
    try {
      const [missionsSnapshot, mediaMap] = await Promise.all([
        getDocs(query(collection(db, 'missions'), orderBy('createdAt', 'desc'))),
        loadAllJourneyChallengeMedia().catch((err) => {
          console.warn('Journey challenge media load failed:', err);
          return {} as Record<string, JourneyChallengeMedia>;
        }),
      ]);
      setJourneyMedia(mediaMap);

      const missionsData: MissionTemplate[] = [];
      missionsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        missionsData.push({
          id: docSnap.id,
          title: data.title || 'Untitled Mission',
          description: data.description || '',
          shortDescription: data.shortDescription || undefined,
          fullDescription: data.fullDescription || undefined,
          lesson: data.lesson || undefined,
          storyText: data.storyText || undefined,
          npc: data.npc || null,
          missionCategory: normalizeMissionCategory(data.missionCategory),
          deliveryChannels: data.deliveryChannels || ['HUB_NPC'],
          story: data.story || undefined,
          profile: data.profile || undefined,
          playerJourneyLink: data.playerJourneyLink || undefined,
          journeyMissionType: data.journeyMissionType || undefined,
          chapterNumber: typeof data.chapterNumber === 'number' ? data.chapterNumber : undefined,
          missionNumber: typeof data.missionNumber === 'number' ? data.missionNumber : undefined,
          xpReward: typeof data.xpReward === 'number' ? data.xpReward : undefined,
          ppReward: typeof data.ppReward === 'number' ? data.ppReward : undefined,
          prerequisiteMissionIds: data.prerequisiteMissionIds || undefined,
          unlocksMissionIds: data.unlocksMissionIds || undefined,
          battleConfigId: data.battleConfigId || undefined,
          previewImageUrl: data.previewImageUrl || undefined,
          previewImageStoragePath: data.previewImageStoragePath || undefined,
          modalImageUrl: data.modalImageUrl || undefined,
          modalImageStoragePath: data.modalImageStoragePath || undefined,
          isPublished: data.isPublished !== false,
          sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
          gating: data.gating || undefined,
          rewards: parseMissionRewardsFromDoc(data.rewards),
          objectives: data.objectives || [],
          sequence: data.sequence || undefined,
          sequenceVersion: data.sequenceVersion || undefined,
          hubDisplayOrder:
            typeof data.hubDisplayOrder === 'number' && Number.isFinite(data.hubDisplayOrder)
              ? data.hubDisplayOrder
              : undefined,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      
      setMissions(missionsData);
    } catch (error) {
      console.error('Error loading missions:', error);
      alert('Failed to load missions');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMission = async (
    missionData: Partial<MissionTemplate> & { hubDisplayOrderClear?: boolean }
  ) => {
    if (!selectedMission) return;

    setSaving(true);
    try {
      const missionRef = doc(db, 'missions', selectedMission.id);
      const { hubDisplayOrderClear, hubDisplayOrder, ...rest } = missionData;
      const payload: Record<string, unknown> = {
        ...rest,
        updatedAt: serverTimestamp()
      };
      if (hubDisplayOrderClear) {
        payload.hubDisplayOrder = deleteField();
      } else if (typeof hubDisplayOrder === 'number' && Number.isFinite(hubDisplayOrder)) {
        payload.hubDisplayOrder = hubDisplayOrder;
      }
      const cleaned = stripUndefinedDeep(payload) as Record<string, unknown>;
      await updateDoc(missionRef, cleaned as never);
      
      await loadMissions();
      setSelectedMission(null);
      alert('Mission updated successfully!');
    } catch (error) {
      console.error('Error saving mission:', error);
      alert('Failed to save mission');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMission = async (missionId: string) => {
    setIsDeletingMission(true);
    try {
      await deleteDoc(doc(db, 'missions', missionId));
      await loadMissions();
      setSelectedMission(null);
      alert('Mission deleted.');
    } catch (error) {
      console.error('Error deleting mission:', error);
      alert('Failed to delete mission');
    } finally {
      setIsDeletingMission(false);
    }
  };

  const handleCreateMission = async (
    missionData: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt'>, 
    playerJourneyLink?: PlayerJourneyLink,
    sequence?: MissionSequenceStep[],
    draftMissionId?: string
  ) => {
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const missionsRef = collection(db, 'missions');
      
      // Use draft mission ID if provided, otherwise create new
      const missionRef = draftMissionId 
        ? doc(db, 'missions', draftMissionId)
        : doc(missionsRef);
      
      // Normalize sequence order if present
      const normalizedSequence = sequence?.map((step, idx) => ({ ...step, order: idx })) || undefined;
      
      // Create/update mission document
      const missionDocData: Record<string, unknown> = {
        ...missionData,
        // Firestore rejects undefined; false clears the draft created for upload IDs
        isDraft: false,
        updatedAt: serverTimestamp()
      };
      
      // Only set createdAt if this is a new mission (not a draft update)
      if (!draftMissionId) {
        missionDocData.createdAt = serverTimestamp();
      }
      
      // Add sequence if present
      if (normalizedSequence && normalizedSequence.length > 0) {
        missionDocData.sequence = normalizedSequence;
        missionDocData.sequenceVersion = 1;
      }

      if (typeof missionData.hubDisplayOrder !== 'number' || !Number.isFinite(missionData.hubDisplayOrder)) {
        delete missionDocData.hubDisplayOrder;
      }

      const sanitized = stripUndefinedDeep(missionDocData) as Record<string, unknown>;
      
      if (draftMissionId) {
        batch.update(missionRef, sanitized as never);
      } else {
        batch.set(missionRef, sanitized as never);
      }
      
      await batch.commit();
      
      clearMissionCreateDraft();
      await loadMissions();
      setShowCreateModal(false);
      
      let message = 'Mission created successfully!';
      if (playerJourneyLink) {
        const chapter = CHAPTERS.find(c => c.id === playerJourneyLink.chapterId);
        const challenge = chapter?.challenges.find(c => c.id === playerJourneyLink.challengeId);
        const challengeTitle = challenge?.title || `Chapter ${playerJourneyLink.chapterId}-${playerJourneyLink.challengeId}`;
        message = `Mission created and linked to Player Journey: Chapter ${playerJourneyLink.chapterId} - ${challengeTitle}`;
      }
      if (normalizedSequence && normalizedSequence.length > 0) {
        message += `\nSequence with ${normalizedSequence.length} step(s) added.`;
      }
      alert(message);
    } catch (error) {
      console.error('Error creating mission:', error);
      alert('Failed to create mission');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (mission: MissionTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isHardcodedJourneyMissionId(mission.id)) {
      alert('Core Journey missions are defined in chapter code and cannot be unpublished here.');
      return;
    }
    try {
      const next = !isMissionPublished(mission);
      await updateDoc(doc(db, 'missions', mission.id), {
        isPublished: next,
        updatedAt: serverTimestamp(),
      });
      await loadMissions();
    } catch (error) {
      console.error('Error toggling publish:', error);
      alert('Failed to update publish status');
    }
  };

  const handleReorderJourney = async (mission: MissionTemplate, direction: -1 | 1, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isHardcodedJourneyMissionId(mission.id)) {
      alert('Core Journey mission order is defined in chapter code.');
      return;
    }
    const journey = mergeJourneyMissionsForAdmin(missions).filter(
      (m) => !isHardcodedJourneyMissionId(m.id)
    );
    const idx = journey.findIndex((m) => m.id === mission.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= journey.length) return;
    const a = journey[idx];
    const b = journey[swapIdx];
    const aOrder = a.sortOrder ?? a.story?.order ?? idx + 1;
    const bOrder = b.sortOrder ?? b.story?.order ?? swapIdx + 1;
    try {
      await Promise.all([
        updateDoc(doc(db, 'missions', a.id), {
          sortOrder: bOrder,
          'story.order': bOrder,
          updatedAt: serverTimestamp(),
        }),
        updateDoc(doc(db, 'missions', b.id), {
          sortOrder: aOrder,
          'story.order': aOrder,
          updatedAt: serverTimestamp(),
        }),
      ]);
      await loadMissions();
    } catch (error) {
      console.error('Error reordering missions:', error);
      alert('Failed to reorder missions');
    }
  };

  if (loading && !showCreateModal) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading missions...</div>;
  }

  const filteredMissions =
    listFilter === 'journey'
      ? mergeJourneyMissionsForAdmin(missions, journeyMedia)
      : listFilter === 'all'
        ? sortJourneyMissions([
            ...mergeJourneyMissionsForAdmin(missions, journeyMedia).filter((m) =>
              isHardcodedJourneyMissionId(m.id)
            ),
            ...missions,
          ])
        : filterMissionsForAdmin(missions, listFilter);

  const filterTabs: Array<{ id: MissionAdminFilter; label: string }> = [
    { id: 'all', label: 'All Missions' },
    { id: 'journey', label: "Player's Journey" },
    { id: 'side', label: 'Side Missions' },
    { id: 'demo', label: 'Demo' },
    { id: 'drafts', label: 'Drafts' },
    { id: 'published', label: 'Published' },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Mission Admin</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          + Create Mission
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setListFilter(tab.id)}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: '999px',
              border: listFilter === tab.id ? '2px solid #111827' : '1px solid #d1d5db',
              background: listFilter === tab.id ? '#111827' : 'white',
              color: listFilter === tab.id ? 'white' : '#374151',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mission List */}
      <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
        {filteredMissions.length === 0 && (
          <div style={{ color: '#6b7280', padding: '1rem' }}>No missions match this filter.</div>
        )}
        {filteredMissions.map((mission) => {
          const chrome = missionCategoryListChrome(mission.missionCategory);
          const published = isMissionPublished(mission);
          const isCoreJourney = isHardcodedJourneyMissionId(mission.id);
          return (
          <div
            key={mission.id}
            onClick={() => {
              if (isCoreJourney) {
                setPreviewMission(mission);
              } else {
                setSelectedMission(mission);
              }
            }}
            style={{
              padding: '1rem',
              background: chrome.panelBg,
              border: `2px solid ${chrome.borderColor}`,
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 72,
                  height: 54,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#e5e7eb',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed #9ca3af',
                }}>
                  {mission.previewImageUrl ? (
                    <img
                      src={mission.previewImageUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', textAlign: 'center', padding: 4 }}>No image</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
                      {mission.title}
                    </h3>
                    <span style={{
                      backgroundColor: chrome.badgeBg,
                      color: chrome.badgeColor,
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {categoryBadgeForFilter(mission.missionCategory)}
                    </span>
                    {isCoreJourney ? (
                      <span style={{
                        backgroundColor: '#e0e7ff',
                        color: '#3730a3',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        Core Journey
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: published ? '#d1fae5' : '#fef3c7',
                        color: published ? '#047857' : '#92400e',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {published ? 'Published' : 'Draft'}
                      </span>
                    )}
                    {mission.journeyMissionType && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {mission.journeyMissionType}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                    {mission.shortDescription || mission.description}
                  </p>
                  {(mission.missionCategory === 'STORY' || isCoreJourney) && (
                    <p style={{ margin: '0.5rem 0 0 0', color: '#9ca3af', fontSize: '0.8rem' }}>
                      {getJourneyChapterLabel(mission)} · XP {missionXpReward(mission)} · PP {missionPpReward(mission)}
                      {isCoreJourney ? ' · Defined in Player Journey chapters' : ''}
                    </p>
                  )}
                  {mission.story && mission.missionCategory !== 'STORY' && !isCoreJourney && (
                    <p style={{ margin: '0.5rem 0 0 0', color: '#9ca3af', fontSize: '0.8rem' }}>
                      Chapter: {mission.story.chapterId} | Order: {mission.story.order}
                    </p>
                  )}
                  {mission.profile && (
                    <p style={{ margin: '0.5rem 0 0 0', color: '#9ca3af', fontSize: '0.8rem' }}>
                      Journey: {mission.profile.journeyStageId} {mission.profile.order != null ? `| Order: ${mission.profile.order}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                {!isCoreJourney && (
                  <button type="button" onClick={() => setSelectedMission(mission)} style={adminChipBtn}>Edit</button>
                )}
                <button type="button" onClick={() => setImageEditMission(mission)} style={adminChipBtn}>
                  {mission.previewImageUrl ? 'Edit Image' : 'Add Image'}
                </button>
                <button type="button" onClick={() => setPreviewMission(mission)} style={adminChipBtn}>Preview</button>
                {!isCoreJourney && (
                  <button type="button" onClick={(e) => handleTogglePublish(mission, e)} style={adminChipBtn}>
                    {published ? 'Unpublish' : 'Publish'}
                  </button>
                )}
                {!isCoreJourney && mission.missionCategory === 'STORY' && (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button type="button" onClick={(e) => handleReorderJourney(mission, -1, e)} style={adminChipBtn}>↑</button>
                    <button type="button" onClick={(e) => handleReorderJourney(mission, 1, e)} style={adminChipBtn}>↓</button>
                  </div>
                )}
                {!isCoreJourney && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!window.confirm(`Delete mission "${mission.title}"?`)) return;
                      await handleDeleteMission(mission.id);
                    }}
                    style={{ ...adminChipBtn, background: '#fee2e2', color: '#991b1b' }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
        })}
      </div>

      {/* Edit Modal */}
      {selectedMission && (
        <MissionEditModal
          key={selectedMission.id}
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
          onSave={handleSaveMission}
          onDelete={handleDeleteMission}
          saving={saving}
          deleting={isDeletingMission}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <MissionCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateMission}
          saving={saving}
        />
      )}

      {previewMission && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setPreviewMission(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '0.75rem',
              maxWidth: 560,
              width: '100%',
              padding: '1.25rem',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{previewMission.title}</h3>
            <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              {categoryBadgeForFilter(previewMission.missionCategory)} ·{' '}
              {isMissionPublished(previewMission) ? 'Published' : 'Draft'} ·{' '}
              {getJourneyChapterLabel(previewMission)}
            </p>
            {(previewMission.previewImageUrl || previewMission.modalImageUrl) ? (
              <img
                src={previewMission.modalImageUrl || previewMission.previewImageUrl}
                alt=""
                style={{ width: '100%', borderRadius: 8, marginBottom: '1rem', maxHeight: 240, objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                height: 120,
                background: '#f3f4f6',
                border: '2px dashed #d1d5db',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                marginBottom: '1rem',
              }}>
                Image Preview
              </div>
            )}
            <p>{previewMission.fullDescription || previewMission.storyText || previewMission.description}</p>
            {previewMission.lesson && (
              <p style={{ fontStyle: 'italic', color: '#374151' }}>Lesson: {previewMission.lesson}</p>
            )}
            <p style={{ fontSize: '0.9rem' }}>
              Rewards: {missionXpReward(previewMission)} XP · {missionPpReward(previewMission)} PP
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setImageEditMission(previewMission);
                  setPreviewMission(null);
                }}
                style={adminChipBtn}
              >
                {previewMission.previewImageUrl ? 'Edit Image' : 'Add Image'}
              </button>
              <button type="button" onClick={() => setPreviewMission(null)} style={adminChipBtn}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {imageEditMission && (
        <MissionImageEditModal
          mission={imageEditMission}
          journeyMedia={
            challengeIdFromJourneyMissionId(imageEditMission.id)
              ? journeyMedia[challengeIdFromJourneyMissionId(imageEditMission.id)!]
              : undefined
          }
          onClose={() => setImageEditMission(null)}
          onSaved={async () => {
            setImageEditMission(null);
            await loadMissions();
          }}
        />
      )}
    </div>
  );
};

const adminChipBtn: React.CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '0.35rem 0.55rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  color: '#111827',
};

interface MissionImageEditModalProps {
  mission: MissionTemplate;
  journeyMedia?: JourneyChallengeMedia;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const MissionImageEditModal: React.FC<MissionImageEditModalProps> = ({
  mission,
  journeyMedia,
  onClose,
  onSaved,
}) => {
  const isCore = isHardcodedJourneyMissionId(mission.id);
  const challengeId = challengeIdFromJourneyMissionId(mission.id);
  const [previewUrl, setPreviewUrl] = useState(
    mission.previewImageUrl ||
      journeyMedia?.previewImageUrl ||
      (isHardcodedJourneyMissionId(mission.id)
        ? resolveJourneyChallengePreviewUrl(challengeIdFromJourneyMissionId(mission.id))
        : undefined) ||
      ''
  );
  const [previewPath, setPreviewPath] = useState(
    mission.previewImageStoragePath || journeyMedia?.previewImageStoragePath || ''
  );
  const [modalUrl, setModalUrl] = useState(
    mission.modalImageUrl || journeyMedia?.modalImageUrl || ''
  );
  const [modalPath, setModalPath] = useState(
    mission.modalImageStoragePath || journeyMedia?.modalImageStoragePath || ''
  );
  const [uploading, setUploading] = useState<'preview' | 'modal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const uploadKind = async (kind: 'preview' | 'modal', file: File) => {
    const validation = validateMissionPreviewImage(file);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setUploading(kind);
    try {
      if (isCore && challengeId) {
        const chapterId = mission.chapterNumber || mission.playerJourneyLink?.chapterId || 1;
        const saved = await saveJourneyChallengePreviewImage(challengeId, chapterId, file, kind);
        if (kind === 'preview') {
          setPreviewUrl(saved.previewImageUrl || '');
          setPreviewPath(saved.previewImageStoragePath || '');
        } else {
          setModalUrl(saved.modalImageUrl || '');
          setModalPath(saved.modalImageStoragePath || '');
        }
      } else {
        const { url, storagePath } = await uploadMissionPreviewImage(mission.id, kind, file);
        if (kind === 'preview') {
          setPreviewUrl(url);
          setPreviewPath(storagePath);
          await updateDoc(doc(db, 'missions', mission.id), {
            previewImageUrl: url,
            previewImageStoragePath: storagePath,
            updatedAt: serverTimestamp(),
          });
        } else {
          setModalUrl(url);
          setModalPath(storagePath);
          await updateDoc(doc(db, 'missions', mission.id), {
            modalImageUrl: url,
            modalImageStoragePath: storagePath,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const removeKind = async (kind: 'preview' | 'modal') => {
    setError(null);
    setSaving(true);
    try {
      if (isCore && challengeId) {
        await removeJourneyChallengeImage(challengeId, kind, {
          challengeId,
          chapterId: mission.chapterNumber || 1,
          previewImageUrl: previewUrl || undefined,
          previewImageStoragePath: previewPath || undefined,
          modalImageUrl: modalUrl || undefined,
          modalImageStoragePath: modalPath || undefined,
        });
        if (kind === 'preview') {
          setPreviewUrl('');
          setPreviewPath('');
        } else {
          setModalUrl('');
          setModalPath('');
        }
      } else {
        const path = kind === 'preview' ? previewPath : modalPath;
        if (path) await deleteMissionMedia(path);
        if (kind === 'preview') {
          await updateDoc(doc(db, 'missions', mission.id), {
            previewImageUrl: deleteField(),
            previewImageStoragePath: deleteField(),
            updatedAt: serverTimestamp(),
          });
          setPreviewUrl('');
          setPreviewPath('');
        } else {
          await updateDoc(doc(db, 'missions', mission.id), {
            modalImageUrl: deleteField(),
            modalImageStoragePath: deleteField(),
            updatedAt: serverTimestamp(),
          });
          setModalUrl('');
          setModalPath('');
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to remove image');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.75rem',
          maxWidth: 520,
          width: '100%',
          padding: '1.25rem',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Edit Preview Image</h3>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 0 }}>
          {mission.title}
          {isCore ? ' · Core Journey (saved to journey media)' : ''}
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
            Preview Image (Journey card / admin thumbnail)
          </label>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
            />
          ) : (
            <div
              style={{
                height: 100,
                border: '2px dashed #d1d5db',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                marginBottom: 8,
              }}
            >
              No preview image
            </div>
          )}
          {previewUrl && !previewPath && isCore && (
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 0 }}>
              Showing bundled Journey asset. Upload a file to override it in admin + Journey.
            </p>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={!!uploading || saving}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadKind('preview', file);
            }}
          />
          {previewUrl && previewPath && (
            <button
              type="button"
              disabled={!!uploading || saving}
              onClick={() => void removeKind('preview')}
              style={{ ...adminChipBtn, marginTop: 8, display: 'block' }}
            >
              Remove uploaded override
            </button>
          )}
          {uploading === 'preview' && (
            <p style={{ color: '#2563eb', fontSize: '0.85rem' }}>Uploading preview…</p>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
            Modal / Story Image (optional)
          </label>
          {modalUrl ? (
            <img
              src={modalUrl}
              alt="Modal"
              style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
            />
          ) : null}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={!!uploading || saving}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadKind('modal', file);
            }}
          />
          {modalUrl && (
            <button
              type="button"
              disabled={!!uploading || saving}
              onClick={() => void removeKind('modal')}
              style={{ ...adminChipBtn, marginTop: 8, display: 'block' }}
            >
              Remove modal image
            </button>
          )}
          {uploading === 'modal' && (
            <p style={{ color: '#2563eb', fontSize: '0.85rem' }}>Uploading modal image…</p>
          )}
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => void onSaved()}
            style={{ ...adminChipBtn, background: '#10b981', color: 'white', borderColor: '#059669' }}
          >
            Done
          </button>
          <button type="button" onClick={onClose} style={adminChipBtn}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

interface MissionEditModalProps {
  mission: MissionTemplate;
  onClose: () => void;
  onSave: (data: Partial<MissionTemplate> & { hubDisplayOrderClear?: boolean }) => void;
  onDelete: (missionId: string) => void | Promise<void>;
  saving: boolean;
  deleting: boolean;
}

const MissionEditModal: React.FC<MissionEditModalProps> = ({ mission, onSave, onClose, onDelete, saving, deleting }) => {
  const [resettingProgress, setResettingProgress] = useState(false);
  const busy = saving || deleting || resettingProgress;
  const [formData, setFormData] = useState({
    title: mission.title,
    description: mission.description,
    shortDescription: mission.shortDescription || '',
    fullDescription: mission.fullDescription || mission.storyText || '',
    lesson: mission.lesson || '',
    npc: mission.npc || '',
    missionCategory: mission.missionCategory,
    deliveryChannels: mission.deliveryChannels,
    storyChapterId: mission.story?.chapterId || '',
    storyOrder: mission.story?.order || 1,
    storyRequired: mission.story?.required !== false,
    storyPrerequisites: (mission.story?.prerequisites || mission.prerequisiteMissionIds || []).join(', '),
    profileJourneyStageId: (mission.profile?.journeyStageId || 'ordinary-world') as ProfileJourneyStageId,
    profileOrder: mission.profile?.order ?? 1,
    gatingMinLevel: mission.gating?.minPlayerLevel ? String(mission.gating.minPlayerLevel) : '',
    gatingChapterId: mission.gating?.chapterId || '',
    hubDisplayOrder:
      mission.hubDisplayOrder != null && Number.isFinite(mission.hubDisplayOrder)
        ? String(mission.hubDisplayOrder)
        : '',
    journeyMissionType: (mission.journeyMissionType || 'story') as JourneyMissionType,
    chapterNumber: mission.chapterNumber != null ? String(mission.chapterNumber) : '',
    missionNumber: mission.missionNumber != null ? String(mission.missionNumber) : '',
    xpReward: mission.xpReward != null ? String(mission.xpReward) : '',
    ppReward: mission.ppReward != null ? String(mission.ppReward) : '',
    battleConfigId: mission.battleConfigId || '',
    sortOrder: mission.sortOrder != null ? String(mission.sortOrder) : '',
    isPublished: isMissionPublished(mission),
    previewImageUrl: mission.previewImageUrl || '',
    previewImageStoragePath: mission.previewImageStoragePath || '',
    modalImageUrl: mission.modalImageUrl || '',
    modalImageStoragePath: mission.modalImageStoragePath || '',
  });

  const [imageUploading, setImageUploading] = useState<'preview' | 'modal' | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [rewardEntries, setRewardEntries] = useState<BattlePassTierRewardEntry[]>(() => {
    const e = mission.rewards?.entries;
    if (Array.isArray(e) && e.length > 0) return e;
    return legacyMissionRewardsToEntries(mission.rewards);
  });

  const [sequence, setSequence] = useState<MissionSequenceStep[]>(mission.sequence || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const missionData: Partial<MissionTemplate> & { hubDisplayOrderClear?: boolean } = {
      title: formData.title,
      description: formData.description,
      shortDescription: formData.shortDescription || undefined,
      fullDescription: formData.fullDescription || undefined,
      lesson: formData.lesson || undefined,
      npc: formData.npc || undefined,
      missionCategory: formData.missionCategory,
      deliveryChannels: formData.deliveryChannels,
      isPublished: formData.isPublished,
      previewImageUrl: formData.previewImageUrl || undefined,
      previewImageStoragePath: formData.previewImageStoragePath || undefined,
      modalImageUrl: formData.modalImageUrl || undefined,
      modalImageStoragePath: formData.modalImageStoragePath || undefined,
    };

    if (formData.missionCategory === 'STORY') {
      missionData.journeyMissionType = formData.journeyMissionType;
      if (formData.chapterNumber.trim()) {
        missionData.chapterNumber = parseInt(formData.chapterNumber, 10);
      }
      if (formData.missionNumber.trim()) {
        missionData.missionNumber = parseInt(formData.missionNumber, 10);
      }
      if (formData.xpReward.trim()) {
        missionData.xpReward = parseInt(formData.xpReward, 10);
      }
      if (formData.ppReward.trim()) {
        missionData.ppReward = parseInt(formData.ppReward, 10);
      }
      if (formData.battleConfigId.trim()) {
        missionData.battleConfigId = formData.battleConfigId.trim();
      }
      if (formData.sortOrder.trim()) {
        missionData.sortOrder = parseInt(formData.sortOrder, 10);
      }
      missionData.prerequisiteMissionIds = formData.storyPrerequisites
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    if (usesHubDisplayOrder(formData.missionCategory)) {
      const raw = formData.hubDisplayOrder.trim();
      if (raw === '') {
        if (mission.hubDisplayOrder != null) {
          missionData.hubDisplayOrderClear = true;
        }
      } else {
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n)) {
          alert('Hub list order must be a whole number (e.g. 1, 2, 3) or left blank for automatic order.');
          return;
        }
        missionData.hubDisplayOrder = n;
      }
    } else if (mission.hubDisplayOrder != null) {
      missionData.hubDisplayOrderClear = true;
    }

    const rewardErr = validateMissionRewardEntries(rewardEntries);
    if (rewardErr) {
      alert(rewardErr);
      return;
    }
    if (rewardEntries.length > 0) {
      // Firestore: deleteField() must be top-level — use dotted paths, not nested under `rewards`.
      const md = missionData as Record<string, unknown>;
      md['rewards.entries'] = serializeMissionRewardEntries(rewardEntries);
      for (const k of [
        'xp',
        'pp',
        'truthMetal',
        'artifactIds',
        'items',
        'moves',
        'abilities',
      ] as const) {
        md[`rewards.${k}`] = deleteField();
      }
    } else if (mission.rewards && Object.keys(mission.rewards).length > 0) {
      (missionData as Record<string, unknown>).rewards = deleteField();
    }

    // Add story metadata if STORY mission
    if (formData.missionCategory === 'STORY') {
      if (!formData.storyChapterId) {
        alert('Chapter ID is required for STORY missions');
        return;
      }
      
      missionData.story = {
        chapterId: formData.storyChapterId,
        order: formData.storyOrder,
        required: formData.storyRequired,
        prerequisites: formData.storyPrerequisites
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)
      };
    }

    // Add profile metadata if PROFILE mission
    if (formData.missionCategory === 'PROFILE') {
      missionData.profile = {
        journeyStageId: formData.profileJourneyStageId,
        order: formData.profileOrder
      };
    }

    // Add gating if provided
    if (formData.gatingMinLevel || formData.gatingChapterId) {
      missionData.gating = {
        minPlayerLevel: formData.gatingMinLevel ? parseInt(String(formData.gatingMinLevel)) : undefined,
        requiresChapterUnlocked: !!formData.gatingChapterId,
        chapterId: formData.gatingChapterId || undefined
      };
    }
    
    if (sequence && sequence.length > 0) {
      const maxSteps = 20;
      if (sequence.length > maxSteps) {
        alert(`Maximum ${maxSteps} steps allowed. Please remove some steps.`);
        return;
      }
      for (const step of sequence) {
        if (step.type === 'STORY_SLIDE' && (!step.bodyText || !step.image.url)) {
          alert('All Story Slides must have caption text and an image.');
          return;
        }
        if (step.type === 'VIDEO' && !step.video.url) {
          alert('All Video steps must have a video URL.');
          return;
        }
        if (step.type === 'BATTLE') {
          const hasEnemies =
            step.battle.enemySet.length > 0 ||
            step.battle.waveConfigs?.some((w) => w.enemySet.length > 0 || (w.opponentIds?.length ?? 0) > 0);
          if (!hasEnemies) {
            alert('All Battle steps must have at least one enemy type or CPU opponent selected per wave.');
            return;
          }
        }
        if (step.type === 'TRAINING_ASSIGNMENT') {
          if (!step.training.quizSetId?.trim()) {
            alert('All Training Assignment steps must have a quiz selected.');
            return;
          }
          const p = step.training.minimumPassPercent;
          if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) {
            alert('Minimum pass percent must be a number from 0 to 100.');
            return;
          }
        }
        if (step.type === 'REFLECTION' && !step.prompt?.trim()) {
          alert('All Reflection steps must include a reflection question (prompt).');
          return;
        }
        if (step.type === 'LEVEL2_MANIFEST') {
          const hasCopy = [step.title, step.description, step.sonidoDialogue].some(
            (s) => typeof s === 'string' && s.trim().length > 0
          );
          if (!hasCopy) {
            alert('Level 2 Manifest steps need a title, description, or Sonido dialogue so players see mentor guidance.');
            return;
          }
        }
        if (step.type === 'CHOICE') {
          if (!step.prompt?.trim()) {
            alert('All Choice steps must include a prompt.');
            return;
          }
          if (!step.choices || step.choices.length < 2) {
            alert('Choice steps need at least two options.');
            return;
          }
          for (const choice of step.choices) {
            if (!choice.label?.trim()) {
              alert('Each Choice option needs a label.');
              return;
            }
            if (!choice.result?.bodyText?.trim()) {
              alert(`Choice "${choice.label.trim()}" needs result text.`);
              return;
            }
            if (choice.goToStepId && !sequence.some((s) => s.id === choice.goToStepId)) {
              alert(`Choice "${choice.label.trim()}" jumps to a step that does not exist.`);
              return;
            }
            const grantIds = choice.result?.grantArtifactIds;
            if (Array.isArray(grantIds) && grantIds.some((id) => typeof id !== 'string' || !id.trim())) {
              alert(`Choice "${choice.label.trim()}" has an empty artifact grant. Select an artifact or remove the row.`);
              return;
            }
          }
        }
        if (step.type === 'CHOOSE_MANIFEST' && formData.missionCategory !== 'DEMO') {
          alert(
            'Choose Manifest steps are only allowed on Demo Missions. Set category to DEMO or remove those steps.'
          );
          return;
        }
        if (step.type === 'SKILLS_MASTERY') {
          const pp = step.grantPP;
          if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) {
            alert('Skills & Mastery steps need a grant PP amount of 0 or more.');
            return;
          }
        }
        if (step.type === 'ARTIFACTS') {
          const pp = step.grantPP;
          if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) {
            alert('Artifacts steps need a grant PP amount of 0 or more.');
            return;
          }
        }
        if (step.type === 'ELEMENTAL_SKILLS') {
          const hasCopy = [step.title, step.bodyText, step.prompt].some(
            (s) => typeof s === 'string' && s.trim().length > 0
          );
          if (!hasCopy) {
            alert('Elemental Skills steps need a title, intro, or prompt so players know what to do.');
            return;
          }
        }
        if (step.type === 'POWER_CARD') {
          const pp = step.grantPP;
          if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) {
            alert('Power Card steps need a grant PP amount of 0 or more.');
            return;
          }
        }
      }
    }

    // Add sequence if present
    if (sequence && sequence.length > 0) {
      const normalizedSequence = sequence.map((step: MissionSequenceStep, idx: number) => ({ ...step, order: idx }));
      missionData.sequence = normalizedSequence;
      missionData.sequenceVersion = (mission.sequenceVersion || 0) + 1;
    } else if (mission.sequence) {
      // If sequence was removed
      missionData.sequence = [];
      missionData.sequenceVersion = (mission.sequenceVersion || 0) + 1;
    }

    onSave(missionData);
  };

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
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '1.5rem' }}>Edit Mission</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={4}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Short Description (Journey card)
            </label>
            <textarea
              value={formData.shortDescription}
              onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Full Description / Story Text
            </label>
            <textarea
              value={formData.fullDescription}
              onChange={(e) => setFormData({ ...formData, fullDescription: e.target.value })}
              rows={4}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Lesson
            </label>
            <input
              type="text"
              value={formData.lesson}
              onChange={(e) => setFormData({ ...formData, lesson: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
              <input
                type="checkbox"
                checked={formData.isPublished}
                onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
              />
              Published
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Preview Image
            </label>
            {formData.previewImageUrl ? (
              <div style={{ marginBottom: '0.5rem' }}>
                <img src={formData.previewImageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 8 }} />
              </div>
            ) : (
              <div style={{ height: 80, background: '#f3f4f6', border: '2px dashed #d1d5db', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', marginBottom: '0.5rem' }}>
                No preview image
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={!!imageUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const err = validateMissionPreviewImage(file);
                if (err) {
                  setImageError(err);
                  return;
                }
                setImageError(null);
                setImageUploading('preview');
                try {
                  const { url, storagePath } = await uploadMissionPreviewImage(mission.id, 'preview', file);
                  setFormData((prev) => ({
                    ...prev,
                    previewImageUrl: url,
                    previewImageStoragePath: storagePath,
                  }));
                } catch (uploadErr: any) {
                  setImageError(uploadErr?.message || 'Upload failed');
                } finally {
                  setImageUploading(null);
                }
              }}
            />
            {formData.previewImageUrl && (
              <button
                type="button"
                onClick={async () => {
                  if (formData.previewImageStoragePath) {
                    await deleteMissionMedia(formData.previewImageStoragePath);
                  }
                  setFormData((prev) => ({
                    ...prev,
                    previewImageUrl: '',
                    previewImageStoragePath: '',
                  }));
                }}
                style={{ marginTop: '0.35rem', ...adminChipBtn }}
              >
                Remove preview image
              </button>
            )}
            {imageUploading === 'preview' && <p style={{ color: '#2563eb', fontSize: '0.85rem' }}>Uploading…</p>}
            {imageError && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{imageError}</p>}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Modal / Story Image
            </label>
            {formData.modalImageUrl ? (
              <div style={{ marginBottom: '0.5rem' }}>
                <img src={formData.modalImageUrl} alt="Modal" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 8 }} />
              </div>
            ) : null}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={!!imageUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const err = validateMissionPreviewImage(file);
                if (err) {
                  setImageError(err);
                  return;
                }
                setImageError(null);
                setImageUploading('modal');
                try {
                  const { url, storagePath } = await uploadMissionPreviewImage(mission.id, 'modal', file);
                  setFormData((prev) => ({
                    ...prev,
                    modalImageUrl: url,
                    modalImageStoragePath: storagePath,
                  }));
                } catch (uploadErr: any) {
                  setImageError(uploadErr?.message || 'Upload failed');
                } finally {
                  setImageUploading(null);
                }
              }}
            />
            {formData.modalImageUrl && (
              <button
                type="button"
                onClick={async () => {
                  if (formData.modalImageStoragePath) {
                    await deleteMissionMedia(formData.modalImageStoragePath);
                  }
                  setFormData((prev) => ({
                    ...prev,
                    modalImageUrl: '',
                    modalImageStoragePath: '',
                  }));
                }}
                style={{ marginTop: '0.35rem', ...adminChipBtn }}
              >
                Remove modal image
              </button>
            )}
            {imageUploading === 'modal' && <p style={{ color: '#2563eb', fontSize: '0.85rem' }}>Uploading…</p>}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Mission Category
            </label>
            <select
              value={formData.missionCategory}
              onChange={(e) => setFormData({ ...formData, missionCategory: e.target.value as MissionCategory })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="SIDE">SIDE (Side Missions)</option>
              <option value="STORY">STORY (Player's Journey)</option>
              <option value="DEMO">DEMO (Game demos & feature showcases)</option>
              <option value="SOVEREIGN">Sovereign Missions</option>
              <option value="PROFILE">PROFILE</option>
            </select>
          </div>

          {usesHubDisplayOrder(formData.missionCategory) && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Hub list order (optional)
              </label>
              <input
                type="number"
                value={formData.hubDisplayOrder}
                onChange={(e) => setFormData({ ...formData, hubDisplayOrder: e.target.value })}
                min={1}
                step={1}
                placeholder="e.g. 1 — leave blank for automatic"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
              />
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                Lower numbers appear first in this NPC&apos;s Side / Sovereign / Demo Missions list. Leave blank to sort by
                creation time (oldest first). Players still see numbered steps 1, 2, 3… in that order.
              </p>
            </div>
          )}

          {formData.missionCategory === 'STORY' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Chapter ID (e.g., "chapter_1")
                </label>
                <input
                  type="text"
                  value={formData.storyChapterId}
                  onChange={(e) => setFormData({ ...formData, storyChapterId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Order (within chapter)
                </label>
                <input
                  type="number"
                  value={formData.storyOrder}
                  onChange={(e) => setFormData({ ...formData, storyOrder: parseInt(e.target.value) || 1 })}
                  required
                  min={1}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.storyRequired}
                    onChange={(e) => setFormData({ ...formData, storyRequired: e.target.checked })}
                  />
                  <span style={{ fontWeight: 'bold' }}>Required for chapter completion</span>
                </label>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Prerequisites (comma-separated mission IDs)
                </label>
                <input
                  type="text"
                  value={formData.storyPrerequisites}
                  onChange={(e) => setFormData({ ...formData, storyPrerequisites: e.target.value })}
                  placeholder="mission_id_1, mission_id_2"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Journey Mission Type
                </label>
                <select
                  value={formData.journeyMissionType}
                  onChange={(e) =>
                    setFormData({ ...formData, journeyMissionType: e.target.value as JourneyMissionType })
                  }
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                >
                  {JOURNEY_MISSION_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Chapter Number</label>
                  <input
                    type="number"
                    value={formData.chapterNumber}
                    onChange={(e) => setFormData({ ...formData, chapterNumber: e.target.value })}
                    min={1}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Mission Number</label>
                  <input
                    type="number"
                    value={formData.missionNumber}
                    onChange={(e) => setFormData({ ...formData, missionNumber: e.target.value })}
                    min={1}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>XP Reward</label>
                  <input
                    type="number"
                    value={formData.xpReward}
                    onChange={(e) => setFormData({ ...formData, xpReward: e.target.value })}
                    min={0}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>PP Reward</label>
                  <input
                    type="number"
                    value={formData.ppReward}
                    onChange={(e) => setFormData({ ...formData, ppReward: e.target.value })}
                    min={0}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Battle Config ID (optional)
                </label>
                <input
                  type="text"
                  value={formData.battleConfigId}
                  onChange={(e) => setFormData({ ...formData, battleConfigId: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Sort Order
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>
            </>
          )}

          {formData.missionCategory === 'PROFILE' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Journey Stage (Player&apos;s Journey on Power Card)
                </label>
                <select
                  value={formData.profileJourneyStageId}
                  onChange={(e) => setFormData({ ...formData, profileJourneyStageId: e.target.value as ProfileJourneyStageId })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                >
                  {PROFILE_JOURNEY_STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                  Completing this mission will add information to this stage in the player&apos;s Journey on their Profile.
                </p>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Order (within stage)
                </label>
                <input
                  type="number"
                  value={formData.profileOrder}
                  onChange={(e) => setFormData({ ...formData, profileOrder: parseInt(e.target.value) || 1 })}
                  min={1}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                  When multiple Profile missions target the same stage, this order determines display sequence.
                </p>
              </div>
            </>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              NPC (optional)
            </label>
            <select
              value={formData.npc}
              onChange={(e) => setFormData({ ...formData, npc: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="">None</option>
              <option value="sonido">Sonido</option>
              <option value="zeke">Zeke</option>
              <option value="luz">Luz</option>
              <option value="kon">Kon</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Delivery Channels
            </label>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.deliveryChannels.includes('HUB_NPC')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({ ...formData, deliveryChannels: [...formData.deliveryChannels, 'HUB_NPC'] });
                    } else {
                      setFormData({ ...formData, deliveryChannels: formData.deliveryChannels.filter(c => c !== 'HUB_NPC') });
                    }
                  }}
                />
                <span>HUB_NPC</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.deliveryChannels.includes('PLAYER_JOURNEY')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({ ...formData, deliveryChannels: [...formData.deliveryChannels, 'PLAYER_JOURNEY'] });
                    } else {
                      setFormData({ ...formData, deliveryChannels: formData.deliveryChannels.filter(c => c !== 'PLAYER_JOURNEY') });
                    }
                  }}
                />
                <span>PLAYER_JOURNEY</span>
              </label>
            </div>
          </div>

          <MissionRewardsBattlePassEditor entries={rewardEntries} onChange={setRewardEntries} />

          {/* Mission Sequence Builder */}
          <MissionSequenceBuilder
            sequence={sequence}
            onChange={setSequence}
            missionId={mission.id}
            missionCategory={formData.missionCategory}
          />

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              marginTop: '2rem',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={busy}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: busy ? 0.5 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save Mission'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: busy ? 0.5 : 1
                }}
              >
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const label = mission.title?.trim() || 'Untitled Mission';
                  if (
                    !window.confirm(
                      `Reset progress for ALL players on "${label}"?\n\n` +
                        `This removes every active and completed record of this mission from player accounts. ` +
                        `Players can accept and play it again from the hub or journey.\n\n` +
                        `It does not undo Player Journey steps already marked complete, and does not remove optional notes in mission reflection history.`
                    )
                  ) {
                    return;
                  }
                  setResettingProgress(true);
                  try {
                    const { deletedCount } = await deleteAllPlayerMissionDocsForMissionTemplate(mission.id);
                    alert(
                      deletedCount === 0
                        ? 'No player progress was stored for this mission (nothing to reset).'
                        : `Removed ${deletedCount} player mission record${deletedCount === 1 ? '' : 's'}. Players can start this mission again.`
                    );
                  } catch (e) {
                    console.error('Reset mission progress failed', e);
                    alert('Failed to reset player progress. Check the console and ensure your account has admin access and Firestore rules are deployed.');
                  } finally {
                    setResettingProgress(false);
                  }
                }}
                style={{
                  backgroundColor: '#d97706',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: busy ? 0.5 : 1
                }}
              >
                {resettingProgress ? 'Resetting…' : 'Reset all player progress'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const label = mission.title?.trim() || 'Untitled Mission';
                  if (
                    !window.confirm(
                      `Permanently delete "${label}"? Player progress tied to this mission may become inconsistent. This cannot be undone.`
                    )
                  ) {
                    return;
                  }
                  void onDelete(mission.id);
                }}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: busy ? 0.5 : 1
                }}
              >
                {deleting ? 'Deleting...' : 'Delete mission'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const DEFAULT_CREATE_FORM: MissionCreateFormData = {
  title: '',
  description: '',
  npc: '',
  missionCategory: 'SIDE',
  deliveryChannels: ['HUB_NPC'],
  storyChapterId: '',
  storyOrder: 1,
  storyRequired: true,
  storyPrerequisites: '',
  profileJourneyStageId: 'ordinary-world',
  profileOrder: 1,
  linkedJourneyStep: '',
  hubDisplayOrder: '',
};

const MissionCreateModal: React.FC<{
  onClose: () => void;
  onCreate: (data: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt'>, playerJourneyLink?: PlayerJourneyLink, sequence?: MissionSequenceStep[], draftMissionId?: string) => void;
  saving: boolean;
}> = ({ onClose, onCreate, saving }) => {
  const restored = readMissionCreateDraft();
  const [formData, setFormData] = useState<MissionCreateFormData>(
    () => restored?.formData || { ...DEFAULT_CREATE_FORM }
  );

  const [rewardEntries, setRewardEntries] = useState<BattlePassTierRewardEntry[]>(
    () => restored?.rewardEntries || []
  );
  
  const [sequence, setSequence] = useState<MissionSequenceStep[]>(() => restored?.sequence || []);
  const [draftMissionId, setDraftMissionId] = useState<string | null>(() => restored?.draftMissionId || null);
  
  // Persist in-progress create work so remounts / accidental closes don't wipe it
  useEffect(() => {
    writeMissionCreateDraft({
      formData,
      rewardEntries,
      sequence,
      draftMissionId,
    });
  }, [formData, rewardEntries, sequence, draftMissionId]);

  // Create draft mission document when modal opens to get an ID for uploads
  useEffect(() => {
    if (draftMissionId) return;

    let cancelled = false;
    const createDraftMission = async () => {
      try {
        const missionsRef = collection(db, 'missions');
        const draftRef = doc(missionsRef);
        const newId = draftRef.id;
        
        await setDoc(draftRef, {
          title: 'Draft Mission',
          description: '',
          missionCategory: 'SIDE',
          deliveryChannels: ['HUB_NPC'],
          isDraft: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        if (!cancelled) setDraftMissionId(newId);
      } catch (error) {
        console.error('Error creating draft mission:', error);
      }
    };
    
    createDraftMission();
    return () => {
      cancelled = true;
    };
  }, [draftMissionId]);
  
  // Build journey step options for dropdown
  const journeyStepOptions: Array<{ value: string; label: string; chapterId: number; challengeId: string }> = [];
  CHAPTERS.forEach(chapter => {
    chapter.challenges.forEach(challenge => {
      journeyStepOptions.push({
        value: `${chapter.id}::${challenge.id}`,
        label: `Chapter ${chapter.id}: ${challenge.title}`,
        chapterId: chapter.id,
        challengeId: challenge.id
      });
    });
  });

  const formIsDirty = Boolean(
    formData.title.trim() ||
    formData.description.trim() ||
    sequence.length > 0 ||
    rewardEntries.length > 0 ||
    formData.missionCategory !== 'SIDE'
  );

  const discardAndClose = () => {
    if (draftMissionId) {
      deleteDoc(doc(db, 'missions', draftMissionId)).catch(console.error);
    }
    clearMissionCreateDraft();
    onClose();
  };

  const handleClose = () => {
    if (formIsDirty) {
      const ok = window.confirm(
        'You have unsaved mission work. Close and discard this draft?'
      );
      if (!ok) return;
    }
    discardAndClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (formData.deliveryChannels.includes('PLAYER_JOURNEY') && !formData.linkedJourneyStep) {
      alert('Please select a Player Journey step to link this mission to.');
      return;
    }
    
    if (formData.deliveryChannels.includes('HUB_NPC') && !formData.npc) {
      alert('Please select an NPC when HUB_NPC delivery channel is selected.');
      return;
    }
    
    const missionData: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      title: formData.title,
      description: formData.description,
      npc: formData.npc || undefined,
      missionCategory: formData.missionCategory,
      deliveryChannels: formData.deliveryChannels
    };

    if (usesHubDisplayOrder(formData.missionCategory)) {
      const raw = formData.hubDisplayOrder.trim();
      if (raw !== '') {
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n)) {
          alert('Hub list order must be a whole number (e.g. 1, 2, 3) or left blank for automatic order.');
          return;
        }
        missionData.hubDisplayOrder = n;
      }
    }

    if (formData.missionCategory === 'STORY') {
      if (!formData.storyChapterId) {
        alert('Chapter ID is required for STORY missions');
        return;
      }
      
      missionData.story = {
        chapterId: formData.storyChapterId,
        order: formData.storyOrder,
        required: formData.storyRequired,
        prerequisites: formData.storyPrerequisites
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)
      };
    }

    if (formData.missionCategory === 'PROFILE') {
      missionData.profile = {
        journeyStageId: formData.profileJourneyStageId,
        order: formData.profileOrder
      };
    }
    
    // Parse player journey link if selected
    let playerJourneyLink: PlayerJourneyLink | undefined;
    if (formData.linkedJourneyStep) {
      const [chapterIdStr, challengeId] = formData.linkedJourneyStep.split('::');
      const chapterId = parseInt(chapterIdStr, 10);
      if (!isNaN(chapterId) && challengeId) {
        playerJourneyLink = { chapterId, challengeId };
        missionData.playerJourneyLink = playerJourneyLink;
      }
    }

    const rewardErr = validateMissionRewardEntries(rewardEntries);
    if (rewardErr) {
      alert(rewardErr);
      return;
    }
    if (rewardEntries.length > 0) {
      const md = missionData as Record<string, unknown>;
      md['rewards.entries'] = serializeMissionRewardEntries(rewardEntries);
      for (const k of [
        'xp',
        'pp',
        'truthMetal',
        'artifactIds',
        'items',
        'moves',
        'abilities',
      ] as const) {
        md[`rewards.${k}`] = deleteField();
      }
    }

    // Validate sequence if present
    if (sequence.length > 0) {
      const maxSteps = 20;
      if (sequence.length > maxSteps) {
        alert(`Maximum ${maxSteps} steps allowed. Please remove some steps.`);
        return;
      }
      
      // Validate each step has required fields
      for (const step of sequence) {
        if (step.type === 'STORY_SLIDE' && (!step.bodyText || !step.image.url)) {
          alert('All Story Slides must have caption text and an image.');
          return;
        }
        if (step.type === 'VIDEO' && !step.video.url) {
          alert('All Video steps must have a video URL.');
          return;
        }
        if (step.type === 'BATTLE') {
          const hasEnemies = step.battle.enemySet.length > 0 || (step.battle.waveConfigs?.some(w => w.enemySet.length > 0 || (w.opponentIds?.length ?? 0) > 0));
          if (!hasEnemies) {
            alert('All Battle steps must have at least one enemy type or CPU opponent selected per wave.');
            return;
          }
        }
        if (step.type === 'TRAINING_ASSIGNMENT') {
          if (!step.training.quizSetId?.trim()) {
            alert('All Training Assignment steps must have a quiz selected.');
            return;
          }
          const p = step.training.minimumPassPercent;
          if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) {
            alert('Minimum pass percent must be a number from 0 to 100.');
            return;
          }
        }
        if (step.type === 'REFLECTION' && !step.prompt?.trim()) {
          alert('All Reflection steps must include a reflection question (prompt).');
          return;
        }
        if (step.type === 'LEVEL2_MANIFEST') {
          const hasCopy = [step.title, step.description, step.sonidoDialogue].some(
            (s) => typeof s === 'string' && s.trim().length > 0
          );
          if (!hasCopy) {
            alert('Level 2 Manifest steps need a title, description, or Sonido dialogue so players see mentor guidance.');
            return;
          }
        }
        if (step.type === 'CHOICE') {
          if (!step.prompt?.trim()) {
            alert('All Choice steps must include a prompt.');
            return;
          }
          if (!step.choices || step.choices.length < 2) {
            alert('Choice steps need at least two options.');
            return;
          }
          for (const choice of step.choices) {
            if (!choice.label?.trim()) {
              alert('Each Choice option needs a label.');
              return;
            }
            if (!choice.result?.bodyText?.trim()) {
              alert(`Choice "${choice.label.trim()}" needs result text.`);
              return;
            }
            if (choice.goToStepId && !sequence.some((s) => s.id === choice.goToStepId)) {
              alert(`Choice "${choice.label.trim()}" jumps to a step that does not exist.`);
              return;
            }
            const grantIds = choice.result?.grantArtifactIds;
            if (Array.isArray(grantIds) && grantIds.some((id) => typeof id !== 'string' || !id.trim())) {
              alert(`Choice "${choice.label.trim()}" has an empty artifact grant. Select an artifact or remove the row.`);
              return;
            }
          }
        }
        if (step.type === 'CHOOSE_MANIFEST' && formData.missionCategory !== 'DEMO') {
          alert(
            'Choose Manifest steps are only allowed on Demo Missions. Set category to DEMO or remove those steps.'
          );
          return;
        }
        if (step.type === 'SKILLS_MASTERY') {
          const pp = step.grantPP;
          if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) {
            alert('Skills & Mastery steps need a grant PP amount of 0 or more.');
            return;
          }
        }
        if (step.type === 'ARTIFACTS') {
          const pp = step.grantPP;
          if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) {
            alert('Artifacts steps need a grant PP amount of 0 or more.');
            return;
          }
        }
        if (step.type === 'ELEMENTAL_SKILLS') {
          const hasCopy = [step.title, step.bodyText, step.prompt].some(
            (s) => typeof s === 'string' && s.trim().length > 0
          );
          if (!hasCopy) {
            alert('Elemental Skills steps need a title, intro, or prompt so players know what to do.');
            return;
          }
        }
        if (step.type === 'POWER_CARD') {
          const pp = step.grantPP;
          if (typeof pp !== 'number' || !Number.isFinite(pp) || pp < 0) {
            alert('Power Card steps need a grant PP amount of 0 or more.');
            return;
          }
        }
      }
    }

    // Pass draft mission ID if available
    onCreate(missionData, playerJourneyLink, sequence.length > 0 ? sequence : undefined, draftMissionId || undefined);
  };

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
      // Do not close on backdrop click — that was wiping in-progress mission drafts
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '1.5rem' }}>Create Mission</h2>
        <form onSubmit={handleSubmit}>
          {/* Same form fields as EditModal */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={4}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Mission Category
            </label>
            <select
              value={formData.missionCategory}
              onChange={(e) => setFormData({ ...formData, missionCategory: e.target.value as MissionCategory })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="SIDE">SIDE</option>
              <option value="STORY">STORY</option>
              <option value="DEMO">DEMO (Game demos & feature showcases)</option>
              <option value="SOVEREIGN">Sovereign Missions</option>
              <option value="PROFILE">PROFILE</option>
            </select>
          </div>

          {usesHubDisplayOrder(formData.missionCategory) && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Hub list order (optional)
              </label>
              <input
                type="number"
                value={formData.hubDisplayOrder}
                onChange={(e) => setFormData({ ...formData, hubDisplayOrder: e.target.value })}
                min={1}
                step={1}
                placeholder="e.g. 1 — leave blank for automatic"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
              />
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                Lower numbers appear first in this NPC&apos;s Side / Sovereign / Demo Missions list. Leave blank to sort by
                creation time (oldest first). Players still see numbered steps 1, 2, 3… in that order.
              </p>
            </div>
          )}

          {formData.missionCategory === 'STORY' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Chapter ID (e.g., "chapter_1")
                </label>
                <input
                  type="text"
                  value={formData.storyChapterId}
                  onChange={(e) => setFormData({ ...formData, storyChapterId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Order (within chapter)
                </label>
                <input
                  type="number"
                  value={formData.storyOrder}
                  onChange={(e) => setFormData({ ...formData, storyOrder: parseInt(e.target.value) || 1 })}
                  required
                  min={1}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.storyRequired}
                    onChange={(e) => setFormData({ ...formData, storyRequired: e.target.checked })}
                  />
                  <span style={{ fontWeight: 'bold' }}>Required for chapter completion</span>
                </label>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Prerequisites (comma-separated mission IDs)
                </label>
                <input
                  type="text"
                  value={formData.storyPrerequisites}
                  onChange={(e) => setFormData({ ...formData, storyPrerequisites: e.target.value })}
                  placeholder="mission_id_1, mission_id_2"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>
            </>
          )}

          {formData.missionCategory === 'PROFILE' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Journey Stage (Player&apos;s Journey on Power Card)
                </label>
                <select
                  value={formData.profileJourneyStageId}
                  onChange={(e) => setFormData({ ...formData, profileJourneyStageId: e.target.value as ProfileJourneyStageId })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                >
                  {PROFILE_JOURNEY_STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                  Completing this mission will add information to this stage in the player&apos;s Journey on their Profile.
                </p>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Order (within stage)
                </label>
                <input
                  type="number"
                  value={formData.profileOrder}
                  onChange={(e) => setFormData({ ...formData, profileOrder: parseInt(e.target.value) || 1 })}
                  min={1}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                  When multiple Profile missions target the same stage, this order determines display sequence.
                </p>
              </div>
            </>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              NPC (optional)
            </label>
            <select
              value={formData.npc}
              onChange={(e) => setFormData({ ...formData, npc: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="">None</option>
              <option value="sonido">Sonido</option>
              <option value="zeke">Zeke</option>
              <option value="luz">Luz</option>
              <option value="kon">Kon</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Delivery Channels
            </label>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.deliveryChannels.includes('HUB_NPC')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({ ...formData, deliveryChannels: [...formData.deliveryChannels, 'HUB_NPC'] });
                    } else {
                      setFormData({ ...formData, deliveryChannels: formData.deliveryChannels.filter(c => c !== 'HUB_NPC') });
                    }
                  }}
                />
                <span>HUB_NPC</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.deliveryChannels.includes('PLAYER_JOURNEY')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({ ...formData, deliveryChannels: [...formData.deliveryChannels, 'PLAYER_JOURNEY'] });
                    } else {
                      setFormData({ ...formData, deliveryChannels: formData.deliveryChannels.filter(c => c !== 'PLAYER_JOURNEY'), linkedJourneyStep: '' });
                    }
                  }}
                />
                <span>PLAYER_JOURNEY</span>
              </label>
            </div>
          </div>

          {/* Link to Player Journey Step - only show if PLAYER_JOURNEY is checked */}
          {formData.deliveryChannels.includes('PLAYER_JOURNEY') && (
            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Link to Player Journey Step <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formData.linkedJourneyStep}
                onChange={(e) => setFormData({ ...formData, linkedJourneyStep: e.target.value })}
                required={formData.deliveryChannels.includes('PLAYER_JOURNEY')}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
              >
                <option value="">-- Select a Journey Step --</option>
                {journeyStepOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                This mission will count for both NPC missions and Player's Journey. Completing it once will satisfy both systems.
              </p>
            </div>
          )}

          <MissionRewardsBattlePassEditor entries={rewardEntries} onChange={setRewardEntries} />

          {/* Mission Sequence Builder */}
          <MissionSequenceBuilder
            sequence={sequence}
            onChange={setSequence}
            missionId={draftMissionId || undefined} // Use draft ID for uploads during creation
            missionCategory={formData.missionCategory}
          />

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: saving ? 0.5 : 1
              }}
            >
              {saving ? 'Creating...' : 'Create Mission'}
            </button>
            <button
              type="button"
              onClick={handleClose}
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
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MissionAdmin;

