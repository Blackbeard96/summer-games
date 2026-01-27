import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ChapterTracker from '../components/ChapterTracker';
import ChapterDetail from '../components/ChapterDetail';
import { Chapter, CHAPTERS } from '../types/chapters';

const Chapters: React.FC = () => {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Check for battle join request from invitation acceptance
  // This must happen BEFORE ChapterDetail is rendered so it can detect the joinBattle flag
  useEffect(() => {
    const checkAndSelectChapter = () => {
      const joinBattleData = sessionStorage.getItem('joinBattle');
      if (joinBattleData) {
        try {
          const battleData = JSON.parse(joinBattleData);
          const { chapterId } = battleData;
          
          console.log('Chapters: Detected battle join request, auto-selecting chapter:', chapterId);
          
          // Find and select the correct chapter
          const chapter = CHAPTERS.find(c => c.id === chapterId);
          if (chapter) {
            console.log('Chapters: Auto-selecting chapter:', chapter.title);
            setSelectedChapter(chapter);
            // Don't remove joinBattle here - let ChapterDetail handle it
            return true; // Chapter selected successfully
          } else {
            console.warn('Chapters: Chapter not found for battle join:', chapterId);
            sessionStorage.removeItem('joinBattle');
            return false;
          }
        } catch (error) {
          console.error('Chapters: Error parsing joinBattle data:', error);
          sessionStorage.removeItem('joinBattle');
          return false;
        }
      }
      return false;
    };
    
    // Check immediately
    checkAndSelectChapter();
    
    // Also check after a short delay in case sessionStorage wasn't ready
    const timeoutId = setTimeout(() => {
      checkAndSelectChapter();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, []); // Run once on mount

  // Handle deep-linking from query params (e.g., ?focus=ch2-1&chapter=2)
  useEffect(() => {
    const focusChallengeId = searchParams.get('focus');
    const chapterParam = searchParams.get('chapter');
    
    if (chapterParam) {
      const chapterId = parseInt(chapterParam, 10);
      const chapter = CHAPTERS.find(c => c.id === chapterId);
      if (chapter && (!selectedChapter || selectedChapter.id !== chapterId)) {
        console.log('Chapters: Auto-selecting chapter from query param:', chapterId);
        setSelectedChapter(chapter);
      }
    }
    
    // If we have a focus challenge but no chapter selected, try to find it
    if (focusChallengeId && !selectedChapter) {
      for (const chapter of CHAPTERS) {
        const challenge = chapter.challenges.find(c => c.id === focusChallengeId);
        if (challenge) {
          console.log('Chapters: Auto-selecting chapter for challenge:', chapter.id);
          setSelectedChapter(chapter);
          break;
        }
      }
    }
  }, [searchParams, selectedChapter]);

  const handleChapterSelect = (chapter: Chapter) => {
    // Allow Chapter 2 to be selected so players can see the "Coming Soon" message
    setSelectedChapter(chapter);
  };

  const handleBackToChapters = () => {
    setSelectedChapter(null);
  };

  return (
    <div 
      className="min-h-screen py-20 chapters-page"
      style={{
        backgroundImage: 'url(/images/PlayerJourney_BKG.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="max-w-6xl mx-auto px-16 chapters-container">
        {selectedChapter ? (
          <ChapterDetail 
            chapter={selectedChapter} 
            onBack={handleBackToChapters}
            focusChallengeId={searchParams.get('focus') || undefined}
          />
        ) : (
          <ChapterTracker onChapterSelect={handleChapterSelect} />
        )}
      </div>
    </div>
  );
};

export default Chapters;