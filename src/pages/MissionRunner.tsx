/**
 * Mission Runner Page
 * 
 * Plays through a mission sequence (Story Slides, Videos, Battles)
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { MissionTemplate, MissionSequenceStep } from '../types/missions';
import { getMissionTemplate } from '../utils/missionsService';
import { completeMission, getPlayerMissions } from '../utils/missionsService';
import IslandRaidBattle from '../components/IslandRaidBattle';
import { DEFAULT_OPPONENTS } from '../components/CPUOpponentMovesAdmin';

// Note: Battle completion callback will be handled by IslandRaidBattle's onLeave
// For now, we'll detect completion by checking battle room status

const MissionRunner: React.FC = () => {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [mission, setMission] = useState<MissionTemplate | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showBattle, setShowBattle] = useState(false);
  const [battleGameId, setBattleGameId] = useState<string | null>(null);
  const [playerMissionId, setPlayerMissionId] = useState<string | null>(null);

  useEffect(() => {
    if (!missionId || !currentUser) return;

    const loadMission = async () => {
      try {
        const missionData = await getMissionTemplate(missionId);
        if (!missionData) {
          alert('Mission not found');
          navigate('/home');
          return;
        }

        if (!missionData.sequence || missionData.sequence.length === 0) {
          alert('This mission does not have a playable sequence.');
          navigate('/home');
          return;
        }

        setMission(missionData);

        // Find active player mission
        const playerMissions = await getPlayerMissions(currentUser.uid);
        const activeMission = playerMissions.find(
          pm => pm.missionId === missionId && pm.status === 'active'
        );
        if (activeMission) {
          setPlayerMissionId(activeMission.id);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading mission:', error);
        alert('Failed to load mission');
        navigate('/home');
      }
    };

    loadMission();
  }, [missionId, currentUser, navigate]);

  const currentStep = mission?.sequence?.[currentStepIndex];
  const isLastStep = mission?.sequence ? currentStepIndex === mission.sequence.length - 1 : false;

  const handleNext = () => {
    if (!mission?.sequence) return;
    
    if (isLastStep) {
      // Complete mission
      handleComplete();
    } else {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleComplete = async () => {
    if (!currentUser || !playerMissionId) {
      alert('Cannot complete mission: no active mission found');
      return;
    }

    try {
      const result = await completeMission(currentUser.uid, playerMissionId);
      if (result.success) {
        alert('Mission completed!');
        navigate('/home');
      } else {
        alert(result.error || 'Failed to complete mission');
      }
    } catch (error) {
      console.error('Error completing mission:', error);
      alert('Failed to complete mission');
    }
  };

  const handleStartBattle = async () => {
    if (!currentUser || !currentStep || currentStep.type !== 'BATTLE') return;

    try {
      const gameId = `mission-battle-${missionId}-${currentStep.id}-${Date.now()}`;
      const battleConfig = currentStep.battle;
      const difficultyMap: Record<string, 'easy' | 'normal' | 'hard' | 'nightmare'> = {
        'EASY': 'easy',
        'MEDIUM': 'normal',
        'HARD': 'hard',
        'BOSS': 'nightmare'
      };
      const difficulty = difficultyMap[battleConfig.difficulty] || 'normal';
      const maxPerWave = battleConfig.maxEnemiesPerWave ?? 4;

      const opponentById = new Map(DEFAULT_OPPONENTS.map(o => [o.id, o]));

      const generateEnemiesForWave = (waveNum: number, enemyTypes: string[]) => {
        const enemies: any[] = [];
        const count = Math.min(maxPerWave, Math.max(1, enemyTypes.length * 2));
        const types = enemyTypes.length ? enemyTypes : battleConfig.enemySet;
        const baseHealth = difficulty === 'easy' ? 100 : difficulty === 'normal' ? 200 : difficulty === 'hard' ? 300 : 400;
        const baseLevel = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 5 : difficulty === 'hard' ? 10 : 15;
        for (let i = 0; i < count; i++) {
          const enemyType = types[i % types.length];
          enemies.push({
            id: `enemy_${waveNum}_${i}`,
            type: enemyType.toLowerCase(),
            name: `${enemyType} ${i + 1}`,
            health: baseHealth,
            maxHealth: baseHealth,
            shieldStrength: difficulty === 'easy' ? 0 : baseHealth * 0.5,
            maxShieldStrength: difficulty === 'easy' ? 0 : baseHealth * 0.5,
            level: baseLevel,
            damage: baseLevel * 10,
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: waveNum,
            image: `/images/${enemyType}.png`
          });
        }
        return enemies;
      };

      const generateEnemiesFromOpponentIds = (waveNum: number, opponentIds: string[]) => {
        const enemies: any[] = [];
        const baseHealth = difficulty === 'easy' ? 100 : difficulty === 'normal' ? 200 : difficulty === 'hard' ? 300 : 400;
        const baseLevel = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 5 : difficulty === 'hard' ? 10 : 15;
        const count = Math.min(maxPerWave, Math.max(1, opponentIds.length * 2));
        for (let i = 0; i < count; i++) {
          const oppId = opponentIds[i % opponentIds.length];
          const opp = opponentById.get(oppId);
          const name = opp?.name ?? oppId;
          const type = (opp?.id ?? oppId).replace(/-/g, '_').toLowerCase();
          enemies.push({
            id: `enemy_${waveNum}_${i}`,
            type,
            name: `${name} ${i + 1}`,
            health: baseHealth,
            maxHealth: baseHealth,
            shieldStrength: difficulty === 'easy' ? 0 : baseHealth * 0.5,
            maxShieldStrength: difficulty === 'easy' ? 0 : baseHealth * 0.5,
            level: baseLevel,
            damage: baseLevel * 10,
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: waveNum,
            image: `/images/${name.replace(/\s+/g, ' ')}.png`
          });
        }
        return enemies;
      };

      let initialEnemies: any[];
      let maxWaves: number;
      let customWaves: Record<number, any[]> | undefined;

      if (battleConfig.waveConfigs?.length) {
        maxWaves = battleConfig.waveConfigs.length;
        customWaves = {};
        for (let w = 0; w < battleConfig.waveConfigs.length; w++) {
          const waveNum = w + 1;
          const waveConfig = battleConfig.waveConfigs[w];
          if (waveConfig.opponentIds?.length) {
            customWaves[waveNum] = generateEnemiesFromOpponentIds(waveNum, waveConfig.opponentIds);
          } else {
            customWaves[waveNum] = generateEnemiesForWave(waveNum, waveConfig.enemySet);
          }
        }
        initialEnemies = customWaves[1];
      } else {
        initialEnemies = generateEnemiesForWave(1, battleConfig.enemySet);
        maxWaves = battleConfig.waves ?? 3;
      }

      const battleRoomData: any = {
        id: gameId,
        gameId,
        lobbyId: null,
        players: [currentUser.uid],
        enemies: initialEnemies,
        waveNumber: 1,
        maxWaves,
        status: 'active',
        difficulty,
        isMissionBattle: true,
        missionId,
        stepId: currentStep.id,
        rewards: battleConfig.rewards,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (customWaves) {
        battleRoomData.customWaves = customWaves;
      }

      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      await setDoc(battleRoomRef, battleRoomData);

      setBattleGameId(gameId);
      setShowBattle(true);
    } catch (error) {
      console.error('Error starting battle:', error);
      alert('Failed to start battle');
    }
  };

  const handleBattleComplete = () => {
    setShowBattle(false);
    setBattleGameId(null);
    // Auto-advance to next step after battle
    handleNext();
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading mission...</div>
      </div>
    );
  }

  if (!mission || !currentStep) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Mission not found or has no sequence.</div>
        <button onClick={() => navigate('/home')} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Go Home
        </button>
      </div>
    );
  }

  // If battle is showing, render battle component
  if (showBattle && battleGameId) {
    return (
      <IslandRaidBattle
        gameId={battleGameId}
        lobbyId=""
        onLeave={() => {
          setShowBattle(false);
          setBattleGameId(null);
        }}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        maxWidth: '800px',
        width: '100%',
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Mission Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{mission.title}</h1>
          <p style={{ color: '#6b7280', margin: 0 }}>Step {currentStepIndex + 1} of {mission.sequence?.length || 0}</p>
        </div>

        {/* Step Content */}
        {currentStep.type === 'STORY_SLIDE' && (
          <div>
            {currentStep.title && (
              <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>
            )}
            {currentStep.image.url && (
              <img
                src={currentStep.image.url}
                alt={currentStep.image.alt || currentStep.title || 'Story slide'}
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  objectFit: 'contain',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem'
                }}
              />
            )}
            <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {currentStep.bodyText}
            </p>
          </div>
        )}

        {currentStep.type === 'VIDEO' && (
          <div>
            {currentStep.title && (
              <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>
            )}
            {currentStep.video.url && (
              <video
                src={currentStep.video.url}
                poster={currentStep.video.posterUrl}
                controls={currentStep.video.controls !== false}
                autoPlay={currentStep.video.autoplay || false}
                muted={currentStep.video.muted || false}
                style={{
                  width: '100%',
                  maxHeight: '500px',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem'
                }}
                onEnded={() => {
                  // Auto-advance when video ends (optional)
                  // handleNext();
                }}
              />
            )}
            {currentStep.bodyText && (
              <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
                {currentStep.bodyText}
              </p>
            )}
          </div>
        )}

        {currentStep.type === 'BATTLE' && (
          <div>
            {currentStep.title && (
              <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>
            )}
            {currentStep.bodyText && (
              <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '1.5rem' }}>
                {currentStep.bodyText}
              </p>
            )}
            <div style={{
              padding: '1.5rem',
              background: '#f3f4f6',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ marginTop: 0 }}>Battle Configuration</h3>
              <p><strong>Difficulty:</strong> {currentStep.battle.difficulty}</p>
              <p><strong>Enemy Types:</strong> {currentStep.battle.enemySet.join(', ')}</p>
              <p><strong>Waves:</strong> {currentStep.battle.waves || 3}</p>
              <p><strong>Rewards:</strong> {currentStep.battle.rewards.xp} XP, {currentStep.battle.rewards.pp} PP</p>
            </div>
            <button
              onClick={handleStartBattle}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Start Battle
            </button>
          </div>
        )}

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '2rem',
          gap: '1rem'
        }}>
          <button
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            style={{
              padding: '0.75rem 1.5rem',
              background: currentStepIndex === 0 ? '#e5e7eb' : '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: currentStepIndex === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            ← Back
          </button>
          <button
            onClick={() => navigate('/home')}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Exit
          </button>
          {currentStep.type !== 'BATTLE' && (
            <button
              onClick={handleNext}
              style={{
                padding: '0.75rem 1.5rem',
                background: isLastStep ? '#10b981' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isLastStep ? 'Complete Mission ✓' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionRunner;

