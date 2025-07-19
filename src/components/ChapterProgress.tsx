import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { CHAPTERS } from '../types/chapters';

const ChapterProgress: React.FC = () => {
  const { currentUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserProgress(doc.data());
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const getCurrentChapter = () => {
    if (!userProgress?.chapters) return null;
    
    return CHAPTERS.find(chapter => 
      userProgress.chapters[chapter.id]?.isActive
    );
  };

  const getChapterProgress = (chapterId: number) => {
    if (!userProgress?.chapters?.[chapterId]) return 0;
    
    const chapter = CHAPTERS.find(c => c.id === chapterId);
    if (!chapter) return 0;
    
    const chapterProgress = userProgress.chapters[chapterId];
    const completedChallenges = chapter.challenges.filter(challenge => 
      chapterProgress.challenges?.[challenge.id]?.isCompleted
    ).length;
    
    return (completedChallenges / chapter.challenges.length) * 100;
  };

  const getCompletedChapters = () => {
    if (!userProgress?.chapters) return 0;
    
    return Object.values(userProgress.chapters).filter((chapter: any) => 
      chapter.isCompleted
    ).length;
  };

  if (loading) {
    return (
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '0.75rem', 
        padding: '1.5rem', 
        marginBottom: '1.5rem', 
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ 
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        }}>
          <div style={{ 
            height: '1rem', 
            backgroundColor: '#e5e7eb', 
            borderRadius: '0.25rem', 
            width: '33%', 
            marginBottom: '1rem' 
          }}></div>
          <div style={{ 
            height: '0.75rem', 
            backgroundColor: '#e5e7eb', 
            borderRadius: '0.25rem', 
            width: '50%', 
            marginBottom: '0.5rem' 
          }}></div>
          <div style={{ 
            height: '0.5rem', 
            backgroundColor: '#e5e7eb', 
            borderRadius: '0.25rem', 
            width: '100%', 
            marginBottom: '1rem' 
          }}></div>
          <div style={{ 
            height: '2rem', 
            backgroundColor: '#e5e7eb', 
            borderRadius: '0.25rem', 
            width: '25%' 
          }}></div>
        </div>
      </div>
    );
  }

  const currentChapter = getCurrentChapter();
  const completedChapters = getCompletedChapters();
  const totalChapters = CHAPTERS.length;

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      padding: '1.5rem', 
      marginBottom: '1.5rem', 
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '0.5rem', 
          color: '#1f2937',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>🏛️ Xiotein School - Hero's Journey</span>
          <Link 
            to="/chapters" 
            style={{
              fontSize: '0.875rem',
              color: '#3b82f6',
              textDecoration: 'none',
              fontWeight: '500'
            }}
          >
            View All Chapters →
          </Link>
        </h2>
      </div>

      {/* Chapter Progress Display */}
      {currentChapter ? (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '0.5rem'
          }}>
            <div>
              <h3 style={{ 
                fontSize: '1rem', 
                fontWeight: '600', 
                color: '#1f2937',
                marginBottom: '0.25rem'
              }}>
                Chapter {currentChapter.id}: {currentChapter.title}
              </h3>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280',
                fontStyle: 'italic'
              }}>
                {currentChapter.subtitle}
              </p>
            </div>
            <div style={{
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              Active
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '0.875rem', 
              color: '#6b7280',
              marginBottom: '0.5rem'
            }}>
              <span>Chapter Progress</span>
              <span>{Math.round(getChapterProgress(currentChapter.id))}%</span>
            </div>
            <div style={{
              width: '100%',
              backgroundColor: '#e5e7eb',
              borderRadius: '9999px',
              height: '0.5rem'
            }}>
              <div style={{
                backgroundColor: '#3b82f6',
                borderRadius: '9999px',
                height: '100%',
                transition: 'width 0.3s ease',
                width: `${getChapterProgress(currentChapter.id)}%`
              }}></div>
            </div>
          </div>

          {/* Chapter Description */}
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#4b5563',
            marginBottom: '1rem',
            lineHeight: '1.5'
          }}>
            {currentChapter.description}
          </p>

          {/* Action Button */}
          <Link 
            to="/chapters" 
            style={{
              display: 'inline-block',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            Continue Journey
          </Link>
        </div>
      ) : (
        <div style={{ 
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem',
          padding: '1rem',
          textAlign: 'center',
          marginBottom: '1rem'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: '0.5rem'
          }}>
            <span style={{ marginRight: '0.5rem' }}>🚀</span>
            <p style={{ 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              color: '#92400e'
            }}>
              Ready to Begin Your Journey
            </p>
          </div>
          <p style={{ 
            fontSize: '0.75rem', 
            color: '#a16207',
            marginBottom: '0.75rem'
          }}>
            Choose your manifest to unlock Chapter 1
          </p>
          <Link 
            to="/chapters" 
            style={{
              display: 'inline-block',
              backgroundColor: '#f59e0b',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              textDecoration: 'none',
              fontSize: '0.75rem',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d97706'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f59e0b'}
          >
            Start Your Journey
          </Link>
        </div>
      )}

      {/* Overall Progress Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        gap: '1rem',
        marginTop: '1rem'
      }}>
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          textAlign: 'center',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold', 
            color: '#1f2937'
          }}>
            {completedChapters}
          </div>
          <div style={{ 
            fontSize: '0.75rem', 
            color: '#6b7280'
          }}>
            Completed
          </div>
        </div>
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          textAlign: 'center',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold', 
            color: '#1f2937'
          }}>
            {totalChapters - completedChapters}
          </div>
          <div style={{ 
            fontSize: '0.75rem', 
            color: '#6b7280'
          }}>
            Remaining
          </div>
        </div>
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          textAlign: 'center',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold', 
            color: '#1f2937'
          }}>
            {Math.round((completedChapters / totalChapters) * 100)}%
          </div>
          <div style={{ 
            fontSize: '0.75rem', 
            color: '#6b7280'
          }}>
            Overall
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChapterProgress; 