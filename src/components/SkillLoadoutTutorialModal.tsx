import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { SKILL_LOADOUT_TUTORIAL_KEY } from '../utils/skillLoadoutTutorial';

const MODAL_Z_INDEX = 100000;

export interface SkillLoadoutTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, marking as seen is persisted to Firestore on close. When false (e.g. opened from Review), do not update. */
  markSeenOnClose: boolean;
}

/**
 * One-time tutorial modal for the New Skill Loadout System.
 * Shown from app startup queue (markSeenOnClose=true) or from Help / Tutorials (markSeenOnClose=false).
 */
const SkillLoadoutTutorialModal: React.FC<SkillLoadoutTutorialModalProps> = ({
  isOpen,
  onClose,
  markSeenOnClose
}) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isMarkingSeen, setIsMarkingSeen] = useState(false);

  const markTutorialSeen = useCallback(async () => {
    if (!markSeenOnClose || !currentUser) return;
    setIsMarkingSeen(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        [`tutorials.${SKILL_LOADOUT_TUTORIAL_KEY}.completed`]: true,
        [`tutorials.${SKILL_LOADOUT_TUTORIAL_KEY}.completedAt`]: new Date()
      });
    } catch (err) {
      console.warn('SkillLoadoutTutorialModal: failed to persist seen state', err);
    } finally {
      setIsMarkingSeen(false);
    }
  }, [markSeenOnClose, currentUser]);

  const handleSetLoadout = useCallback(async () => {
    if (markSeenOnClose) await markTutorialSeen();
    onClose();
    try {
      navigate({ pathname: '/battle', search: '?tutorial=skill-loadout', hash: 'moves' });
    } catch (e) {
      console.warn('SkillLoadoutTutorialModal: navigate failed', e);
      window.location.href = '/battle?tutorial=skill-loadout#moves';
    }
  }, [markSeenOnClose, markTutorialSeen, onClose, navigate]);

  const handleLater = useCallback(async () => {
    if (markSeenOnClose) await markTutorialSeen();
    onClose();
  }, [markSeenOnClose, markTutorialSeen, onClose]);

  const handleBackdropClick = useCallback(() => {
    handleLater();
  }, [handleLater]);

  if (!isOpen) return null;

  const modalContent = (
    <>
      <div
        role="presentation"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: MODAL_Z_INDEX,
          backdropFilter: 'blur(2px)',
          pointerEvents: 'auto'
        }}
        onClick={handleBackdropClick}
      />
      <div
        role="dialog"
        aria-labelledby="skill-loadout-tutorial-title"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '520px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: MODAL_Z_INDEX + 1,
          border: '2px solid #4f46e5',
          pointerEvents: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h2
            id="skill-loadout-tutorial-title"
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#1f2937',
              margin: 0
            }}
          >
            New Skill Loadout System
          </h2>
          <button
            type="button"
            onClick={handleLater}
            disabled={isMarkingSeen}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: isMarkingSeen ? 'not-allowed' : 'pointer',
              color: '#6b7280',
              padding: '0.25rem'
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p style={{ color: '#374151', marginBottom: '1rem', lineHeight: 1.5 }}>
          Your battle system has been upgraded. You can now equip up to 6 Skills in your Loadout from multiple sources, including Manifest, Elemental, RR Candy, and Artifact Skills. Before your next battle, make sure your Loadout is set.
        </p>

        <ul style={{
          margin: '0 0 1.5rem 1.25rem',
          padding: 0,
          color: '#374151',
          lineHeight: 1.6
        }}>
          <li style={{ marginBottom: '0.5rem' }}>Equip up to 6 Skills total</li>
          <li style={{ marginBottom: '0.5rem' }}>Mix skills from different sources</li>
          <li style={{ marginBottom: '0.5rem' }}>Your equipped skills determine what you can use in battle</li>
          <li style={{ marginBottom: '0.5rem' }}>Update your Loadout before entering combat</li>
        </ul>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => void handleSetLoadout()}
            disabled={isMarkingSeen}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.375rem',
              cursor: isMarkingSeen ? 'not-allowed' : 'pointer',
              fontSize: '0.9375rem',
              fontWeight: 600
            }}
          >
            Set My Loadout
          </button>
          <button
            type="button"
            onClick={handleLater}
            disabled={isMarkingSeen}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.375rem',
              cursor: isMarkingSeen ? 'not-allowed' : 'pointer',
              fontSize: '0.9375rem',
              fontWeight: 500
            }}
          >
            Later
          </button>
        </div>

        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
          You can review this tutorial again from Help / Tutorials later.
        </p>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default SkillLoadoutTutorialModal;

/** Re-export for consumers that import from the modal module. */
export { SKILL_LOADOUT_TUTORIAL_KEY, hasSeenSkillLoadoutTutorial } from '../utils/skillLoadoutTutorial';
