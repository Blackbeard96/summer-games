import React, { useEffect } from 'react';

interface Badge {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  earnedAt?: any;
}

interface BadgeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  badge: Badge | null;
}

const BadgeDetailModal: React.FC<BadgeDetailModalProps> = ({
  isOpen,
  onClose,
  badge
}) => {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !badge) return null;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    try {
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString();
      }
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString();
      }
      return 'Unknown date';
    } catch (error) {
      return 'Unknown date';
    }
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
        zIndex: 100000,
        padding: '1rem',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        // Only close if clicking the backdrop, not the modal content
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          maxWidth: '500px',
          width: '100%',
          color: 'white',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
          border: '2px solid rgba(139, 92, 246, 0.5)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Top Right */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '0.5rem',
            padding: '0.5rem',
            color: '#fca5a5',
            cursor: 'pointer',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.4)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Badge Icon/Image */}
        <div style={{
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
          boxShadow: '0 10px 30px rgba(139, 92, 246, 0.4)',
          border: '4px solid rgba(139, 92, 246, 0.3)'
        }}>
          {badge.imageUrl ? (
            <img
              src={badge.imageUrl}
              alt={badge.name}
              style={{
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                objectFit: 'cover'
              }}
            />
          ) : (
            <div style={{ fontSize: '6rem' }}>🏅</div>
          )}
        </div>

        {/* Badge Name */}
        <h2 style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          margin: 0,
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          {badge.name}
        </h2>

        {/* Badge Description */}
        {badge.description && (
          <p style={{
            fontSize: '1.125rem',
            color: '#cbd5e1',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
            maxWidth: '400px'
          }}>
            {badge.description}
          </p>
        )}

        {/* Earned Date */}
        {badge.earnedAt && (
          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '0.75rem',
            padding: '0.75rem 1.5rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              marginBottom: '0.25rem'
            }}>
              Earned On
            </div>
            <div style={{
              fontSize: '1rem',
              fontWeight: 'bold',
              color: '#a78bfa'
            }}>
              {formatDate(badge.earnedAt)}
            </div>
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            border: 'none',
            borderRadius: '0.75rem',
            color: 'white',
            fontSize: '1.125rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default BadgeDetailModal;


