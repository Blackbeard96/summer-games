import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { CHAPTERS, Chapter } from '../types/chapters';
import { detectManifest, logManifestDetection } from '../utils/manifestDetection';

interface ChapterTrackerProps {
  onChapterSelect?: (chapter: Chapter) => void;
}

const ChapterTracker: React.FC<ChapterTrackerProps> = ({ onChapterSelect }) => {
  const { currentUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      try {
        // Fetch user progress from 'users' collection
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('ChapterTracker: User progress data loaded:', userData);
          console.log('ChapterTracker: Chapters data:', userData.chapters);
          setUserProgress(userData);
        }

        // Fetch student data from 'students' collection (for manifest, etc.)
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          console.log('ChapterTracker: Student data loaded:', studentData);
          setStudentData(studentData);
        }
      } catch (error) {
        console.error('ChapterTracker: Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, refreshKey]);

  const getRequirementStatus = (requirement: any) => {
    console.log('ChapterTracker: Checking requirement:', requirement.type, {
      studentData,
      userProgress,
      requirement
    });
    
    switch (requirement.type) {
      case 'level':
        // Check if user has reached the required level
        const userLevel = studentData?.level || userProgress?.level || 1;
        const requiredLevel = requirement.value || 1;
        console.log(`ChapterTracker: Level check - user: ${userLevel}, required: ${requiredLevel}`);
        return userLevel >= requiredLevel;
      case 'manifest':
        // Use standardized manifest detection utility
        const manifestData = { studentData, userProgress };
        const hasManifest = detectManifest(manifestData);
        logManifestDetection(manifestData, 'ChapterTracker');
        return hasManifest;
      case 'artifact':
        return userProgress?.artifact?.identified;
      case 'team':
        return userProgress?.team;
      case 'rival':
        return userProgress?.rival;
      case 'veil':
        return userProgress?.veil?.isConfronted;
      case 'reflection':
        return userProgress?.reflectionEcho;
      case 'wisdom':
        return userProgress?.wisdomPoints && userProgress.wisdomPoints.length > 0;
      case 'ethics':
        return userProgress?.ethics && userProgress.ethics.length >= requirement.value;
      case 'leadership':
        return userProgress?.leadership?.role;
      case 'profile':
        return studentData?.displayName && studentData?.photoURL;
      case 'previousChapter':
        // Check if previous chapter is completed
        const prevChapterId = requirement.value;
        const prevChapterProgress = userProgress?.chapters?.[prevChapterId];
        return prevChapterProgress?.isCompleted || false;
      default:
        console.warn(`ChapterTracker: Unknown requirement type: ${requirement.type}`);
        return false;
    }
  };

  const getChapterStatus = (chapter: Chapter) => {
    if (!userProgress) return 'locked';
    
    const chapterProgress = userProgress.chapters?.[chapter.id];
    if (chapterProgress?.isCompleted) return 'completed';
    if (chapterProgress?.isActive) return 'active';
    
    // Check if chapter requirements are met
    const requirementsMet = chapter.requirements.every(req => {
      const requirementStatus = getRequirementStatus(req);
      console.log(`ChapterTracker: Chapter ${chapter.id} requirement ${req.type}:`, requirementStatus);
      return requirementStatus;
    });
    
    console.log(`ChapterTracker: Chapter ${chapter.id} requirements met:`, requirementsMet);
    
    return requirementsMet ? 'available' : 'locked';
  };

  const getChapterProgress = (chapter: Chapter) => {
    if (!userProgress) return 0;
    
    const chapterProgress = userProgress.chapters?.[chapter.id];
    if (!chapterProgress) return 0;
    
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

  const handleChapterClick = async (chapter: Chapter) => {
    if (getChapterStatus(chapter) === 'locked') return;
    
    if (onChapterSelect) {
      onChapterSelect(chapter);
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setLoading(true);
    console.log('Manual refresh triggered');
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'active': return 'Active';
      case 'available': return 'Available';
      case 'locked': return 'Locked';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-xl p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Loading Your Journey</h3>
          <p className="text-gray-500 text-center">Preparing your epic quest through the Nine Knowings Universe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl p-16 mx-12 my-16 max-w-5xl mx-auto">
      {/* Player's Journey Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 mb-6 rounded-lg text-center font-bold">
      </div>
      
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full mb-6">
          <span className="text-2xl">🏛️</span>
        </div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
          The Player's Journey
        </h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Embark on your epic quest through the Nine Knowings Universe. Each chapter reveals new mysteries, challenges, and opportunities for growth.
        </p>
        <div className="mt-4 flex gap-2 justify-center">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh Progress
          </button>
          <button
            onClick={async () => {
              if (!currentUser) {
                alert('No current user found');
                return;
              }
              if (!window.confirm('Reset your chapter progress? This will clear all completions.')) {
                return;
              }
              try {
                console.log('Resetting progress for user:', currentUser.uid);
                await updateDoc(doc(db, 'users', currentUser.uid), {
                  chapters: {},
                  storyChapter: 1,
                  resetAt: new Date(),
                  resetBy: 'self'
                });
                console.log('Progress reset successfully');
                alert('Progress reset! Click Refresh to see changes.');
              } catch (error) {
                console.error('Error resetting progress:', error);
                alert('Failed to reset progress');
              }
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            🗑️ Reset My Progress
          </button>
        </div>
      </div>

      {/* Progress Summary Cards - Inline Styles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #c7d2fe 100%)', padding: '1rem', borderRadius: '12px', border: '1px solid #93c5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#2563eb', fontWeight: '500' }}>Total Chapters</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>{CHAPTERS.length}</p>
            </div>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '1.125rem' }}>📖</span>
            </div>
          </div>
        </div>
        
        <div style={{ background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)', padding: '1rem', borderRadius: '12px', border: '1px solid #c084fc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#7c3aed', fontWeight: '500' }}>Story Episodes</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6d28d9' }}>Integrated</p>
            </div>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#8b5cf6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '1.125rem' }}>🎭</span>
            </div>
          </div>
        </div>
        
        <div style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', padding: '1rem', borderRadius: '12px', border: '1px solid #6ee7b7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#059669', fontWeight: '500' }}>Completed</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#047857' }}>{getCompletedChapters()}</p>
            </div>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '1.125rem' }}>✓</span>
            </div>
          </div>
        </div>
        
        <div style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', padding: '1rem', borderRadius: '12px', border: '1px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#d97706', fontWeight: '500' }}>Available</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#b45309' }}>
                {CHAPTERS.filter(ch => getChapterStatus(ch) === 'available').length}
              </p>
            </div>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#f59e0b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '1.125rem' }}>🔓</span>
            </div>
          </div>
        </div>
        
        <div style={{ background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)', padding: '1rem', borderRadius: '12px', border: '1px solid #c084fc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#7c3aed', fontWeight: '500' }}>Progress</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6d28d9' }}>
                {Math.round((getCompletedChapters() / CHAPTERS.length) * 100)}%
              </p>
            </div>
            <div style={{ width: '40px', height: '40px', backgroundColor: '#8b5cf6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '1.125rem' }}>📊</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chapter Cards Grid */}
      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <span className="mr-2">📚</span>
          Your Journey Chapters
        </h3>
      </div>
      

      
      {/* Chapter Cards - Inline Styles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
        {CHAPTERS.map((chapter, index) => {
          const status = getChapterStatus(chapter);
          const progress = getChapterProgress(chapter);
          
          // Determine card styling based on status
          let cardStyle = {};
          let badgeStyle = {};
          
          if (status === 'locked') {
            cardStyle = {
              background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
              border: '2px solid #e5e7eb',
              opacity: 0.6,
              cursor: 'not-allowed'
            };
            badgeStyle = {
              background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
            };
          } else if (status === 'active') {
            cardStyle = {
              background: 'linear-gradient(135deg, #dbeafe 0%, #c7d2fe 100%)',
              border: '2px solid #60a5fa',
              boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.1)',
              cursor: 'pointer'
            };
            badgeStyle = {
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
            };
          } else if (status === 'completed') {
            cardStyle = {
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
              border: '2px solid #34d399',
              boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1)',
              cursor: 'pointer'
            };
            badgeStyle = {
              background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)'
            };
          } else {
            cardStyle = {
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px solid #f59e0b',
              boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.1)',
              cursor: 'pointer'
            };
            badgeStyle = {
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
            };
          }
          
          return (
            <div
              key={chapter.id}
              style={{
                position: 'relative',
                padding: '1.5rem',
                borderRadius: '12px',
                transition: 'all 0.3s ease',
                transform: 'scale(1)',
                ...cardStyle
              }}
              onClick={() => handleChapterClick(chapter)}
            >
              {/* Chapter Number Badge */}
              <div style={{
                position: 'absolute',
                top: '-16px',
                left: '-16px',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                color: 'white',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                ...badgeStyle
              }}>
                {chapter.id}
              </div>

              {/* Status Badge */}
              <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  backgroundColor: status === 'completed' ? '#dcfce7' : 
                                status === 'active' ? '#dbeafe' : 
                                status === 'available' ? '#fef3c7' : '#f3f4f6',
                  color: status === 'completed' ? '#166534' : 
                        status === 'active' ? '#1e40af' : 
                        status === 'available' ? '#92400e' : '#374151',
                  border: `1px solid ${status === 'completed' ? '#86efac' : 
                                    status === 'active' ? '#93c5fd' : 
                                    status === 'available' ? '#fde047' : '#d1d5db'}`
                }}>
                  {getStatusText(status)}
                </span>
              </div>

              {/* Story Mode Badge for Chapters with Integrated Story Content */}
              {(chapter.id >= 1 && chapter.id <= 9) && (
                <div style={{ position: 'absolute', top: '16px', right: '120px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.625rem',
                    fontWeight: '600',
                    backgroundColor: '#f3e8ff',
                    color: '#7c3aed',
                    border: '1px solid #c084fc'
                  }}>
                    📖 Story
                  </span>
                </div>
              )}

              <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Chapter Header */}
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    color: '#1f2937', 
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {chapter.title}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280', 
                    fontStyle: 'italic', 
                    fontWeight: '500' 
                  }}>
                    {chapter.subtitle}
                  </p>
                </div>

                {/* Description */}
                <p style={{ 
                  color: '#374151', 
                  marginBottom: '1rem', 
                  lineHeight: '1.6', 
                  fontSize: '0.875rem',
                  flex: 1,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {chapter.description}
                </p>

                {/* Progress Bar */}
                {status !== 'locked' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#6b7280', 
                      marginBottom: '8px' 
                    }}>
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div style={{
                      width: '100%',
                      backgroundColor: '#e5e7eb',
                      borderRadius: '9999px',
                      height: '8px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        borderRadius: '9999px',
                        transition: 'width 0.5s ease-out',
                        width: `${progress}%`,
                        background: status === 'completed' ? 'linear-gradient(90deg, #10b981 0%, #047857 100%)' :
                                  status === 'active' ? 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)' :
                                  'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                      }}></div>
                    </div>
                  </div>
                )}

                {/* Requirements */}
                {status === 'locked' && (
                  <div style={{ 
                    marginBottom: '1rem', 
                    padding: '12px', 
                    backgroundColor: '#fef2f2', 
                    borderRadius: '8px', 
                    border: '1px solid #fecaca' 
                  }}>
                    <h4 style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '600', 
                      color: '#991b1b', 
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <span style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: '#ef4444', 
                        borderRadius: '50%', 
                        marginRight: '8px' 
                      }}></span>
                      Requirements
                    </h4>
                    <ul style={{ fontSize: '0.75rem', color: '#991b1b' }}>
                      {chapter.requirements.slice(0, 2).map((req, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <span style={{ 
                            width: '6px', 
                            height: '6px', 
                            backgroundColor: '#f87171', 
                            borderRadius: '50%', 
                            marginRight: '8px', 
                            marginTop: '6px',
                            flexShrink: 0
                          }}></span>
                          <span style={{ 
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {req.description}
                          </span>
                        </li>
                      ))}
                      {chapter.requirements.length > 2 && (
                        <li style={{ fontSize: '0.75rem', color: '#dc2626', fontStyle: 'italic' }}>
                          +{chapter.requirements.length - 2} more requirements
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Rewards */}
                {status !== 'locked' && (
                  <div style={{ 
                    marginBottom: '1rem', 
                    padding: '12px', 
                    backgroundColor: '#f0fdf4', 
                    borderRadius: '8px', 
                    border: '1px solid #bbf7d0' 
                  }}>
                    <h4 style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '600', 
                      color: '#166534', 
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <span style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: '#22c55e', 
                        borderRadius: '50%', 
                        marginRight: '8px' 
                      }}></span>
                      Rewards
                    </h4>
                    <ul style={{ fontSize: '0.75rem', color: '#166534' }}>
                      {chapter.rewards.slice(0, 2).map((reward, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <span style={{ 
                            width: '6px', 
                            height: '6px', 
                            backgroundColor: '#4ade80', 
                            borderRadius: '50%', 
                            marginRight: '8px', 
                            marginTop: '6px',
                            flexShrink: 0
                          }}></span>
                          <span style={{ 
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {reward.description}
                          </span>
                        </li>
                      ))}
                      {chapter.rewards.length > 2 && (
                        <li style={{ fontSize: '0.75rem', color: '#16a34a', fontStyle: 'italic' }}>
                          +{chapter.rewards.length - 2} more rewards
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between' 
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      fontSize: '0.75rem', 
                      color: '#6b7280' 
                    }}>
                      <span style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: '#d1d5db', 
                        borderRadius: '50%', 
                        marginRight: '4px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                        <span style={{ fontSize: '0.75rem' }}>👥</span>
                      </span>
                      {chapter.teamSize} {chapter.teamSize === 1 ? 'player' : 'players'}
                    </div>
                    {status === 'active' && (
                      <button style={{
                        padding: '6px 12px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        border: 'none',
                        cursor: 'pointer'
                      }}>
                        Continue
                      </button>
                    )}
                    {status === 'completed' && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        fontSize: '0.75rem', 
                        color: '#16a34a' 
                      }}>
                        <span style={{ marginRight: '4px' }}>✓</span>
                        Completed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChapterTracker;