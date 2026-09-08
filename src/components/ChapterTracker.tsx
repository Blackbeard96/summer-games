import React, { useState, useEffect, useMemo } from 'react';
import { debug } from '../utils/debug';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { CHAPTERS, Chapter } from '../types/chapters';
import { calculateChapterProgress, getChapterProgress } from '../utils/journeyProgress';
import { mergeUserAndStudentForJourney } from '../utils/mergeChapterProgress';
import { detectManifest, logManifestDetection } from '../utils/manifestDetection';

interface ChapterTrackerProps {
  onChapterSelect?: (chapter: Chapter) => void;
}

const ChapterTracker: React.FC<ChapterTrackerProps> = ({ onChapterSelect }) => {
  const { currentUser, isAdmin: isAdminUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  /** Chapters + squad/rival/artifacts: students often hold progress users/{uid} lacks. */
  const mergedUserProgress = useMemo(
    () => mergeUserAndStudentForJourney(userProgress, studentData),
    [userProgress, studentData]
  );

  const journeyProgress = mergedUserProgress;

  // Helper to check for Firestore internal errors
  const isFirestoreInternalError = (error: any): boolean => {
    if (!error) return false;
    const errorString = String(error);
    const errorMessage = error?.message || '';
    const errorStack = error?.stack || '';
    return (
      errorString.includes('INTERNAL ASSERTION FAILED') ||
      errorMessage.includes('INTERNAL ASSERTION FAILED') ||
      errorStack.includes('INTERNAL ASSERTION FAILED') ||
      errorString.includes('ID: ca9') ||
      errorString.includes('ID: b815') ||
      (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
    );
  };

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      try {
        // Fetch user progress from 'users' collection
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          debug.group('ChapterTracker', 'Loading User Data');
          debug.log('ChapterTracker', 'User progress data loaded', userData);
          debug.log('ChapterTracker', 'Chapters data', userData.chapters);
          debug.groupEnd();
          setUserProgress(userData);
        }

        // Fetch student data from 'students' collection (for manifest, etc.)
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          debug.log('ChapterTracker', 'Student data loaded', studentData);
          setStudentData(studentData);
        }
      } catch (error) {
        // Suppress Firestore internal assertion errors
        if (isFirestoreInternalError(error)) {
          debug.warn('ChapterTracker', 'Firestore internal assertion error - ignoring');
          // Still set loading to false so UI doesn't hang
          setLoading(false);
          return;
        }
        debug.error('ChapterTracker', 'Error fetching data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, refreshKey]);

  const getRequirementStatus = (requirement: any) => {
    debug.throttle(
      `requirement-check-${requirement.type}`,
      1000,
      'ChapterTracker',
      `Checking requirement: ${requirement.type}`,
      { requirement }
    );
    
    switch (requirement.type) {
      case 'level':
        // Check if user has reached the required level
        const userLevel = studentData?.level || journeyProgress?.level || 1;
        const requiredLevel = requirement.value || 1;
        debug.log('ChapterTracker', `Level check - user: ${userLevel}, required: ${requiredLevel}`);
        return userLevel >= requiredLevel;
      case 'manifest':
        // Use standardized manifest detection utility
        const manifestData = { studentData, userProgress: journeyProgress };
        const hasManifest = detectManifest(manifestData);
        logManifestDetection(manifestData, 'ChapterTracker');
        return hasManifest;
      case 'artifact':
        return journeyProgress?.artifact?.identified;
      case 'team':
        return journeyProgress?.team;
      case 'rival':
        return journeyProgress?.rival;
      case 'veil':
        return journeyProgress?.veil?.isConfronted;
      case 'reflection':
        return journeyProgress?.reflectionEcho;
      case 'wisdom':
        return journeyProgress?.wisdomPoints && journeyProgress.wisdomPoints.length > 0;
      case 'ethics':
        return journeyProgress?.ethics && journeyProgress.ethics.length >= requirement.value;
      case 'leadership':
        return journeyProgress?.leadership?.role;
      case 'profile':
        return studentData?.displayName && studentData?.photoURL;
      case 'previousChapter':
        // Check if previous chapter is completed (Firestore may use string keys)
        const prevChapterId = requirement.value;
        const prevChapterProgress =
          journeyProgress?.chapters?.[String(prevChapterId)] ??
          journeyProgress?.chapters?.[prevChapterId];
        return prevChapterProgress?.isCompleted || false;
      default:
        debug.warn('ChapterTracker', `Unknown requirement type: ${requirement.type}`);
        return false;
    }
  };

  const getChapterStatus = (chapter: Chapter) => {
    if (!journeyProgress) {
      // Chapter 1 and 2 are always available, even without userProgress
      if (chapter.id === 1 || chapter.id === 2) return 'available';
      return 'locked';
    }
    
    // Chapter 1 and 2 are always available to all players - no requirements
    if (chapter.id === 1 || chapter.id === 2) {
      const chapterProgress = getChapterProgress(journeyProgress, chapter.id);
      if (chapterProgress?.isCompleted) return 'completed';
      if (chapterProgress?.isActive) return 'active';
      if (chapter.id === 2) {
        const ch2Pct = calculateChapterProgress(chapter, journeyProgress, studentData);
        if (ch2Pct > 0) return 'active';
        const ch1Prog = getChapterProgress(journeyProgress, 1);
        if (ch1Prog?.isCompleted === true) return 'active';
      }
      return 'available'; // Always available, even if not active yet
    }
    
    const chapterProgress = getChapterProgress(journeyProgress, chapter.id);
    if (chapterProgress?.isCompleted) return 'completed';
    if (chapterProgress?.isActive) return 'active';
    
    // Check if chapter requirements are met
    debug.groupCollapsed('ChapterTracker', `Chapter ${chapter.id} Requirements Check`);
    const requirementsMet = chapter.requirements.every(req => {
      const requirementStatus = getRequirementStatus(req);
      debug.log('ChapterTracker', `Requirement ${req.type}`, requirementStatus);
      return requirementStatus;
    });
    debug.log('ChapterTracker', `All requirements met`, requirementsMet);
    debug.groupEnd();
    
    return requirementsMet ? 'available' : 'locked';
  };

  const getChapterProgressPercent = (chapter: Chapter) => {
    if (!journeyProgress) return 0;
    return calculateChapterProgress(chapter, journeyProgress, studentData);
  };

  const getCompletedChapters = () => {
    if (!journeyProgress?.chapters) return 0;
    
    return Object.values(journeyProgress.chapters).filter((chapter: any) => 
      chapter.isCompleted
    ).length;
  };

  const handleChapterClick = async (chapter: Chapter) => {
    if (getChapterStatus(chapter) === 'locked') return;
    
    if (onChapterSelect) {
      onChapterSelect(chapter);
    }
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
      <div className="mst-journey-loading">
        <div className="mst-journey-loading-spinner" aria-hidden="true" />
        <h3 className="mst-journey-loading-title">Loading your Journey...</h3>
        <p className="mst-journey-loading-copy">Preparing your epic quest through the Nine Knowings Universe...</p>
      </div>
    );
  }

  return (
    <div className="mst-journey-page">
      <header className="mst-journey-hero">
        <div className="mst-journey-hero-main">
          <div className="mst-journey-compass" aria-hidden="true">◈</div>
          <h2 className="mst-journey-title">YOUR JOURNEY</h2>
          <p className="mst-journey-motto">DISCOVER. GROW. MASTER. LEAVE A LEGACY.</p>
          <p className="mst-journey-desc">
            Embark on your epic quest through the Nine Knowings Universe. Each chapter reveals new mysteries, challenges, and opportunities for growth.
          </p>
        </div>
        <div className="mst-journey-side-motto" aria-hidden="true">
          ONE UNIVERSE{'\n'}MANY PATHS{'\n'}ONE PURPOSE
        </div>
      </header>

      <div className="mst-journey-stats">
        <div className="mst-journey-stat mst-journey-stat--chapters">
          <div>
            <p className="mst-journey-stat-label">Total Chapters</p>
            <p className="mst-journey-stat-value">{CHAPTERS.length}</p>
          </div>
          <div className="mst-journey-stat-icon" aria-hidden="true">📖</div>
        </div>

        <div className="mst-journey-stat mst-journey-stat--story">
          <div>
            <p className="mst-journey-stat-label">Story Episodes</p>
            <p className="mst-journey-stat-value">Integrated</p>
          </div>
          <div className="mst-journey-stat-icon" aria-hidden="true">🎭</div>
        </div>

        <div className="mst-journey-stat mst-journey-stat--completed">
          <div>
            <p className="mst-journey-stat-label">Completed</p>
            <p className="mst-journey-stat-value">{getCompletedChapters()}</p>
          </div>
          <div className="mst-journey-stat-icon" aria-hidden="true">✓</div>
        </div>

        <div className="mst-journey-stat mst-journey-stat--available">
          <div>
            <p className="mst-journey-stat-label">Available</p>
            <p className="mst-journey-stat-value">
              {CHAPTERS.filter(ch => getChapterStatus(ch) === 'available').length}
            </p>
          </div>
          <div className="mst-journey-stat-icon" aria-hidden="true">🔓</div>
        </div>

        <div className="mst-journey-stat mst-journey-stat--progress">
          <div>
            <p className="mst-journey-stat-label">Progress</p>
            <p className="mst-journey-stat-value">
              {Math.round((getCompletedChapters() / CHAPTERS.length) * 100)}%
            </p>
          </div>
          <div className="mst-journey-stat-icon" aria-hidden="true">📊</div>
        </div>
      </div>

      <div className="mst-journey-section">
        <h3 className="mst-journey-section-title">YOUR JOURNEY CHAPTERS</h3>
        <p className="mst-journey-section-sub">EXPLORE NEW REALMS. UNLOCK YOUR POTENTIAL.</p>
        <div className="mst-journey-section-divider" aria-hidden="true" />
      </div>

      <div className="mst-journey-chapters">
        {CHAPTERS.map((chapter) => {
          const status = getChapterStatus(chapter);
          const progress = getChapterProgressPercent(chapter);
          const chapterArt =
            (chapter as Chapter & { artwork?: string; imageUrl?: string }).artwork ||
            (chapter as Chapter & { artwork?: string; imageUrl?: string }).imageUrl;
          const chapterStyle = chapterArt
            ? ({ ['--journey-chapter-art' as string]: `url(${chapterArt})` } as React.CSSProperties)
            : undefined;

          return (
            <div
              key={chapter.id}
              className={`mst-journey-chapter mst-journey-chapter--${status}`}
              style={chapterStyle}
              onClick={() => handleChapterClick(chapter)}
            >
              <div className="mst-journey-chapter-overlay" aria-hidden="true" />
              <div className="mst-journey-medallion">{chapter.id}</div>

              <div className="mst-journey-badges">
                {(chapter.id >= 1 && chapter.id <= 9) && (
                  <span className="mst-journey-badge mst-journey-badge--story">Story</span>
                )}
                <span className={`mst-journey-badge mst-journey-badge--${status}`}>
                  {getStatusText(status)}
                </span>
              </div>

              <div className="mst-journey-chapter-body">
                <div>
                  <h3 className="mst-journey-chapter-title">{chapter.title}</h3>
                  <p className="mst-journey-chapter-subtitle">{chapter.subtitle}</p>
                </div>

                <p className="mst-journey-chapter-desc">{chapter.description}</p>

                {status !== 'locked' && (
                  <div className="mst-journey-progress">
                    <div className="mst-journey-progress-meta">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="mst-journey-progress-track">
                      <div
                        className="mst-journey-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {status === 'locked' && !(chapter.id === 2 && journeyProgress?.chapters?.[1]?.isCompleted) && (
                  <div className="mst-journey-info mst-journey-info--requirements">
                    <h4 className="mst-journey-info-title">
                      <span className="mst-journey-info-dot" aria-hidden="true" />
                      Requirements
                    </h4>
                    <ul className="mst-journey-info-list">
                      {chapter.requirements.slice(0, 2).map((req, idx) => (
                        <li key={idx}>
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
                        <li className="mst-journey-info-more">
                          +{chapter.requirements.length - 2} more requirements
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {status !== 'locked' && (
                  <div className="mst-journey-info mst-journey-info--rewards">
                    <h4 className="mst-journey-info-title">
                      <span className="mst-journey-info-dot" aria-hidden="true" />
                      Rewards
                    </h4>
                    <ul className="mst-journey-info-list">
                      {chapter.rewards.slice(0, 2).map((reward, idx) => (
                        <li key={idx}>
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
                        <li className="mst-journey-info-more">
                          +{chapter.rewards.length - 2} more rewards
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="mst-journey-footer">
                  <div className="mst-journey-team">
                    <span aria-hidden="true">👥</span>
                    {chapter.teamSize} {chapter.teamSize === 1 ? 'player' : 'players'}
                  </div>
                  {status === 'active' && (
                    <button type="button" className="mst-journey-cta mst-journey-cta--continue">
                      Continue Chapter
                    </button>
                  )}
                  {status === 'available' && (
                    <button type="button" className="mst-journey-cta mst-journey-cta--begin">
                      Begin Chapter
                    </button>
                  )}
                  {status === 'completed' && (
                    <button type="button" className="mst-journey-cta mst-journey-cta--review">
                      Review Chapter
                    </button>
                  )}
                  {status === 'locked' && (
                    <button type="button" className="mst-journey-cta mst-journey-cta--locked" disabled>
                      Complete Previous Chapters to Unlock
                    </button>
                  )}
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