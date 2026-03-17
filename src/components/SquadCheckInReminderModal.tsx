import React from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY_PREFIX = 'mst_squad_checkin_reminder_';

export function getSquadCheckInReminderStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns true if we should show the reminder today (user hasn't seen it yet today). */
export function shouldShowSquadCheckInReminder(userId: string): boolean {
  try {
    const key = getSquadCheckInReminderStorageKey(userId);
    const stored = localStorage.getItem(key);
    const today = getTodayDateString();
    return stored !== today;
  } catch {
    return true;
  }
}

/** Mark that the user has seen the reminder today (call on close or when navigating). */
export function markSquadCheckInReminderSeenToday(userId: string): void {
  try {
    const key = getSquadCheckInReminderStorageKey(userId);
    localStorage.setItem(key, getTodayDateString());
  } catch {
    // ignore
  }
}

interface SquadCheckInReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const SquadCheckInReminderModal: React.FC<SquadCheckInReminderModalProps> = ({
  isOpen,
  onClose,
  userId
}) => {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  const handleClose = () => {
    markSquadCheckInReminderSeenToday(userId);
    onClose();
  };

  const handleGoToCheckIn = () => {
    markSquadCheckInReminderSeenToday(userId);
    onClose();
    navigate('/squads');
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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="squad-checkin-reminder-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255,255,255,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
          <h2
            id="squad-checkin-reminder-title"
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '0.5rem',
              textShadow: '1px 1px 2px rgba(0,0,0,0.2)'
            }}
          >
            Don’t forget to check in with your Squad
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.95)', margin: 0, lineHeight: 1.4 }}>
            Daily check-in earns PP for you and your squad. Tap below to go to Squad Check-in.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={handleGoToCheckIn}
            style={{
              width: '100%',
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            }}
          >
            Go to Squad Check-in
          </button>
          <button
            onClick={handleClose}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'transparent',
              color: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: '0.5rem',
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
};

export default SquadCheckInReminderModal;
