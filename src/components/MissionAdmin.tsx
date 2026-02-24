/**
 * Mission Admin Component
 * 
 * Allows admins to:
 * - Create/edit missions
 * - Designate missions as STORY or SIDE
 * - Set chapter metadata for story missions
 * - Assign NPCs and delivery channels
 */

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, writeBatch, getDoc as getDocFn } from 'firebase/firestore';
import { db } from '../firebase';
import { MissionTemplate, MissionCategory, DeliveryChannel, PlayerJourneyLink, MissionSequenceStep } from '../types/missions';
import { CHAPTERS, ChapterChallenge } from '../types/chapters';
import MissionSequenceBuilder from './MissionSequenceBuilder';

const MissionAdmin: React.FC = () => {
  const [missions, setMissions] = useState<MissionTemplate[]>([]);
  const [selectedMission, setSelectedMission] = useState<MissionTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          missionCategory: data.missionCategory || 'SIDE',
          deliveryChannels: data.deliveryChannels || ['HUB_NPC'],
          story: data.story || undefined,
          playerJourneyLink: data.playerJourneyLink || undefined,
          gating: data.gating || undefined,
          rewards: data.rewards || {},
          objectives: data.objectives || [],
          sequence: data.sequence || undefined,
          sequenceVersion: data.sequenceVersion || undefined,
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

  const handleSaveMission = async (missionData: Partial<MissionTemplate>) => {
    if (!selectedMission) return;

    setSaving(true);
    try {
      const missionRef = doc(db, 'missions', selectedMission.id);
      await updateDoc(missionRef, {
        ...missionData,
        updatedAt: serverTimestamp()
      });
      
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
      const missionDocData: any = {
        ...missionData,
        isDraft: undefined, // Remove draft flag
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
      
      if (draftMissionId) {
        batch.update(missionRef, missionDocData);
      } else {
        batch.set(missionRef, missionDocData);
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
        {missions.map((mission) => (
          <div
            key={mission.id}
            onClick={() => setSelectedMission(mission)}
            style={{
              padding: '1rem',
              background: mission.missionCategory === 'STORY' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(59, 130, 246, 0.1)',
              border: `2px solid ${mission.missionCategory === 'STORY' ? '#fbbf24' : '#3b82f6'}`,
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
                    backgroundColor: mission.missionCategory === 'STORY' ? '#fbbf24' : '#3b82f6',
                    color: mission.missionCategory === 'STORY' ? '#1f2937' : 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    {mission.missionCategory}
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
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {selectedMission && (
        <MissionEditModal
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
          onSave={handleSaveMission}
          saving={saving}
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
  onSave: (data: Partial<MissionTemplate>) => void;
  saving: boolean;
}

const MissionEditModal: React.FC<MissionEditModalProps> = ({ mission, onSave, onClose, saving }) => {
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
    gatingMinLevel: mission.gating?.minPlayerLevel ? String(mission.gating.minPlayerLevel) : '',
    gatingChapterId: mission.gating?.chapterId || ''
  });

  const [sequence, setSequence] = useState<MissionSequenceStep[]>(mission.sequence || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const missionData: Partial<MissionTemplate> = {
      title: formData.title,
      description: formData.description,
      npc: formData.npc || undefined,
      missionCategory: formData.missionCategory,
      deliveryChannels: formData.deliveryChannels
    };

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

    // Add gating if provided
    if (formData.gatingMinLevel || formData.gatingChapterId) {
      missionData.gating = {
        minPlayerLevel: formData.gatingMinLevel ? parseInt(String(formData.gatingMinLevel)) : undefined,
        requiresChapterUnlocked: !!formData.gatingChapterId,
        chapterId: formData.gatingChapterId || undefined
      };
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
            </select>
          </div>

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

          {/* Mission Sequence Builder */}
          <MissionSequenceBuilder
            sequence={sequence}
            onChange={setSequence}
            missionId={mission.id}
          />

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: saving ? 0.5 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save Mission'}
            </button>
            <button
              type="button"
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
              Cancel
            </button>
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
    linkedJourneyStep: '' // Format: "chapterId::challengeId"
  });
  
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
    
    // Cleanup: delete draft if modal is closed without saving
    return () => {
      if (draftId) {
        deleteDoc(doc(db, 'missions', draftId)).catch(console.error);
      }
    };
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
            </select>
          </div>

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

