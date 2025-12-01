import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface Season0IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Season0IntroModal: React.FC<Season0IntroModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "Welcome to MST: Season 0!",
      content: "We're leveling up to help YOU level up. Check out what's new.",
      icon: "🎉"
    },
    {
      title: "New Battle Pass",
      content: "Check out the new Battle pass. It may not be much now, but it will be expanding more and more each season.",
      icon: "🎁"
    },
    {
      title: "Practice Mode Challenges",
      content: "The Practice Mode has some new challenges. Check them out and see how powerful you truly are.",
      icon: "⚔️"
    },
    {
      title: "Battle Mode Changes",
      content: "The Battle Mode has changed. Instead of all of your PP being your health, now your health is 10% of your total PP. Meaning, you can only lose 10% of your PP at a time.",
      icon: "🛡️"
    },
    {
      title: "Coming Soon",
      content: "Artifacts, Multiplayer Mode and More",
      icon: "🚀"
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleClose = async () => {
    // Mark as seen in Firestore - this ensures it never shows again
    if (currentUser) {
      try {
        const userRef = doc(db, 'students', currentUser.uid);
        await setDoc(userRef, {
          season0IntroSeen: true,
          season0IntroSeenAt: serverTimestamp()
        }, { merge: true });
        console.log('Season 0 intro marked as seen for user:', currentUser.uid);
      } catch (error) {
        console.error('Error marking intro as seen:', error);
        // Even if there's an error, close the modal to prevent it from blocking the UI
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  const currentSlideData = slides[currentSlide];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10001,
      padding: '2rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        borderRadius: '1.5rem',
        padding: '3rem',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        border: '2px solid rgba(139, 92, 246, 0.5)',
        position: 'relative',
        textAlign: 'center'
      }}>
        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: '#fca5a5',
            cursor: 'pointer',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>

        {/* Slide Content */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            fontSize: '5rem',
            marginBottom: '1.5rem'
          }}>
            {currentSlideData.icon}
          </div>
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {currentSlideData.title}
          </h2>
          <p style={{
            fontSize: '1.25rem',
            lineHeight: '1.8',
            color: '#cbd5e1',
            marginBottom: '2rem'
          }}>
            {currentSlideData.content}
          </p>
        </div>

        {/* Slide Indicators */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '2rem'
        }}>
          {slides.map((_, index) => (
            <div
              key={index}
              style={{
                width: currentSlide === index ? '30px' : '10px',
                height: '10px',
                borderRadius: '5px',
                background: currentSlide === index 
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
                  : 'rgba(139, 92, 246, 0.3)',
                transition: 'all 0.3s'
              }}
            />
          ))}
        </div>

        {/* Navigation Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <button
            onClick={handlePrevious}
            disabled={currentSlide === 0}
            style={{
              flex: 1,
              padding: '1rem 2rem',
              background: currentSlide === 0
                ? 'rgba(100, 100, 100, 0.3)'
                : 'rgba(139, 92, 246, 0.3)',
              border: `1px solid ${currentSlide === 0 ? 'rgba(100, 100, 100, 0.5)' : 'rgba(139, 92, 246, 0.5)'}`,
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: currentSlide === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: currentSlide === 0 ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (currentSlide > 0) {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentSlide > 0) {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
              }
            }}
          >
            ← Previous
          </button>
          <button
            onClick={handleNext}
            style={{
              flex: 1,
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              border: 'none',
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s',
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
            {currentSlide === slides.length - 1 ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Season0IntroModal;

