import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelFromXP } from '../utils/leveling';
import LevelUpNotification from '../components/LevelUpNotification';

interface LevelUpContextType {
  showLevelUpNotification: (currentXP: number, previousXP: number) => void;
}

const LevelUpContext = createContext<LevelUpContextType | undefined>(undefined);

export const useLevelUp = () => {
  const context = useContext(LevelUpContext);
  if (context === undefined) {
    throw new Error('useLevelUp must be used within a LevelUpProvider');
  }
  return context;
};

interface LevelUpProviderProps {
  children: ReactNode;
}

export const LevelUpProvider: React.FC<LevelUpProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [previousXP, setPreviousXP] = useState<number>(0);
  const [currentXP, setCurrentXP] = useState<number>(0);
  const [showNotification, setShowNotification] = useState(false);

  // Listen to user's XP changes
  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'students', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        const newXP = userData.xp || 0;
        
        // Check if this is a level up
        const newLevel = getLevelFromXP(newXP);
        const oldLevel = getLevelFromXP(currentXP);
        
        if (newLevel > oldLevel && currentXP > 0) {
          // Level up detected!
          setPreviousXP(currentXP);
          setCurrentXP(newXP);
          setShowNotification(true);
        } else {
          // Just update the current XP
          setCurrentXP(newXP);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser]); // Removed currentXP to prevent infinite loops

  const handleCloseNotification = () => {
    setShowNotification(false);
  };

  const showLevelUpNotification = (currentXP: number, previousXP: number) => {
    setCurrentXP(currentXP);
    setPreviousXP(previousXP);
    setShowNotification(true);
  };

  return (
    <LevelUpContext.Provider value={{ showLevelUpNotification }}>
      {children}
      {showNotification && (
        <LevelUpNotification
          currentXP={currentXP}
          previousXP={previousXP}
          onClose={handleCloseNotification}
        />
      )}
    </LevelUpContext.Provider>
  );
}; 