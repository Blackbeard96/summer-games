import React, { useState, useEffect } from 'react';
import ChapterTracker from '../components/ChapterTracker';
import ChapterDetail from '../components/ChapterDetail';
import { Chapter, CHAPTERS } from '../types/chapters';

const Chapters: React.FC = () => {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

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

  const handleChapterSelect = (chapter: Chapter) => {
    // Allow Chapter 2 to be selected so players can see the "Coming Soon" message
    setSelectedChapter(chapter);
  };

  const handleBackToChapters = () => {
    setSelectedChapter(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-20 chapters-page">
      <div className="max-w-6xl mx-auto px-16 chapters-container">
        {selectedChapter ? (
          <ChapterDetail 
            chapter={selectedChapter} 
            onBack={handleBackToChapters} 
          />
        ) : (
          <ChapterTracker onChapterSelect={handleChapterSelect} />
        )}
      </div>
    </div>
  );
};

export default Chapters;