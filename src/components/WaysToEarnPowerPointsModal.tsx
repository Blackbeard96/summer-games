import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestHomeHubMissionsHighlight } from '../utils/earnPowerPointsHomeIntent';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen guide: PP sources. Daily challenges are described in-place (power card Daily tab).
 * MST Home hub missions is a separate row that goes to Home and highlights NPC mission hotspots.
 */
const WaysToEarnPowerPointsModal: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const goHomeHubMissions = () => {
    onClose();
    requestHomeHubMissionsHighlight();
    if (pathname !== '/home') navigate('/home');
    else {
      window.dispatchEvent(new CustomEvent('xiotein:replayHomeHubHighlight'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="earn-pp-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        <h2
          id="earn-pp-modal-title"
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#1f2937',
            textAlign: 'center',
          }}
        >
          💰 Ways to Earn Power Points
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go('/battle');
              }
            }}
            style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '0.75rem',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onClick={() => go('/battle')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>⚔️</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Battle Arena</h3>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                  Fight other players and win PP from their vaults. Practice mode also rewards PP!
                </p>
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go('/island-raid');
              }
            }}
            style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '0.75rem',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onClick={() => go('/island-raid')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>🏝️</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Island Raid</h3>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                  Complete Island Raids to earn PP rewards. Easy mode: 150 PP, Normal mode: 300 PP!
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '0.75rem',
              color: 'white',
              cursor: 'default',
              border: '2px dashed rgba(255,255,255,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>📅</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Daily Challenges</h3>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.92, fontSize: '0.875rem' }}>
                  Complete rotating daily tasks for PP. On MST Home, open the bottom power card and choose the{' '}
                  <strong>Daily</strong> tab — challenges and rewards refresh every day.
                </p>
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goHomeHubMissions();
              }
            }}
            style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              borderRadius: '0.75rem',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onClick={goHomeHubMissions}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>🏠</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>MST Home hub missions</h3>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.92, fontSize: '0.875rem' }}>
                  Go to MST Home and use the glowing character icons (Sonido, Zeke, Luz, Kon) to open missions that
                  award PP and story progress.
                </p>
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go('/story');
              }
            }}
            style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              borderRadius: '0.75rem',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onClick={() => go('/story')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>📖</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Story Mode</h3>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                  Complete story episodes to earn PP and other rewards as you progress through the story!
                </p>
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go('/chapters');
              }
            }}
            style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
              borderRadius: '0.75rem',
              color: 'white',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onClick={() => go('/chapters')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>🗺️</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{'Player\u2019s Journey'}</h3>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                  Complete chapter challenges to earn PP and unlock new content!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaysToEarnPowerPointsModal;
