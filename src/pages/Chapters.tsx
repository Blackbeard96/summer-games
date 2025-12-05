import React, { useState } from 'react';
import ChapterTracker from '../components/ChapterTracker';
import ChapterDetail from '../components/ChapterDetail';
import { Chapter } from '../types/chapters';

const Chapters: React.FC = () => {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  const handleChapterSelect = (chapter: Chapter) => {
    // Block access to Chapter 2 - it's locked and disabled for now
    if (chapter.id === 2) {
      return;
    }
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