import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField, onSnapshot } from 'firebase/firestore';
import BattleEngine from './BattleEngine';
import { updateProgressOnChallengeComplete } from '../utils/chapterProgression';
import { grantChallengeRewards } from '../utils/challengeRewards';

interface ImpositionTestBattleProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  challengeId: string;
}

interface KonDialogue {
  wave: number;
  trigger: 'intro' | 'mid-wave' | 'wave-complete' | 'pre-wave-5' | 'victory' | 'defeat';
  text: string;
  timing?: 'immediate' | 'after-delay';
  delay?: number;
}

// Kon's dialogue for each narrative beat
const KON_DIALOGUES: KonDialogue[] = [
  // Intro
  {
    wave: 0,
    trigger: 'intro',
    text: "That power you're holding… it doesn't respond to you. It waits for you to decide.",
    timing: 'immediate'
  },
  {
    wave: 0,
    trigger: 'intro',
    text: "RR Candy doesn't enhance reality — it overrides it. This is called Imposition: forcing your intent onto the system.",
    timing: 'immediate'
  },
  {
    wave: 0,
    trigger: 'intro',
    text: "Imagine your new power as a new Lego set. It has a bunch of new pieces, each with their own placement, potential and power. Today, focus on just one new piece of that power. What can you do to unleash it's potential?",
    timing: 'immediate'
  },
  // Wave 1 - Control Test
  {
    wave: 1,
    trigger: 'mid-wave',
    text: "They're not stronger. They're being allowed to ignore the rules.",
    timing: 'after-delay',
    delay: 5000
  },
  // Wave 3 - Perception Test
  {
    wave: 3,
    trigger: 'mid-wave',
    text: "Power doesn't fail people. Perspective does.",
    timing: 'after-delay',
    delay: 8000
  },
  // Pre-Wave 5 - Final Advice
  {
    wave: 4,
    trigger: 'pre-wave-5',
    text: "Up until now, you've been asking the world to cooperate.",
    timing: 'immediate'
  },
  {
    wave: 4,
    trigger: 'pre-wave-5',
    text: "Wave five won't listen.",
    timing: 'after-delay',
    delay: 3000
  },
  {
    wave: 4,
    trigger: 'pre-wave-5',
    text: "Don't react. Don't wait. Decide the outcome first.",
    timing: 'after-delay',
    delay: 6000
  },
  {
    wave: 4,
    trigger: 'pre-wave-5',
    text: "This isn't about winning a fight. It's about proving you can end one.",
    timing: 'after-delay',
    delay: 9000
  },
  // Victory
  {
    wave: 5,
    trigger: 'victory',
    text: "You felt it, didn't you? Reality pushing back.",
    timing: 'immediate'
  },
  {
    wave: 5,
    trigger: 'victory',
    text: "You didn't just use the power. You held it steady under pressure.",
    timing: 'after-delay',
    delay: 3000
  },
  {
    wave: 5,
    trigger: 'victory',
    text: "Now the question isn't if they'll come for you. It's how many will realize they should've run.",
    timing: 'after-delay',
    delay: 6000
  }
];

// Enemy definitions for each wave
const WAVE_ENEMIES = {
  1: [
    // 2 Powered Zombies
    { id: 'powered_zombie_1', name: 'Powered Zombie 1', health: 180, maxHealth: 180, shieldStrength: 0, maxShieldStrength: 0, level: 5, image: '/images/Powered Zombie.png', special: 'attracted_to_power' },
    { id: 'powered_zombie_2', name: 'Powered Zombie 2', health: 180, maxHealth: 180, shieldStrength: 0, maxShieldStrength: 0, level: 5, image: '/images/Powered Zombie.png', special: 'attracted_to_power' },
    // 2 Zombie Captains
    { id: 'zombie_captain_1', name: 'Zombie Captain 1', health: 500, maxHealth: 500, shieldStrength: 200, maxShieldStrength: 200, level: 8, image: '/images/Zombie Captain.png', special: 'captain' },
    { id: 'zombie_captain_2', name: 'Zombie Captain 2', health: 500, maxHealth: 500, shieldStrength: 200, maxShieldStrength: 200, level: 8, image: '/images/Zombie Captain.png', special: 'captain' }
  ],
  2: [
    { id: 'unveiled_elite_1', name: 'Unveiled Elite', health: 120, maxHealth: 120, shieldStrength: 40, maxShieldStrength: 40, level: 4, image: '⚔️', special: 'coordinated', statusEffects: true },
    { id: 'unveiled_elite_2', name: 'Unveiled Elite', health: 120, maxHealth: 120, shieldStrength: 40, maxShieldStrength: 40, level: 4, image: '⚔️', special: 'coordinated', statusEffects: true },
    { id: 'environment_anchor', name: 'Environment Anchor', health: 100, maxHealth: 100, shieldStrength: 0, maxShieldStrength: 0, level: 3, image: '🌿', special: 'environment_anchored', ignoresShields: true }
  ],
  3: [
    { id: 'unveiled_illusionist_1', name: 'Unveiled Illusionist', health: 90, maxHealth: 90, shieldStrength: 30, maxShieldStrength: 30, level: 4, image: '🎭', special: 'decoy', isDecoy: false },
    { id: 'unveiled_illusionist_2', name: 'Unveiled Illusionist', health: 90, maxHealth: 90, shieldStrength: 30, maxShieldStrength: 30, level: 4, image: '🎭', special: 'decoy', isDecoy: true },
    { id: 'unveiled_illusionist_3', name: 'Unveiled Illusionist', health: 90, maxHealth: 90, shieldStrength: 30, maxShieldStrength: 30, level: 4, image: '🎭', special: 'decoy', isDecoy: true },
    { id: 'unveiled_guard_3', name: 'Unveiled Guard', health: 80, maxHealth: 80, shieldStrength: 20, maxShieldStrength: 20, level: 3, image: '🛡️', special: 'normal' }
  ],
  4: [
    { id: 'awakened_elite', name: 'Awakened Elite', health: 200, maxHealth: 200, shieldStrength: 60, maxShieldStrength: 60, level: 6, image: '👁️', special: 'awakened', ignoresCooldowns: true, altersTurnOrder: true }
  ],
  5: [
    { id: 'awakened_elite_unleashed', name: 'Awakened Elite (Unleashed)', health: 300, maxHealth: 300, shieldStrength: 100, maxShieldStrength: 100, level: 8, image: '👁️💥', special: 'fully_awakened', environmentFights: true, realityDistortions: true }
  ]
};

