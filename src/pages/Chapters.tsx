import React, { useState } from 'react';
import ChapterTracker from '../components/ChapterTracker';
import ChapterDetail from '../components/ChapterDetail';
import { Chapter } from '../types/chapters';

const Chapters: React.FC = () => {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  const handleChapterSelect = (chapter: Chapter) => {
    setSelectedChapter(chapter);
  };

  const handleBackToChapters = () => {
    setSelectedChapter(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
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