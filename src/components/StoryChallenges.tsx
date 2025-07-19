import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, onSnapshot, query, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { CHAPTERS } from '../types/chapters';
import ModelPreview from './ModelPreview';

interface ChallengeData {
  completed?: boolean;
  file?: string;
}

interface GoogleClassroomAssignment {
  id: string;
  title: string;
  description?: string;
  dueDate?: {
    year: number;
    month: number;
    day: number;
  };
  courseId: string;
  courseName?: string;
}

const StoryChallenges = () => {
  const { currentUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ [challenge: string]: File | null }>({});
  const [chapterClassroomAssignments, setChapterClassroomAssignments] = useState<{ [challengeId: string]: GoogleClassroomAssignment }>({});

  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserProgress(doc.data());
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const fetchChapterClassroomAssignments = async () => {
      try {
        const mappingsQuery = query(collection(db, 'chapterClassroomMap'));
        const mappingsSnapshot = await getDocs(mappingsQuery);
        const assignments: { [challengeId: string]: GoogleClassroomAssignment } = {};
        
        for (const mappingDoc of mappingsSnapshot.docs) {
          const mappingData = mappingDoc.data();
          const challengeId = mappingData.challengeId;
          const assignmentId = mappingDoc.id;
          
          assignments[challengeId] = {
            id: assignmentId,
            title: mappingData.title || 'Google Classroom Assignment',
            description: mappingData.description || '',
            dueDate: mappingData.dueDate,
            courseId: mappingData.courseId,
            courseName: mappingData.courseName || ''
          };
        }
        
        setChapterClassroomAssignments(assignments);
      } catch (error) {
        console.error('Error fetching chapter classroom assignments:', error);
      }
    };

    if (currentUser) {
      fetchChapterClassroomAssignments();
    }
  }, [currentUser]);

  const handleFileSelect = (challengeName: string, file: File | null) => {
    setSelectedFiles(prev => ({ ...prev, [challengeName]: file }));
  };

  const handleFileUpload = async (challengeName: string) => {
    if (!currentUser || !selectedFiles[challengeName]) return;

    try {
      const file = selectedFiles[challengeName];
      if (!file) return; // Additional null check
      
      const storageRef = ref(storage, `manifestation_submissions/${currentUser.uid}/${challengeName}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Update user progress
      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      const currentChapter = getCurrentChapter();
      
      if (currentChapter) {
        const updatedChapters = {
          ...currentData.chapters,
          [currentChapter.id]: {
            ...currentData.chapters?.[currentChapter.id],
            challenges: {
              ...currentData.chapters?.[currentChapter.id]?.challenges,
              [challengeName]: {
                isCompleted: true,
                file: downloadURL,
                completedAt: serverTimestamp()
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });

        // Add to challenge submissions
        await addDoc(collection(db, 'challengeSubmissions'), {
          userId: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          challengeId: challengeName,
          challengeName: challengeName,
          fileUrl: downloadURL,
          timestamp: serverTimestamp(),
          status: 'pending',
          xpReward: 15,
          ppReward: 8,
          manifestationType: 'Chapter Challenge',
          character: 'Chapter System'
        });
      }

      setSelectedFiles(prev => ({ ...prev, [challengeName]: null }));
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload manifestation. Please try again.');
    }
  };

  const handleRemoveSubmission = async (challengeName: string) => {
    if (!currentUser) return;

    try {
      const storageRef = ref(storage, `manifestation_submissions/${currentUser.uid}/${challengeName}`);
      await deleteObject(storageRef);
      
      // Update user progress
      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      const currentChapter = getCurrentChapter();
      
      if (currentChapter) {
        const updatedChapters = {
          ...currentData.chapters,
          [currentChapter.id]: {
            ...currentData.chapters?.[currentChapter.id],
            challenges: {
              ...currentData.chapters?.[currentChapter.id]?.challenges,
              [challengeName]: {
                isCompleted: false,
                file: null
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });
      }
    } catch (error) {
      console.error('Error removing submission:', error);
      alert('Failed to remove manifestation. Please try again.');
    }
  };

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

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      padding: '1.5rem', 
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '0.5rem', 
          color: '#1f2937'
        }}>
          📖 Story Challenges
        </h2>
        
        {/* Chapter Progress Card */}
        {(() => {
          const currentChapter = getCurrentChapter();
          const completedChapters = getCompletedChapters();
          const totalChapters = CHAPTERS.length;
          
          return currentChapter ? (
            <div style={{ 
              padding: '1rem', 
              backgroundColor: '#f0fdf4', 
              border: '1px solid #22c55e',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ 
                  width: '20px', 
                  height: '20px', 
                  backgroundColor: '#22c55e', 
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  ✓
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    marginBottom: '0.5rem',
                    color: '#22c55e'
                  }}>
                    Chapter {currentChapter.id}: {currentChapter.title}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280', 
                    marginBottom: '0.5rem',
                    fontStyle: 'italic'
                  }}>
                    {currentChapter.subtitle}
                  </p>
                  <div style={{ 
                    padding: '0.5rem', 
                    backgroundColor: '#f3f4f6', 
                    borderRadius: '0.25rem',
                    fontSize: '0.8rem',
                    marginBottom: '0.5rem',
                    color: '#374151'
                  }}>
                    <strong>Story:</strong> {currentChapter.description}
                  </div>
                  
                  {/* Progress Bar */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '0.75rem', 
                      color: '#6b7280',
                      marginBottom: '0.25rem'
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
                        backgroundColor: '#22c55e',
                        borderRadius: '9999px',
                        height: '100%',
                        transition: 'width 0.3s ease',
                        width: `${getChapterProgress(currentChapter.id)}%`
                      }}></div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    fontSize: '0.75rem',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      backgroundColor: '#22c55e', 
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      Active
                    </span>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      backgroundColor: '#f59e0b', 
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      {completedChapters}/{totalChapters} Chapters
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: '1rem', 
              backgroundColor: '#fef3c7', 
              border: '1px solid #f59e0b',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              textAlign: 'center'
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
            </div>
          );
        })()}
      </div>

      {/* Chapter Challenges Section */}
      {(() => {
        const currentChapter = getCurrentChapter();
        if (!currentChapter) return null;
        
        return (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: 'bold', 
              marginBottom: '1rem',
              color: '#1f2937',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '0.5rem',
              backgroundColor: '#f8fafc',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}>
              📖 Chapter {currentChapter.id} Challenges
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {currentChapter.challenges.map((challenge) => {
                const challengeData = userProgress?.chapters?.[currentChapter.id]?.challenges?.[challenge.id] || {};
                const isCompleted = challengeData.isCompleted;
                const hasFile = !!challengeData.file;
                const classroomAssignment = chapterClassroomAssignments[challenge.id];
                
                return (
                  <div key={challenge.id} style={{ 
                    padding: '1rem', 
                    backgroundColor: isCompleted ? '#f0fdf4' : '#f9fafb',
                    border: isCompleted ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    transition: 'all 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: isCompleted ? '#22c55e' : '#e5e7eb', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {isCompleted ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ 
                          fontSize: '1.125rem', 
                          fontWeight: 'bold', 
                          marginBottom: '0.5rem',
                          color: isCompleted ? '#22c55e' : '#1f2937'
                        }}>
                          {challenge.title}
                        </h3>
                        <p style={{ 
                          fontSize: '0.875rem', 
                          color: '#6b7280', 
                          marginBottom: '0.5rem',
                          fontStyle: 'italic'
                        }}>
                          {challenge.description}
                        </p>
                        
                        {/* Google Classroom Assignment Information */}
                        {classroomAssignment && (
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: '#dbeafe', 
                            border: '1px solid #3b82f6',
                            borderRadius: '0.25rem',
                            fontSize: '0.8rem',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem', 
                              marginBottom: '0.25rem',
                              color: '#1e40af',
                              fontWeight: 'bold'
                            }}>
                              📚 Google Classroom Assignment
                            </div>
                            <div style={{ marginBottom: '0.25rem', color: '#1e40af' }}>
                              <strong>Title:</strong> {classroomAssignment.title}
                            </div>
                            {classroomAssignment.description && (
                              <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', color: '#1e40af' }}>
                                {classroomAssignment.description}
                              </div>
                            )}
                            {classroomAssignment.courseName && (
                              <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', color: '#1e40af' }}>
                                <strong>Course:</strong> {classroomAssignment.courseName}
                              </div>
                            )}
                            {classroomAssignment.dueDate && (
                              <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                                <strong>Due:</strong> {classroomAssignment.dueDate?.month}/{classroomAssignment.dueDate?.day}/{classroomAssignment.dueDate?.year}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Rewards */}
                        {challenge.rewards.length > 0 && (
                          <div style={{ 
                            display: 'flex', 
                            gap: '0.5rem', 
                            fontSize: '0.75rem',
                            marginBottom: '0.5rem',
                            flexWrap: 'wrap'
                          }}>
                            {challenge.rewards.map((reward, index) => {
                              let bgColor = '#fbbf24';
                              let textColor = 'black';
                              
                              // Color coding for different reward types
                              if (reward.type === 'xp') {
                                bgColor = '#fbbf24';
                                textColor = 'black';
                              } else if (reward.type === 'pp') {
                                bgColor = '#a78bfa';
                                textColor = 'white';
                              } else if (reward.type === 'level') {
                                bgColor = '#8b5cf6';
                                textColor = 'white';
                              } else if (reward.type === 'artifact') {
                                bgColor = '#34d399';
                                textColor = 'white';
                              } else if (reward.type === 'manifest') {
                                bgColor = '#f59e0b';
                                textColor = 'white';
                              } else if (reward.type === 'reflection') {
                                bgColor = '#06b6d4';
                                textColor = 'white';
                              } else if (reward.type === 'wisdom') {
                                bgColor = '#10b981';
                                textColor = 'white';
                              } else if (reward.type === 'blessing') {
                                bgColor = '#ec4899';
                                textColor = 'white';
                              } else if (reward.type === 'ability') {
                                bgColor = '#6366f1';
                                textColor = 'white';
                              } else if (reward.type === 'title') {
                                bgColor = '#84cc16';
                                textColor = 'white';
                              } else if (reward.type === 'team') {
                                bgColor = '#f97316';
                                textColor = 'white';
                              } else if (reward.type === 'rival') {
                                bgColor = '#dc2626';
                                textColor = 'white';
                              } else if (reward.type === 'veil') {
                                bgColor = '#7c3aed';
                                textColor = 'white';
                              } else if (reward.type === 'leadership') {
                                bgColor = '#059669';
                                textColor = 'white';
                              } else if (reward.type === 'ethics') {
                                bgColor = '#be185d';
                                textColor = 'white';
                              } else if (reward.type === 'ninth') {
                                bgColor = '#1e40af';
                                textColor = 'white';
                              }
                              
                              return (
                                <span key={index} style={{ 
                                  padding: '0.25rem 0.5rem', 
                                  background: bgColor,
                                  color: textColor,
                                  borderRadius: '0.25rem',
                                  fontWeight: 'bold'
                                }}>
                                  +{reward.value} {reward.type.toUpperCase()}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {!isCompleted && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          type="file"
                          accept=".stl,.obj,.jpg,.jpeg,.png,.pdf"
                          style={{ 
                            padding: '0.5rem',
                            background: 'white',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            color: '#374151',
                            fontSize: '0.875rem'
                          }}
                          onChange={e => {
                            handleFileSelect(challenge.id, e.target.files && e.target.files[0] ? e.target.files[0] : null);
                          }}
                        />
                        {selectedFiles[challenge.id] ? (
                          <ModelPreview file={selectedFiles[challenge.id] as File} />
                        ) : null}
                        <button
                          type="button"
                          style={{ 
                            padding: '0.5rem 1rem', 
                            background: selectedFiles[challenge.id] ? '#22c55e' : '#6b7280', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '0.25rem', 
                            cursor: selectedFiles[challenge.id] ? 'pointer' : 'not-allowed',
                            opacity: selectedFiles[challenge.id] ? 1 : 0.5,
                            fontWeight: 'bold',
                            fontSize: '0.875rem'
                          }}
                          disabled={!selectedFiles[challenge.id]}
                          onClick={() => handleFileUpload(challenge.id)}
                        >
                          Submit
                        </button>
                      </div>
                    )}

                    {hasFile && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginTop: '0.5rem',
                        flexWrap: 'wrap'
                      }}>
                        <a
                          href={challengeData.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ 
                            color: '#60a5fa', 
                            fontSize: '0.875rem',
                            textDecoration: 'none',
                            padding: '0.25rem 0.5rem',
                            background: 'rgba(96, 165, 250, 0.2)',
                            borderRadius: '0.25rem',
                            fontWeight: 'bold'
                          }}
                        >
                          View Manifestation
                        </a>
                        <button
                          type="button"
                          style={{ 
                            padding: '0.25rem 0.5rem', 
                            background: '#dc2626', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '0.25rem', 
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
                          }}
                          onClick={() => handleRemoveSubmission(challenge.id)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Progress Message */}
      {(() => {
        const currentChapter = getCurrentChapter();
        if (!currentChapter || currentChapter.id >= 9) return null;
        
        return (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            background: 'rgba(251, 191, 36, 0.2)', 
            borderRadius: '0.5rem',
            border: '1px solid rgba(251, 191, 36, 0.5)',
            textAlign: 'center'
          }}>
            <p style={{ fontWeight: 'bold', color: '#fbbf24' }}>
              Complete all manifestations in Chapter {currentChapter.id} to unlock the next chapter of your story!
            </p>
          </div>
        );
      })()}
    </div>
  );
};

export default StoryChallenges; 