// Kon as AI ally
const KON_ALLY = {
  id: 'kon_ally',
  name: 'Kon',
  currentPP: 200,
  maxPP: 200,
  shieldStrength: 50,
  maxShieldStrength: 50,
  level: 10,
  image: '/images/Kon.png',
  photoURL: '/images/Kon.png',
  isPlayer: false,
  isAI: true,
  controller: 'ai' as const, // Mark as AI-controlled ally
  avatar: '/images/Kon.png'
};

const ImpositionTestBattle: React.FC<ImpositionTestBattleProps> = ({
  isOpen,
  onClose,
  onComplete,
  challengeId
}) => {
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const navigate = useNavigate();
  const [battlePhase, setBattlePhase] = useState<'intro' | 'battle' | 'wave-transition' | 'pre-wave-5' | 'escape' | 'victory' | 'defeat'>('intro');
  const [currentWave, setCurrentWave] = useState(1);
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  const [konDialogue, setKonDialogue] = useState<string | null>(null);
  const [showDialogue, setShowDialogue] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<any[]>([]);
  const [allies, setAllies] = useState<any[]>([]);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [waveTransitioning, setWaveTransitioning] = useState(false);
  const [selectedMove, setSelectedMove] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [currentIntroScene, setCurrentIntroScene] = useState(0);
  const [showIntroImage, setShowIntroImage] = useState(false);
  const [currentIntroImage, setCurrentIntroImage] = useState<string | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<'kon' | 'sonido'>('kon');
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownIntroRef = useRef(false);
  const [showKonWave1Popup, setShowKonWave1Popup] = useState(false);
  // Refs to prevent Firestore from overwriting local damage updates
  const isUpdatingLocallyRef = useRef(false);
  const lastLocalUpdateRef = useRef<Map<string, { health: number; shield: number }>>(new Map());

  // Initialize battle when modal opens
  useEffect(() => {
    if (isOpen && !hasShownIntroRef.current) {
      hasShownIntroRef.current = true;
      setBattlePhase('intro');
      setCurrentWave(1);
      setShowBattleEngine(false);
      setKonDialogue(null);
      setShowDialogue(false);
      setBattleLog([]);
      setCurrentIntroScene(0);
      setShowIntroImage(false);
      setCurrentIntroImage(null);
      setCurrentSpeaker('kon');
      setShowVideoPreview(false);
      setVideoEnded(false);
      startBattle();
    } else if (!isOpen) {
      hasShownIntroRef.current = false;
      setCurrentIntroScene(0);
      setShowIntroImage(false);
      setCurrentIntroImage(null);
      setCurrentSpeaker('kon');
      setShowVideoPreview(false);
      setVideoEnded(false);
    }
  }, [isOpen]);

  // Show Kon's dialogue
  const showKonDialogue = useCallback((dialogue: KonDialogue) => {
    if (dialogueTimeoutRef.current) {
      clearTimeout(dialogueTimeoutRef.current);
    }
    
    if (dialogue.timing === 'immediate') {
      setKonDialogue(dialogue.text);
      setShowDialogue(true);
    } else if (dialogue.timing === 'after-delay' && dialogue.delay) {
      dialogueTimeoutRef.current = setTimeout(() => {
        setKonDialogue(dialogue.text);
        setShowDialogue(true);
      }, dialogue.delay);
    }
  }, []);

  // Start the battle - show first intro scene
  const startBattle = async () => {
    if (!currentUser) return;

    try {
      setCurrentIntroScene(0);
      setShowIntroImage(true);
      setCurrentIntroImage('/images/Ch2-5_Kon_ImpositionIntro.png');
      const introDialogues = KON_DIALOGUES.filter(d => d.wave === 0 && d.trigger === 'intro');
      if (introDialogues.length > 0) {
        setKonDialogue(introDialogues[0].text);
        setShowDialogue(true);
      }
    } catch (error) {
      console.error('Error starting battle:', error);
    }
  };

  // Sonido's dialogues for the transmission scenes
  const SONIDO_DIALOGUES = [
    "My apologies for the deception. 'Tis not my prefered tactic, but I'm always willing to do what needs to be done.",
    "You are now in possession of an incredible power - the Power of Reality itself. What will you do with it?",
    "But before we get to that, the more immediate question is , will you be able to escape? The Unveiled will not suffer such loss - and betrayal - without a response. Will you be able to overcome the wrath of the Unveiled?"
  ];

  // Go back to previous intro scene
  const goBackIntroScene = () => {
    const introDialogues = KON_DIALOGUES.filter(d => d.wave === 0 && d.trigger === 'intro');
    
    if (currentIntroScene === 5) {
      // Go back from Scene 6 (Kon 3 - Lego set) to Scene 5 (Kon 2 - Imposition)
      setCurrentIntroScene(4);
      if (introDialogues.length > 1) {
        setKonDialogue(introDialogues[1].text);
        setCurrentSpeaker('kon');
        setCurrentIntroImage('/images/Ch2-5_Kon_ImpositionIntro.png');
        setShowIntroImage(true);
        setShowDialogue(true);
      }
    } else if (currentIntroScene === 4) {
      // Go back from Scene 5 (Kon 2) to Video Preview
      setCurrentIntroScene(3);
      setShowIntroImage(false);
      setCurrentIntroImage(null);
      setShowDialogue(false);
      setShowVideoPreview(true);
      setVideoEnded(false);
      // Restart video
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(console.error);
      }
    } else if (currentIntroScene === 3) {
      // Go back from Scene 4 (Sonido 3) to Scene 3 (Sonido 2)
      setCurrentIntroScene(2);
      setKonDialogue(SONIDO_DIALOGUES[1]);
      setShowDialogue(true);
    } else if (currentIntroScene === 2) {
      // Go back from Scene 3 (Sonido 2) to Scene 2 (Sonido 1)
      setCurrentIntroScene(1);
      setKonDialogue(SONIDO_DIALOGUES[0]);
      setShowDialogue(true);
    } else if (currentIntroScene === 1) {
      // Go back from Scene 2 (Sonido 1) to Scene 1 (Kon 1)
      setCurrentIntroScene(0);
      setCurrentIntroImage('/images/Ch2-5_Kon_ImpositionIntro.png');
      setCurrentSpeaker('kon');
      if (introDialogues.length > 0) {
        setKonDialogue(introDialogues[0].text);
        setShowDialogue(true);
      }
    }
    // Scene 0 is the first scene, can't go back further
  };

  // Advance to next intro scene
  const advanceIntroScene = () => {
    const introDialogues = KON_DIALOGUES.filter(d => d.wave === 0 && d.trigger === 'intro');
    
    if (currentIntroScene === 0) {
      // Scene 1 (Kon) complete, move to Scene 2 (Sonido transmission - first dialogue)
      setCurrentIntroScene(1);
      setCurrentIntroImage('/images/Ch2-5_NewTrasnsmission.png');
      setCurrentSpeaker('sonido');
      setKonDialogue(SONIDO_DIALOGUES[0]);
      setShowDialogue(true);
    } else if (currentIntroScene === 1) {
      // Scene 2 (Sonido 1) complete, move to Scene 3 (Sonido 2)
      setCurrentIntroScene(2);
      setKonDialogue(SONIDO_DIALOGUES[1]);
      setShowDialogue(true);
    } else if (currentIntroScene === 2) {
      // Scene 3 (Sonido 2) complete, move to Scene 4 (Sonido 3)
      setCurrentIntroScene(3);
      setKonDialogue(SONIDO_DIALOGUES[2]);
      setShowDialogue(true);
    } else if (currentIntroScene === 3) {
      // Scene 4 (Sonido 3) complete, show video preview
      setShowDialogue(false);
      setShowIntroImage(false);
      setCurrentIntroImage(null);
      setShowVideoPreview(true);
      setVideoEnded(false);
    } else if (currentIntroScene === 4) {
      // Scene 5 (Kon 2 - after video) complete, move to Scene 6 (Kon 3)
      setCurrentIntroScene(5);
      if (introDialogues.length > 2) {
        setKonDialogue(introDialogues[2].text);
        setShowDialogue(true);
      }
    } else if (currentIntroScene === 5) {
      // Scene 6 (Kon 3 - Lego set) complete, start battle
      setShowDialogue(false);
      setShowIntroImage(false);
      setCurrentIntroImage(null);
      setBattlePhase('battle');
      initializeWave(1);
    }
  };
  
  // Handle video end - show Kon's remaining dialogues, then start battle
  const handleVideoEnd = () => {
    setVideoEnded(true);
    setShowVideoPreview(false);
    // Move to post-video Kon dialogues (scenes 4-5)
    setCurrentIntroScene(4);
    setCurrentIntroImage('/images/Ch2-5_Kon_ImpositionIntro.png');
    setCurrentSpeaker('kon');
    setShowIntroImage(true);
    const introDialogues = KON_DIALOGUES.filter(d => d.wave === 0 && d.trigger === 'intro');
    if (introDialogues.length > 1) {
      setKonDialogue(introDialogues[1].text);
      setShowDialogue(true);
    }
  };

  // Auto-play video when video preview is shown
  useEffect(() => {
    if (showVideoPreview && videoRef.current && !videoEnded) {
      videoRef.current.play().catch(error => {
        console.error('Error playing video:', error);
        // If autoplay fails, allow manual play
      });
    }
  }, [showVideoPreview, videoEnded]);

  // Initialize Island Raid style battle with waves 1-4
  const initializeWave = async (waveNumber: number) => {
    if (!currentUser) return;

    try {
      // Create or get battle session
      const battleId = gameId || `imposition-test-${currentUser.uid}-${Date.now()}`;
      setGameId(battleId);

      // Get player stats
      const [studentRef, vaultRef] = await Promise.all([
        doc(db, 'students', currentUser.uid),
        doc(db, 'vaults', currentUser.uid)
      ]);
      const [studentDoc, vaultDoc] = await Promise.all([
        getDoc(studentRef),
        getDoc(vaultRef)
      ]);
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      
      const playerLevel = Math.floor((studentData.xp || 0) / 1000) + 1;
      
      // Load vault data for accurate health and shield stats
      let vaultHealth = 100;
      let maxVaultHealth = 100;
      let shieldStrength = 0;
      let maxShieldStrength = 100;
      let currentPP = studentData.powerPoints || 0;
      let maxPP = 1000;
      
      if (vaultDoc.exists()) {
        const vaultData = vaultDoc.data();
        maxPP = vaultData.capacity || 1000;
        currentPP = vaultData.currentPP || 0;
        
        // Max vault health is 10% of max PP (capacity is the max PP)
        maxVaultHealth = Math.floor(maxPP * 0.1);
        vaultHealth = vaultData.vaultHealth !== undefined 
          ? Math.min(vaultData.vaultHealth, maxVaultHealth, currentPP)
          : Math.min(currentPP, maxVaultHealth);
        
        // Shield stats from vault
        shieldStrength = vaultData.shieldStrength || 0;
        maxShieldStrength = vaultData.maxShieldStrength || 100;
      } else {
        // Fallback to student data if no vault exists
        maxPP = 1000;
        maxVaultHealth = Math.floor(maxPP * 0.1);
        vaultHealth = Math.min(currentPP, maxVaultHealth);
      }

      // Set up allies (player + Kon)
      const playerAlly = {
        id: currentUser.uid,
        name: studentData.displayName || 'Player',
        currentPP: currentPP,
        maxPP: maxPP,
        shieldStrength: shieldStrength,
        maxShieldStrength: maxShieldStrength,
        level: playerLevel,
        photoURL: studentData.photoURL,
        isPlayer: true,
        avatar: studentData.photoURL || '👤',
        vaultHealth: vaultHealth,
        maxVaultHealth: maxVaultHealth
      };

      // Kon as CPU ally with proper properties
      const konCPUAlly = {
        ...KON_ALLY,
        vaultHealth: KON_ALLY.currentPP,
        maxVaultHealth: KON_ALLY.maxPP,
        isAI: true,
        isPlayer: false,
        controller: 'ai' as const // Ensure controller is set
      };

      setAllies([playerAlly, konCPUAlly]);

      // Convert WAVE_ENEMIES to IslandRaidEnemy format for waves 1-4
      const convertToIslandRaidEnemies = (waveNum: number): any[] => {
        const waveEnemies = WAVE_ENEMIES[waveNum as keyof typeof WAVE_ENEMIES] || [];
        return waveEnemies.map((enemy: any) => ({
          id: enemy.id,
          type: 'powered_zombie' as const,
          name: enemy.name,
          health: enemy.health,
          maxHealth: enemy.maxHealth,
          shieldStrength: enemy.shieldStrength,
          maxShieldStrength: enemy.maxShieldStrength,
          level: enemy.level,
          damage: enemy.level * 10,
          moves: [],
          position: { x: Math.random() * 100, y: Math.random() * 100 },
          spawnTime: new Date(),
          waveNumber: waveNum,
          image: enemy.image,
          special: enemy.special,
          ...(enemy.ignoresShields && { ignoresShields: true }),
          ...(enemy.ignoresCooldowns && { ignoresCooldowns: true }),
          ...(enemy.altersTurnOrder && { altersTurnOrder: true }),
          ...(enemy.environmentFights && { environmentFights: true }),
          ...(enemy.realityDistortions && { realityDistortions: true })
        }));
      };

      // Create customWaves for waves 1-4
      const customWaves: any = {
        1: convertToIslandRaidEnemies(1),
        2: convertToIslandRaidEnemies(2),
        3: convertToIslandRaidEnemies(3),
        4: convertToIslandRaidEnemies(4),
        5: convertToIslandRaidEnemies(5) // Wave 5 for later
      };

      // Create or update Firestore battle room
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', battleId);
      const battleRoomData: any = {
        id: battleId,
        gameId: battleId,
        lobbyId: null,
        players: [currentUser.uid],
        enemies: customWaves[waveNumber],
        customWaves: customWaves,
        waveNumber: waveNumber,
        maxWaves: 5, // Total 5 waves, but start with 1-4
        status: 'active',
        difficulty: 'normal',
        isChapter2Battle: true,
        chapterId: 2,
        challengeId: challengeId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        waveRevision: 0,
        enemiesRevision: 0
      };

      await setDoc(battleRoomRef, battleRoomData);

      // Set up enemies for display - ensure names are preserved
      const formattedEnemies = customWaves[waveNumber].map((enemy: any) => ({
        id: enemy.id,
        name: enemy.name || `Enemy ${enemy.id}`, // Ensure name is always present
        currentPP: enemy.health,
        maxPP: enemy.maxHealth,
        shieldStrength: enemy.shieldStrength,
        maxShieldStrength: enemy.maxShieldStrength,
        level: enemy.level,
        image: enemy.image,
        avatar: enemy.image, // Also set avatar for display
        vaultHealth: enemy.health,
        maxVaultHealth: enemy.maxHealth,
        special: enemy.special,
        ...(enemy.ignoresShields && { ignoresShields: true }),
        ...(enemy.ignoresCooldowns && { ignoresCooldowns: true }),
        ...(enemy.altersTurnOrder && { altersTurnOrder: true }),
        ...(enemy.environmentFights && { environmentFights: true }),
        ...(enemy.realityDistortions && { realityDistortions: true })
      }));

      setOpponents(formattedEnemies);
      setCurrentWave(waveNumber);
      setBattleLog(prev => [...prev, `🌊 WAVE ${waveNumber} BEGINS!`]);
      setShowBattleEngine(true);
      
      // Show Kon's Wave 1 popup as overlay when battle starts
      if (waveNumber === 1) {
        setShowKonWave1Popup(true);
      }

      // Show wave-specific Kon dialogue (for mid-wave dialogues)
      if (waveNumber === 1) {
        setTimeout(() => {
          const wave1Dialogue = KON_DIALOGUES.find(d => d.wave === 1 && d.trigger === 'mid-wave');
          if (wave1Dialogue) showKonDialogue(wave1Dialogue);
        }, 5000);
      } else if (waveNumber === 3) {
        setTimeout(() => {
          const wave3Dialogue = KON_DIALOGUES.find(d => d.wave === 3 && d.trigger === 'mid-wave');
          if (wave3Dialogue) showKonDialogue(wave3Dialogue);
        }, 8000);
      }
    } catch (error) {
      console.error('Error initializing wave:', error);
    }
  };


  // Handle battle end from BattleEngine
  const handleBattleEnd = useCallback((result: 'victory' | 'defeat' | 'escape', winnerId?: string, loserId?: string) => {
    if (result === 'defeat') {
      handleDefeat();
    } else if (result === 'escape') {
      // Handle escape if needed (not used in this battle)
      handleDefeat();
    }
    // Victory is handled by the wave completion monitoring useEffect
  }, []);

  // Handle victory
  const handleVictory = async () => {
    setBattlePhase('victory');
    setShowBattleEngine(false);

    // Show victory dialogues
    const victoryDialogues = KON_DIALOGUES.filter(d => d.wave === 5 && d.trigger === 'victory');
    victoryDialogues.forEach((dialogue, index) => {
      if (index === 0) {
        showKonDialogue(dialogue);
      } else {
        setTimeout(() => showKonDialogue(dialogue), dialogue.delay || 0);
      }
    });

    // After dialogues, show escape sequence
    setTimeout(() => {
      setShowDialogue(false);
      setBattlePhase('escape');
      // Escape sequence will be handled here
      setTimeout(() => {
        completeChallenge();
      }, 3000);
    }, 10000);
  };

  // Handle defeat
  const handleDefeat = () => {
    setBattlePhase('defeat');
    setShowDialogue(false);
    // Could show defeat dialogue here
  };

  // Complete the challenge
  const completeChallenge = async () => {
    if (!currentUser) return;

    try {
      // Get challenge rewards from chapter definition
      const { CHAPTERS } = await import('../types/chapters');
      const chapter2 = CHAPTERS.find(c => c.id === 2);
      const challenge = chapter2?.challenges.find(c => c.id === challengeId);
      
      if (!challenge) {
        console.error('Challenge not found:', challengeId);
        return;
      }

      await updateProgressOnChallengeComplete(currentUser.uid, 2, challengeId);
      await grantChallengeRewards(currentUser.uid, challengeId, challenge.rewards, challenge.title);
      
      setBattlePhase('victory');
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (error) {
      console.error('Error completing challenge:', error);
    }
  };

  // Handle wave advancement from BattleEngine
  const handleWaveAdvance = useCallback((newWave: number, newEnemies: any[]) => {
    console.log(`[ImpositionTestBattle] Wave advanced to ${newWave}`);
    setCurrentWave(newWave);
    setOpponents(newEnemies);
    
    // Show wave-specific Kon dialogue
    if (newWave === 1) {
      setTimeout(() => {
        const wave1Dialogue = KON_DIALOGUES.find(d => d.wave === 1 && d.trigger === 'mid-wave');
        if (wave1Dialogue) showKonDialogue(wave1Dialogue);
      }, 5000);
    } else if (newWave === 3) {
      setTimeout(() => {
        const wave3Dialogue = KON_DIALOGUES.find(d => d.wave === 3 && d.trigger === 'mid-wave');
        if (wave3Dialogue) showKonDialogue(wave3Dialogue);
      }, 8000);
    } else if (newWave === 5) {
      // Wave 5 started - no special dialogue here, will show pre-wave-5 dialogue before this
    }
  }, [showKonDialogue]);

  // Handle opponents updates from BattleEngine (for real-time health/shield updates)
  const handleOpponentsUpdate = useCallback(async (updatedOpponents: any[]) => {
    console.log(`[ImpositionTestBattle] Opponents updated from BattleEngine:`, updatedOpponents.map(opp => ({
      id: opp.id,
      name: opp.name,
      currentPP: opp.currentPP,
      vaultHealth: opp.vaultHealth,
      shieldStrength: opp.shieldStrength
    })));
    
    // Mark that we're doing a Firestore update to prevent listener from overwriting
    isUpdatingLocallyRef.current = true;
    
    // CRITICAL FIX: Don't update local state here - let Firestore listener do it
    // This prevents circular updates:
    // - BattleEngine updates → calls onOpponentsUpdate → we update Firestore
    // - Firestore listener fires → updates local state → passes to BattleEngine as props
    // - BattleEngine syncs from props (if needed) → no circular loop
    
    // Store health/shield values for comparison (for merge logic in listener)
    updatedOpponents.forEach(opp => {
      const health = opp.vaultHealth !== undefined ? opp.vaultHealth : opp.currentPP;
      const shield = opp.shieldStrength || 0;
      lastLocalUpdateRef.current.set(opp.id, { health, shield });
    });
    
    // CRITICAL: Update Firestore immediately to persist damage
    // The Firestore listener will then update local state, breaking the circular loop
    if (gameId) {
      try {
        const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
        
        // Format enemies for Firestore (matching the structure expected by the listener)
        // NOTE: Cannot use serverTimestamp() inside arrays - use Date instead
        const firestoreEnemies = updatedOpponents.map(opp => ({
          id: opp.id,
          name: opp.name,
          health: opp.vaultHealth !== undefined ? opp.vaultHealth : opp.currentPP,
          maxHealth: opp.maxVaultHealth !== undefined ? opp.maxVaultHealth : opp.maxPP,
          shieldStrength: opp.shieldStrength || 0,
          maxShieldStrength: opp.maxShieldStrength || 0,
          level: opp.level || 1,
          image: opp.image,
          special: opp.special,
          spawnTime: new Date() // Use Date instead of serverTimestamp() for array elements
        }));
        
        // Update Firestore with the new enemy states
        await updateDoc(battleRoomRef, {
          enemies: firestoreEnemies,
          enemiesRevision: serverTimestamp(), // Use timestamp as revision to track updates
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ [ImpositionTestBattle] Firestore updated with ${firestoreEnemies.length} enemies`, {
          enemies: firestoreEnemies.map(e => ({
            id: e.id,
            name: e.name,
            health: e.health,
            shieldStrength: e.shieldStrength
          }))
        });
        
        // CRITICAL: Update local state AFTER Firestore update completes
        // This ensures we have the latest data and prevents the listener from overwriting with stale data
        // The listener will still fire, but it will see isUpdatingLocallyRef is true and skip
        setOpponents(updatedOpponents);
        
        // Clear the flag after a short delay to allow listener to process
        // The listener will skip while this flag is true
        setTimeout(() => {
          isUpdatingLocallyRef.current = false;
          console.log('🔄 [ImpositionTestBattle] Cleared isUpdatingLocallyRef flag - Firestore and local state updated');
        }, 200); // Short delay to ensure state update completes
      } catch (error) {
        console.error('❌ [ImpositionTestBattle] Error updating Firestore with opponent damage:', error);
        // On error, still update local state as fallback
        setOpponents(updatedOpponents);
        // Clear the flag after a delay
        setTimeout(() => {
          isUpdatingLocallyRef.current = false;
        }, 200);
      }
    } else {
      // No gameId - update local state directly (for non-Firestore battles)
      setOpponents(updatedOpponents);
    }
  }, [gameId]);

  // Firestore listener for battle room updates (Island Raid style wave progression)
  useEffect(() => {
    if (!gameId || !currentUser) return;

    const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
    const unsubscribe = onSnapshot(battleRoomRef, async (docSnapshot) => {
      if (!docSnapshot.exists()) return;

      const data = docSnapshot.data();
      const firestoreWave = data.waveNumber || 1;
      const firestoreEnemies = (data.enemies || []).map((enemy: any) => ({
        ...enemy,
        spawnTime: enemy.spawnTime?.toDate ? enemy.spawnTime.toDate() : (enemy.spawnTime || new Date())
      }));

      // Update local state if wave changed
      if (firestoreWave !== currentWave) {
        setCurrentWave(firestoreWave);
        setBattleLog(prev => [...prev, `🌊 WAVE ${firestoreWave} BEGINS!`]);
        // Clear local update tracking when wave changes
        lastLocalUpdateRef.current.clear();
        isUpdatingLocallyRef.current = false;
      }

      // Format enemies from Firestore
      const formattedEnemies = firestoreEnemies.map((enemy: any) => ({
        id: enemy.id,
        name: enemy.name,
        currentPP: enemy.health,
        maxPP: enemy.maxHealth,
        shieldStrength: enemy.shieldStrength,
        maxShieldStrength: enemy.maxShieldStrength,
        level: enemy.level,
        image: enemy.image,
        vaultHealth: enemy.health,
        maxVaultHealth: enemy.maxHealth,
        special: enemy.special
      }));

      // CRITICAL FIX: Don't overwrite local updates with Firestore data during active battle
      // Only update from Firestore if:
      // 1. Wave changed (handled above)
      // 2. We're not in the middle of a local update
      // 3. The local state doesn't have more recent damage data
      if (isUpdatingLocallyRef.current) {
        console.log('🔄 [ImpositionTestBattle] Skipping Firestore update - local update in progress');
        return;
      }

      // Merge Firestore data with local state, preferring local if it has more recent damage
      // Also check the lastLocalUpdateRef to see if we have more recent local damage
      setOpponents(prev => {
        const merged = formattedEnemies.map((firestoreEnemy: any) => {
          const localEnemy = prev.find(p => p.id === firestoreEnemy.id);
          const lastLocalUpdate = lastLocalUpdateRef.current.get(firestoreEnemy.id);
          
          if (localEnemy) {
            // Check if local has more recent damage (lower health/shield)
            const localHealth = localEnemy.vaultHealth !== undefined ? localEnemy.vaultHealth : localEnemy.currentPP;
            const firestoreHealth = firestoreEnemy.vaultHealth !== undefined ? firestoreEnemy.vaultHealth : firestoreEnemy.currentPP;
            const localShield = localEnemy.shieldStrength || 0;
            const firestoreShield = firestoreEnemy.shieldStrength || 0;
            
            // Also check lastLocalUpdateRef for the most recent damage
            const lastLocalHealth = lastLocalUpdate?.health;
            const lastLocalShield = lastLocalUpdate?.shield;
            
            // If local or lastLocalUpdate has more recent damage (lower values), prefer local
            if ((lastLocalHealth !== undefined && lastLocalHealth < firestoreHealth) ||
                (lastLocalShield !== undefined && lastLocalShield < firestoreShield) ||
                (localHealth < firestoreHealth) ||
                (localShield < firestoreShield)) {
              console.log(`✅ [ImpositionTestBattle] Preserving local damage for ${localEnemy.name}:`, {
                localHealth,
                lastLocalHealth,
                firestoreHealth,
                localShield,
                lastLocalShield,
                firestoreShield
              });
              return localEnemy;
            }
          }
          
          // Otherwise use Firestore data (for new enemies or if Firestore is more up-to-date)
          return firestoreEnemy;
        });
        
        // Add any local enemies that aren't in Firestore (shouldn't happen, but safety check)
        prev.forEach(localEnemy => {
          if (!merged.find((m: any) => m.id === localEnemy.id)) {
            merged.push(localEnemy);
          }
        });
        
        return merged;
      });

      // Check for wave 1-3 completion (advance to next wave)
      // Use local opponents state (which has the most recent damage) instead of Firestore data
      if (firestoreWave >= 1 && firestoreWave <= 3 && opponents.length > 0) {
        // Filter out allies (player and AI allies like Kon) - only check enemies
        const enemies = opponents.filter((opp: any) => {
          // Exclude player
          if (opp.isPlayer === true) return false;
          // Exclude AI allies (like Kon)
          if (opp.isAI === true) return false;
          // Exclude specific ally IDs
          if (opp.id === 'kon_ally' || opp.id?.includes('_ally')) return false;
          // Include everything else (enemies)
          return true;
        });
        
        console.log(`🌊 [ImpositionTestBattle] Checking wave ${firestoreWave} completion:`, {
          totalOpponents: opponents.length,
          enemies: enemies.length,
          enemyDetails: enemies.map((e: any) => ({
            id: e.id,
            name: e.name,
            health: e.vaultHealth !== undefined ? e.vaultHealth : e.currentPP,
            shield: e.shieldStrength,
            isDefeated: e.isDefeated
          }))
        });
        
        const allDefeated = enemies.length > 0 && enemies.every((opp: any) => {
          const health = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.currentPP || 0);
          const shield = opp.shieldStrength || 0;
          // Enemy is defeated if health <= 0 and shield <= 0, or if explicitly marked as defeated
          return (health <= 0 && shield <= 0) || opp.isDefeated === true;
        });

        if (allDefeated && !waveTransitioning) {
          console.log(`🌊 [ImpositionTestBattle] Wave ${firestoreWave} complete! Advancing to wave ${firestoreWave + 1}`);
          setWaveTransitioning(true);
          
          // Update Firestore to next wave
          const nextWave = firestoreWave + 1;
          const customWaves = (data as any).customWaves || {};
          if (customWaves[nextWave]) {
            updateDoc(battleRoomRef, {
              waveNumber: nextWave,
              enemies: customWaves[nextWave],
              waveRevision: ((data as any).waveRevision || 0) + 1,
              enemiesRevision: ((data as any).enemiesRevision || 0) + 1,
              updatedAt: serverTimestamp()
            }).then(() => {
              setWaveTransitioning(false);
              setBattleLog(prev => [...prev, `🌊 Wave ${nextWave} begins!`]);
            }).catch(err => {
              console.error('Error advancing wave:', err);
              setWaveTransitioning(false);
            });
          } else {
            console.warn(`⚠️ [ImpositionTestBattle] No enemies found for wave ${nextWave}`);
            setWaveTransitioning(false);
          }
        }
      }

      // Check for wave 4 completion (transition to wave 5)
      if (firestoreWave === 4 && formattedEnemies.length > 0) {
        // Filter out allies (player and AI allies like Kon) - only check enemies
        const enemies = formattedEnemies.filter((opp: any) => {
          // Exclude player
          if (opp.isPlayer === true) return false;
          // Exclude AI allies (like Kon)
          if (opp.isAI === true) return false;
          // Exclude specific ally IDs
          if (opp.id === 'kon_ally' || opp.id?.includes('_ally')) return false;
          // Include everything else (enemies)
          return true;
        });
        
        console.log(`🌊 [ImpositionTestBattle] Checking wave 4 completion:`, {
          totalOpponents: formattedEnemies.length,
          enemies: enemies.length,
          enemyDetails: enemies.map((e: any) => ({
            id: e.id,
            name: e.name,
            health: e.vaultHealth !== undefined ? e.vaultHealth : e.currentPP
          }))
        });
        
        const allDefeated = enemies.length > 0 && enemies.every((opp: any) => {
          const health = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.currentPP || 0);
          return health <= 0;
        });

        if (allDefeated && !waveTransitioning) {
          // Wave 4 complete: Show pre-Wave 5 dialogue
          setWaveTransitioning(true);
          setShowBattleEngine(false);
          setBattleLog(prev => [...prev, `🎉 Wave 4 complete!`]);
          setBattlePhase('pre-wave-5');
          
          // Show Kon's final advice
          const preWave5Dialogues = KON_DIALOGUES.filter(d => d.wave === 4 && d.trigger === 'pre-wave-5');
          preWave5Dialogues.forEach((dialogue, index) => {
            if (index === 0) {
              showKonDialogue(dialogue);
            } else {
              setTimeout(() => showKonDialogue(dialogue), dialogue.delay || 0);
            }
          });

          // After dialogue, advance to Wave 5 in Firestore
          setTimeout(async () => {
            setShowDialogue(false);
            setBattlePhase('battle');
            setWaveTransitioning(false);
            
            // Update Firestore to wave 5
            const customWaves = (data as any).customWaves || {};
            if (customWaves[5]) {
              await updateDoc(battleRoomRef, {
                waveNumber: 5,
                enemies: customWaves[5],
                waveRevision: ((data as any).waveRevision || 0) + 1,
                enemiesRevision: ((data as any).enemiesRevision || 0) + 1,
                updatedAt: serverTimestamp()
              });
            }
          }, 15000);
        }
      }

      // Check for wave 5 completion (victory)
      if (firestoreWave === 5 && formattedEnemies.length > 0) {
        const allDefeated = formattedEnemies.every((opp: any) => {
          const health = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.currentPP || 0);
          return health <= 0;
        });

        if (allDefeated) {
          handleVictory();
        }
      }
    });

    return () => unsubscribe();
  }, [gameId, currentUser, currentWave, waveTransitioning, showKonDialogue, opponents]);

  // Monitor for Wave 5 completion (final victory)
  useEffect(() => {
    if (!showBattleEngine || currentWave !== 5 || opponents.length === 0) return;

    const allDefeated = opponents.every(opp => {
      const health = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.currentPP || 0);
      return health <= 0;
    });

    if (allDefeated) {
      handleVictory();
    }
  }, [opponents, showBattleEngine, currentWave]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Intro Phase with Image */}
      {battlePhase === 'intro' && showIntroImage && currentIntroImage && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          backgroundColor: '#000000' // Black background
        }}>
          {/* Image Container - Rectangular */}
          <div style={{
            width: '80%',
            maxWidth: '1200px',
            aspectRatio: '16/9',
            position: 'relative',
            marginBottom: showDialogue ? '2rem' : '0',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            boxShadow: '0 0 40px rgba(139, 92, 246, 0.3)',
            zIndex: 1
          }}>
            <img 
              src={currentIntroImage} 
              alt={currentIntroScene === 1 ? "Sonido Transmission" : "Kon Imposition Intro"}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
          

          {/* Dialogue Modal (Kon or Sonido) */}
          {showDialogue && konDialogue && (
            <div style={{
              position: 'absolute',
              bottom: '10%',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.95)',
              border: `2px solid ${currentSpeaker === 'sonido' ? '#f59e0b' : '#8b5cf6'}`,
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '700px',
              width: '90%',
              zIndex: 10001,
              boxShadow: `0 0 30px ${currentSpeaker === 'sonido' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(139, 92, 246, 0.5)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>{currentSpeaker === 'sonido' ? '📡' : '⚡'}</div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: currentSpeaker === 'sonido' ? '#fbbf24' : '#a78bfa' }}>
                    {currentSpeaker === 'sonido' ? 'Sonido' : 'Kon'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: currentSpeaker === 'sonido' ? '#fcd34d' : '#c4b5fd' }}>
                    {currentSpeaker === 'sonido' ? 'Transmission' : 'Your Ally'}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '1.125rem', lineHeight: '1.6', margin: 0, marginBottom: '1rem' }}>{konDialogue}</p>
              <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                {/* Back Button */}
                {currentIntroScene > 0 && (
                  <button
                    onClick={goBackIntroScene}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#374151',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                      flex: 1,
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#4b5563';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#374151';
                    }}
                  >
                    ← Back
                  </button>
                )}
                {/* Continue Button */}
                <button
                  onClick={advanceIntroScene}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: currentSpeaker === 'sonido' ? '#f59e0b' : '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    flex: currentIntroScene > 0 ? 1 : 1,
                    width: currentIntroScene === 0 ? '100%' : 'auto',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = currentSpeaker === 'sonido' ? '#d97706' : '#7c3aed';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = currentSpeaker === 'sonido' ? '#f59e0b' : '#8b5cf6';
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}
          
          {/* Continue button for Scene 2 (Sonido transmission - no dialogue) - REMOVED, now has dialogue */}
        </div>
      )}

      {/* Video Preview Phase */}
      {showVideoPreview && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          backgroundColor: '#000000'
        }}>
          {/* Video Container */}
          <div style={{
            width: '90%',
            maxWidth: '1200px',
            aspectRatio: '16/9',
            position: 'relative',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            boxShadow: '0 0 40px rgba(139, 92, 246, 0.3)',
            zIndex: 1
          }}>
            <video
              ref={videoRef}
              src="/videos/Ch2-5_UnveiledInvasion.mp4"
              onEnded={handleVideoEnd}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
          
          {/* Continue and Back buttons */}
          {!videoEnded && (
            <div style={{
              marginTop: '2rem',
              display: 'flex',
              gap: '1rem',
              zIndex: 10001
            }}>
              <button
                onClick={() => {
                  // Go back to previous scene (Sonido's last dialogue)
                  setShowVideoPreview(false);
                  setVideoEnded(false);
                  setCurrentIntroScene(3);
                  setCurrentIntroImage('/images/Ch2-5_NewTrasnsmission.png');
                  setCurrentSpeaker('sonido');
                  setShowIntroImage(true);
                  setKonDialogue(SONIDO_DIALOGUES[2]);
                  setShowDialogue(true);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#374151';
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleVideoEnd}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#7c3aed';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8b5cf6';
                }}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pre-Wave 5 Phase */}
      {battlePhase === 'pre-wave-5' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>The Shift</h2>
          <p style={{ fontSize: '1.125rem', opacity: 0.9 }}>
            Everything slows. Energy crackles through the room.
          </p>
        </div>
      )}

      {/* Wave Transition */}
      {waveTransitioning && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '2rem' }}>Preparing Next Wave...</h2>
        </div>
      )}

      {/* Escape Sequence */}
      {battlePhase === 'escape' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Escape</h2>
          <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>
            Emergency exits unlock. The facility collapses behind you.
          </p>
        </div>
      )}

      {/* Victory */}
      {battlePhase === 'victory' && !showDialogue && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#10b981' }}>Victory!</h1>
          <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>
            You've proven you can command power, not just react to it.
          </p>
        </div>
      )}

      {/* Defeat */}
      {battlePhase === 'defeat' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#ef4444' }}>Defeat</h1>
          <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>
            The power overwhelmed you. Try again and remember: command, don't react.
          </p>
          <button
            onClick={() => {
              // Return to Player's Journey page
              navigate('/chapters');
              onClose();
            }}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Kon's Wave 1 Popup - Below battle action buttons */}
      {showKonWave1Popup && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            width: '90%',
            maxWidth: '600px',
            pointerEvents: 'auto'
          }}
        >
          <div
            style={{
              backgroundColor: '#1f2937',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '2px solid #8b5cf6',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '1.5rem',
              backdropFilter: 'blur(10px)'
            }}
          >
            {/* Kon's Image */}
            <img
              src="/images/Kon_PopUp.png"
              alt="Kon"
              style={{
                width: '150px',
                height: 'auto',
                borderRadius: '0.5rem',
                border: '2px solid #8b5cf6',
                flexShrink: 0
              }}
              onError={(e) => {
                // Fallback if image doesn't exist
                console.warn('Kon_PopUp.png not found, using fallback');
                (e.target as HTMLImageElement).src = '/images/Kon.png';
              }}
            />
            
            {/* Dialogue Text and Button */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                flex: 1
              }}
            >
              <p
                style={{
                  fontSize: '1.125rem',
                  color: '#e5e7eb',
                  textAlign: 'left',
                  lineHeight: '1.6',
                  fontStyle: 'italic',
                  margin: 0
                }}
              >
                "Let's see how you wield your new power. I'll back you up."
              </p>
              
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowKonWave1Popup(false);
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.875rem',
                  transition: 'background-color 0.2s ease',
                  alignSelf: 'flex-start'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#7c3aed';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8b5cf6';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Island Raid Style Battle (waves 1-4, then 5) - Shows multiple enemies */}
      {showBattleEngine && battlePhase === 'battle' && (
        <div style={{ width: '100%', height: '100%' }}>
          <BattleEngine
            onBattleEnd={handleBattleEnd}
            opponents={opponents}
            allies={allies}
            isMultiplayer={true}
            maxWaves={5}
            currentWave={currentWave}
            customWaves={WAVE_ENEMIES}
            onWaveAdvance={handleWaveAdvance}
            onOpponentsUpdate={handleOpponentsUpdate}
            initialBattleLog={battleLog}
            onBattleLogUpdate={(log) => setBattleLog(log)}
            gameId={gameId || undefined}
          />
        </div>
      )}

      {/* Close button (only in certain phases) */}
      {(battlePhase === 'victory' || battlePhase === 'defeat') && !showDialogue && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '2rem',
            right: '2rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#374151',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Close
        </button>
      )}
    </div>
  );
};

export default ImpositionTestBattle;

