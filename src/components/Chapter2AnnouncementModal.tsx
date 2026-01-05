import React, { useState, useEffect } from 'react';

interface Chapter2AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
  totalCount?: number;
}

const Chapter2AnnouncementModal: React.FC<Chapter2AnnouncementModalProps> = ({
  isOpen,
  onClose,
  onNext,
  onPrevious,
  currentIndex = 0,
  totalCount = 1
}) => {
  const [currentPage, setCurrentPage] = useState(0); // 0 = Chapter 2 Update, 1 = In-Session Mode
  
  // Reset to first page when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(0);
    }
  }, [isOpen]);
  
  if (!isOpen) return null;

  const hasNext = onNext !== undefined;
  const hasPrevious = onPrevious !== undefined;
  const isLastPage = currentPage === 1; // Last page in this modal
  const isLast = isLastPage && !hasNext;
  
  const handleNext = () => {
    if (currentPage === 0) {
      // Move to In-Session Mode page
      setCurrentPage(1);
    } else if (hasNext) {
      // Move to next announcement if available
      onNext?.();
    } else {
      // Close if no more announcements
      onClose();
    }
  };
  
  const handlePrevious = () => {
    if (currentPage === 1) {
      // Go back to Chapter 2 Update page
      setCurrentPage(0);
    } else if (hasPrevious) {
      // Go to previous announcement
      onPrevious?.();
    }
  };
  
  const handleClose = () => {
    setCurrentPage(0); // Reset to first page when closing
    onClose();
  };

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInUp {
            from {
              opacity: 0;
              transform: translateY(30px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          animation: 'fadeIn 0.3s ease-out',
          padding: '1rem'
        }}
        onClick={handleClose}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '100%',
            color: 'white',
            boxShadow: '0 20px 60px rgba(102, 126, 234, 0.4)',
            animation: 'slideInUp 0.4s ease-out',
            textAlign: 'center'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {currentPage === 0 ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
              <h2 style={{ 
                margin: 0, 
                fontSize: '1.75rem', 
                fontWeight: 'bold',
                marginBottom: '1.5rem'
              }}>
                Chapter 2 Update
              </h2>
              
              {/* Preview Image */}
              <div style={{
                marginBottom: '1.5rem',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}>
                <img 
                  src="/images/Ch2-1 _ Preview_Timu Island.png" 
                  alt="Timu Island Preview"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block'
                  }}
                />
              </div>
              
              <div style={{
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                textAlign: 'left'
              }}>
                <p style={{ 
                  margin: 0, 
                  fontSize: '1rem', 
                  lineHeight: 1.6,
                  marginBottom: '1rem'
                }}>
                  <strong>Chapter 2 is now partially open.</strong>
                </p>
                <p style={{ 
                  margin: 0, 
                  fontSize: '0.95rem', 
                  lineHeight: 1.6,
                  opacity: 0.9
                }}>
                  You can complete the first half of Chapter 2. The rest is under construction.
                </p>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
              <h2 style={{ 
                margin: 0, 
                fontSize: '1.75rem', 
                fontWeight: 'bold',
                marginBottom: '1.5rem'
              }}>
                Coming Soon: In-Session Mode
              </h2>
              
              <div style={{
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                textAlign: 'left'
              }}>
                <p style={{ 
                  margin: 0, 
                  fontSize: '1rem', 
                  lineHeight: 1.6,
                  opacity: 0.9
                }}>
                  Fast real-time gameplay with your classmates. Stay tuned!
                </p>
              </div>
            </>
          )}

          {/* Navigation buttons */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            {/* Previous button */}
            {(hasPrevious || currentPage > 0) ? (
              <button
                onClick={handlePrevious}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ← Previous
              </button>
            ) : (
              <div style={{ width: '120px' }} />
            )}

            {/* Page indicator */}
            <div style={{
              fontSize: '0.85rem',
              opacity: 0.8,
              color: 'white'
            }}>
              {currentPage + 1} / 2{totalCount > 1 ? ` • ${currentIndex + 1} / ${totalCount}` : ''}
            </div>

            {/* Next/Close button */}
            <button
              onClick={isLast ? handleClose : handleNext}
              style={{
                width: hasPrevious ? 'auto' : '100%',
                background: isLast 
                  ? 'rgba(255, 255, 255, 0.2)' 
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: isLast ? '2px solid rgba(255, 255, 255, 0.3)' : 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '0.95rem',
                fontWeight: isLast ? '500' : 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: isLast ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (isLast) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                } else {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (isLast) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                } else {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                }
              }}
            >
              {isLast ? 'Close' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Chapter2AnnouncementModal;

