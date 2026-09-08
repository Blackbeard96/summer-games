import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db, storage } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import type { ProductivityStatDoc } from '../utils/productivityTracking';
import { tsMs } from '../utils/productivityTracking';
import {
  formatExamDurationMs,
  loadExamHistoryForUser,
  isLegacyExamQuizAttemptId,
} from '../utils/examProfileHistory';
import type { ExamProductivityLog } from '../types/examProductivity';
import { ENERGY_TYPES, type BattleEnergyType } from '../constants/energyTypes';
import {
  extractElementOrNull,
  formatElementDisplayLabel,
  getElementDisplayColor,
  hasElementSelected,
} from '../utils/elementDisplay';
import { parseWorkStatsFromDoc, workCompletionRatePct, WORK_ENERGY_ORDER } from '../utils/workStatsTracking';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, getAuth } from 'firebase/auth';
import PlayerCard from '../components/PlayerCard';
import ManifestProgress from '../components/ManifestProgress';
import ManifestSelection from '../components/ManifestSelection';
import { SketchPicker } from 'react-color';
import { getLevelFromXP } from '../utils/leveling';
import { topPowerLevelContributors } from '../utils/powerLevel';
import { PlayerManifest, MANIFESTS } from '../types/manifest';
import type { PowerStatBranch } from '../types/playerPowerStats';
import { POWER_STAT_EVENT_DESCRIPTION } from '../types/playerPowerStats';
import { findNextChallenge } from '../utils/journeyProgress';
import { mergeChaptersProgressMaps } from '../utils/mergeChapterProgress';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';
import { getUserSquadAbbreviation } from '../utils/squadUtils';
import { normalizePlayerData } from '../utils/playerData';
import { getMoveUsageCount, getMilestoneProgress, claimMilestoneRewards, MANIFEST_MILESTONES } from '../utils/manifestTracking';
import { MOVE_TEMPLATES } from '../types/battle';
import EditRivalModal from '../components/EditRivalModal';
import { getRivals } from '../utils/rivalService';
import { UniversalLawSkillTreePage } from '../components/skillTree/UniversalLawSkillTreePage';
import { getMergedRRCandyStatus, getRRCandyStatus } from '../utils/rrCandyUtils';
import { normalizePlayerPowerStats } from '../utils/liveEventPowerStatsService';
import PowerStatProgressBar from '../components/PowerStatProgressBar';
import WaysToEarnPowerPointsModal from '../components/WaysToEarnPowerPointsModal';
import {
  artifactRequiresUxpStyleApproval,
  markUserArtifactPendingStaffApproval,
} from '../utils/artifactsRequiringStaffApproval';
import type { MstCivicPlayerState } from '../types/mstCivicEconomy';
import {
  getPlayerState,
  getTaxSettings,
  nextTaxCollectionMs,
  refreshShutdownIfExpired,
} from '../utils/mstCivicEconomyService';

