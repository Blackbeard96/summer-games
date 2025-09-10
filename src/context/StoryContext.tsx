import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { STORY_EPISODES, StoryEpisode, StoryProgress, EpisodeProgress } from '../types/story';

interface StoryContextType {
  storyProgress: StoryProgress;
  episodeProgress: Record<string, EpisodeProgress>;
  currentEpisode: StoryEpisode | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  startEpisode: (episodeId: string) => Promise<void>;
  completeObjective: (episodeId: string, objectiveId: string) => Promise<void>;
  completeEncounter: (episodeId: string, encounterId: string) => Promise<void>;
  defeatBoss: (episodeId: string) => Promise<void>;
  claimRewards: (episodeId: string) => Promise<void>;
  unlockEpisode: (episodeId: string) => Promise<void>;
  
  // Utility functions
  getEpisodeStatus: (episodeId: string) => 'locked' | 'unlocked' | 'completed';
  isEpisodeUnlocked: (episodeId: string) => boolean;
  getEpisodeProgress: (episodeId: string) => EpisodeProgress | null;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

export const useStory = () => {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error('useStory must be used within a StoryProvider');
  }
  return context;
};

interface StoryProviderProps {
  children: ReactNode;
}

export const StoryProvider: React.FC<StoryProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [storyProgress, setStoryProgress] = useState<StoryProgress>({
    currentEpisode: 'ep_01_xiotein_letter',
    completedEpisodes: [],
    totalProgress: 0,
    seasonRewards: []
  });
  const [episodeProgress, setEpisodeProgress] = useState<Record<string, EpisodeProgress>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current episode data
  const currentEpisode = STORY_EPISODES.find(ep => ep.id === storyProgress.currentEpisode) || null;

  // Load story progress from Firestore
  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'storyProgress', currentUser.uid),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data() as StoryProgress;
          setStoryProgress(data);
          
          // Calculate episode progress
          const episodeProgressData: Record<string, EpisodeProgress> = {};
          STORY_EPISODES.forEach(episode => {
            episodeProgressData[episode.id] = {
              isStarted: data.completedEpisodes.includes(episode.id) || episode.id === data.currentEpisode,
              isCompleted: data.completedEpisodes.includes(episode.id),
              objectivesCompleted: [], // TODO: Track individual objectives
              encountersCompleted: [], // TODO: Track individual encounters
              bossDefeated: data.completedEpisodes.includes(episode.id),
              rewardsClaimed: data.completedEpisodes.includes(episode.id),
              completionDate: data.completedEpisodes.includes(episode.id) ? new Date() : undefined
            };
          });
          setEpisodeProgress(episodeProgressData);
        } else {
          // Initialize default progress
          const defaultProgress: StoryProgress = {
            currentEpisode: 'ep_01_xiotein_letter',
            completedEpisodes: [],
            totalProgress: 0,
            seasonRewards: []
          };
          setStoryProgress(defaultProgress);
          
          // Initialize episode progress
          const defaultEpisodeProgress: Record<string, EpisodeProgress> = {};
          STORY_EPISODES.forEach(episode => {
            defaultEpisodeProgress[episode.id] = {
              isStarted: episode.id === 'ep_01_xiotein_letter',
              isCompleted: false,
              objectivesCompleted: [],
              encountersCompleted: [],
              bossDefeated: false,
              rewardsClaimed: false
            };
          });
          setEpisodeProgress(defaultEpisodeProgress);
          
          // Save default progress to Firestore
          try {
            await setDoc(doc(db, 'storyProgress', currentUser.uid), defaultProgress);
          } catch (error) {
            console.error('Error saving default story progress:', error);
            setError('Failed to initialize story progress');
          }
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Error loading story progress:', error);
        setError('Failed to load story progress');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Start an episode
  const startEpisode = async (episodeId: string) => {
    if (!currentUser) return;
    
    try {
      const episode = STORY_EPISODES.find(ep => ep.id === episodeId);
      if (!episode) throw new Error('Episode not found');
      
      if (!isEpisodeUnlocked(episodeId)) {
        throw new Error('Episode is locked');
      }
      
      await updateDoc(doc(db, 'storyProgress', currentUser.uid), {
        currentEpisode: episodeId
      });
      
      console.log(`Started episode: ${episodeId}`);
    } catch (error) {
      console.error('Error starting episode:', error);
      setError('Failed to start episode');
    }
  };

  // Complete an objective
  const completeObjective = async (episodeId: string, objectiveId: string) => {
    if (!currentUser) return;
    
    try {
      const currentProgress = episodeProgress[episodeId];
      if (!currentProgress) throw new Error('Episode progress not found');
      
      const updatedObjectives = [...currentProgress.objectivesCompleted, objectiveId];
      
      await updateDoc(doc(db, 'storyProgress', currentUser.uid), {
        [`episodeProgress.${episodeId}.objectivesCompleted`]: updatedObjectives
      });
      
      console.log(`Completed objective: ${objectiveId} in episode: ${episodeId}`);
    } catch (error) {
      console.error('Error completing objective:', error);
      setError('Failed to complete objective');
    }
  };

  // Complete an encounter
  const completeEncounter = async (episodeId: string, encounterId: string) => {
    if (!currentUser) return;
    
    try {
      const currentProgress = episodeProgress[episodeId];
      if (!currentProgress) throw new Error('Episode progress not found');
      
      const updatedEncounters = [...currentProgress.encountersCompleted, encounterId];
      
      await updateDoc(doc(db, 'storyProgress', currentUser.uid), {
        [`episodeProgress.${episodeId}.encountersCompleted`]: updatedEncounters
      });
      
      console.log(`Completed encounter: ${encounterId} in episode: ${episodeId}`);
    } catch (error) {
      console.error('Error completing encounter:', error);
      setError('Failed to complete encounter');
    }
  };

  // Defeat a boss
  const defeatBoss = async (episodeId: string) => {
    if (!currentUser) return;
    
    try {
      const episode = STORY_EPISODES.find(ep => ep.id === episodeId);
      if (!episode) throw new Error('Episode not found');
      
      // Update episode progress
      await updateDoc(doc(db, 'storyProgress', currentUser.uid), {
        [`episodeProgress.${episodeId}.bossDefeated`]: true
      });
      
      console.log(`Defeated boss in episode: ${episodeId}`);
    } catch (error) {
      console.error('Error defeating boss:', error);
      setError('Failed to defeat boss');
    }
  };

  // Claim rewards
  const claimRewards = async (episodeId: string) => {
    if (!currentUser) return;
    
    try {
      const episode = STORY_EPISODES.find(ep => ep.id === episodeId);
      if (!episode) throw new Error('Episode not found');
      
      // Mark episode as completed
      const updatedCompletedEpisodes = [...storyProgress.completedEpisodes, episodeId];
      const totalProgress = Math.round((updatedCompletedEpisodes.length / STORY_EPISODES.length) * 100);
      
      // Add rewards to season rewards
      const updatedSeasonRewards = [...storyProgress.seasonRewards, ...episode.rewards.fixed];
      
      await updateDoc(doc(db, 'storyProgress', currentUser.uid), {
        completedEpisodes: updatedCompletedEpisodes,
        totalProgress,
        seasonRewards: updatedSeasonRewards,
        [`episodeProgress.${episodeId}.isCompleted`]: true,
        [`episodeProgress.${episodeId}.rewardsClaimed`]: true,
        [`episodeProgress.${episodeId}.completionDate`]: new Date()
      });
      
      console.log(`Claimed rewards for episode: ${episodeId}`);
    } catch (error) {
      console.error('Error claiming rewards:', error);
      setError('Failed to claim rewards');
    }
  };

  // Unlock an episode
  const unlockEpisode = async (episodeId: string) => {
    if (!currentUser) return;
    
    try {
      const episode = STORY_EPISODES.find(ep => ep.id === episodeId);
      if (!episode) throw new Error('Episode not found');
      
      await updateDoc(doc(db, 'storyProgress', currentUser.uid), {
        [`episodeProgress.${episodeId}.isStarted`]: true
      });
      
      console.log(`Unlocked episode: ${episodeId}`);
    } catch (error) {
      console.error('Error unlocking episode:', error);
      setError('Failed to unlock episode');
    }
  };

  // Get episode status
  const getEpisodeStatus = (episodeId: string): 'locked' | 'unlocked' | 'completed' => {
    if (storyProgress.completedEpisodes.includes(episodeId)) {
      return 'completed';
    } else if (isEpisodeUnlocked(episodeId)) {
      return 'unlocked';
    } else {
      return 'locked';
    }
  };

  // Check if episode is unlocked
  const isEpisodeUnlocked = (episodeId: string): boolean => {
    if (episodeId === 'ep_01_xiotein_letter') return true;
    
    const episode = STORY_EPISODES.find(ep => ep.id === episodeId);
    if (!episode) return false;
    
    const requiredEpisodes = episode.gates.requires;
    const hasRequiredEpisodes = requiredEpisodes.every(req => 
      storyProgress.completedEpisodes.includes(req)
    );
    
    return hasRequiredEpisodes;
  };

  // Get episode progress
  const getEpisodeProgress = (episodeId: string): EpisodeProgress | null => {
    return episodeProgress[episodeId] || null;
  };

  const value: StoryContextType = {
    storyProgress,
    episodeProgress,
    currentEpisode,
    isLoading,
    error,
    startEpisode,
    completeObjective,
    completeEncounter,
    defeatBoss,
    claimRewards,
    unlockEpisode,
    getEpisodeStatus,
    isEpisodeUnlocked,
    getEpisodeProgress
  };

  return (
    <StoryContext.Provider value={value}>
      {children}
    </StoryContext.Provider>
  );
};
