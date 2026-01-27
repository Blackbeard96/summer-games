import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
  const [previousXP, setPreviousXP] = useState<number>(-1);
  const [currentXP, setCurrentXP] = useState<number>(-1);
  const [showNotification, setShowNotification] = useState(false);
  
  // Use refs to track previous values without causing re-renders
  const previousLevelRef = useRef<number>(-1);
  const isInitializedRef = useRef<boolean>(false);

  // Listen to user's XP changes
  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'students', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        const newXP = userData.xp || 0;
        const newLevel = getLevelFromXP(newXP);
        
        // Initialize on first load
        if (!isInitializedRef.current) {
          setCurrentXP(newXP);
          setPreviousXP(newXP);
          previousLevelRef.current = newLevel;
          isInitializedRef.current = true;
          return;
        }
        
        // Check if this is a level up (new level is higher than previous level)
        if (newLevel > previousLevelRef.current) {
          // Level up detected!
          console.log('🎉 Level up detected!', { 
            previousLevel: previousLevelRef.current, 
            newLevel, 
            previousXP: currentXP, 
            newXP 
          });
          setPreviousXP(currentXP);
          setCurrentXP(newXP);
          previousLevelRef.current = newLevel;
          setShowNotification(true);
          
          // Recalculate power level after level up (async IIFE)
          (async () => {
            try {
              const { recalculatePowerLevel } = await import('../services/recalculatePowerLevel');
              await recalculatePowerLevel(currentUser.uid);
            } catch (plError) {
              console.error('Error recalculating power level after level up:', plError);
              // Don't throw - power level recalculation is non-critical
            }
          })();
        } else {
          // Same level or level decreased, just update XP
          setCurrentXP(newXP);
          previousLevelRef.current = newLevel;
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser, currentXP]); // Only depend on currentUser and currentXP

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