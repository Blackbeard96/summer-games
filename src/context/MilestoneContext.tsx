import React, { createContext, useContext, useState, useCallback } from 'react';

interface MilestoneReward {
  pp: number;
  tmShards?: number;
  xp?: number;
}

interface MilestoneNotification {
  milestone: number;
  moveName: string;
  rewards: MilestoneReward;
}

interface MilestoneContextType {
  showMilestone: (notification: MilestoneNotification) => void;
  currentMilestone: MilestoneNotification | null;
  isOpen: boolean;
  closeMilestone: () => void;
}

const MilestoneContext = createContext<MilestoneContextType | undefined>(undefined);

export const useMilestone = () => {
  const context = useContext(MilestoneContext);
  if (context === undefined) {
    throw new Error('useMilestone must be used within a MilestoneProvider');
  }
  return context;
};

export const MilestoneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentMilestone, setCurrentMilestone] = useState<MilestoneNotification | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const showMilestone = useCallback((notification: MilestoneNotification) => {
    setCurrentMilestone(notification);
    setIsOpen(true);
  }, []);

  const closeMilestone = useCallback(() => {
    setIsOpen(false);
    // Clear the milestone after a short delay to allow animation to complete
    setTimeout(() => {
      setCurrentMilestone(null);
    }, 300);
  }, []);

  return (
    <MilestoneContext.Provider
      value={{
        showMilestone,
        currentMilestone,
        isOpen,
        closeMilestone
      }}
    >
      {children}
    </MilestoneContext.Provider>
  );
};



