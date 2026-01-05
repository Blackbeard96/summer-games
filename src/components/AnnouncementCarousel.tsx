import React, { useState } from 'react';
import Chapter2AnnouncementModal from './Chapter2AnnouncementModal';

export type AnnouncementType = 'chapter2';

interface AnnouncementCarouselProps {
  isOpen: boolean;
  onClose: () => void;
  announcements: AnnouncementType[];
  onAnnouncementSeen: (announcementId: string) => void;
}

const AnnouncementCarousel: React.FC<AnnouncementCarouselProps> = ({
  isOpen,
  onClose,
  announcements,
  onAnnouncementSeen
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen || announcements.length === 0) return null;

  const currentAnnouncement = announcements[currentIndex];
  const hasNext = currentIndex < announcements.length - 1;
  const hasPrevious = currentIndex > 0;

  const handleClose = () => {
    // Mark all remaining announcements as seen
    announcements.slice(currentIndex).forEach((announcement) => {
      if (announcement === 'chapter2') {
        onAnnouncementSeen('chapter2_partial_open_2026_01_04');
      }
    });
    onClose();
  };

  const handleNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Last announcement, close carousel
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  };
  
  const handleNextClick = () => {
    // Mark current announcement as seen before moving to next
    if (currentAnnouncement === 'chapter2') {
      onAnnouncementSeen('chapter2_partial_open_2026_01_04');
    }
    handleNext();
  };

  return (
    <>
      {currentAnnouncement === 'chapter2' && (
        <Chapter2AnnouncementModal
          isOpen={isOpen}
          onClose={handleClose}
          onNext={hasNext ? handleNextClick : undefined}
          onPrevious={hasPrevious ? handlePrevious : undefined}
          currentIndex={currentIndex}
          totalCount={announcements.length}
        />
      )}
    </>
  );
};

export default AnnouncementCarousel;