function formatCivicTaxCountdown(targetMs: number, nowMs: number): string {
  const ms = Math.max(0, targetMs - nowMs);
  if (ms < 1000) return 'Due now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Import marketplace items to match legacy items
const marketplaceItems = [
  { 
    id: 'checkin-free',
    name: 'Get Out of Check-in Free', 
    description: 'Skip the next check-in requirement', 
    price: 50, 
    icon: '🎫', 
    image: '/images/Get-Out-of-Check-in-Free.png',
    category: 'protection',
    rarity: 'common'
  },
  { 
    id: 'shield',
    name: 'Shield', 
    description: 'Block the next incoming attack on your vault', 
    price: 25, 
    icon: '🛡️', 
    image: '/images/Shield Item.jpeg',
    category: 'protection',
    rarity: 'common'
  }
  // Add more items as needed
];

// Function to enhance legacy items with marketplace data
const enhanceLegacyItem = (item: any) => {
  if (typeof item === 'string') {
    const marketplaceItem = marketplaceItems.find(mi => mi.name === item);
    if (marketplaceItem) {
      return {
        id: marketplaceItem.id,
        name: marketplaceItem.name,
        description: marketplaceItem.description,
        icon: marketplaceItem.icon,
        image: marketplaceItem.image,
        category: marketplaceItem.category,
        rarity: marketplaceItem.rarity,
        purchasedAt: null,
        used: false,
        isLegacy: true
      };
    }
  }
  return item;
};

// Helper function to determine if an artifact is equippable (should be shown on Artifacts page, not Profile)
const isEquippableArtifact = (artifact: any): boolean => {
  if (!artifact) return false;
  
  const enhanced = enhanceLegacyItem(artifact);
  const artifactId = enhanced.id || (typeof artifact === 'string' ? artifact : '');
  const artifactName = (enhanced.name || '').toLowerCase();
  const category = enhanced.category || '';
  
  // Check by category
  if (category === 'armor' || category === 'accessory') {
    return true;
  }
  
  // Check by ID patterns (helmets, rings)
  const equippablePatterns = [
    'helmet',
    'ring',
    'captain',
    'blaze-ring',
    'terra-ring',
    'aqua-ring',
    'air-ring',
    'elemental-ring'
  ];
  
  if (equippablePatterns.some(pattern => artifactId.toLowerCase().includes(pattern))) {
    return true;
  }
  
  // Check by name patterns
  if (equippablePatterns.some(pattern => artifactName.includes(pattern))) {
    return true;
  }
  
  // Check if description mentions "Equip"
  const description = (enhanced.description || '').toLowerCase();
  if (description.includes('equip') || description.includes('equip to')) {
    return true;
  }
  
  return false;
};



const Profile = () => {
  type SprintActivityLog = {
    id: string;
    sprintTitle?: string;
    sprintType?: string;
    status?: string;
    joinedAt?: unknown;
    completedAt?: unknown;
    missedAt?: unknown;
    completionTime?: number | null;
    weekId?: string;
  };

  type QuizActivityLog = {
    id: string;
    attemptId?: string;
    quizTopic?: string;
    scorePercent?: number;
    completedAt?: unknown;
    weekId?: string;
    totalQuestions?: number;
    correctAnswers?: number;
    /** 'live' when synced from a live event session; 'solo' for Training Grounds solo, etc. */
    mode?: string;
  };

  const { currentUser, activeTestAccountId, currentRole } = useAuth();
  const { syncVaultPP, vault, moves: battleMoves, refreshVaultData } = useBattle();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ppBoostStatus, setPpBoostStatus] = useState<{ isActive: boolean; timeRemaining: string; multiplier: number }>({ isActive: false, timeRemaining: '', multiplier: 1 });
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  // Add state for manifest, style, and rarity
  const [manifest, setManifest] = useState(userData?.manifest || 'None');
  const [style, setStyle] = useState(userData?.manifestationType || '');
  const [rarity, setRarity] = useState(userData?.rarity || 1);
  const [cardBgColor, setCardBgColor] = useState(userData?.cardBgColor || '#0B1220');
  const [cardFrameShape, setCardFrameShape] = useState<'circular' | 'rectangular'>('circular');
  const [cardBorderColor, setCardBorderColor] = useState(userData?.cardBorderColor || '#D4AF37');
  const [cardImageBorderColor, setCardImageBorderColor] = useState(userData?.cardImageBorderColor || '#D4AF37');
  const [moves, setMoves] = useState(userData?.moves || []);
  const [newMove, setNewMove] = useState({ name: '', description: '', icon: '' });
  const [badges, setBadges] = useState(userData?.badges || []);
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [nextChallenge, setNextChallenge] = useState<any>(null);
  const [squadAbbreviation, setSquadAbbreviation] = useState<string | null>(null);
  const [isSkillTreeShowing, setIsSkillTreeShowing] = useState(false);
  /** True if battleMoves already has RR Candy skills (unlock even when journey chapter shape differs) */
  const [skillTreeUnlockedFromBattleMoves, setSkillTreeUnlockedFromBattleMoves] = useState(false);
  /** users + students merged RR candy (candyChoice often lives on only one doc) */
  const [rrCandyMergedStatus, setRRCandyMergedStatus] = useState<ReturnType<typeof getMergedRRCandyStatus> | null>(null);
  const [showEditRivalModal, setShowEditRivalModal] = useState(false);
  const [rivals, setRivals] = useState<{ chosen?: any; inbound?: any }>({});
  const [showPowerBreakdown, setShowPowerBreakdown] = useState(false);
  const [showWaysToEarnPpModal, setShowWaysToEarnPpModal] = useState(false);
  const [profilePowerStatHover, setProfilePowerStatHover] = useState<PowerStatBranch | null>(null);
  const [productivityStats, setProductivityStats] = useState<ProductivityStatDoc | null | undefined>(undefined);
  const [productivityActivityLoading, setProductivityActivityLoading] = useState(false);
  const [recentSprintActivity, setRecentSprintActivity] = useState<SprintActivityLog[]>([]);
  const [recentLiveEventQuizActivity, setRecentLiveEventQuizActivity] = useState<QuizActivityLog[]>([]);
  const [examHistory, setExamHistory] = useState<ExamProductivityLog[]>([]);
  const [showAllExamHistory, setShowAllExamHistory] = useState(false);
  const [civicState, setCivicState] = useState<MstCivicPlayerState | null | undefined>(undefined);
  const [profileTaxPreview, setProfileTaxPreview] = useState<{ nextMs: number; owedPp: number } | null>(null);
  const [, setTaxCountdownTick] = useState(0);
  const powerCardRowRef = useRef<HTMLDivElement>(null);
  const [powerCardHeight, setPowerCardHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = powerCardRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setPowerCardHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [userData?.photoURL, userData?.powerLevel, userData?.xp, playerManifest, isSkillTreeShowing]);

  // Function to get manifest color
  const getManifestColor = (manifestName: string) => {
    const manifest = MANIFESTS.find(m => m.name === manifestName);
    return manifest ? manifest.color : '#6b7280'; // Default gray if not found
  };

  // Function to get element color
  const getElementColor = (elementName: string) => {
    return getElementDisplayColor(elementName);
  };

  const fetchUserData = async () => {
    if (!currentUser) return;
    
    // Helper to check for Firestore internal errors
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorStack = error?.stack || '';
      return (
        errorString.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorStack.includes('INTERNAL ASSERTION FAILED') ||
        errorString.includes('ID: ca9') ||
        errorString.includes('ID: b815') ||
        (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
      );
    };
    
    try {
      // Fetch from both collections
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      const battleMovesRef = doc(db, 'battleMoves', currentUser.uid);
      
      const [studentsSnap, usersSnap, battleMovesSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef),
        getDoc(battleMovesRef)
      ]);

      // RR Candy / skill-tree unlock from moves (same idea as Skill Mastery)
      if (battleMovesSnap.exists()) {
        const rawMoves = battleMovesSnap.data().moves;
        const hasRrCandy =
          Array.isArray(rawMoves) &&
          rawMoves.some((m: any) => String(m?.id || '').toLowerCase().startsWith('rr-candy-'));
        setSkillTreeUnlockedFromBattleMoves(hasRrCandy);
      } else {
        setSkillTreeUnlockedFromBattleMoves(false);
      }
      
      if (studentsSnap.exists()) {
        const userDataFromDB = studentsSnap.data();
        
        // Migrate rarity from old default (3) to new default (1)
        let rarityValue = userDataFromDB.rarity;
        if (rarityValue === 3 || rarityValue === undefined) {
          rarityValue = 1;
          // Update the database with the new rarity value
          const userRef = doc(db, 'students', currentUser.uid);
          updateDoc(userRef, { rarity: 1 }).catch(error => {
            if (isFirestoreInternalError(error)) {
              console.warn('Profile: Firestore internal assertion error during rarity update - ignoring');
              return;
            }
            console.error('Error updating rarity:', error);
          });
        }
        
        // Get artifacts from users collection
        let artifacts = [];
        if (usersSnap.exists()) {
          try {
            const usersData = usersSnap.data();
            artifacts = usersData.artifacts || [];
            console.log('Profile: Loaded artifacts from users collection:', artifacts);
          } catch (artifactError) {
            if (isFirestoreInternalError(artifactError)) {
              console.warn('Profile: Firestore internal assertion error when reading artifacts - using empty array');
              artifacts = [];
            } else {
              console.error('Profile: Error reading artifacts:', artifactError);
              artifacts = [];
            }
          }
        }
        
        // Merge students + users chapters so we never wipe journey data when users/{uid}.chapters is missing/empty
        const studentsChapters =
          userDataFromDB.chapters && typeof userDataFromDB.chapters === 'object' ? userDataFromDB.chapters : {};
        const usersChapters =
          usersSnap.exists() && usersSnap.data().chapters && typeof usersSnap.data().chapters === 'object'
            ? usersSnap.data().chapters
            : {};
        const mergedChapters =
          mergeChaptersProgressMaps(usersChapters, studentsChapters) ??
          { ...studentsChapters, ...usersChapters };

        // Merge students data with users artifacts and merged chapters
        const mergedUserData = {
          ...userDataFromDB,
          artifacts: artifacts,
          chapters: mergedChapters
        };
        
        // Determine element: prioritize chosen_element / elementalAffinity — never invent Fire
        const chosenElement =
          extractElementOrNull(
            usersSnap.exists() ? usersSnap.data() : {},
            userDataFromDB
          );
        const displayElement = formatElementDisplayLabel(chosenElement);
        
        setUserData(mergedUserData);
        setRRCandyMergedStatus(
          getMergedRRCandyStatus(usersSnap.exists() ? usersSnap.data() : {}, userDataFromDB)
        );
        setDisplayName(userDataFromDB.displayName || currentUser.displayName || '');
        setBio(userDataFromDB.bio || '');
        // Extract manifestId correctly - handle both object and string formats
        let manifestId = 'None';
        if (userDataFromDB.manifest) {
          if (typeof userDataFromDB.manifest === 'object' && userDataFromDB.manifest.manifestId) {
            manifestId = userDataFromDB.manifest.manifestId;
          } else if (typeof userDataFromDB.manifest === 'string') {
            manifestId = userDataFromDB.manifest;
          }
        }
        setManifest(manifestId);
        setStyle(displayElement);
        setRarity(rarityValue);
        setCardBgColor(userDataFromDB.cardBgColor || '#0B1220');
        // Validate cardFrameShape to ensure it's either 'circular' or 'rectangular'
        const frameShape = userDataFromDB.cardFrameShape;
        setCardFrameShape(
          frameShape === 'circular' || frameShape === 'rectangular' 
            ? frameShape 
            : 'circular'
        );
        setCardBorderColor(userDataFromDB.cardBorderColor || '#D4AF37');
        setCardImageBorderColor(userDataFromDB.cardImageBorderColor || '#D4AF37');
        // Use battle loadout moves (battleMoves) when available so Elemental Move Progress sees same moves as Battle/Skills & Mastery
        const battleMovesList = battleMovesSnap.exists() ? battleMovesSnap.data().moves : null;
        setMoves(Array.isArray(battleMovesList) && battleMovesList.length > 0 ? battleMovesList : (userDataFromDB.moves || []));
        setBadges(userDataFromDB.badges || []);
        
        // Find the next available challenge
        const nextChallengeData = findNextChallenge(mergedUserData, userDataFromDB);
        setNextChallenge(nextChallengeData);
        
        // Load manifest data
        const manifestData = studentsSnap.data().manifest;
        if (manifestData) {
          // Convert Firestore timestamp to Date if needed
          const processedManifest = {
            ...manifestData,
            lastAscension: manifestData.lastAscension?.toDate ? 
              manifestData.lastAscension.toDate() : 
              new Date(manifestData.lastAscension)
          };
          setPlayerManifest(processedManifest);
        } else {
          // No manifest found - automatically show selection
          setShowManifestSelection(true);
        }
        
        // Fetch squad abbreviation
        const abbreviation = await getUserSquadAbbreviation(currentUser.uid);
        setSquadAbbreviation(abbreviation);
        
        // Fetch rivals
        const rivalsData = await getRivals(currentUser.uid);
        setRivals(rivalsData);

        // Recompute PL from equipped artifacts/skills (fixes stale Firestore + merge bugs) then refresh UI
        try {
          const { recalculatePowerLevel } = await import('../services/recalculatePowerLevel');
          await recalculatePowerLevel(currentUser.uid);
          const refreshedStudent = await getDoc(doc(db, 'students', currentUser.uid));
          if (refreshedStudent.exists()) {
            const sd = refreshedStudent.data();
            setUserData((prev: any) =>
              prev
                ? {
                    ...prev,
                    powerLevel: sd.powerLevel ?? prev.powerLevel,
                    powerBreakdown: sd.powerBreakdown ?? prev.powerBreakdown,
                  }
                : prev
            );
          }
        } catch (plErr) {
          console.error('Profile: Power level sync failed', plErr);
        }
      } else {
        // Create user document if it doesn't exist
        setUserData({ xp: 0, powerPoints: 0, truthMetal: 0, challenges: {}, level: 1, rarity: 1, artifacts: [] });
        setRRCandyMergedStatus(
          getMergedRRCandyStatus(usersSnap.exists() ? usersSnap.data() : {}, null)
        );
      }
    } catch (error) {
      if (isFirestoreInternalError(error)) {
        console.warn('Profile: Firestore internal assertion error when fetching user data - ignoring');
        // Still set loading to false so UI doesn't hang
        setLoading(false);
        return;
      }
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load and update PP boost status
  useEffect(() => {
    if (!currentUser) return;
    
    const loadPPBoostStatus = async () => {
      try {
        const activeBoost = await getActivePPBoost(currentUser.uid);
        const status = getPPBoostStatus(activeBoost);
        setPpBoostStatus(status);
      } catch (error) {
        console.error('Error loading PP boost status:', error);
      }
    };
    
    loadPPBoostStatus();
    
    // Update countdown every second for real-time display
    const interval = setInterval(() => {
      loadPPBoostStatus();
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setProductivityStats(undefined);
      return;
    }
    const ref = doc(db, 'productivityStats', currentUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProductivityStats({
            userId: currentUser.uid,
            ...(snap.data() as object),
          } as ProductivityStatDoc);
        } else {
          setProductivityStats(null);
        }
      },
      () => setProductivityStats(null)
    );
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setCivicState(undefined);
      setProfileTaxPreview(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const settings = await getTaxSettings();
        await refreshShutdownIfExpired(currentUser.uid);
        const s = await getPlayerState(currentUser.uid);
        if (!cancelled) setCivicState(s);
        const nextFromState =
          s?.nextTaxDate && typeof s.nextTaxDate === 'number' && s.nextTaxDate > Date.now()
            ? s.nextTaxDate
            : null;
        const nextMs = nextFromState ?? nextTaxCollectionMs(settings, Date.now());
        const disc = Math.min(100, Math.max(0, Math.floor(s?.taxDiscountPercent ?? 0)));
        const base = Math.max(0, Math.floor(settings.baseWeeklyTaxPp || 0));
        const owedPp = Math.max(0, Math.floor((base * (100 - disc)) / 100));
        if (!cancelled) setProfileTaxPreview({ nextMs, owedPp });
      } catch {
        if (!cancelled) {
          setCivicState(null);
          try {
            const settings = await getTaxSettings();
            const nextMs = nextTaxCollectionMs(settings, Date.now());
            const owedPp = Math.max(0, Math.floor(settings.baseWeeklyTaxPp || 0));
            if (!cancelled) setProfileTaxPreview({ nextMs, owedPp });
          } catch {
            if (!cancelled) setProfileTaxPreview(null);
          }
        }
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !profileTaxPreview) return;
    const id = window.setInterval(() => setTaxCountdownTick((c) => c + 1), 1000);
    return () => window.clearInterval(id);
  }, [currentUser, profileTaxPreview?.nextMs]);

  useEffect(() => {
    let cancelled = false;
    const loadProductivityActivity = async () => {
      if (!currentUser) {
        setRecentSprintActivity([]);
        setRecentLiveEventQuizActivity([]);
        setExamHistory([]);
        return;
      }
      setProductivityActivityLoading(true);
      try {
        const sprintPrimaryQuery = query(
          collection(db, 'sprintProductivityLogs'),
          where('userId', '==', currentUser.uid),
          orderBy('joinedAt', 'desc'),
          limit(8)
        );
        const quizPrimaryQuery = query(
          collection(db, 'quizProductivityLogs'),
          where('userId', '==', currentUser.uid),
          orderBy('completedAt', 'desc'),
          limit(50)
        );

        let sprintDocs;
        let quizDocs;
        try {
          [sprintDocs, quizDocs] = await Promise.all([
            getDocs(sprintPrimaryQuery),
            getDocs(quizPrimaryQuery),
          ]);
        } catch {
          const sprintFallback = query(
            collection(db, 'sprintProductivityLogs'),
            where('userId', '==', currentUser.uid),
            limit(20)
          );
          const quizFallback = query(
            collection(db, 'quizProductivityLogs'),
            where('userId', '==', currentUser.uid),
            limit(80)
          );
          [sprintDocs, quizDocs] = await Promise.all([
            getDocs(sprintFallback),
            getDocs(quizFallback),
          ]);
        }

        const sprintRows = sprintDocs.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) } as SprintActivityLog))
          .sort((a, b) => {
            const aMs = tsMs(a.completedAt || a.joinedAt || a.missedAt) || 0;
            const bMs = tsMs(b.completedAt || b.joinedAt || b.missedAt) || 0;
            return bMs - aMs;
          })
          .slice(0, 8);
        const allQuizRows = quizDocs.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              ...(data as object),
              attemptId: typeof data.attemptId === 'string' ? data.attemptId : undefined,
            } as QuizActivityLog;
          })
          .sort((a, b) => (tsMs(b.completedAt) || 0) - (tsMs(a.completedAt) || 0));
        const liveQuizRows = allQuizRows
          .filter(
            (q) =>
              q.mode === 'live' &&
              !isLegacyExamQuizAttemptId(q.attemptId) &&
              !q.id.includes('__live_exam_')
          )
          .slice(0, 3);

        const exams = await loadExamHistoryForUser(currentUser.uid, 24);

        if (cancelled) return;
        setRecentSprintActivity(sprintRows);
        setRecentLiveEventQuizActivity(liveQuizRows);
        setExamHistory(exams);
      } catch (error) {
        console.warn('Profile: unable to load productivity activity logs', error);
        if (!cancelled) {
          setRecentSprintActivity([]);
          setRecentLiveEventQuizActivity([]);
          setExamHistory([]);
        }
      } finally {
        if (!cancelled) setProductivityActivityLoading(false);
      }
    };

    void loadProductivityActivity();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const userId = currentUser.uid; // Store in variable for TypeScript
    fetchUserData();
    
    // Helper to check for Firestore internal errors
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorStack = error?.stack || '';
      return (
        errorString.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorStack.includes('INTERNAL ASSERTION FAILED') ||
        errorString.includes('ID: ca9') ||
        errorString.includes('ID: b815') ||
        (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
      );
    };

      // Set up real-time listener for manifest data in students collection
      // This ensures ability usage counts update automatically when moves are used in battles
      const studentsRef = doc(db, 'students', userId);
      const unsubscribeManifest = onSnapshot(studentsRef, (doc) => {
        if (doc.exists()) {
          const userData = doc.data();
          const manifestData = userData.manifest;
          if (manifestData) {
            // Convert Firestore timestamp to Date if needed
            const processedManifest = {
              ...manifestData,
              lastAscension: manifestData.lastAscension?.toDate ? 
                manifestData.lastAscension.toDate() : 
                (manifestData.lastAscension ? new Date(manifestData.lastAscension) : new Date())
            };
            setPlayerManifest(processedManifest);
            console.log('[Profile] Manifest data updated via real-time listener:', {
              abilityUsage: processedManifest.abilityUsage,
              moveUsage: processedManifest.moveUsage
            });
          }
        }
      }, (error) => {
        if (!error.message?.includes('INTERNAL ASSERTION FAILED') && 
            !error.message?.includes('Unexpected state')) {
          console.error('Profile: Error in manifest listener:', error);
        }
      });

      // Set up real-time listener for rivals in users collection
      // Use getRivals to fetch latest displayNames
      const usersRef = doc(db, 'users', userId);
      const unsubscribeRivals = onSnapshot(usersRef, async (docSnapshot) => {
        try {
          if (docSnapshot.exists()) {
            // Use getRivals to fetch latest displayNames from Firestore
            const rivalsData = await getRivals(userId);
            setRivals(rivalsData);
          }
        } catch (error) {
          console.error('Error updating rivals from real-time listener:', error);
        }
      });

    // Cleanup function for all listeners
    return () => {
      if (unsubscribeManifest) {
        unsubscribeManifest();
      }
      if (unsubscribeRivals) {
        unsubscribeRivals();
      }
    };
  }, [currentUser, navigate]);

  // Handle query parameters for skill tree view
  const [searchParams] = useSearchParams();
  const skillTreeView = searchParams.get('view');
  const skillTreeModeParam = searchParams.get('mode');
  const returnMissionId = searchParams.get('returnMission');
  const missionPpGranted = searchParams.get('missionPp');
  const fromMission =
    !!returnMissionId && /^[a-zA-Z0-9_-]+$/.test(returnMissionId);
  const safeReturnMissionPath = fromMission
    ? `/mission/${encodeURIComponent(returnMissionId!)}/play`
    : null;

  useEffect(() => {
    // If query params indicate skill tree view, show it
    if (skillTreeView === 'skill-tree') {
      setIsSkillTreeShowing(true);
    }
  }, [skillTreeView]);

  /** Skill tree on Profile: merged users+students RR status + any rr-candy-* moves in battleMoves */
  const rrProfileSkill = useMemo(() => {
    const rr = rrCandyMergedStatus ?? getRRCandyStatus(userData || {});
    return {
      hasAccess: skillTreeUnlockedFromBattleMoves || rr.unlocked,
      candyType: rr.candyType || 'on-off',
    };
  }, [userData, skillTreeUnlockedFromBattleMoves, rrCandyMergedStatus]);

  const profilePowerStats = useMemo(
    () => normalizePlayerPowerStats(userData?.stats),
    [userData?.stats]
  );

  // Note: RR Candy moves are now managed entirely in Skill Mastery (Battle Arena)
  // No longer needed to ensure RR Candy moves in Profile

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) {
      console.log('No file selected or no user');
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size too large. Please select an image smaller than 5MB.');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, GIF, etc.)');
      return;
    }

    console.log('Starting upload for file:', file.name, 'Size:', file.size, 'Type:', file.type);
    setUploading(true);
    
    try {
      // Add timestamp to filename to avoid conflicts
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `avatar_${timestamp}.${fileExtension}`;
      
      const storageRef = ref(storage, `profile_pictures/${currentUser.uid}/${fileName}`);
      console.log('Uploading to storage reference:', storageRef.fullPath);
      
      // Upload with metadata
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: currentUser.uid,
          uploadedAt: new Date().toISOString()
        }
      });
      console.log('Upload successful:', uploadResult);
      
      const downloadURL = await getDownloadURL(storageRef);
      console.log('Download URL:', downloadURL);
      
      // Update Firebase Auth profile
      await updateProfile(currentUser, { photoURL: downloadURL });
      console.log('Firebase Auth profile updated');
      
      // Update Firestore
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { photoURL: downloadURL });
      console.log('Firestore updated');
      
      // Update local state instead of reloading
      setUserData((prev: any) => ({ ...prev, photoURL: downloadURL }));
      
      // Force a small delay to ensure state updates, then show success
      setTimeout(() => {
        alert('Avatar updated successfully! If you have a display name set, the "Update Your Profile" challenge will be automatically completed.');
      }, 100);
      
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      console.error('Error code:', error.code);
      console.error('Error details:', error.details);
      
      let errorMessage = 'Upload failed: ';
      if (error.code === 'storage/unauthorized') {
        errorMessage += 'You are not authorized to upload files. Please make sure you are logged in.';
      } else if (error.code === 'storage/canceled') {
        errorMessage += 'Upload was canceled.';
      } else if (error.code === 'storage/unknown') {
        errorMessage += 'An unknown error occurred. This might be a network issue or server problem. Please try again.';
      } else if (error.code === 'storage/invalid-format') {
        errorMessage += 'Invalid file format. Please select a valid image file.';
      } else if (error.code === 'storage/invalid-checksum') {
        errorMessage += 'File corruption detected. Please try uploading the file again.';
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) {
      alert('❌ Error: No user logged in. Please log in and try again.');
      return;
    }

    try {
      setUploading(true);
      
      // Get fresh auth user reference to avoid stale user object issues
      const auth = getAuth();
      const authUser = auth.currentUser;
      // Never write Auth displayName while impersonating a test account — Auth stays the real
      // admin/user, while Firestore writes go to the test uid. Polluting Auth caused wrong
      // battle names (e.g. "9th Justice") for the real account after test switches.
      const isImpersonatingTestAccount =
        currentRole === 'test' ||
        !!activeTestAccountId ||
        (!!authUser && !!currentUser && authUser.uid !== currentUser.uid);

      if (
        !isImpersonatingTestAccount &&
        authUser &&
        displayName &&
        displayName.trim() !== ''
      ) {
        try {
          await updateProfile(authUser, { displayName });
        } catch (authError) {
          // If auth update fails, log but continue with Firestore update
          console.warn('Failed to update Firebase Auth profile:', authError);
        }
      }
      
      // Prepare update data — do not invent an Element when none is chosen
      const elementForSave = hasElementSelected(style) ? style : null;
      const updateData: any = {
        displayName: displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        bio: bio || '',
        manifest: manifest || 'None',
        manifestationType: elementForSave,
        elementalAffinity: elementForSave,
        rarity: rarity || 1,
        cardBgColor: cardBgColor || '#0B1220',
        cardFrameShape: cardFrameShape || 'circular',
        cardBorderColor: cardBorderColor || '#D4AF37',
        cardImageBorderColor: cardImageBorderColor || '#D4AF37',
        moves: moves || [],
        updatedAt: new Date()
      };
      
      // Update both Firestore collections to keep them in sync
      const studentRef = doc(db, 'students', currentUser.uid);
      const userRef = doc(db, 'users', currentUser.uid);
      
      // Update students collection
      await updateDoc(studentRef, updateData);
      
      // Update users collection
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, updateData);
      } else {
        // Create user document if it doesn't exist
        await setDoc(userRef, {
          ...updateData,
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || null,
          createdAt: new Date()
        });
      }
      
      // Update local state
      setEditing(false);
      setUserData((prev: any) => ({ 
        ...prev, 
        displayName: updateData.displayName, 
        bio: updateData.bio, 
        manifest: updateData.manifest, 
        manifestationType: updateData.manifestationType, 
        rarity: updateData.rarity, 
        cardBgColor: updateData.cardBgColor, 
        cardFrameShape: updateData.cardFrameShape, 
        cardBorderColor: updateData.cardBorderColor, 
        cardImageBorderColor: updateData.cardImageBorderColor, 
        moves: updateData.moves 
      }));
      
      // Refresh user data from Firestore to ensure UI is up to date
      const refreshedStudentDoc = await getDoc(studentRef);
      if (refreshedStudentDoc.exists()) {
        const refreshedData = refreshedStudentDoc.data();
        setUserData((prev: any) => ({ ...prev, ...refreshedData }));
      }
      
      // Check if profile is now complete for auto-completion
      const hasDisplayName = displayName && displayName.trim() !== '';
      const hasAvatar = userData?.photoURL && userData.photoURL.trim() !== '';
      
      if (hasDisplayName && hasAvatar) {
        alert('✅ Profile updated successfully! If you have Chapter 1 active, the "Update Your Profile" challenge will be automatically completed.');
      } else {
        alert('✅ Profile updated successfully! Complete your profile with a display name and avatar to auto-complete the profile challenge.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(`❌ Error updating profile: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    } finally {
      setUploading(false);
    }
  };



  const handleManifestSelect = async (manifestId: string) => {
    if (!currentUser) return;

    try {
      const { savePlayerManifestSelection } = await import('../utils/playerManifestSelection');
      const newPlayerManifest = await savePlayerManifestSelection(
        currentUser.uid,
        manifestId,
        playerManifest
      );
      setPlayerManifest(newPlayerManifest);
      setUserData((prev: any) => ({ ...prev, manifest: newPlayerManifest }));
      setShowManifestSelection(false);
      try {
        await refreshVaultData?.();
      } catch {
        /* optional battle context refresh */
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Manifest change cancelled') {
        return;
      }
      console.error('Error setting manifest:', error);
      alert(error instanceof Error ? error.message : 'Failed to set manifest. Please try again.');
    }
  };

  const handleVeilBreak = async (veilId: string) => {
    if (!currentUser || !playerManifest) return;

    // Simple veil breaking logic - could be expanded
    const newVeil = 'Need for validation'; // Next veil
    const updatedManifest = {
      ...playerManifest,
      veil: newVeil
    };

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: updatedManifest });
      setPlayerManifest(updatedManifest);
      
      // Recalculate power level after manifest update (veil break might affect ascension)
      try {
        const { recalculatePowerLevel } = await import('../services/recalculatePowerLevel');
        await recalculatePowerLevel(currentUser.uid);
      } catch (plError) {
        console.error('Error recalculating power level after veil break:', plError);
        // Don't throw - power level recalculation is non-critical
      }
      
      alert('Veil broken! New challenge awaits.');
    } catch (error) {
      console.error('Error breaking veil:', error);
      alert('Failed to break veil. Please try again.');
    }
  };

  /** UXP credits and Assignment Pass stay out of “Available” while awaiting staff approval */
  const isAwaitingStaffArtifactApproval = (artifact: any): boolean =>
    artifactRequiresUxpStyleApproval(artifact) &&
    (artifact.pendingApproval === true ||
      artifact.approvalStatus === 'pending' ||
      artifact.pending === true);

  // Function to handle admin approval/rejection of UXP artifacts
  // UXP credits are ONLY applied after admin approval - they are marked as "pending" when used
  const handleAdminResponse = async (artifactName: string, approved: boolean) => {
    if (!currentUser) return;
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.map((artifact: any) => {
          if (artifact.name === artifactName && artifact.pending) {
            if (approved) {
              // Mark as used and remove from inventory
              return { ...artifact, used: true, pending: false, approvedAt: new Date() };
            } else {
              // Reject - remove pending status
              return { ...artifact, pending: false, rejectedAt: new Date() };
            }
          }
          return artifact;
        }) : [];
        
        await updateDoc(userRef, {
          artifacts: updatedArtifacts
        });
        
        // If approved, also remove from students inventory
        if (approved) {
          const studentsRef = doc(db, 'students', currentUser.uid);
          const studentsSnap = await getDoc(studentsRef);
          if (studentsSnap.exists()) {
            const studentsData = studentsSnap.data();
            const currentInventory = studentsData.inventory || [];
            const updatedInventory = currentInventory.filter((item: string) => item !== artifactName);
            
            await updateDoc(studentsRef, {
              inventory: updatedInventory
            });
          }
        }
        
        // Refresh user data
        const updatedUserSnap = await getDoc(userRef);
        if (updatedUserSnap.exists()) {
          const updatedUserData = updatedUserSnap.data();
          setUserData(updatedUserData);
        }
        
        console.log(`✅ UXP artifact ${approved ? 'approved' : 'rejected'}:`, artifactName);
      }
    } catch (error) {
      console.error('Error handling admin response:', error);
    }
  };

  if (loading) {
    return (
      <div className="mst-profile-loading">
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const level = userData ? getLevelFromXP(userData.xp || 0) : 1;
  const powerLevel = userData?.powerLevel || null;
  const powerBreakdown = userData?.powerBreakdown || null;
  const avatarUrl = userData?.photoURL || currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || currentUser.email}&background=4f46e5&color=fff&size=128`;

  // Get the current manifest name from playerManifest state
  const currentManifest = playerManifest ? 
    MANIFESTS.find(m => m.id === playerManifest.manifestId)?.name || 'None' : 
    'None';

  // Helper function to convert rarity number to stars
  const getRarityStars = (rarityLevel: number) => {
    return Array.from({ length: rarityLevel }, (_, i) => (
      <span key={i} className="mst-power-rarity">★</span>
    ));
  };

  // Add the same items array as in Marketplace for reference
  const items = [
    { name: 'Sleep - In 30 min', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Sleep - In 1 hr', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Shield', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Lunch Extension (+15)', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  ];

  return (
    <div className="mst-profile-page">
      {safeReturnMissionPath && (
        <div className="mst-profile-mission">
          <div className="mst-profile-mission-text">
            <strong>Mission: Power Card</strong>
            {missionPpGranted && Number(missionPpGranted) > 0 ? (
              <span>
                {' '}
                — +{Number(missionPpGranted).toLocaleString()} PP from this step. Review your card, then return.
              </span>
            ) : (
              <span> — Review your Power Card and profile, then return to continue the mission.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(safeReturnMissionPath)}
            className="mst-profile-mission-btn"
          >
            Return to mission
          </button>
        </div>
      )}

      {/* Header with Level and Power Level */}
      <div className="mst-profile-hero">
        <div className="mst-profile-hero-titles">
          <h1 className="mst-profile-hero-title">Your Profile</h1>
          <p className="mst-profile-hero-sub">Ignite Your Purpose</p>
        </div>
        <span className="mst-profile-hero-motto" aria-hidden="true">Knowledge is Power</span>
        {powerLevel !== null && (
          <div
            className="mst-profile-pl"
            onClick={() => setShowPowerBreakdown(!showPowerBreakdown)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowPowerBreakdown(!showPowerBreakdown);
              }
            }}
          >
            <span className="mst-profile-pl-icon">⚡</span>
            <div className="mst-profile-pl-meta">
              <div className="mst-profile-pl-label">Power Level</div>
              <div className="mst-profile-pl-value">{powerLevel}</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Power Level Breakdown Panel */}
      {showPowerBreakdown && powerBreakdown && (
        <div className="mst-profile-breakdown">
          <div className="mst-profile-breakdown-head">
            <h2 className="mst-profile-breakdown-title">
              <span>⚡</span>
              Power Level Breakdown
            </h2>
            <button
              onClick={() => setShowPowerBreakdown(false)}
              className="mst-profile-breakdown-close"
              type="button"
              aria-label="Close power breakdown"
            >
              ×
            </button>
          </div>
          
          <div className="mst-profile-breakdown-grid">
            <div className="mst-profile-breakdown-cell">
              <div className="mst-profile-breakdown-cell-label">Base (Level)</div>
              <div className="mst-profile-breakdown-cell-value">{powerBreakdown.base}</div>
              <div className="mst-profile-breakdown-cell-hint">Level {level} × 10</div>
            </div>
            
            <div className="mst-profile-breakdown-cell">
              <div className="mst-profile-breakdown-cell-label">Skills</div>
              <div className="mst-profile-breakdown-cell-value mst-profile-breakdown-cell-value--skills">
                +{powerBreakdown.skills}
              </div>
              <div className="mst-profile-breakdown-cell-hint">Equipped skills</div>
            </div>
            
            <div className="mst-profile-breakdown-cell">
              <div className="mst-profile-breakdown-cell-label">Artifacts</div>
              <div className="mst-profile-breakdown-cell-value mst-profile-breakdown-cell-value--artifacts">
                +{powerBreakdown.artifacts}
              </div>
              <div className="mst-profile-breakdown-cell-hint">Equipped artifacts</div>
            </div>
            
            <div className="mst-profile-breakdown-cell">
              <div className="mst-profile-breakdown-cell-label">Ascension</div>
              <div className="mst-profile-breakdown-cell-value mst-profile-breakdown-cell-value--ascension">
                +{powerBreakdown.ascension}
              </div>
              <div className="mst-profile-breakdown-cell-hint">Manifest ascension</div>
            </div>
          </div>
          
          <div className="mst-profile-breakdown-total">
            <div className="mst-profile-breakdown-total-label">Total Power Level</div>
            <div className="mst-profile-breakdown-total-value">{powerLevel}</div>
          </div>
        </div>
      )}
      
      {/* Two-column layout: Left (Player Card + Journey) and Right (Profile Settings) */}
      <div className="mst-profile-layout">
        {/* Left Column - Power Card (height drives Profile Settings cap) */}
        <div
          ref={powerCardRowRef}
          className="mst-profile-card-col"
        >
          {/* Player Card on top */}
          <div className="mst-profile-card-wrap">
            <PlayerCard
              key={`${userData?.photoURL}-${displayName}`} // Force re-render when avatar or name changes
              name={displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}
              photoURL={userData?.photoURL || currentUser.photoURL || avatarUrl}
              powerPoints={userData?.powerPoints || 0}
              truthMetal={userData?.truthMetal || 0}
              manifest={currentManifest}
              level={level}
              powerLevel={powerLevel}
              powerBreakdown={powerBreakdown}
              rarity={rarity}
              style={style}
              description={bio}
              cardBgColor={cardBgColor}
              cardFrameShape={cardFrameShape}
              cardBorderColor={cardBorderColor}
              cardImageBorderColor={cardImageBorderColor}
              moves={moves}
              badges={badges}
              xp={userData?.xp || 0}
              userId={currentUser?.uid}
              onManifestReselect={() => setShowManifestSelection(true)}
              ordinaryWorld={userData?.ordinaryWorld}
              journeyStageContent={userData?.journeyStageContent}
              squadAbbreviation={squadAbbreviation}
              hasSkillTreeAccess={rrProfileSkill.hasAccess}
              candyType={rrProfileSkill.candyType}
              onSkillTreeToggle={setIsSkillTreeShowing}
              initialSkillTreeMode={(skillTreeModeParam === 'irl' ? 'irl' : 'in-game') as 'in-game' | 'irl'}
              powerStats={profilePowerStats}
            />
          </div>
        </div>

        {/* Right Column - Profile Settings or Skill Tree Settings */}
        <div
          style={
            isSkillTreeShowing
              ? undefined
              : {
                  alignSelf: 'start',
                  height: powerCardHeight ?? undefined,
                  maxHeight: powerCardHeight ?? undefined,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }
          }
        >
          {isSkillTreeShowing ? (
            /* Skill Tree Page — flex column capped to viewport so inner grid can scroll */
            <div
              style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                borderRadius: '0.75rem',
                padding: '1.25rem 1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '2rem',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: 'calc(100dvh - 7.5rem)',
                maxHeight: 'calc(100dvh - 7.5rem)',
                overflow: 'hidden',
              }}
            >
              {/* Background texture overlay */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `
                  repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(255, 255, 255, 0.02) 2px,
                    rgba(255, 255, 255, 0.02) 4px
                  )
                `,
                pointerEvents: 'none',
                opacity: 0.3
              }} />
              
              {/* Title + back */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  marginBottom: '1rem',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsSkillTreeShowing(false)}
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.25)',
                      color: '#e5e7eb',
                      borderRadius: '0.5rem',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    ← Back to profile
                  </button>
                </div>
                <h2 style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: '#fff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  margin: 0,
                  textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)'
                }}>
                  Skill Tree
                </h2>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255, 255, 255, 0.6)',
                  marginTop: '0.5rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em'
                }}>
                  Unlock new abilities • Manage in Skill Mastery
                </p>
              </div>

              {/* Universal Law Skill Tree — fills remaining height; page scrolls inside */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {currentUser?.uid ? (
                  <UniversalLawSkillTreePage
                    userId={currentUser.uid}
                  />
                ) : (
                  <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.7)'
                  }}>
                    Loading...
                  </div>
                )}
              </div>

              {/* Info Footer */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  marginTop: '0.75rem',
                  padding: '0.65rem 0.75rem',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                <p style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.5)',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em'
                }}>
                  To equip and upgrade skills, visit{' '}
                  <button
                    onClick={() => navigate('/battle#moves')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#eab308',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em'
                    }}
                  >
                    Skill Mastery
                  </button>
                </p>
              </div>
            </div>
          ) : (
            /* Profile Settings — height capped to Power Card */
          <>
          <div className="profile-settings mst-profile-settings">
            <h2 className="mst-profile-settings-title">
              Profile Settings
            </h2>
            <div className="profile-card" style={{ marginBottom: 0 }}>
              {/* User Info Section - Avatar, Name, and Bio */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Avatar Section */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    key={avatarUrl} // Force re-render when avatar changes
                    src={avatarUrl}
                    alt="Profile"
                    className="mst-profile-settings-avatar"
                  />
                  <label className={`mst-profile-settings-camera${uploading ? ' is-disabled' : ''}`}>
                    {uploading ? '⏳' : '📷'}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} disabled={uploading} />
                  </label>
                </div>
                {/* User Info Edit Controls */}
                <div style={{ flex: 1 }}>
                  {editing ? (
                    <div>
                      <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="mst-profile-input" style={{ fontSize: '1.5rem' }} placeholder="Display Name" />
                      <textarea value={bio} onChange={e => setBio(e.target.value)} className="mst-profile-textarea" placeholder="Tell us about yourself..." />
                    </div>
                  ) : (
                    <div>
                      <h2 className="mst-profile-settings-name">{displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}</h2>
                      <p className="mst-profile-settings-bio">{bio || 'No bio yet. Click edit to add one!'}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Rest of Profile Settings */}
              {editing ? (
                <div>
                    <div style={{ margin: '0.5rem 0' }}>
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> <span style={{ color: getManifestColor(currentManifest), fontWeight: 'bold' }}>{currentManifest}</span></span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> <span style={{ color: getElementColor(style), fontWeight: 'bold' }}>{formatElementDisplayLabel(style)}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <b>Rarity:</b> {getRarityStars(rarity)}
                      </span>
                    </div>
                    <div style={{ margin: '1rem 0' }}>
                      <label className="mst-profile-label" style={{ display: 'block', marginBottom: '1rem' }}><b>Card Customization:</b></label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                        <div>
                          <label className="mst-profile-label" style={{ display: 'block', marginBottom: '0.5rem' }}><b>Card Background Color:</b></label>
                          <div style={{ marginTop: 8 }}>
                            <SketchPicker color={cardBgColor} onChange={(color: any) => setCardBgColor(color.hex)} width="100%" />
                          </div>
                        </div>
                        <div>
                          <label className="mst-profile-label" style={{ display: 'block', marginBottom: '0.5rem' }}><b>Card Border Color:</b></label>
                          <div style={{ marginTop: 8 }}>
                            <SketchPicker color={cardBorderColor} onChange={(color: any) => setCardBorderColor(color.hex)} width="100%" />
                          </div>
                        </div>
                        <div>
                          <label className="mst-profile-label" style={{ display: 'block', marginBottom: '0.5rem' }}><b>Card Image Border Color:</b></label>
                          <div style={{ marginTop: 8 }}>
                            <SketchPicker color={cardImageBorderColor} onChange={(color: any) => setCardImageBorderColor(color.hex)} width="100%" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ margin: '1rem 0' }}>
                      <label className="mst-profile-label"><b>Card Image Frame Shape:</b></label>
                      <div style={{ marginTop: 8, display: 'flex', gap: '1rem' }}>
                        <button
                          onClick={() => setCardFrameShape('circular')}
                          className={`mst-profile-frame-btn mst-profile-frame-btn--circle${cardFrameShape === 'circular' ? ' is-active' : ''}`}
                          title="Circular Frame"
                          type="button"
                        >
                          ⭕
                        </button>
                        <button
                          onClick={() => setCardFrameShape('rectangular')}
                          className={`mst-profile-frame-btn mst-profile-frame-btn--rect${cardFrameShape === 'rectangular' ? ' is-active' : ''}`}
                          title="Rectangular Frame"
                          type="button"
                        >
                          ▭
                        </button>
                      </div>
                      <div className="mst-profile-hint">
                        Current: {cardFrameShape === 'circular' ? 'Circular' : 'Rectangular'}
                      </div>
                    </div>
                    {level >= 3 && (
                      <div style={{ margin: '1.5rem 0' }}>
                        <label className="mst-profile-label"><b>Design Your Moves</b></label>
                        <div style={{ margin: '0.5rem 0' }}>
                          {moves.map((move: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 20 }}>{move.icon}</span>
                              <span style={{ fontWeight: 'bold' }}>{move.name}</span>
                              <span style={{ color: 'var(--mst-text-muted)' }}>{move.description}</span>
                              <button onClick={() => setMoves(moves.filter((_: any, i: number) => i !== idx))} className="mst-profile-btn--remove" type="button">Remove</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input type="text" value={newMove.icon} onChange={e => setNewMove({ ...newMove, icon: e.target.value })} placeholder="Icon (e.g. ⚡)" className="mst-profile-input" style={{ width: 50, marginBottom: 0 }} />
                          <input type="text" value={newMove.name} onChange={e => setNewMove({ ...newMove, name: e.target.value })} placeholder="Move Name" className="mst-profile-input" style={{ flex: 1, marginBottom: 0 }} />
                          <input type="text" value={newMove.description} onChange={e => setNewMove({ ...newMove, description: e.target.value })} placeholder="Description" className="mst-profile-input" style={{ flex: 2, marginBottom: 0 }} />
                          <button onClick={() => {
                            if (newMove.name && newMove.icon) {
                              setMoves([...moves, newMove]);
                              setNewMove({ name: '', description: '', icon: '' });
                            }
                          }} className="mst-profile-btn--add" type="button">Add</button>
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: '1rem' }}>
                      <button onClick={handleSaveProfile} className="mst-profile-btn mst-profile-btn--save" type="button">Save</button>
                      <button onClick={() => setEditing(false)} className="mst-profile-btn mst-profile-btn--cancel" type="button">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ margin: '0.5rem 0' }}>
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> <span style={{ color: getManifestColor(currentManifest), fontWeight: 'bold' }}>{currentManifest}</span></span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> <span style={{ color: getElementColor(style), fontWeight: 'bold' }}>{formatElementDisplayLabel(style)}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <b>Rarity:</b> {getRarityStars(rarity)}
                      </span>
                    </div>
                    {currentManifest !== 'None' && (
                      <div style={{ margin: '0.5rem 0' }}>
                        <button
                          onClick={() => setShowManifestSelection(true)}
                          className="mst-profile-btn mst-profile-btn--manifest"
                          type="button"
                        >
                          🔄 Re-select Manifest
                        </button>
                      </div>
                    )}
                    {/* Rivals Section */}
                    {(rivals.chosen || rivals.inbound) && (
                      <div className="mst-profile-rivals">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.25rem' }}>⚔️</span>
                            <span className="mst-profile-rivals-title">Rivals</span>
                          </div>
                          <button
                            onClick={() => setShowEditRivalModal(true)}
                            className="mst-profile-btn--rival"
                            type="button"
                          >
                            Edit Rival
                          </button>
                        </div>
                        {rivals.chosen && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div className="mst-profile-rivals-label">
                              Chosen Rival:
                            </div>
                            <div className="mst-profile-rivals-name">
                              {rivals.chosen.displayName}
                            </div>
                          </div>
                        )}
                        {rivals.inbound && (
                          <div>
                            <div className="mst-profile-rivals-label">
                              Inbound Rival:
                            </div>
                            <div className="mst-profile-rivals-name">
                              {rivals.inbound.displayName}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {!(rivals.chosen || rivals.inbound) && (
                      <div className="mst-profile-rivals">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontSize: '1.25rem' }}>⚔️</span>
                              <span className="mst-profile-rivals-title">No Rivals Set</span>
                            </div>
                            <div className="mst-profile-rivals-empty">
                              Set a rival to earn double rewards when you defeat them!
                            </div>
                          </div>
                          <button
                            onClick={() => setShowEditRivalModal(true)}
                            className="mst-profile-btn--rival"
                            type="button"
                          >
                            Set Rival
                          </button>
                        </div>
                      </div>
                    )}
                    <button onClick={() => setEditing(true)} className="mst-profile-btn mst-profile-btn--edit" type="button">Edit Profile</button>
                  </div>
                )}
            </div>
          </div>
          </>
          )}
        </div>


      {/* Productivity Stats — full width under Power Card + Profile Settings */}
      {productivityStats !== undefined && (
        <div className="mst-profile-panel mst-profile-panel--productivity">
          <h3 className="mst-profile-panel-title">
            Productivity Stats (My Stats)
          </h3>
          {productivityStats ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                <span className="mst-profile-rank-pill">
                  {productivityStats.productivityRank || 'Dormant'}
                </span>
                <span className="mst-profile-prod-rating">
                  Productivity Rating: {Math.round(productivityStats.overallProductivityRating || 0)}%
                </span>
              </div>
              <div className="mst-profile-prod-track">
                <div
                  className="mst-profile-prod-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, Math.round(productivityStats.overallProductivityRating || 0)))}%`,
                  }}
                />
              </div>

              <div className="mst-profile-prod-grid">
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Total Sprints Joined</div><div style={{ fontWeight: 800 }}>{productivityStats.totalSprintsJoined || 0}</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Total Sprints Completed</div><div style={{ fontWeight: 800 }}>{productivityStats.totalSprintsCompleted || 0}</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Sprint Completion Rate</div><div style={{ fontWeight: 800 }}>{Math.round(productivityStats.sprintCompletionRate || 0)}%</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Total Quizzes Completed</div><div style={{ fontWeight: 800 }}>{productivityStats.totalQuizzesCompleted || 0}</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Average Quiz Score</div><div style={{ fontWeight: 800 }}>{Math.round(productivityStats.averageQuizScore || 0)}%</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Live Exams Completed</div><div style={{ fontWeight: 800 }}>{productivityStats.totalExamsCompleted || 0}</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Average Exam Score</div><div style={{ fontWeight: 800 }}>{Math.round(productivityStats.averageExamScore || 0)}%</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Current Streak</div><div style={{ fontWeight: 800 }}>{productivityStats.currentStreak ?? 0} wk</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Best Streak</div><div style={{ fontWeight: 800 }}>{productivityStats.bestStreak ?? 0} wk</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Weekly Productivity</div><div style={{ fontWeight: 800 }}>{Math.round(productivityStats.weeklyProductivityRating || 0)}%</div></div>
                <div><div style={{ opacity: 0.75, fontWeight: 600 }}>Overall Productivity</div><div style={{ fontWeight: 800 }}>{Math.round(productivityStats.overallProductivityRating || 0)}%</div></div>
              </div>

              <div
                style={{
                  marginTop: '1.5rem',
                  paddingTop: '1.25rem',
                  borderTop: '1px solid var(--mst-border)',
                }}
              >
                <h4 className="mst-profile-panel-sub">
                  Work & Energy Stats
                </h4>
                <div
                  style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1rem',
                      }}
                    >
                      {WORK_ENERGY_ORDER.map((k: BattleEnergyType) => {
                    const w = parseWorkStatsFromDoc(productivityStats.workStats);
                    const b = w[k];
                    const pct = workCompletionRatePct(b.completed, b.attempted);
                    const line1 =
                      k === ENERGY_TYPES.PHYSICAL
                        ? 'Physical Energy'
                        : k === ENERGY_TYPES.MENTAL
                          ? 'Mental Energy'
                          : k === ENERGY_TYPES.EMOTIONAL
                            ? 'Emotional Energy'
                            : 'Spiritual Energy';
                    const line2 =
                      k === ENERGY_TYPES.PHYSICAL
                        ? 'Discipline'
                        : k === ENERGY_TYPES.MENTAL
                          ? 'Measured Intelligence'
                          : k === ENERGY_TYPES.EMOTIONAL
                            ? 'Connection to Self'
                            : 'Card Power Level';
                    const barColor =
                      k === ENERGY_TYPES.PHYSICAL
                        ? '#059669'
                        : k === ENERGY_TYPES.MENTAL
                          ? '#2563eb'
                          : k === ENERGY_TYPES.EMOTIONAL
                            ? '#db2777'
                            : '#7c3aed';
                    const lastMs = tsMs(b.lastCompletedAt);

                    if (k === ENERGY_TYPES.SPIRITUAL) {
                      const plContributors = topPowerLevelContributors(powerBreakdown, 3);
                      return (
                        <div
                          key={k}
                          className="mst-profile-energy-card"
                          style={{
                            border: '1px solid var(--mst-border-purple)',
                          }}
                        >
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mst-text-secondary)' }}>{line1}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--mst-text-muted)', marginBottom: 6 }}>{line2}</div>
                          {powerLevel != null ? (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  marginBottom: 8,
                                }}
                              >
                                <span style={{ fontSize: '1.1rem' }}>⚡</span>
                                <div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--mst-text-muted)', fontWeight: 600 }}>
                                    Power Level
                                  </div>
                                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--mst-purple-bright)', lineHeight: 1.1 }}>
                                    {powerLevel}
                                  </div>
                                </div>
                              </div>
                              {plContributors.length > 0 ? (
                                <div style={{ marginBottom: 8 }}>
                                  <div
                                    style={{
                                      fontSize: '0.65rem',
                                      fontWeight: 800,
                                      color: '#4c1d95',
                                      marginBottom: 4,
                                      letterSpacing: '0.02em',
                                    }}
                                  >
                                    Top contributors
                                  </div>
                                  <ol
                                    style={{
                                      margin: 0,
                                      paddingLeft: '1.1rem',
                                      fontSize: '0.68rem',
                                      color: '#374151',
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    {plContributors.map((row) => (
                                      <li key={row.label}>
                                        <strong>{row.label}</strong>: +{row.value}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: 8 }}>
                                  Open the header <strong>Power Level</strong> tile after your card syncs for a
                                  full breakdown.
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: '0.68rem', color: '#6b7280', marginBottom: 8 }}>
                              Power Level appears after your profile recalculates (equip skills & artifacts on
                              your card).
                            </div>
                          )}
                          <div
                            style={{
                              borderTop: '1px solid rgba(124, 58, 237, 0.2)',
                              paddingTop: 6,
                              marginTop: 2,
                            }}
                          >
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                              Spiritual work (goals & live events)
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#374151' }}>
                              Done: <strong>{b.completed}</strong> · Tried: <strong>{b.attempted}</strong>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#374151', marginTop: 2 }}>
                              Rate: <strong>{pct}%</strong> · Points: <strong>{Math.round(b.pointsEarned)}</strong>
                            </div>
                            <div
                              style={{
                                marginTop: 6,
                                height: 8,
                                borderRadius: 999,
                                background: 'rgba(16,185,129,0.15)',
                                overflow: 'hidden',
                              }}
                            >
                              <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 4 }}>
                              Last: {lastMs ? new Date(lastMs).toLocaleString() : '—'}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={k}
                        style={{
                          background: 'rgba(5, 7, 13, 0.55)',
                          borderRadius: '0.65rem',
                          padding: '0.85rem 1rem',
                          border: '1px solid var(--mst-border)',
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--mst-text-secondary)' }}>{line1}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--mst-text-muted)', marginBottom: 4 }}>{line2}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--mst-text-secondary)' }}>
                          Done: <strong>{b.completed}</strong> · Tried: <strong>{b.attempted}</strong>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--mst-text-secondary)', marginTop: 2 }}>
                          Rate: <strong>{pct}%</strong> · Points: <strong>{Math.round(b.pointsEarned)}</strong>
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            height: 8,
                            borderRadius: 999,
                            background: 'var(--mst-track)',
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--mst-text-muted)', marginTop: 4 }}>
                          Last: {lastMs ? new Date(lastMs).toLocaleString() : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  marginTop: '1.35rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div className="mst-profile-energy-card">
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--mst-gold-bright)', marginBottom: '0.5rem' }}>
                    Recent Sprint Activity
                  </div>
                  {productivityActivityLoading ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--mst-text-muted)' }}>Loading sprint activity…</div>
                  ) : recentSprintActivity.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--mst-text-muted)' }}>No sprint activity yet.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.76rem', color: 'var(--mst-text-secondary)' }}>
                      {recentSprintActivity.slice(0, 5).map((item) => (
                        <li key={item.id} style={{ marginBottom: '0.2rem' }}>
                          {(item.status || 'joined').toUpperCase()} — {item.sprintTitle || 'Sprint'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mst-profile-energy-card">
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--mst-gold-bright)', marginBottom: '0.5rem' }}>
                    Live Event CFU / quizzes (last 3)
                  </div>
                  {productivityActivityLoading ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--mst-text-muted)' }}>Loading live quiz activity…</div>
                  ) : recentLiveEventQuizActivity.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--mst-text-muted)' }}>
                      No live event CFU or quiz completions yet.
                    </div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.76rem' }}>
                      {recentLiveEventQuizActivity.map((item) => {
                        const pct = Math.round(item.scorePercent ?? 0);
                        const cq = item.correctAnswers;
                        const tq = item.totalQuestions;
                        const detail =
                          typeof cq === 'number' && typeof tq === 'number' && tq > 0
                            ? ` (${cq}/${tq} correct)`
                            : '';
                        const whenMs = tsMs(item.completedAt);
                        const whenStr = whenMs ? new Date(whenMs).toLocaleString() : '';
                        return (
                          <li key={item.id} style={{ marginBottom: '0.35rem' }}>
                            <div style={{ fontWeight: 600 }}>{item.quizTopic || 'CFU / Live quiz'}</div>
                            <div style={{ color: '#047857' }}>
                              Score: <strong>{pct}%</strong>
                              {detail}
                            </div>
                            {whenStr ? (
                              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 2 }}>{whenStr}</div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              <div
                style={{
                  marginTop: '1.15rem',
                  padding: '1.15rem 1.25rem',
                  background: 'linear-gradient(135deg, rgba(238,242,255,0.95) 0%, rgba(224,231,255,0.85) 100%)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(79, 70, 229, 0.35)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--mst-purple-bright)' }}>Live Event Exam History</div>
                  {examHistory.length > 5 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllExamHistory((v) => !v)}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#4f46e5',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {showAllExamHistory ? 'Show less' : `View all (${examHistory.length})`}
                    </button>
                  ) : null}
                </div>
                {productivityActivityLoading ? (
                  <div style={{ fontSize: '0.78rem', color: '#4338ca' }}>Loading exam history…</div>
                ) : examHistory.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: '#4338ca' }}>
                    No completed live exams yet. Finish an Exam Mode live event to see scores here.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(showAllExamHistory ? examHistory : examHistory.slice(0, 5)).map((exam) => {
                      const pct = Math.round(exam.scorePercent ?? 0);
                      const whenMs = tsMs(exam.completedAt);
                      const whenStr = whenMs ? new Date(whenMs).toLocaleString() : '';
                      const scoreColor = pct >= 90 ? '#059669' : pct >= 70 ? '#2563eb' : pct >= 50 ? '#d97706' : '#dc2626';
                      return (
                        <div
                          key={exam.id}
                          style={{
                            background: 'rgba(255,255,255,0.75)',
                            borderRadius: '0.45rem',
                            padding: '0.5rem 0.6rem',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b' }}>{exam.title}</div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: scoreColor }}>{pct}%</div>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 4 }}>
                            {exam.correctAnswers}/{exam.totalQuestions} correct
                            {exam.timeTakenMs ? ` · ${formatExamDurationMs(exam.timeTakenMs)}` : ''}
                          </div>
                          {exam.assessmentTitle ? (
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                              Linked assessment: {exam.assessmentTitle}
                            </div>
                          ) : null}
                          {whenStr ? (
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 4 }}>{whenStr}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--mst-text-muted)' }}>
              No productivity data yet. Join Class Flow sprints and complete Training Grounds quizzes to populate
              your My Stats section.
            </p>
          )}
        </div>
      )}

      {/* Secondary profile panels under the top card row */}
      <div className="mst-profile-secondary">
          {currentUser && (
            <div className="mst-profile-panel mst-profile-panel--civic">
              <h3 className="mst-profile-panel-title mst-profile-panel-title--sm">
                Civic Status
              </h3>
              {civicState === undefined ? (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>Loading civic status…</p>
              ) : civicState === null ? (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>
                  No civic economy record yet. After weekly tax runs, your job, tax, and seat status appear here.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gap: '0.45rem',
                      fontSize: '0.82rem',
                      color: '#334155',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Job role: </span>
                      {civicState.jobRole
                        ? civicState.jobRole.replace(/_/g, ' ')
                        : '—'}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Job pay: </span>
                      {civicState.jobPayRatePp ?? 0} PP
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Tax discount: </span>
                      {civicState.taxDiscountPercent ?? 0}%
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Weekly tax (owed): </span>
                      {civicState.weeklyTaxOwed ?? 0} PP
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Tax status: </span>
                      <strong>
                        {civicState.taxStatus === 'paid'
                          ? 'Paid'
                          : civicState.taxStatus === 'due_soon'
                            ? 'Due Soon'
                            : civicState.taxStatus === 'unpaid'
                              ? 'Unpaid'
                              : civicState.taxStatus === 'defaulted'
                                ? 'Defaulted'
                                : civicState.taxStatus === 'shutdown'
                                  ? 'Shut Down'
                                  : civicState.taxStatus}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Next tax: </span>
                      {typeof civicState.nextTaxDate === 'number' && civicState.nextTaxDate > 0
                        ? new Date(civicState.nextTaxDate).toLocaleString()
                        : '—'}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>Seat freedom: </span>
                      {civicState.seatFreedom === 'active' ? 'Active' : 'Restricted'}
                    </div>
                    {civicState.taxStatus === 'shutdown' &&
                    civicState.shutdownEndsAt &&
                    typeof (civicState.shutdownEndsAt as Timestamp).toMillis === 'function' ? (
                      <div style={{ color: '#b45309', fontWeight: 700 }}>
                        Shutdown ends:{' '}
                        {new Date((civicState.shutdownEndsAt as Timestamp).toMillis()).toLocaleString()}
                        {' · '}
                        {Math.max(
                          0,
                          Math.ceil(
                            ((civicState.shutdownEndsAt as Timestamp).toMillis() - Date.now()) / 60000
                          )
                        )}
                        m left
                      </div>
                    ) : null}
                  </div>
                  {civicState.seatFreedom === 'restricted' &&
                  (civicState.taxStatus === 'unpaid' || civicState.taxStatus === 'defaulted') ? (
                    <p
                      style={{
                        margin: '0.75rem 0 0',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#991b1b',
                        lineHeight: 1.35,
                      }}
                    >
                      Seat Choice Restricted — Admin Chooses Seat.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
          <div className="mst-profile-panel mst-profile-panel--season">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ color: 'var(--mst-purple-bright)' }}>Season 1 — Flow &amp; Energy</strong>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--mst-text-secondary)', maxWidth: '36rem' }}>
                  Track the four energies and evolve your manifest skill tiers (PP unlocks). Same progression data powers live events and battle pass.
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => navigate('/energy-mastery')}
                  className="mst-profile-nav-chip"
                >
                  Energy Mastery
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/manifest-evolution')}
                  className="mst-profile-nav-chip"
                >
                  Manifest evolution
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/battle-pass')}
                  className="mst-profile-nav-chip mst-profile-nav-chip--gold"
                >
                  Battle Pass
                </button>
              </div>
            </div>
          </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div className="mst-profile-stat-tile">
                <div className="mst-profile-stat-value">{userData?.xp || 0}</div>
                <div className="mst-profile-stat-label" style={{ marginBottom: '0.75rem' }}>Total XP</div>
                <div
                  style={{
                    borderTop: '1px solid var(--mst-border)',
                    paddingTop: '0.75rem',
                  }}
                >
                  <div className="mst-profile-stat-value">{level}</div>
                  <div className="mst-profile-stat-label">Level</div>
                </div>
              </div>
              <div className="mst-profile-stat-tile">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <div className="mst-profile-stat-value">{userData?.powerPoints || 0}</div>
                  {ppBoostStatus.isActive && (
                    <span 
                      style={{ 
                        fontSize: '1rem',
                        color: 'var(--mst-purple-bright)',
                        fontWeight: 'bold',
                        textShadow: '0 0 2px rgba(124, 58, 237, 0.3)',
                        animation: 'pulse 2s infinite'
                      }}
                      title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
                    >
                      ×2
                    </span>
                  )}
                </div>
                <div className="mst-profile-stat-label" style={{ marginBottom: '0.35rem' }}>Power Points</div>
                {profileTaxPreview ? (
                  <div className="mst-profile-tax-preview">
                    <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
                      Next civic tax in{' '}
                      <span style={{ color: '#115e59' }}>
                        {formatCivicTaxCountdown(profileTaxPreview.nextMs, Date.now())}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.25rem', color: '#134e4a' }}>
                      Est. deduction: <strong>{profileTaxPreview.owedPp} PP</strong>
                      {civicState && typeof civicState.taxDiscountPercent === 'number' && civicState.taxDiscountPercent > 0 ? (
                        <span style={{ fontWeight: 500, color: '#0d9488' }}>
                          {' '}
                          (after {civicState.taxDiscountPercent}% role discount)
                        </span>
                      ) : null}
                      <span style={{ display: 'block', fontWeight: 500, color: '#5eead4', marginTop: '0.2rem' }}>
                        Taken from your vault; won’t drop below 0 PP.
                      </span>
                    </div>
                  </div>
                ) : null}
                {/* Want more PP? Button */}
                <button
                  type="button"
                  onClick={() => setShowWaysToEarnPpModal(true)}
                  className="mst-profile-btn--pp"
                >
                  💰 Want more PP?
                </button>
              </div>
              <div className="mst-profile-tm-tile">
                <div className="mst-profile-stat-value" style={{ color: '#fff' }}>{Math.floor(userData?.truthMetal || 0)}</div>
                <div className="mst-profile-stat-label" style={{ color: '#e5e7eb', fontWeight: 500 }}>Truth Metal Shards</div>
                <div
                  style={{
                    marginTop: '0.85rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid rgba(255,255,255,0.2)',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#d1d5db',
                      marginBottom: '0.45rem',
                    }}
                  >
                    Earn more shards
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {[
                      { label: 'Journey — story & chapter rewards', path: '/chapters' },
                      { label: 'Daily challenges — Battle power card · Daily tab', path: '/battle' },
                      { label: 'Battle Pass — seasonal track', path: '/battle-pass' },
                      { label: 'Island Raid — run rewards', path: '/island-raid' },
                    ].map((row) => (
                      <button
                        key={row.path}
                        type="button"
                        onClick={() => navigate(row.path)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.35rem 0',
                          margin: 0,
                          border: 'none',
                          background: 'transparent',
                          color: '#e0f2fe',
                          fontSize: '0.72rem',
                          lineHeight: 1.35,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                          fontWeight: 500,
                        }}
                      >
                        {row.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mst-profile-stat-tile">
                <div className="mst-profile-stat-value">{Object.values(userData?.challenges || {}).filter(Boolean).length}</div>
                <div className="mst-profile-stat-label">Challenges Completed</div>
              </div>
            </div>

            <div className="mst-profile-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
              <h3 className="mst-profile-panel-title mst-profile-panel-title--sm">
                ⚡ Power stats
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--mst-text-muted)', margin: '0 0 1rem 0', lineHeight: 1.45 }}>
                Hover a stat to see which live events and goals level it up.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: '0.75rem' }}>
                {(['physical', 'mental', 'emotional', 'spiritual'] as const).map((key) => {
                  const st = normalizePlayerPowerStats(userData?.stats)[key];
                  const label =
                    key === 'physical' ? 'Physical' : key === 'mental' ? 'Mental' : key === 'emotional' ? 'Emotional' : 'Spiritual';
                  const hovered = profilePowerStatHover === key;
                  return (
                    <div
                      key={key}
                      role="group"
                      aria-label={label}
                      onMouseEnter={() => setProfilePowerStatHover(key)}
                      onMouseLeave={() => setProfilePowerStatHover(null)}
                      style={{
                        background: hovered ? 'rgba(30, 41, 59, 0.95)' : 'rgba(17, 24, 39, 0.85)',
                        padding: '0.85rem',
                        borderRadius: '0.5rem',
                        border: `1px solid ${hovered ? 'var(--mst-border-gold)' : 'var(--mst-border)'}`,
                        cursor: 'help',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 168,
                        transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#4f46e5', marginTop: '0.15rem' }}>Lv {st.level}</div>
                      <PowerStatProgressBar branch={key} st={st} height={12} style={{ marginTop: '0.5rem' }} />
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                        {st.xp} / {st.xpToNextLevel} XP to next
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.35rem' }}>Lifetime XP: {st.totalEarned}</div>
                      {st.bonusesUnlocked.length > 0 && (
                        <div style={{ fontSize: '0.65rem', color: '#059669', marginTop: '0.35rem' }}>
                          Bonuses: {st.bonusesUnlocked.length} unlocked
                        </div>
                      )}
                      <div
                        style={{
                          marginTop: 'auto',
                          paddingTop: '0.5rem',
                          minHeight: 40,
                          fontSize: '0.7rem',
                          lineHeight: 1.45,
                          color: 'var(--mst-text-secondary)',
                          opacity: hovered ? 1 : 0,
                          transition: 'opacity 0.15s ease',
                        }}
                      >
                        {POWER_STAT_EVENT_DESCRIPTION[key]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
      </div>
      </div>

      {/* Artifacts and Manifest Progress Side by Side */}
      <div className="mst-profile-artifacts-row">
        {/* Artifacts Section - Left Side with Vertical Scrolling */}
        <div className="mst-profile-panel mst-profile-panel--artifacts">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
              <h2 className="mst-profile-panel-title" style={{ margin: 0, lineHeight: '1.5rem', fontSize: '1.35rem' }}>Purchased Artifacts</h2>
              {Array.isArray(userData?.artifacts) && userData.artifacts.length > 0 && (
                <div className="mst-profile-artifact-count">
                  {Array.isArray(userData?.artifacts) ? userData.artifacts.filter((a: any) => !a.used && !a.pending && !isEquippableArtifact(a)).length : 0} Available • {Array.isArray(userData?.artifacts) ? userData.artifacts.filter((a: any) => a.pending).length : 0} In Use • {Array.isArray(userData?.artifacts) ? userData.artifacts.filter((a: any) => a.used).length : 0} Used
                </div>
              )}
            </div>
            
            {Array.isArray(userData?.artifacts) && userData.artifacts.length > 0 ? (
              <div>
              {/* Available Artifacts - 2 columns with vertical scroll (only consumable artifacts, equippable ones are on Artifacts page) */}
                {Array.isArray(userData?.artifacts) && userData.artifacts.filter((artifact: any) => {
                  const enhanced = enhanceLegacyItem(artifact);
                  // Filter out: used artifacts, equippable artifacts, and pending staff-approval artifacts
                  return !enhanced.used && 
                         !isEquippableArtifact(artifact) && 
                         !isAwaitingStaffArtifactApproval(enhanced);
                }).length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                      Available Artifacts ({Array.isArray(userData?.artifacts) ? userData.artifacts.filter((a: any) => {
                        const enhanced = enhanceLegacyItem(a);
                        return !enhanced.used && 
                               !isEquippableArtifact(a) && 
                               !isAwaitingStaffArtifactApproval(enhanced);
                      }).length : 0})
                    </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      {userData.artifacts.filter((artifact: any) => {
                        const enhanced = enhanceLegacyItem(artifact);
                        // Filter out: used artifacts, equippable artifacts, and pending staff-approval artifacts
                        return !enhanced.used && 
                               !isEquippableArtifact(artifact) && 
                               !isAwaitingStaffArtifactApproval(enhanced);
                      }).map((artifact: any, index: number) => {
                        const enhancedArtifact = enhanceLegacyItem(artifact);
                        const getRarityColor = (rarity: string) => {
                          switch (rarity) {
                            case 'common': return '#6b7280';
                            case 'rare': return '#3b82f6';
                            case 'epic': return '#8b5cf6';
                            case 'legendary': return '#f59e0b';
                            default: return '#6b7280';
                          }
                        };

                        return (
                          <div key={`${enhancedArtifact.id || artifact}-${index}`} style={{ 
                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
                            borderRadius: '0.75rem', 
                            padding: '1rem', 
                            textAlign: 'center', 
                            boxShadow: '0 2px 4px 0 rgba(0,0,0,0.1)', 
                            border: `2px solid ${getRarityColor(enhancedArtifact.rarity || 'common')}`,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px 0 rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 4px 0 rgba(0,0,0,0.1)';
                          }}>
                            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                              {enhancedArtifact.image ? (
                                <img 
                                  src={enhancedArtifact.image} 
                                  alt={enhancedArtifact.name || 'Artifact'} 
                                  style={{ 
                                    width: '100%', 
                                    height: '100px', 
                                    objectFit: 'cover', 
                                    borderRadius: '0.5rem',
                                    border: `1px solid ${getRarityColor(enhancedArtifact.rarity || 'common')}20`
                                  }} 
                                />
                              ) : (
                                <div style={{ 
                                  width: '100%', 
                                  height: '100px', 
                                  background: '#f3f4f6', 
                                  borderRadius: '0.5rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '2rem',
                                  color: '#9ca3af'
                                }}>
                                  {enhancedArtifact.icon || '📦'}
                                </div>
                              )}
                              {enhancedArtifact.rarity && (
                                <div style={{ 
                                  position: 'absolute',
                                  top: '0.5rem',
                                  right: '0.5rem',
                                  background: getRarityColor(enhancedArtifact.rarity),
                                  color: 'white',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.7rem',
                                  fontWeight: 'bold',
                                  textTransform: 'uppercase'
                                }}>
                                  {enhancedArtifact.rarity}
                                </div>
                              )}
                            </div>
                            
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#1f2937', marginBottom: '0.25rem', lineHeight: '1.2' }}>
                              {enhancedArtifact.name || 'Unknown Item'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.3' }}>
                              {enhancedArtifact.description || 'No description available'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                              {enhancedArtifact.purchasedAt ? new Date(enhancedArtifact.purchasedAt.seconds * 1000).toLocaleDateString() : (enhancedArtifact.isLegacy ? 'Legacy Item' : 'Unknown')}
                            </div>
                            
                            {/* PP Boost Countdown Display - Only show on the artifact that was actually used */}
                            {enhancedArtifact.name === 'Double PP Boost' && ppBoostStatus.isActive && artifact.used && (
                              <div style={{
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                color: 'white',
                                padding: '0.5rem',
                                borderRadius: '0.375rem',
                                marginBottom: '0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                boxShadow: '0 2px 4px rgba(251, 191, 36, 0.3)'
                              }}>
                                ⚡ Active: {ppBoostStatus.timeRemaining} remaining
                              </div>
                            )}
                            
                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                            <button 
                              style={{ 
                                backgroundColor: artifact.pending ? '#f59e0b' : '#4f46e5', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '0.375rem', 
                                padding: '0.5rem 0.75rem', 
                                cursor: artifact.pending ? 'not-allowed' : 'pointer', 
                                fontWeight: 'bold',
                                fontSize: '0.8rem',
                                flex: 1,
                                transition: 'background-color 0.2s ease',
                                opacity: artifact.pending ? 0.7 : 1
                              }} 
                              onMouseEnter={(e) => {
                                if (!artifact.pending) {
                                  e.currentTarget.style.backgroundColor = '#3730a3';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!artifact.pending) {
                                  e.currentTarget.style.backgroundColor = '#4f46e5';
                                }
                              }}
                              disabled={artifact.pending}
                              onClick={async () => {
                                if (!currentUser) return;
                                
                                // Handle Instant A - show ERROR 1001 and don't consume the item
                                if (enhancedArtifact.name === 'Instant A') {
                                  const showError1001 = () => {
                                    const modal = document.createElement('div');
                                    modal.style.cssText = `
                                      position: fixed;
                                      top: 0;
                                      left: 0;
                                      right: 0;
                                      bottom: 0;
                                      background: rgba(0, 0, 0, 0.9);
                                      display: flex;
                                      align-items: center;
                                      justify-content: center;
                                      z-index: 10000;
                                      font-family: 'Courier New', monospace;
                                    `;
                                    
                                    const content = document.createElement('div');
                                    content.style.cssText = `
                                      background: #000;
                                      border: 2px solid #ff0000;
                                      padding: 2rem;
                                      border-radius: 0.5rem;
                                      color: #00ff00;
                                      text-align: center;
                                      box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
                                      max-width: 500px;
                                      position: relative;
                                    `;
                                    
                                    const errorTitle = document.createElement('div');
                                    errorTitle.style.cssText = `
                                      font-size: 1.5rem;
                                      color: #ff0000;
                                      margin-bottom: 1rem;
                                      font-weight: bold;
                                    `;
                                    errorTitle.textContent = 'ERROR 1001';
                                    
                                    const binaryText = document.createElement('pre');
                                    binaryText.style.cssText = `
                                      font-size: 1rem;
                                      color: #00ff00;
                                      margin: 1rem 0;
                                      white-space: pre;
                                      line-height: 1.2;
                                      text-align: center;
                                      font-family: 'Courier New', monospace;
                                    `;
                                    binaryText.textContent = `    0 1 0 1 0
  0 1     0 1     0 1
0 1         1         1 0
  0   0 0 0   0 0 0   0
    0         0`;
                                    
                                    const closeButton = document.createElement('button');
                                    closeButton.textContent = 'CLOSE';
                                    closeButton.style.cssText = `
                                      background: #ff0000;
                                      color: #000;
                                      border: none;
                                      padding: 0.5rem 1.5rem;
                                      border-radius: 0.25rem;
                                      cursor: pointer;
                                      font-weight: bold;
                                      margin-top: 1rem;
                                      font-family: 'Courier New', monospace;
                                    `;
                                    closeButton.onclick = () => document.body.removeChild(modal);
                                    
                                    content.appendChild(errorTitle);
                                    content.appendChild(binaryText);
                                    content.appendChild(closeButton);
                                    modal.appendChild(content);
                                    document.body.appendChild(modal);
                                  };
                                  
                                  showError1001();
                                  return;
                                }
                                
                                // Handle Shield artifact specifically
                                if (enhancedArtifact.name === 'Shield') {
                                  try {
                                    // Get current vault data
                                    const vaultRef = doc(db, 'vaults', currentUser.uid);
                                    const vaultSnap = await getDoc(vaultRef);
                                    
                                    if (vaultSnap.exists()) {
                                      const vaultData = vaultSnap.data();
                                      
                                      // Check if player already has an active overshield
                                      if ((vaultData.overshield || 0) > 0) {
                                        alert('You already have an active overshield! You can only have 1 overshield at a time.');
                                        return;
                                      }
                                      
                                      // Add overshield (absorbs next attack) - capped at 1
                                      await updateDoc(vaultRef, {
                                        overshield: 1
                                      });
                                      
                                      // Mark artifact as used
                                      const userRef = doc(db, 'users', currentUser.uid);
                                      const userSnap = await getDoc(userRef);
                                      if (userSnap.exists()) {
                                        const userData = userSnap.data();
                                        // Only mark ONE instance as used, not all of them
                                        let foundOne = false;
                                        const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.map((artifact: any) => {
                                          if (foundOne) return artifact;
                                          
                                          // Handle both legacy artifacts (strings) and new artifacts (objects)
                                          if (typeof artifact === 'string') {
                                            // Legacy artifact stored as string - match by name
                                            if (artifact === enhancedArtifact.name) {
                                              foundOne = true;
                                              return { 
                                                id: enhancedArtifact.id,
                                                name: enhancedArtifact.name,
                                                description: enhancedArtifact.description,
                                                icon: enhancedArtifact.icon,
                                                image: enhancedArtifact.image,
                                                category: enhancedArtifact.category,
                                                rarity: enhancedArtifact.rarity,
                                                purchasedAt: null,
                                                used: true,
                                                isLegacy: true
                                              };
                                            }
                                            return artifact;
                                          } else {
                                            // New artifact stored as object - match by ID or name and check if not already used
                                            // Only mark as used if it's not already used (check for used property explicitly)
                                            const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
                                            if ((artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) && isNotUsed) {
                                              foundOne = true;
                                              return { ...artifact, used: true };
                                            }
                                            return artifact;
                                          }
                                        }) : [];
                                        
                                        await updateDoc(userRef, {
                                          artifacts: updatedArtifacts
                                        });
                                        
                                        // Also update the students collection inventory to keep both in sync
                                        const studentsRef = doc(db, 'students', currentUser.uid);
                                        const studentsSnap = await getDoc(studentsRef);
                                        if (studentsSnap.exists()) {
                                        const studentsData = studentsSnap.data();
                                        const currentInventory = studentsData.inventory || [];
                                        // Remove only ONE instance of the artifact from inventory
                                        const artifactIndex = currentInventory.indexOf(enhancedArtifact.name);
                                        const updatedInventory = artifactIndex > -1 
                                          ? currentInventory.filter((item: string, index: number) => index !== artifactIndex)
                                          : currentInventory;
                                          
                                          await updateDoc(studentsRef, {
                                            inventory: updatedInventory
                                          });
                                          
                                          console.log('✅ Students inventory updated:', updatedInventory);
                                        }
                                        
                                        console.log('✅ Shield artifact marked as used:', updatedArtifacts);
                                      }
                                      
                                      // Force a refresh of the user data to update the UI
                                      // Trigger a re-fetch of user data
                                      const updatedUserSnap = await getDoc(userRef);
                                      if (updatedUserSnap.exists()) {
                                        const updatedUserData = updatedUserSnap.data();
                                        setUserData(updatedUserData);
                                      }
                                      
                                      alert('🛡️ Shield artifact activated! Your vault now has an overshield that will absorb the next attack.');
                                    } else {
                                      alert('Error: Vault not found. Please try again.');
                                    }
                                  } catch (error) {
                                    console.error('Error using Shield artifact:', error);
                                    alert('Error using Shield artifact. Please try again.');
                                  }
                                } else if (enhancedArtifact.name === 'Double PP Boost') {
                                  // Handle Double PP Boost - no admin approval needed
                                  try {
                                    const { activatePPBoost, getActivePPBoost, getPPBoostStatus } = await import('../utils/ppBoost');
                                    const success = await activatePPBoost(currentUser.uid, enhancedArtifact.name);
                                    if (success) {
                                      // Get the active boost to show countdown
                                      const activeBoost = await getActivePPBoost(currentUser.uid);
                                      const boostStatus = getPPBoostStatus(activeBoost);
                                      const timeRemaining = boostStatus.isActive ? boostStatus.timeRemaining : '4:00';
                                      alert(`⚡ Double PP Boost activated! You'll receive double PP for the next 4 hours!\n\nTime remaining: ${timeRemaining}`);
                                      
                                      // Mark only ONE artifact as used
                                      const userRef = doc(db, 'users', currentUser.uid);
                                      const userSnap = await getDoc(userRef);
                                      if (userSnap.exists()) {
                                        const userData = userSnap.data();
                                        const currentArtifacts = userData.artifacts || [];
                                        
                                        // Find the FIRST unused artifact with this name and mark only that one
                                        let foundOne = false;
                                        const updatedArtifacts = currentArtifacts.map((artifact: any) => {
                                          if (foundOne) return artifact;
                                          
                                          if (typeof artifact === 'string') {
                                            if (artifact === enhancedArtifact.name) {
                                              foundOne = true;
                                              return { 
                                                id: enhancedArtifact.id,
                                                name: enhancedArtifact.name,
                                                description: enhancedArtifact.description,
                                                icon: enhancedArtifact.icon,
                                                image: enhancedArtifact.image,
                                                category: enhancedArtifact.category,
                                                rarity: enhancedArtifact.rarity,
                                                purchasedAt: null,
                                                used: true,
                                                usedAt: new Date(),
                                                isLegacy: true
                                              };
                                            }
                                            return artifact;
                                          } else {
                                            // Only mark as used if it's not already used (check for used property explicitly)
                                            const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
                                            if ((artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) && isNotUsed) {
                                              foundOne = true;
                                              return { ...artifact, used: true, usedAt: new Date() };
                                            }
                                            return artifact;
                                          }
                                        });
                                        
                                        await updateDoc(userRef, {
                                          artifacts: updatedArtifacts
                                        });
                                        
                                        // Remove ONE instance from students inventory
                                        const studentsRef = doc(db, 'students', currentUser.uid);
                                        const studentsSnap = await getDoc(studentsRef);
                                        if (studentsSnap.exists()) {
                                          const studentsData = studentsSnap.data();
                                          const currentInventory = studentsData.inventory || [];
                                          const artifactIndex = currentInventory.indexOf(enhancedArtifact.name);
                                          if (artifactIndex > -1) {
                                            const updatedInventory = [...currentInventory];
                                            updatedInventory.splice(artifactIndex, 1);
                                            await updateDoc(studentsRef, {
                                              inventory: updatedInventory
                                            });
                                          }
                                        }
                                        
                                        // Refresh user data
                                        const updatedUserSnap = await getDoc(userRef);
                                        if (updatedUserSnap.exists()) {
                                          setUserData(updatedUserSnap.data());
                                        }
                                      }
                                    } else {
                                      alert('Failed to activate PP boost. Please try again.');
                                    }
                                  } catch (error) {
                                    console.error('Error using Double PP Boost:', error);
                                    alert('Error using Double PP Boost. Please try again.');
                                  }
                                } else if (artifactRequiresUxpStyleApproval(enhancedArtifact)) {
                                  const submit = await markUserArtifactPendingStaffApproval(currentUser.uid, {
                                    id: enhancedArtifact.id,
                                    name: enhancedArtifact.name,
                                    description: enhancedArtifact.description,
                                    icon: enhancedArtifact.icon,
                                    image: enhancedArtifact.image,
                                    category: enhancedArtifact.category,
                                    rarity: enhancedArtifact.rarity,
                                  });
                                  if (!submit.ok) {
                                    alert(submit.error || 'Could not submit this request. Try again or refresh the page.');
                                    return;
                                  }
                                  const userRef = doc(db, 'users', currentUser.uid);
                                  const updatedUserSnap = await getDoc(userRef);
                                  if (updatedUserSnap.exists()) {
                                    setUserData(updatedUserSnap.data());
                                  }
                                  const nm = String(enhancedArtifact.name ?? '').toLowerCase();
                                  if (nm.includes('uxp')) {
                                    alert(
                                      'Your UXP Credit request has been sent to the admin for approval. The credit will be applied to your assignment after approval.'
                                    );
                                  } else {
                                    alert(
                                      'Your Assignment Pass request has been sent for staff approval. Full credit will apply after approval (subject to assignment type rules).'
                                    );
                                  }
                                } else {
                                  // Use immediately — mark one instance used and remove from students inventory
                                  const userRef = doc(db, 'users', currentUser.uid);
                                  const userSnap = await getDoc(userRef);
                                  if (userSnap.exists()) {
                                    const userData = userSnap.data();
                                    let foundOne = false;
                                    const finalUpdatedArtifacts = Array.isArray(userData?.artifacts)
                                      ? userData.artifacts.map((artifact: any) => {
                                          if (foundOne) return artifact;

                                          if (typeof artifact === 'string') {
                                            if (artifact === enhancedArtifact.name) {
                                              foundOne = true;
                                              return {
                                                id: enhancedArtifact.id,
                                                name: enhancedArtifact.name,
                                                description: enhancedArtifact.description,
                                                icon: enhancedArtifact.icon,
                                                image: enhancedArtifact.image,
                                                category: enhancedArtifact.category,
                                                rarity: enhancedArtifact.rarity,
                                                purchasedAt: null,
                                                used: true,
                                                isLegacy: true,
                                              };
                                            }
                                            return artifact;
                                          }
                                          const isNotUsed =
                                            artifact.used === false ||
                                            artifact.used === undefined ||
                                            artifact.used === null;
                                          if (
                                            (artifact.id === enhancedArtifact.id ||
                                              artifact.name === enhancedArtifact.name) &&
                                            isNotUsed
                                          ) {
                                            foundOne = true;
                                            return { ...artifact, used: true, usedAt: new Date() };
                                          }
                                          return artifact;
                                        })
                                      : [];

                                    await updateDoc(userRef, {
                                      artifacts: finalUpdatedArtifacts,
                                    });

                                    const studentsRef = doc(db, 'students', currentUser.uid);
                                    const studentsSnap = await getDoc(studentsRef);
                                    if (studentsSnap.exists()) {
                                      const studentsData = studentsSnap.data();
                                      const currentInventory = studentsData.inventory || [];
                                      const updatedInventory = currentInventory.filter(
                                        (item: string) => item !== enhancedArtifact.name
                                      );

                                      await updateDoc(studentsRef, {
                                        inventory: updatedInventory,
                                      });
                                    }

                                    alert('Your request to use this artifact has been sent to the admin!');
                                  }
                                }
                              }}
                            >
                              {artifact.pending ? 'In Use' : 'Use Artifact'}
                            </button>
                            
                            {/* Return Artifact Button */}
                            {(() => {
                              // Get the original price - check multiple sources
                              let artifactPrice = 0;
                              
                              // First, check if artifact object has price property
                              if (typeof artifact === 'object' && artifact.price) {
                                artifactPrice = artifact.price;
                              } 
                              // Second, check if enhanced artifact has price
                              else if (enhancedArtifact.price) {
                                artifactPrice = enhancedArtifact.price;
                              }
                              // Third, try to find price from marketplace items
                              else {
                                const marketplaceItem = marketplaceItems.find(mi => 
                                  mi.name === enhancedArtifact.name || mi.id === enhancedArtifact.id
                                );
                                if (marketplaceItem) {
                                  artifactPrice = marketplaceItem.price;
                                }
                              }
                              
                              // Only show return button if artifact has a price (was purchased from MST MKT)
                              if (artifactPrice > 0 && !artifact.used && !artifact.pending) {
                                const returnPrice = Math.floor(artifactPrice * 0.5);
                                
                                return (
                                  <button
                                    style={{
                                      backgroundColor: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '0.375rem',
                                      padding: '0.5rem 0.75rem',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                      fontSize: '0.8rem',
                                      flex: 1,
                                      transition: 'background-color 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#059669';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#10b981';
                                    }}
                                    onClick={async () => {
                                      if (!currentUser) return;
                                      
                                      if (!window.confirm(`Return ${enhancedArtifact.name} for ${returnPrice} PP (50% of original ${artifactPrice} PP)?`)) {
                                        return;
                                      }
                                      
                                      try {
                                        // Get current user data
                                        const userRef = doc(db, 'users', currentUser.uid);
                                        const userSnap = await getDoc(userRef);
                                        const studentsRef = doc(db, 'students', currentUser.uid);
                                        const studentsSnap = await getDoc(studentsRef);
                                        
                                        if (!userSnap.exists() || !studentsSnap.exists()) {
                                          alert('Error: User data not found.');
                                          return;
                                        }
                                        
                                        const userData = userSnap.data();
                                        const studentsData = studentsSnap.data();
                                        
                                        // Remove ONE instance of the artifact from users collection
                                        let foundOne = false;
                                        const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.filter((art: any) => {
                                          if (foundOne) return true;
                                          
                                          if (typeof art === 'string') {
                                            if (art === enhancedArtifact.name) {
                                              foundOne = true;
                                              return false; // Remove this artifact
                                            }
                                            return true;
                                          } else {
                                            // Match by ID or name, and ensure it's not used
                                            const isNotUsed = art.used === false || art.used === undefined || art.used === null;
                                            if ((art.id === enhancedArtifact.id || art.name === enhancedArtifact.name) && isNotUsed) {
                                              foundOne = true;
                                              return false; // Remove this artifact
                                            }
                                            return true;
                                          }
                                        }) : [];
                                        
                                        // Remove ONE instance from students inventory
                                        const currentInventory = studentsData.inventory || [];
                                        const artifactIndex = currentInventory.indexOf(enhancedArtifact.name);
                                        const updatedInventory = artifactIndex > -1 
                                          ? currentInventory.filter((item: string, index: number) => index !== artifactIndex)
                                          : currentInventory;
                                        
                                        // Calculate new PP (add 50% of original price)
                                        const currentPP = studentsData.powerPoints || 0;
                                        const newPP = currentPP + returnPrice;
                                        
                                        console.log('[Profile] Returning artifact:', {
                                          artifactName: enhancedArtifact.name,
                                          currentPP,
                                          returnPrice,
                                          newPP
                                        });
                                        
                                        // Update both collections
                                        await updateDoc(userRef, {
                                          artifacts: updatedArtifacts
                                        });
                                        
                                        // Update students collection with new PP
                                        await updateDoc(studentsRef, {
                                          inventory: updatedInventory,
                                          powerPoints: newPP
                                        });
                                        
                                        // Also update vault directly to ensure consistency
                                        const vaultRef = doc(db, 'vaults', currentUser.uid);
                                        const vaultSnap = await getDoc(vaultRef);
                                        if (vaultSnap.exists()) {
                                          const vaultData = vaultSnap.data();
                                          const maxVaultHealth = vaultData.maxVaultHealth || Math.floor((vaultData.capacity || 1000) * 0.1);
                                          const correctVaultHealth = newPP >= maxVaultHealth
                                            ? maxVaultHealth
                                            : Math.min(newPP, maxVaultHealth);
                                          
                                          await updateDoc(vaultRef, {
                                            currentPP: newPP,
                                            vaultHealth: correctVaultHealth
                                          });
                                          
                                          console.log('[Profile] Updated vault:', {
                                            currentPP: newPP,
                                            vaultHealth: correctVaultHealth,
                                            maxVaultHealth
                                          });
                                        } else {
                                          console.error('[Profile] Vault not found for user:', currentUser.uid);
                                        }
                                        
                                        // Don't call syncVaultPP here - we've already updated both collections directly
                                        // Calling syncVaultPP might read stale data and overwrite our update
                                        
                                        // Refresh user data from both collections to ensure UI updates
                                        const updatedUserSnap = await getDoc(userRef);
                                        const updatedStudentsSnap = await getDoc(studentsRef);
                                        
                                        if (updatedUserSnap.exists() && updatedStudentsSnap.exists()) {
                                          const userData = updatedUserSnap.data();
                                          const studentsData = updatedStudentsSnap.data();
                                          
                                          // Merge the data to ensure we have the latest PP
                                          setUserData({
                                            ...userData,
                                            powerPoints: studentsData.powerPoints || 0,
                                            inventory: studentsData.inventory || []
                                          });
                                          
                                          console.log('[Profile] Refreshed user data after return:', {
                                            powerPoints: studentsData.powerPoints,
                                            inventory: studentsData.inventory
                                          });
                                        }
                                        
                                        alert(`✅ ${enhancedArtifact.name} returned! You received ${returnPrice} PP (50% of original ${artifactPrice} PP).`);
                                      } catch (error) {
                                        console.error('Error returning artifact:', error);
                                        alert('Error returning artifact. Please try again.');
                                      }
                                    }}
                                  >
                                    💰 Return ({returnPrice} PP)
                                  </button>
                                );
                              }
                              return null;
                            })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Used Artifacts */}
                {Array.isArray(userData?.artifacts) && userData.artifacts.filter((artifact: any) => artifact.used).length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                      Used Artifacts ({userData.artifacts.filter((a: any) => a.used).length})
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                      {userData.artifacts.filter((artifact: any) => artifact.used).map((artifact: any, index: number) => {
                        const enhancedArtifact = enhanceLegacyItem(artifact);
                        const getRarityColor = (rarity: string) => {
                          switch (rarity) {
                            case 'common': return '#6b7280';
                            case 'rare': return '#3b82f6';
                            case 'epic': return '#8b5cf6';
                            case 'legendary': return '#f59e0b';
                            default: return '#6b7280';
                          }
                        };

                        return (
                          <div key={`${enhancedArtifact.id || artifact.name || 'artifact'}-used-${index}`} style={{ 
                            background: '#f9fafb', 
                            borderRadius: '0.5rem', 
                            padding: '0.75rem', 
                            textAlign: 'center', 
                            border: '1px solid #e5e7eb',
                            opacity: 0.7
                          }}>
                            <div style={{ marginBottom: '0.5rem' }}>
                              {typeof artifact === 'object' && artifact.image ? (
                                <img 
                                  src={artifact.image} 
                                  alt={enhancedArtifact.name || 'Artifact'} 
                                  style={{ 
                                    width: '100%', 
                                    height: '60px', 
                                    objectFit: 'cover', 
                                    borderRadius: '0.25rem',
                                    filter: 'grayscale(100%)'
                                  }} 
                                />
                              ) : (
                                <div style={{ 
                                  width: '100%', 
                                  height: '60px', 
                                  background: '#e5e7eb', 
                                  borderRadius: '0.25rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1.5rem',
                                  color: '#9ca3af'
                                }}>
                                  {typeof artifact === 'object' ? (artifact.icon || '📦') : '📦'}
                                </div>
                              )}
                            </div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                              {enhancedArtifact.name || 'Unknown Item'}
                            </div>
                            
                            {/* PP Boost Countdown Display - Only show on the artifact that was actually used */}
                            {enhancedArtifact.name === 'Double PP Boost' && ppBoostStatus.isActive && artifact.used && (
                              <div style={{
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                color: 'white',
                                padding: '0.5rem',
                                borderRadius: '0.375rem',
                                marginBottom: '0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                boxShadow: '0 2px 4px rgba(251, 191, 36, 0.3)'
                              }}>
                                ⚡ Active: {ppBoostStatus.timeRemaining} remaining
                              </div>
                            )}
                            {typeof artifact === 'object' && artifact.rarity && (
                              <div style={{ 
                                fontSize: '0.7rem', 
                                color: getRarityColor(artifact.rarity), 
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                              }}>
                                {artifact.rarity}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem 1rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  No Artifacts Yet
                </div>
                <div style={{ fontSize: '0.9rem' }}>
                  Visit the MST MKT to purchase your first artifact!
                </div>
              </div>
            )}
          </div>
      
        {/* Manifest Progress Section - Right Side with Horizontal Scrolling */}
        <div className="mst-profile-panel mst-profile-panel--artifacts" style={{ overflowX: 'auto', minWidth: 0 }}>
        <h2 className="mst-profile-panel-title" style={{ margin: '0 0 1.5rem', lineHeight: '1.5rem', flexShrink: 0, fontSize: '1.35rem' }}>
          Manifest Progress
        </h2>
        {playerManifest ? (
            <div style={{ minWidth: '600px' }}>
          <ManifestProgress 
            playerManifest={playerManifest} 
            onVeilBreak={handleVeilBreak}
            userId={currentUser?.uid}
            moves={moves}
            onAbilityUsed={() => {
              // Refresh user data to show updated usage counts
              if (currentUser?.uid) {
                fetchUserData();
              }
            }}
          />
            </div>
        ) : (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              minWidth: '400px'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#4f46e5' }}>
                Choose Your Manifest
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will.
              </p>
              <button
                onClick={() => setShowManifestSelection(true)}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold'
                }}
              >
                Select Your Manifest
              </button>
            </div>
          )}

          {/* Elemental Move Progress - under Manifest; same structure (usage, milestones 20/50/100/200/500, claim) */}
          {playerManifest && Array.isArray(moves) && (
            <div style={{ marginTop: '2rem', minWidth: '600px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#f59e0b', margin: 0, lineHeight: '1.5rem', flexShrink: 0 }}>
                ⚡ Elemental Move Progress
              </h2>
              <div style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.04) 100%)',
                border: '2px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                color: '#1f2937'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(() => {
                    // Match by base name so "Ember Jab [Level 2]" or "Ember Jab (Base: ...)" matches template "Ember Jab"
                    const getTemplateForMove = (move: any) => {
                      const name = move?.name;
                      if (!name) return undefined;
                      return MOVE_TEMPLATES.find((t: any) =>
                        t.name === name ||
                        name.startsWith(t.name + ' ') ||
                        name.startsWith(t.name + '[') ||
                        name.startsWith(t.name + '(')
                      );
                    };
                    const getCategoryFromTemplate = (move: any) => move?.category ?? getTemplateForMove(move)?.category;
                    const getMoveElement = (move: any) => (move?.elementalAffinity ?? getTemplateForMove(move)?.elementalAffinity)?.toLowerCase?.();
                    // Only show elemental moves that match the player's chosen element
                    const playerElement = hasElementSelected(style)
                      ? style.toString().toLowerCase()
                      : '';
                    const elementalMoves = moves.filter((move: any) =>
                      getCategoryFromTemplate(move) === 'elemental' && getMoveElement(move) === playerElement
                    );
                    if (!playerElement) {
                      return (
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>
                          Element: Unawakened — elemental moves unlock after you choose your Element in Chapter 1.
                        </p>
                      );
                    }
                    if (elementalMoves.length === 0) {
                      return (
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem' }}>
                          No elemental moves in your loadout yet. Unlock and add elemental moves in the Battle Arena (Skills & Mastery) to track their usage and milestones (20, 50, 100, 200, 500) here.
                        </p>
                      );
                    }
                    return elementalMoves.map((move: any, elIdx: number) => {
                    const usageCount = getMoveUsageCount(playerManifest, move.name);
                    const milestones = [...MANIFEST_MILESTONES];
                    const milestoneProgress = getMilestoneProgress(usageCount);
                    const reachedMilestones = milestones.filter((m: number) => usageCount >= m);
                    const unclaimedMilestones = playerManifest.unclaimedMilestones?.[move.name] || [];
                    const availableToClaim = milestones.filter((m: number) => usageCount >= m && unclaimedMilestones.includes(m));
                    const hasUnclaimedMilestones = availableToClaim.length > 0;
                    const hasReachedMilestones = reachedMilestones.length > 0;
                    const elementalColor = '#f59e0b';
                    const moveRowKey = `${move.id || 'move'}-${move.name}-${elIdx}`;
                    return (
                      <div
                        key={moveRowKey}
                        style={{
                          padding: '1rem',
                          background: 'rgba(255,255,255,0.6)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          borderRadius: '0.75rem',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {move.icon && <span style={{ fontSize: '1.25rem' }}>{move.icon}</span>}
                            <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#92400e' }}>{move.name}</span>
                          </div>
                          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: elementalColor }}>{usageCount} uses</span>
                        </div>
                        {move.description && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>{move.description}</div>
                        )}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: '#6b7280', fontWeight: '600' }}>Milestones:</div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                            {milestones.map((milestone: number) => {
                              const isReached = usageCount >= milestone;
                              return (
                                <div
                                  key={milestone}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    background: isReached ? elementalColor : 'rgba(255,255,255,0.8)',
                                    color: isReached ? 'white' : '#6b7280',
                                    border: `1px solid ${isReached ? elementalColor : '#e5e7eb'}`
                                  }}
                                >
                                  {milestone} {isReached ? '✓' : ''}
                                </div>
                              );
                            })}
                          </div>
                          {milestoneProgress && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: '#6b7280' }}>Next: {milestoneProgress.milestone} uses</div>
                              <div style={{ width: '100%', height: '0.5rem', background: '#e5e7eb', borderRadius: '0.25rem', overflow: 'hidden' }}>
                                <div style={{ width: `${milestoneProgress.progress}%`, height: '100%', background: elementalColor, transition: 'width 0.3s ease' }} />
                              </div>
                            </div>
                          )}
                          {hasReachedMilestones && currentUser?.uid ? (
                            <button
                              onClick={async () => {
                                if (hasUnclaimedMilestones) {
                                  await claimMilestoneRewards(currentUser.uid, move.name, availableToClaim);
                                  if (currentUser?.uid) fetchUserData();
                                }
                              }}
                              disabled={!hasUnclaimedMilestones}
                              style={{
                                padding: '0.5rem 1rem',
                                background: hasUnclaimedMilestones ? elementalColor : '#9ca3af',
                                border: 'none',
                                borderRadius: '0.5rem',
                                color: 'white',
                                cursor: hasUnclaimedMilestones ? 'pointer' : 'not-allowed',
                                fontSize: '0.875rem',
                                fontWeight: 'bold',
                                width: '100%',
                                transition: 'all 0.2s ease',
                                opacity: hasUnclaimedMilestones ? 1 : 0.6
                              }}
                            >
                              {hasUnclaimedMilestones ? (
                                <>🎁 Claim Milestone{availableToClaim.length > 1 ? 's' : ''} ({availableToClaim.length})</>
                              ) : (
                                <>✓ Milestone Claimed - Next: {milestoneProgress?.milestone || 'N/A'} uses</>
                              )}
                            </button>
                          ) : (
                            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                              Use this move in battle to progress (20, 50, 100, 200, 500 uses).
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Debug Section for UXP Artifact Management */}
      {(() => {
        const artifacts = userData?.artifacts;
        if (!Array.isArray(artifacts)) return false;
        return artifacts.some((artifact: any) => artifact.pending);
      })() && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#92400e' }}>
            🔧 Admin Debug: Pending UXP Artifacts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.isArray(userData?.artifacts) && userData.artifacts.filter((artifact: any) => artifact.pending).map((artifact: any, index: number) => (
              <div key={`${artifact.id || artifact.name || 'artifact'}-pending-${index}`} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem',
                backgroundColor: '#111827',
                borderRadius: '0.25rem',
                border: '1px solid var(--mst-border)'
              }}>
                <span style={{ fontWeight: 'bold', color: 'var(--mst-text-primary)' }}>
                  {artifact.name} (Submitted: {artifact.submittedAt ? new Date(artifact.submittedAt).toLocaleString() : 'Unknown'})
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleAdminResponse(artifact.name, true)}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => handleAdminResponse(artifact.name, false)}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manifest Selection Modal */}
      {/* Edit Rival Modal */}
      <EditRivalModal
        isOpen={showEditRivalModal}
        onClose={() => setShowEditRivalModal(false)}
        onRivalUpdated={async () => {
          if (currentUser) {
            const userId = currentUser.uid;
            // Refresh rivals data
            const rivalsData = await getRivals(userId);
            setRivals(rivalsData);
            // Also refresh userData to ensure profile updates
            await fetchUserData();
          }
        }}
      />

      {showManifestSelection && (
        <ManifestSelection
          onManifestSelect={handleManifestSelect}
          onClose={() => setShowManifestSelection(false)}
        />
      )}

      <WaysToEarnPowerPointsModal
        open={showWaysToEarnPpModal}
        onClose={() => setShowWaysToEarnPpModal(false)}
      />

    </div>
  );
};

export default Profile; 
