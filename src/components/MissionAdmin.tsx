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

function usesHubDisplayOrder(category: MissionCategory): boolean {
  return category === 'SIDE' || category === 'SOVEREIGN';
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
  return category === 'SOVEREIGN' ? 'Sovereign' : category;
}

const MissionAdmin: React.FC = () => {
  const [missions, setMissions] = useState<MissionTemplate[]>([]);
  const [selectedMission, setSelectedMission] = useState<MissionTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeletingMission, setIsDeletingMission] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadMissions();
  }, []);

  const loadMissions = async () => {
    setLoading(true);
    try {
      const missionsRef = collection(db, 'missions');
      const q = query(missionsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const missionsData: MissionTemplate[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        missionsData.push({
          id: doc.id,
          title: data.title || 'Untitled Mission',
          description: data.description || '',
          npc: data.npc || null,
          missionCategory: normalizeMissionCategory(data.missionCategory),
          deliveryChannels: data.deliveryChannels || ['HUB_NPC'],
          story: data.story || undefined,
          profile: data.profile || undefined,
          playerJourneyLink: data.playerJourneyLink || undefined,
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

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading missions...</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
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

      {/* Mission List */}
      <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
        {missions.map((mission) => {
          const chrome = missionCategoryListChrome(mission.missionCategory);
          return (
          <div
            key={mission.id}
            onClick={() => setSelectedMission(mission)}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
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
                    {missionCategoryBadgeLabel(mission.missionCategory)}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                  {mission.description}
                </p>
                {mission.story && (
                  <p style={{ margin: '0.5rem 0 0 0', color: '#9ca3af', fontSize: '0.8rem' }}>
                    Chapter: {mission.story.chapterId} | Order: {mission.story.order} | Required: {mission.story.required ? 'Yes' : 'No'}
                  </p>
                )}
                {mission.profile && (
                  <p style={{ margin: '0.5rem 0 0 0', color: '#9ca3af', fontSize: '0.8rem' }}>
                    Journey: {mission.profile.journeyStageId} {mission.profile.order != null ? `| Order: ${mission.profile.order}` : ''}
                  </p>
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
    npc: mission.npc || '',
    missionCategory: mission.missionCategory,
    deliveryChannels: mission.deliveryChannels,
    storyChapterId: mission.story?.chapterId || '',
    storyOrder: mission.story?.order || 1,
    storyRequired: mission.story?.required !== false,
    storyPrerequisites: (mission.story?.prerequisites || []).join(', '),
    profileJourneyStageId: (mission.profile?.journeyStageId || 'ordinary-world') as ProfileJourneyStageId,
    profileOrder: mission.profile?.order ?? 1,
    gatingMinLevel: mission.gating?.minPlayerLevel ? String(mission.gating.minPlayerLevel) : '',
    gatingChapterId: mission.gating?.chapterId || '',
    hubDisplayOrder:
      mission.hubDisplayOrder != null && Number.isFinite(mission.hubDisplayOrder)
        ? String(mission.hubDisplayOrder)
        : ''
  });

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
      npc: formData.npc || undefined,
      missionCategory: formData.missionCategory,
      deliveryChannels: formData.deliveryChannels
    };

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
              Mission Category
            </label>
            <select
              value={formData.missionCategory}
              onChange={(e) => setFormData({ ...formData, missionCategory: e.target.value as MissionCategory })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="SIDE">SIDE</option>
              <option value="STORY">STORY</option>
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
                Lower numbers appear first in this NPC&apos;s Side / Sovereign Missions list. Leave blank to sort by
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

const MissionCreateModal: React.FC<{
  onClose: () => void;
  onCreate: (data: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt'>, playerJourneyLink?: PlayerJourneyLink, sequence?: MissionSequenceStep[], draftMissionId?: string) => void;
  saving: boolean;
}> = ({ onClose, onCreate, saving }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    npc: '',
    missionCategory: 'SIDE' as MissionCategory,
    deliveryChannels: ['HUB_NPC'] as DeliveryChannel[],
    storyChapterId: '',
    storyOrder: 1,
    storyRequired: true,
    storyPrerequisites: '',
    profileJourneyStageId: 'ordinary-world' as ProfileJourneyStageId,
    profileOrder: 1,
    linkedJourneyStep: '', // Format: "chapterId::challengeId"
    hubDisplayOrder: ''
  });

  const [rewardEntries, setRewardEntries] = useState<BattlePassTierRewardEntry[]>([]);
  
  const [sequence, setSequence] = useState<MissionSequenceStep[]>([]);
  const [draftMissionId, setDraftMissionId] = useState<string | null>(null);
  
  // Create draft mission document when modal opens to get an ID for uploads
  useEffect(() => {
    let draftId: string | null = null;
    
    const createDraftMission = async () => {
      try {
        const missionsRef = collection(db, 'missions');
        const draftRef = doc(missionsRef);
        draftId = draftRef.id;
        
        // Create a minimal draft document
        await setDoc(draftRef, {
          title: 'Draft Mission',
          description: '',
          missionCategory: 'SIDE',
          deliveryChannels: ['HUB_NPC'],
          isDraft: true, // Flag to identify drafts
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        setDraftMissionId(draftId);
      } catch (error) {
        console.error('Error creating draft mission:', error);
        // If draft creation fails, we can still proceed with URL-based media
      }
    };
    
    createDraftMission();

    // Intentionally no cleanup deleteDoc: the draft doc id becomes the real mission on save.
    // Unmount-after-success would delete the mission we just wrote. Abandoned drafts are
    // removed in handleClose (Cancel / backdrop).
  }, []);
  
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
      }
    }

    // Pass draft mission ID if available
    onCreate(missionData, playerJourneyLink, sequence.length > 0 ? sequence : undefined, draftMissionId || undefined);
  };
  
  const handleClose = () => {
    // Clean up draft if exists
    if (draftMissionId) {
      deleteDoc(doc(db, 'missions', draftMissionId)).catch(console.error);
    }
    onClose();
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
      onClick={handleClose}
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
                Lower numbers appear first in this NPC&apos;s Side / Sovereign Missions list. Leave blank to sort by
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

