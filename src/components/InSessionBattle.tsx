import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import BattleEngine from './BattleEngine';
import BagModal from './BagModal';
import VaultModal from './VaultModal';
import { getLevelFromXP } from '../utils/leveling';
import { getUserSquadAbbreviations } from '../utils/squadUtils';
import { isUserScorekeeper, isUserAdmin, canEndLiveEventSession } from '../utils/roleManagement';
import { calculateDamageRange, calculateShieldBoostRange, calculateHealingRange } from '../utils/damageCalculator';
import { getEffectiveMasteryLevel, getArtifactDamageMultiplier } from '../utils/artifactUtils';
import { getMoveDamageSync } from '../utils/moveOverrides';
// New service imports
import { 
  subscribeToSession, 
  joinSession, 
  endSession, 
  leaveSession,
  getSession,
  canHostSession,
  isGlobalHost,
  type SessionPlayer as ServiceSessionPlayer
} from '../utils/inSessionService';
import { 
  startPresence, 
  stopPresence, 
  subscribeToPresence,
  isPlayerOnline,
  type PlayerPresence
} from '../utils/inSessionPresenceService';
import { 
  getAvailableSkillsForSession,
  validateSkillUsage,
  createSessionLoadout
} from '../utils/inSessionSkillsService';
import { 
  submitAction,
  subscribeToActions,
  generateClientNonce,
  checkDuplicateAction,
  type ActionType
} from '../utils/inSessionActionsService';
import { 
  trackSkillUsage,
  trackDamage,
  trackElimination,
  trackParticipation,
  getSessionSummary
} from '../utils/inSessionStatsService';
import { debug, debugError, debugThrottle } from '../utils/inSessionDebug';
import SessionSummaryModal from './SessionSummaryModal';
import { SessionSummary } from '../types/inSessionStats';
import LiveEventDebugOverlay from './LiveEventDebugOverlay';

interface Student {
  id: string;
  displayName: string;
  email: string;
  powerPoints: number;
  photoURL?: string;
  level?: number;
  xp?: number;
}

interface InSessionBattleProps {
  sessionId: string;
  classId: string;
  className: string;
  students: Student[];
  onEndSession: () => void;
}

interface SessionPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  powerLevel?: number | null; // Power Level (PL)
  powerPoints: number;
  participationCount: number;
  movesEarned: number;
  hp?: number;
  maxHp?: number;
  shield?: number;
  maxShield?: number;
  eliminated?: boolean;
}

const InSessionBattle: React.FC<InSessionBattleProps> = ({
  sessionId,
  classId,
  className,
  students,
  onEndSession
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { vault, refreshVaultData, moves } = useBattle();
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([]);
  const [battleLog, setBattleLog] = useState<string[]>(['📚 In Session Battle Started!']);
  const [selectedStudentForPP, setSelectedStudentForPP] = useState<string | null>(null);
  const [ppAdjustment, setPPAdjustment] = useState<number>(0);
  const [ppQuickAdjust, setPPQuickAdjust] = useState<{ [userId: string]: number }>({});
  const [showBagModal, setShowBagModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [selectedMove, setSelectedMove] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<string[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<string, { connected: boolean; lastSeenAt: any }>>(new Map());
  const battleEngineRef = useRef<{ selectMove: (move: any) => void; selectTarget: (targetId: string) => void } | null>(null);
  const [squadAbbreviations, setSquadAbbreviations] = useState<Map<string, string | null>>(new Map());
  // CRITICAL: Initialize all permission states as false - button is HIDDEN by default
  const [isScorekeeper, setIsScorekeeper] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [permissionsChecked, setPermissionsChecked] = useState<boolean>(false);
  const [isSessionHost, setIsSessionHost] = useState<boolean>(false);
  
  // Log initial state
  console.log('[InSessionBattle] Component initialized with permissions:', {
    isAdminUser,
    isScorekeeper,
    permissionsChecked,
    currentUserId: currentUser?.uid
  });
  const [userLevel, setUserLevel] = useState(1);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  const [userProfiles, setUserProfiles] = useState<Map<string, { displayName: string; photoURL?: string }>>(new Map());
  const isUpdatingViewersRef = useRef(false); // Prevent concurrent updates
  
  // Session summary modal state
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);

  // Track player presence using presence service
  useEffect(() => {
    if (!sessionId || !currentUser) return;

    debug('inSessionBattle', `Starting presence tracking for ${currentUser.uid}`);
    
    // Start presence tracking
    const cleanupPresence = startPresence(sessionId, currentUser.uid);

    // Subscribe to presence updates for all players
    const unsubscribePresence = subscribeToPresence(sessionId, (newPresenceMap) => {
      debugThrottle('presence-update', 2000, 'inSessionBattle', 
        `Presence update: ${newPresenceMap.size} players`, 
        Array.from(newPresenceMap.entries()).map(([uid, p]) => ({ uid, connected: p.connected }))
      );
      
      // Store presence map in state for UI to use
      setPresenceMap(newPresenceMap);
      
      // Update session players with presence data
      setSessionPlayers(prev => prev.map(player => {
        const presence = newPresenceMap.get(player.userId);
        return {
          ...player,
          // Presence data can be used to show online/offline status
        };
      }));
    });

    return () => {
      debug('inSessionBattle', `Stopping presence tracking for ${currentUser.uid}`);
      cleanupPresence();
      unsubscribePresence();
      stopPresence(sessionId, currentUser.uid);
    };
  }, [sessionId, currentUser]);

  // Load session data and listen for updates using session service
  useEffect(() => {
    if (!sessionId || !currentUser) return;

    debug('inSessionBattle', `Setting up session subscription for ${sessionId}`);
    
    // Track if join is in progress to prevent duplicate attempts
    let joinInProgress = false;
    
    // Auto-join the session if user is not already in it (idempotent)
    const autoJoinSession = async () => {
      // Prevent duplicate join attempts
      if (joinInProgress) {
        debug('inSessionBattle', 'Join already in progress, skipping duplicate attempt');
        return;
      }
      
      try {
        joinInProgress = true;
        
        // Quick check: Is user already in session?
        const sessionRef = doc(db, 'inSessionRooms', sessionId);
        const sessionDoc = await getDoc(sessionRef);
        if (sessionDoc.exists()) {
          const sessionData = sessionDoc.data();
          const alreadyInSession = sessionData.players?.some((p: any) => p.userId === currentUser.uid) || false;
          if (alreadyInSession) {
            debug('inSessionBattle', `User ${currentUser.uid} already in session, skipping join`);
            joinInProgress = false;
            return;
          }
        }
        
        // Get user and vault data for join (use vault for accurate max HP/shield from upgrades)
        const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        const vaultDoc = await getDoc(vaultRef);
        
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        const userData = userDoc.exists() ? userDoc.data() : {};
        const vaultData = vaultDoc.exists() ? vaultDoc.data() : {};
        
        const playerLevel = studentData.level || getLevelFromXP(studentData.xp || 0) || 1;
        const capacity = vaultData.capacity || studentData.powerPoints || 1000;
        // Max HP: vault uses 10% of capacity; minimum 100, or level * 10
        const maxHp = Math.max(100, Math.floor(Number(capacity) * 0.1), playerLevel * 10);
        // Current HP: use vault's current vault health so session matches Vault Management / Battle Arena
        const currentVaultHp = vaultData.vaultHealth !== undefined
          ? Math.min(vaultData.vaultHealth, maxHp, vaultData.currentPP ?? maxHp)
          : maxHp;
        const hp = currentVaultHp;
        // Max Shield: from vault upgrades (maxShieldStrength) so it reflects player upgrades
        const maxShield = Math.max(100, Number(vaultData.maxShieldStrength) || 100);
        // Current Shield: use vault's current shield so session matches Vault Management / Battle Arena
        const shield = (vaultData.shieldStrength !== undefined && vaultData.shieldStrength !== null)
          ? Math.min(vaultData.shieldStrength, maxShield)
          : maxShield;
        // PP from vault so it matches Vault Management
        const powerPoints = vaultData.currentPP ?? studentData.powerPoints ?? 0;

        const newPlayer: ServiceSessionPlayer = {
          userId: currentUser.uid,
          displayName: userData.displayName || studentData.displayName || currentUser.displayName || 'Unknown',
          photoURL: userData.photoURL || studentData.photoURL || currentUser.photoURL,
          level: playerLevel,
          powerPoints,
          participationCount: 0,
          movesEarned: 0,
          hp,
          maxHp,
          shield,
          maxShield
        };
        
        // Join session (idempotent - safe to call multiple times)
        const result = await joinSession(sessionId, newPlayer);
        if (result.success) {
          debug('inSessionBattle', `User ${currentUser.uid} joined session ${sessionId}`);
          
          // Create session loadout snapshot
          const userElement = studentData.elementalAffinity;
          await createSessionLoadout(sessionId, currentUser.uid, userElement);
        } else {
          debugError('inSessionBattle', `Failed to join session: ${result.error}`);
        }
      } catch (error) {
        debugError('inSessionBattle', `Error auto-joining session`, error);
      } finally {
        joinInProgress = false;
      }
    };
    
    // Auto-join on mount
    autoJoinSession();
    
      // Subscribe to session updates
      // CRITICAL: Ensure only one subscription per sessionId to prevent duplication
      const unsubscribe = subscribeToSession(sessionId, (session) => {
        // Dispatch subscription health update
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('liveEventSubscriptionUpdate', {
            detail: { 
              type: 'session', 
              connected: true, 
              lastUpdate: new Date().toISOString() 
            }
          }));
        }
      if (!session) {
        debug('inSessionBattle', `Session ${sessionId} does not exist`);
        return;
      }
      
      const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                 process.env.REACT_APP_DEBUG === 'true';
      
      // Throttle session update logs to reduce noise (only log every 5 seconds)
      debugThrottle('session-update', 5000, 'inSessionBattle', `Session update received`, {
        sessionId,
        playersCount: session.players?.length || 0,
        battleLogLength: session.battleLog?.length || 0,
        lastLogEntry: session.battleLog?.[session.battleLog.length - 1] || 'none'
      });
      
      const players: SessionPlayer[] = session.players || [];
      
      // CRITICAL: Log raw players array from Firestore to verify transaction wrote correctly
      if (DEBUG_LIVE_EVENTS) {
        console.log('📥 [Session Update] Raw players from Firestore:', players.map(p => ({
          userId: p.userId.substring(0, 8) + '...',
          name: p.displayName,
          hp: p.hp,
          shield: p.shield,
          pp: p.powerPoints
        })));
      }
      
      // Update player names from userProfiles (source of truth)
      const updatedPlayers = players.map((player) => {
        const latestProfile = userProfiles.get(player.userId);
        if (latestProfile && latestProfile.displayName !== player.displayName) {
          return {
            ...player,
            displayName: latestProfile.displayName,
            photoURL: latestProfile.photoURL || player.photoURL
          };
        }
        return player;
      });
      
      // ALWAYS log player state changes (critical for debugging) - enhanced
      updatedPlayers.forEach(player => {
        const oldPlayer = sessionPlayers.find(p => p.userId === player.userId);
        if (oldPlayer) {
          const changes = [];
          const oldHp = oldPlayer.hp ?? 0;
          const newHp = player.hp ?? 0;
          const oldShield = oldPlayer.shield ?? 0;
          const newShield = player.shield ?? 0;
          const oldPp = oldPlayer.powerPoints ?? 0;
          const newPp = player.powerPoints ?? 0;
          
          if (oldHp !== newHp) changes.push(`HP: ${oldHp} → ${newHp} (Δ${newHp - oldHp})`);
          if (oldShield !== newShield) changes.push(`Shield: ${oldShield} → ${newShield} (Δ${newShield - oldShield})`);
          if (oldPp !== newPp) changes.push(`PP: ${oldPp} → ${newPp} (Δ${newPp - oldPp})`);
          
          if (changes.length > 0) {
            console.log(`🔄 [Session Update] ⚡ STATE CHANGED ⚡`, player.displayName, '|', changes.join(' | '));
            
            // Dispatch state update event for debug overlay
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('liveEventStateUpdate', {
                detail: { playerId: player.userId }
              }));
            }
          } else if (DEBUG_LIVE_EVENTS) {
            // Log even when no changes to verify subscription is working
            console.log(`📊 [Session Update] No changes for ${player.displayName}:`, {
              hp: player.hp,
              shield: player.shield,
              pp: player.powerPoints
            });
          }
        } else {
          // New player joined
          if (DEBUG_LIVE_EVENTS) {
            console.log(`🆕 [Session Update] New player detected: ${player.displayName}`, {
              hp: player.hp,
              shield: player.shield,
              pp: player.powerPoints
            });
          }
        }
      });
      
      // CRITICAL: Update React state - this triggers UI re-render
      setSessionPlayers(updatedPlayers);
      
      // Update battle log
      if (session.battleLog && Array.isArray(session.battleLog)) {
        const oldLogLength = battleLog.length;
        const newLogLength = session.battleLog.length;
        // ALWAYS log battle log updates (critical for debugging)
        if (newLogLength > oldLogLength) {
          console.log(`📝 [Session Update] BATTLE LOG UPDATED:`, {
            oldLength: oldLogLength,
            newLength: newLogLength,
            newEntries: session.battleLog.slice(oldLogLength),
            sessionId,
            timestamp: new Date().toISOString()
          });
        } else if (newLogLength < oldLogLength) {
          console.warn(`⚠️ [Session Update] Battle log length DECREASED: ${oldLogLength} → ${newLogLength}`);
        }
        setBattleLog(session.battleLog);
      } else {
        console.warn('⚠️ [Session Update] Battle log missing or invalid:', {
          hasBattleLog: !!session.battleLog,
          isArray: Array.isArray(session.battleLog),
          sessionId
        });
      }
      
      // Update active viewers (if still using array for backward compatibility)
      // Note: activeViewers is optional and may not be in the type
      const activeViewersArray = (session as any).activeViewers;
      if (activeViewersArray && Array.isArray(activeViewersArray)) {
        setActiveViewers(activeViewersArray);
      }
      
      // Check if current user is the session host
      if (currentUser) {
        const isHost = session.hostUid === currentUser.uid || 
                       isGlobalHost(currentUser.uid, currentUser.email || undefined, currentUser.displayName || undefined);
        setIsSessionHost(isHost);
      }
      
      // Check if session ended and show summary modal
      if (session.status === 'ended' && !showSessionSummary) {
        debug('inSessionBattle', `Session ${sessionId} ended, fetching summary...`);
        
        // Try to get summary from session doc first
        const summaryData = (session as any).sessionSummary;
        if (summaryData) {
          setSessionSummary(summaryData);
          setShowSessionSummary(true);
        } else {
          // Fallback: try to get summary
          getSessionSummary(sessionId).then(summary => {
            if (summary) {
              setSessionSummary(summary);
              setShowSessionSummary(true);
            }
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [sessionId, currentUser, userProfiles]);

  // Load vault data for all players
  const [playerVaultData, setPlayerVaultData] = useState<Record<string, {
    vaultHealth: number;
    maxVaultHealth: number;
    shieldStrength: number;
    maxShieldStrength: number;
    currentPP: number;
    maxPP: number;
  }>>({});

  useEffect(() => {
    const loadVaultData = async () => {
      const vaultDataMap: Record<string, any> = {};
      
      for (const player of sessionPlayers) {
        try {
          const vaultRef = doc(db, 'vaults', player.userId);
          const vaultDoc = await getDoc(vaultRef);
          
          if (vaultDoc.exists()) {
            const vaultData = vaultDoc.data();
            const student = students.find(s => s.id === player.userId);
            // Use vault document as source of truth (match Vault Management / Battle Arena)
            const maxPP = vaultData.capacity || 1000; // Capacity is the max PP
            const currentPP = vaultData.currentPP ?? student?.powerPoints ?? player.powerPoints ?? 0;
            const maxVaultHealth = Math.floor(maxPP * 0.1); // Health is 10% of max PP
            const vaultHealth = vaultData.vaultHealth !== undefined
              ? Math.min(vaultData.vaultHealth, maxVaultHealth, vaultData.currentPP ?? currentPP)
              : Math.min(currentPP, maxVaultHealth);

            vaultDataMap[player.userId] = {
              vaultHealth,
              maxVaultHealth,
              shieldStrength: vaultData.shieldStrength ?? 0,
              maxShieldStrength: vaultData.maxShieldStrength ?? 100,
              currentPP,
              maxPP
            };
          } else {
            // Default values if no vault exists
            const student = students.find(s => s.id === player.userId);
            const currentPP = student?.powerPoints || player.powerPoints;
            vaultDataMap[player.userId] = {
              vaultHealth: Math.floor(currentPP * 0.1),
              maxVaultHealth: Math.floor(currentPP * 0.1),
              shieldStrength: 100,
              maxShieldStrength: 100,
              currentPP,
              maxPP: currentPP
            };
          }
        } catch (error) {
          console.error(`Error loading vault for ${player.userId}:`, error);
        }
      }
      
      setPlayerVaultData(vaultDataMap);
    };

    if (sessionPlayers.length > 0) {
      loadVaultData();
    }
  }, [sessionPlayers, students]);

  // Fetch squad abbreviations for all students
  useEffect(() => {
    const fetchSquadAbbreviations = async () => {
      const studentIds = students.map(s => s.id).filter(id => id);
      
      if (studentIds.length > 0) {
        const abbreviations = await getUserSquadAbbreviations(studentIds);
        setSquadAbbreviations(abbreviations);
      }
    };
    
    fetchSquadAbbreviations();
  }, [students]);

  // Listen to user profile updates in real-time to ensure consistent display across all game modes
  useEffect(() => {
    if (students.length === 0) return;

    const unsubscribes: (() => void)[] = [];
    const profilesMap = new Map<string, { displayName: string; photoURL?: string }>();

    // Set initial profiles from students array
    students.forEach(student => {
      profilesMap.set(student.id, {
        displayName: student.displayName,
        photoURL: student.photoURL
      });
    });
    setUserProfiles(profilesMap);

    // Set up real-time listeners for each user's profile
    students.forEach(student => {
      const userRef = doc(db, 'users', student.id);
      const unsubscribe = onSnapshot(userRef, (userDoc) => {
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserProfiles(prev => {
            const updated = new Map(prev);
            updated.set(student.id, {
              displayName: userData.displayName || student.displayName || 'Unknown',
              photoURL: userData.photoURL || student.photoURL
            });
            return updated;
          });
        }
      }, (error) => {
        // Suppress Firestore internal assertion errors
        if (error instanceof Error && 
            (error.message?.includes('INTERNAL ASSERTION FAILED') || 
             error.message?.includes('Unexpected state'))) {
          return;
        }
        console.error(`Error listening to user profile ${student.id}:`, error);
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [students]);

  // Keep sessionPlayers displayName/photoURL in sync with userProfiles (profile is source of truth)
  // Important: do NOT write back to Firestore here (avoid feedback loops). We only normalize for UI/BattleEngine rendering.
  useEffect(() => {
    if (sessionPlayers.length === 0 || userProfiles.size === 0) return;

    setSessionPlayers(prev => {
      let changed = false;
      const next = prev.map(p => {
        const profile = userProfiles.get(p.userId);
        if (!profile) return p;

        const nextDisplayName = profile.displayName || p.displayName;
        const nextPhotoURL = profile.photoURL || p.photoURL;

        if (nextDisplayName !== p.displayName || nextPhotoURL !== p.photoURL) {
          changed = true;
          return { ...p, displayName: nextDisplayName, photoURL: nextPhotoURL };
        }
        return p;
      });

      return changed ? next : prev;
    });
  }, [userProfiles, sessionPlayers.length]);

  // Check if current user is admin or scorekeeper
  useEffect(() => {
    console.log('[InSessionBattle] Permission check useEffect triggered', { currentUserId: currentUser?.uid, currentUserEmail: currentUser?.email });
    
    const checkUserPermissions = async () => {
      // Always start with false values and reset permissionsChecked
      setIsAdminUser(false);
      setIsScorekeeper(false);
      setPermissionsChecked(false);
      
      console.log('[InSessionBattle] Starting permission check...');
      
      if (!currentUser) {
        setPermissionsChecked(true);
        console.log('[InSessionBattle] No current user - permissions denied');
        return;
      }

      try {
        // Check admin status - check userRoles collection first, then fallback to email
        const hasAdminRole = await isUserAdmin(currentUser.uid, currentUser.email);
        
        console.log('[InSessionBattle] Admin check result:', {
          userId: currentUser.uid,
          email: currentUser.email,
          hasAdminRole,
          note: 'Only exact email matches or userRoles collection grant admin status'
        });
        
        // Check scorekeeper role - verify it's actually in the database
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        let isScorekeeperUser = false;
        
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          const role = roleData.role;
          const rolesArray = roleData.roles;
          
          // STRICT CHECK: Only true if:
          // 1. role field is explicitly 'scorekeeper' (not 'student' or anything else)
          // OR
          // 2. roles array exists, is an array, and explicitly contains 'scorekeeper'
          const hasScorekeeperRole = role === 'scorekeeper';
          const hasScorekeeperInArray = Array.isArray(rolesArray) && rolesArray.includes('scorekeeper');
          
          // If role is 'student', user is NOT a scorekeeper unless explicitly in roles array
          if (role === 'student') {
            isScorekeeperUser = hasScorekeeperInArray; // Only true if in roles array
          } else {
            isScorekeeperUser = hasScorekeeperRole || hasScorekeeperInArray;
          }
          
          console.log('[InSessionBattle] Scorekeeper role check:', {
            role,
            rolesArray,
            hasScorekeeperRole,
            hasScorekeeperInArray,
            isScorekeeperUser
          });
        } else {
          // No role document = not a scorekeeper
          isScorekeeperUser = false;
          console.log('[InSessionBattle] No role document found - not a scorekeeper');
        }
        
        // Final validation: explicitly deny if role is 'student' without scorekeeper in array
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          if (roleData.role === 'student' && !(Array.isArray(roleData.roles) && roleData.roles.includes('scorekeeper'))) {
            isScorekeeperUser = false;
            console.log('[InSessionBattle] Explicitly denying scorekeeper access - user is student without scorekeeper in roles array');
          }
        }
        
        // CRITICAL: Only set to true if explicitly confirmed - default is false
        // Use strict boolean checks to ensure no truthy/falsy issues
        const finalIsAdmin = Boolean(hasAdminRole === true);
        const finalIsScorekeeper = Boolean(isScorekeeperUser === true);
        
        // CRITICAL: Explicitly set to false if not confirmed
        setIsAdminUser(finalIsAdmin);
        setIsScorekeeper(finalIsScorekeeper);
        
        console.log('[InSessionBattle] Setting permission states:', {
          finalIsAdmin,
          finalIsScorekeeper,
          willShowButton: finalIsAdmin || finalIsScorekeeper,
          permissionsChecked: true
        });
        
        // Debug logging with explicit values
        console.log('[InSessionBattle] User permissions check COMPLETE:', {
          userId: currentUser.uid,
          email: currentUser.email,
          hasAdminRole: hasAdminRole,
          isScorekeeperUser: isScorekeeperUser,
          roleDocExists: roleDoc.exists(),
          roleData: roleDoc.exists() ? roleDoc.data() : null,
          settingIsAdminUser: finalIsAdmin,
          settingIsScorekeeper: finalIsScorekeeper,
          willShowButton: finalIsAdmin || finalIsScorekeeper,
          typeOfIsAdmin: typeof finalIsAdmin,
          typeOfIsScorekeeper: typeof finalIsScorekeeper
        });
      } catch (error) {
        console.error('[InSessionBattle] Error checking user permissions:', error);
        // On error, explicitly set to false - user is NOT admin or scorekeeper
        setIsAdminUser(false);
        setIsScorekeeper(false);
        setPermissionsChecked(true); // Set checked to true so UI doesn't wait forever
        console.log('[InSessionBattle] Error occurred - permissions denied, buttons will be hidden');
      } finally {
        // Always set permissionsChecked to true after check completes (whether success or error)
        // This ensures UI doesn't wait forever, but buttons will only show if isAdminUser or isScorekeeper is true
        setPermissionsChecked(true);
      }
    };

    checkUserPermissions();
  }, [currentUser]);

  // Convert students to opponents format for BattleEngine
  const opponents = sessionPlayers
    .filter(p => p.userId !== currentUser?.uid)
    .map(player => {
      const student = students.find(s => s.id === player.userId);
      const profile = userProfiles.get(player.userId);
      
      // In-Session mode: Use hp/shield from session player if available
      // Otherwise fall back to vault data
      const useSessionHealth = (player.hp !== undefined || player.shield !== undefined);
      
      let health, maxHealth, shield, maxShield, pp, maxPP;
      
      if (useSessionHealth) {
        health = player.hp ?? 100;
        shield = player.shield ?? 100;
        pp = player.powerPoints ?? 0;
        maxPP = student?.powerPoints || player.powerPoints || 1000;
        // Use vault max when available so display reflects upgrades; otherwise session max
        const vaultForMax = playerVaultData[player.userId];
        maxHealth = vaultForMax?.maxVaultHealth ?? player.maxHp ?? 100;
        maxShield = vaultForMax?.maxShieldStrength ?? player.maxShield ?? 100;
      } else {
        const vaultData = playerVaultData[player.userId] || {
          vaultHealth: Math.floor((student?.powerPoints || player.powerPoints) * 0.1),
          maxVaultHealth: Math.floor((student?.powerPoints || player.powerPoints) * 0.1),
          shieldStrength: 100,
          maxShieldStrength: 100,
          currentPP: student?.powerPoints || player.powerPoints,
          maxPP: student?.powerPoints || player.powerPoints
        };
        health = vaultData.vaultHealth;
        maxHealth = vaultData.maxVaultHealth;
        shield = vaultData.shieldStrength;
        maxShield = vaultData.maxShieldStrength;
        pp = vaultData.currentPP;
        maxPP = vaultData.maxPP;
      }
      
      return {
        id: player.userId,
        name: profile?.displayName || player.displayName,
        currentPP: pp,
        maxPP: maxPP,
        vaultHealth: health,
        maxVaultHealth: maxHealth,
        shieldStrength: shield,
        maxShieldStrength: maxShield,
        level: player.level,
        photoURL: profile?.photoURL || player.photoURL,
        speed: 50
      };
    });

  const allies = sessionPlayers
    .filter(p => p.userId === currentUser?.uid)
    .map(player => {
      const student = students.find(s => s.id === player.userId);
      const profile = userProfiles.get(player.userId);
      
      // In-Session mode: Use hp/shield from session player if available
      // Otherwise fall back to vault data
      const useSessionHealth = (player.hp !== undefined || player.shield !== undefined);
      
      let health, maxHealth, shield, maxShield, pp, maxPP;
      
      if (useSessionHealth) {
        health = player.hp ?? 100;
        shield = player.shield ?? 100;
        pp = player.powerPoints ?? 0;
        maxPP = vault?.capacity || student?.powerPoints || player.powerPoints || 1000;
        const vaultForMax = playerVaultData[player.userId];
        maxHealth = vaultForMax?.maxVaultHealth ?? player.maxHp ?? 100;
        maxShield = vaultForMax?.maxShieldStrength ?? player.maxShield ?? 100;
      } else {
        const vaultData = playerVaultData[player.userId] || (vault ? {
          vaultHealth: Math.floor(vault.currentPP * 0.1),
          maxVaultHealth: Math.floor((vault.capacity || vault.currentPP) * 0.1),
          shieldStrength: vault.shieldStrength || 100,
          maxShieldStrength: vault.maxShieldStrength || 100,
          currentPP: vault.currentPP,
          maxPP: vault.capacity || 1000
        } : {
          vaultHealth: 100,
          maxVaultHealth: 100,
          shieldStrength: 100,
          maxShieldStrength: 100,
          currentPP: student?.powerPoints || player.powerPoints,
          maxPP: student?.powerPoints || player.powerPoints
        });
        health = vaultData.vaultHealth;
        maxHealth = vaultData.maxVaultHealth;
        shield = vaultData.shieldStrength;
        maxShield = vaultData.maxShieldStrength;
        pp = vaultData.currentPP;
        maxPP = vaultData.maxPP;
      }
      
      return {
        id: player.userId,
        name: profile?.displayName || player.displayName,
        currentPP: pp,
        maxPP: maxPP,
        vaultHealth: health,
        maxVaultHealth: maxHealth,
        shieldStrength: shield,
        maxShieldStrength: maxShield,
        level: player.level,
        photoURL: profile?.photoURL || player.photoURL,
        isPlayer: true,
        speed: 50
      };
    });

  // Handle participation tracking
  const handleAddParticipation = async (userId: string) => {
    // Security check: Only admins and scorekeepers can add participation
    if (!currentUser) {
      console.error('Unauthorized: No user logged in');
      return;
    }

    // Verify user has permission - only Yondaime can add participation
    const isYondaime = currentUser?.email === 'edm21179@gmail.com' || 
                       currentUser?.displayName === 'Yondaime' || 
                       currentUser?.displayName?.toLowerCase() === 'yondaime';
    
    if (!isYondaime) {
      console.error('[InSessionBattle] Unauthorized: Only Yondaime can add participation');
      return;
    }

    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return;

      const data = sessionDoc.data();
      const players: SessionPlayer[] = data.players || [];

      // Check if player is already in session (works for both in-session and not-in-session players)
      const existingPlayer = players.find(p => p.userId === userId);
      
      let updatedPlayers: SessionPlayer[];
      
      if (existingPlayer) {
        // Player is in session - update their participation
        updatedPlayers = players.map(p => {
          if (p.userId === userId) {
            const newParticipationCount = (p.participationCount || 0) + 1;
            const newMovesEarned = Math.floor(newParticipationCount / 1); // 1 participation = 1 move
            return {
              ...p,
              participationCount: newParticipationCount,
              movesEarned: newMovesEarned
            };
          }
          return p;
        });
      } else {
        // Player is not in session - add them first, then add participation
        const student = students.find(s => s.id === userId);
        if (!student) return; // Student not found
        
        // Get latest profile data from users collection (source of truth)
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const latestProfile = userProfiles.get(userId);
        
        // Use latest profile data if available, otherwise fall back to student data
        const displayName = latestProfile?.displayName || userData.displayName || student.displayName;
        const photoURL = latestProfile?.photoURL || userData.photoURL || student.photoURL;
        
        const newPlayer: SessionPlayer = {
          userId: student.id,
          displayName: displayName,
          photoURL: photoURL,
          level: student.level || getLevelFromXP(student.xp || 0) || 1,
          powerPoints: student.powerPoints || 0,
          participationCount: 1, // Start with 1 participation
          movesEarned: 1 // 1 participation = 1 move
        };
        
        updatedPlayers = [...players, newPlayer];
      }

      // Update battle log
      const updatedPlayer = updatedPlayers.find(p => p.userId === userId);
      const playerName = updatedPlayer?.displayName || students.find(s => s.id === userId)?.displayName || 'Player';
      
      // Track participation in stats
      await trackParticipation(sessionId, userId, 1);
      
      const newLogEntry = `✨ ${playerName} participated! (+1 participation, ${updatedPlayer?.movesEarned || 0} moves earned)`;
      const updatedLog = [...(data.battleLog || []), newLogEntry];

      await updateDoc(sessionRef, {
        players: updatedPlayers,
        battleLog: updatedLog,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding participation:', error);
    }
  };

  // Handle adding participation points (directly adds 1 move)
  const handleAddParticipationPoint = async (userId: string) => {
    // Security check: Only admins and scorekeepers can add participation points
    if (!currentUser) {
      console.error('Unauthorized: No user logged in');
      return;
    }

    // Verify user has permission - only Yondaime can add participation points
    const isYondaime = currentUser?.email === 'edm21179@gmail.com' || 
                       currentUser?.displayName === 'Yondaime' || 
                       currentUser?.displayName?.toLowerCase() === 'yondaime';
    
    if (!isYondaime) {
      console.error('[InSessionBattle] Unauthorized: Only Yondaime can add participation points');
      return;
    }

    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return;

      const data = sessionDoc.data();
      const players: SessionPlayer[] = data.players || [];
      const updatedPlayers = players.map(p => {
        if (p.userId === userId) {
          return {
            ...p,
            movesEarned: (p.movesEarned || 0) + 1
          };
        }
        return p;
      });

      // Update battle log
      const player = players.find(p => p.userId === userId);
      const newLogEntry = `✨ ${player?.displayName || 'Player'} earned +1 Par. Pt. (${updatedPlayers.find(p => p.userId === userId)?.movesEarned || 0} moves available)`;
      const updatedLog = [...(data.battleLog || []), newLogEntry];

      await updateDoc(sessionRef, {
        players: updatedPlayers,
        battleLog: updatedLog,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding participation point:', error);
    }
  };

  // Handle PP adjustment
  const handleAdjustPP = async (userId: string, amount: number) => {
    // Security check: Only admins and scorekeepers can adjust PP
    if (!currentUser) {
      console.error('[InSessionBattle] Unauthorized: No user logged in');
      return;
    }

    // Verify user has permission - only Yondaime can adjust PP
    const isYondaime = currentUser?.email === 'edm21179@gmail.com' || 
                       currentUser?.displayName === 'Yondaime' || 
                       currentUser?.displayName?.toLowerCase() === 'yondaime';
    
    if (!isYondaime) {
      console.error('[InSessionBattle] Unauthorized: Only Yondaime can adjust PP');
      return;
    }

    try {
      // Update student document
      const studentRef = doc(db, 'students', userId);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) return;

      const currentPP = studentDoc.data().powerPoints || 0;
      const newPP = Math.max(0, currentPP + amount);

      await updateDoc(studentRef, {
        powerPoints: newPP
      });

      // Update vault if it exists
      const vaultRef = doc(db, 'vaults', userId);
      const vaultDoc = await getDoc(vaultRef);
      if (vaultDoc.exists()) {
        await updateDoc(vaultRef, {
          currentPP: newPP
        });
      }

      // Update session players
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        const players: SessionPlayer[] = data.players || [];
        const updatedPlayers = players.map(p => {
          if (p.userId === userId) {
            return { ...p, powerPoints: newPP };
          }
          return p;
        });

        const player = players.find(p => p.userId === userId);
        const student = students.find(s => s.id === userId);
        const playerName = player?.displayName || student?.displayName || 'Player';
        const newLogEntry = amount > 0 
          ? `💰 ${playerName} gained ${amount} PP!`
          : `💰 ${playerName} lost ${Math.abs(amount)} PP!`;
        const updatedLog = [...(data.battleLog || []), newLogEntry];

        await updateDoc(sessionRef, {
          players: updatedPlayers,
          battleLog: updatedLog,
          updatedAt: serverTimestamp()
        });
      }

      // Refresh vault data for current user if they're the one being updated
      if (userId === currentUser?.uid) {
        await refreshVaultData();
      }
    } catch (error) {
      console.error('Error adjusting PP:', error);
    }
  };

  // Custom move consumption - check participation instead of offline moves
  const handleMoveConsumption = useCallback(async (): Promise<boolean> => {
    if (!currentUser) return false;

    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return false;

      const data = sessionDoc.data();
      const players: SessionPlayer[] = data.players || [];
      const player = players.find(p => p.userId === currentUser.uid);

      if (!player) return false;

      // Check if player has moves available from participation
      if (player.movesEarned > 0) {
        // Consume a move
        const updatedPlayers = players.map(p => {
          if (p.userId === currentUser.uid) {
            return {
              ...p,
              movesEarned: Math.max(0, p.movesEarned - 1)
            };
          }
          return p;
        });

        await updateDoc(sessionRef, {
          players: updatedPlayers,
          updatedAt: serverTimestamp()
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking move consumption:', error);
      return false;
    }
  }, [currentUser, sessionId]);

  // Handle battle log updates from BattleEngine
  const handleBattleLogUpdate = useCallback(async (newLog: string[]) => {
    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return;
      
      const sessionData = sessionDoc.data();
      const currentLog = sessionData.battleLog || [];
      
      // Only update if there are new log entries (prevent redundant updates)
      if (newLog.length > currentLog.length) {
        const newEntries = newLog.slice(currentLog.length);
        debug('inSessionBattle', `Adding ${newEntries.length} new battle log entries`, newEntries);
        
        await updateDoc(sessionRef, {
          battleLog: newLog,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      debugError('inSessionBattle', 'Error updating battle log', error);
    }
  }, [sessionId]);

  // Handle battle end
  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape', winnerId?: string, loserId?: string) => {
    // Update battle log
    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        const updatedLog = [...(data.battleLog || []), `🏁 Battle ended: ${result}`];
        await updateDoc(sessionRef, {
          battleLog: updatedLog,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating battle log:', error);
    }
  };

  const currentPlayer = sessionPlayers.find(p => p.userId === currentUser?.uid);

  // Get all students in the class (not just those in session)
  // Create a combined list with session players and non-session students
  // Always use the latest profile data from userProfiles to ensure consistency
  const allClassStudents = students.map(student => {
    const sessionPlayer = sessionPlayers.find(p => p.userId === student.id);
    const latestProfile = userProfiles.get(student.id);
    
    // Use latest profile data if available, otherwise fall back to student data
    const displayName = latestProfile?.displayName || student.displayName;
    const photoURL = latestProfile?.photoURL || student.photoURL;
    
    return {
      ...student,
      displayName, // Override with latest profile data
      photoURL, // Override with latest profile data
      isInSession: !!sessionPlayer,
      sessionData: sessionPlayer || null
    };
  });

  // Split all students evenly between left and right
  const midPoint = Math.ceil(allClassStudents.length / 2);
  const leftStudents = allClassStudents.slice(0, midPoint);
  const rightStudents = allClassStudents.slice(midPoint);

  // Helper function to render a player card
  const renderPlayerCard = (student: Student & { isInSession: boolean; sessionData: SessionPlayer | null }, isLeft: boolean) => {
    const player = student.sessionData;
    
    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                               process.env.REACT_APP_DEBUG === 'true';
    
    // CRITICAL: For players in session, use session player data (hp/shield from session document)
    // This is the source of truth that gets updated by applyInSessionMove
    // Only fall back to vault data for players not in session
    let vaultData: {
      vaultHealth: number;
      maxVaultHealth: number;
      shieldStrength: number;
      maxShieldStrength: number;
      currentPP: number;
      maxPP: number;
    };
    
    if (player && (player.hp !== undefined || player.shield !== undefined)) {
      // Session player: current hp/shield from session; max and PP from vault when available (match Vault Management / Battle Arena)
      let hp = player.hp ?? 100;
      let shield = player.shield ?? 100;
      const vaultForMax = playerVaultData[student.id];
      const maxHp = vaultForMax?.maxVaultHealth ?? player.maxHp ?? 100;
      const maxShield = vaultForMax?.maxShieldStrength ?? player.maxShield ?? 100;
      // When session still shows "full" (never took damage), prefer vault current so display matches Vault Management
      if (vaultForMax && hp >= maxHp && shield >= maxShield) {
        hp = vaultForMax.vaultHealth;
        shield = vaultForMax.shieldStrength;
      }
      // Prefer vault currentPP so displayed PP matches Vault Management
      const pp = vaultForMax?.currentPP ?? player.powerPoints ?? (student.powerPoints || 0);
      const maxPP = vaultForMax?.maxPP ?? 1000;
      vaultData = {
        vaultHealth: hp,
        maxVaultHealth: maxHp,
        shieldStrength: shield,
        maxShieldStrength: maxShield,
        currentPP: pp,
        maxPP
      };
      
      if (DEBUG_LIVE_EVENTS) {
        console.log(`📊 [renderPlayerCard] Using session data for ${player.displayName}:`, {
          hp,
          maxHp,
          shield,
          maxShield,
          pp
        });
      }
    } else if (player && playerVaultData[student.id]) {
      // Player is in session but no hp/shield yet - use vault data as fallback
      vaultData = playerVaultData[student.id];
    } else if (player) {
      // Player is in session but no vault data yet - use player's PP
      const pp = student.powerPoints || player.powerPoints || 0;
      vaultData = {
        vaultHealth: Math.floor(pp * 0.1),
        maxVaultHealth: Math.floor(pp * 0.1),
        shieldStrength: 100,
        maxShieldStrength: 100,
        currentPP: pp,
        maxPP: pp
      };
    } else {
      // Player not in session - use student's PP
      const pp = student.powerPoints || 0;
      vaultData = {
        vaultHealth: Math.floor(pp * 0.1),
        maxVaultHealth: Math.floor(pp * 0.1),
        shieldStrength: 100,
        maxShieldStrength: 100,
        currentPP: pp,
        maxPP: pp
      };
    }
    
    // Ensure all values are numbers and have defaults
    vaultData = {
      vaultHealth: vaultData?.vaultHealth ?? Math.floor((student.powerPoints || 0) * 0.1),
      maxVaultHealth: vaultData?.maxVaultHealth ?? Math.floor((student.powerPoints || 0) * 0.1),
      shieldStrength: vaultData?.shieldStrength ?? 100,
      maxShieldStrength: vaultData?.maxShieldStrength ?? 100,
      currentPP: vaultData?.currentPP ?? (student.powerPoints || 0),
      maxPP: vaultData?.maxPP ?? (student.powerPoints || 0)
    };
    
    const isCurrentPlayer = student.id === currentUser?.uid;
    const isActiveInSession = student.isInSession;
    // Check if player is present (actively viewing the session)
    // Use presence service data (connected: true) or fallback to activeViewers array
    const playerPresence = presenceMap.get(student.id);
    const isPresentInPresenceService = playerPresence?.connected === true;
    const isPresentInActiveViewers = activeViewers.includes(student.id);
    const isPresent = isActiveInSession && (isPresentInPresenceService || isPresentInActiveViewers);
    // Eliminated: from session flag or inferred when in session with 0 health and 0 shield
    const isEliminated = player?.eliminated === true || (isActiveInSession && vaultData.vaultHealth === 0 && vaultData.shieldStrength === 0);

    return (
      <div
        key={student.id}
        onClick={async (e) => {
          // If a move is selected, use this player as target
          // Allow targeting ALL players (including those not in session)
          if (selectedMove && student.id !== currentUser?.uid) {
            // ALWAYS log target click (critical - must see this)
            console.log('🎯 [InSessionBattle] ⚡ TARGET CLICKED ⚡', student.displayName, '| Move:', selectedMove?.name, '| TraceId:', currentTraceId || 'NEW');
            
            e.stopPropagation(); // Prevent event bubbling
            
            const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILLS === 'true' ||
                                     process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                     process.env.REACT_APP_DEBUG === 'true';
            
            // Stage B: Target clicked - Use existing traceId or generate new one
            const { generateTraceId, traceStage, writeDebugAction } = await import('../utils/liveEventDebug');
            const traceId = currentTraceId || generateTraceId();
            if (!currentTraceId) {
              setCurrentTraceId(traceId);
            }
            
            console.log('🎯 [InSessionBattle] Using traceId:', traceId);
            
            traceStage('targeted', traceId, 'Target clicked', {
              targetId: student.id,
              targetName: student.displayName,
              selectedMove: {
                id: selectedMove.id,
                name: selectedMove.name,
                type: selectedMove.type,
                cost: selectedMove.cost,
                category: selectedMove.category
              },
              actorUid: currentUser?.uid,
              sessionId: sessionId
            }, { file: 'InSessionBattle.tsx', line: 1158 });
            
            // Write debug mirror
            if (classId && sessionId) {
              await writeDebugAction(classId, sessionId, traceId, 'targeted', {
                actorUid: currentUser?.uid || '',
                targetUid: student.id,
                skillId: selectedMove.id,
                skillName: selectedMove.name,
                metadata: {
                  targetName: student.displayName
                }
              });
            }
            
            // ALWAYS log target click (critical - must see this)
            console.log('🎯 [InSessionBattle] ⚡ TARGET CLICKED ⚡', student.displayName, '| Move:', selectedMove?.name, '| TraceId:', traceId);
            console.log('🎯 [InSessionBattle] Target click details:', {
              traceId: traceId || 'NONE',
              targetId: student.id,
              targetName: student.displayName,
              selectedMove: selectedMove ? {
                id: selectedMove.id,
                name: selectedMove.name,
                type: selectedMove.type,
                cost: selectedMove.cost,
                category: selectedMove.category
              } : null,
              actorUid: currentUser?.uid,
              sessionId: sessionId,
              hasClassId: !!classId
            });
            
            // CRITICAL: Verify we have all required data before dispatching
            if (!selectedMove || !selectedMove.id) {
              console.error('❌ [InSessionBattle] Cannot dispatch - invalid selectedMove!', selectedMove);
              alert('Error: No move selected. Please select a move first.');
              return;
            }
            
            if (!student.id) {
              console.error('❌ [InSessionBattle] Cannot dispatch - invalid target!', student);
              alert('Error: Invalid target selected.');
              return;
            }
            
            if (!currentUser || !currentUser.uid) {
              console.error('❌ [InSessionBattle] Cannot dispatch - no current user!');
              alert('Error: Not logged in.');
              return;
            }
            
            if (!sessionId) {
              console.error('❌ [InSessionBattle] Cannot dispatch - no sessionId!');
              alert('Error: No session ID.');
              return;
            }
            
            setSelectedTarget(student.id);
            // Dispatch custom event to trigger BattleEngine move execution
            // Include traceId, classId, and eventId in event detail
            const eventDetail = { 
              move: selectedMove, 
              targetId: student.id, 
              traceId,
              classId,
              eventId: sessionId // Using sessionId as eventId for now
            };
            
            // ALWAYS log event dispatch (critical - must see this)
            console.log('📤 [InSessionBattle] ⚡ DISPATCHING EVENT ⚡', selectedMove?.name, '→', student.displayName, '| TraceId:', traceId);
            console.log('📤 [InSessionBattle] Event detail:', eventDetail);
            
            try {
              window.dispatchEvent(new CustomEvent('inSessionMoveSelect', {
                detail: eventDetail
              }));
              console.log('✅ [InSessionBattle] Event dispatched successfully');
            } catch (error) {
              console.error('❌ [InSessionBattle] Failed to dispatch event:', error);
              alert('Error: Failed to dispatch move event. Check console for details.');
              return;
            }
            
            // Clear selection after dispatching
            setSelectedMove(null);
            setSelectedTarget(null);
            setCurrentTraceId(null);
          }
        }}
        style={{
          background: isActiveInSession ? 'white' : '#f9fafb',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          border: selectedMove && student.id !== currentUser?.uid
            ? '3px solid #fbbf24'
            : (isCurrentPlayer ? '2px solid #3b82f6' : (isPresent ? '2px solid #10b981' : (isActiveInSession ? '2px solid #ef4444' : '1px solid #e5e7eb'))),
          boxShadow: selectedMove && student.id !== currentUser?.uid
            ? '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2)'
            : (isCurrentPlayer ? '0 2px 8px rgba(59, 130, 246, 0.2)' : (isPresent ? '0 2px 8px rgba(16, 185, 129, 0.2)' : (isActiveInSession ? '0 2px 8px rgba(239, 68, 68, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)'))),
          opacity: isActiveInSession ? 1 : (selectedMove ? 1 : 0.7), // Full opacity when move is selected
          position: 'relative',
          cursor: selectedMove && student.id !== currentUser?.uid ? 'pointer' : 'default',
          transform: selectedMove && student.id !== currentUser?.uid ? 'scale(1.05)' : 'scale(1)',
          transition: 'all 0.2s',
          zIndex: selectedMove && student.id !== currentUser?.uid ? 1000 : 'auto'
        }}
        onMouseEnter={(e) => {
          if (selectedMove && student.id !== currentUser?.uid) {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 0 25px rgba(251, 191, 36, 1), 0 6px 16px rgba(0, 0, 0, 0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (selectedMove && student.id !== currentUser?.uid) {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2)';
          } else {
            e.currentTarget.style.transform = 'scale(1)';
          }
        }}
      >
        {/* Active/Inactive Indicator */}
        <div style={{
          position: 'absolute',
          top: '0.375rem',
          right: '0.375rem',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isPresent ? '#10b981' : (isActiveInSession ? '#ef4444' : '#9ca3af'),
          border: '2px solid white',
          boxShadow: '0 0 0 1px ' + (isPresent ? '#10b981' : (isActiveInSession ? '#ef4444' : '#9ca3af'))
        }} title={isPresent ? 'Present in Session' : (isActiveInSession ? 'Not Present' : 'Not in Session')} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {(student.photoURL || player?.photoURL) ? (
            <img
              src={student.photoURL || player?.photoURL}
              alt={student.displayName}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: isCurrentPlayer ? '2px solid #3b82f6' : (isPresent ? '2px solid #10b981' : (isActiveInSession ? '2px solid #ef4444' : '1px solid #e5e7eb')),
                objectFit: 'cover',
                flexShrink: 0
              }}
            />
          ) : (
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: isCurrentPlayer ? '#3b82f6' : (isPresent ? '#10b981' : (isActiveInSession ? '#ef4444' : '#8b5cf6')),
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1rem',
              flexShrink: 0
            }}>
              {student.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: '600', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{student.displayName}</span>
                {squadAbbreviations.get(student.id) && (
                  <span style={{
                    fontSize: '0.7rem',
                    color: '#4f46e5',
                    fontWeight: '600'
                  }}>
                    [{squadAbbreviations.get(student.id)}]
                  </span>
                )}
              </div>
              {isActiveInSession ? (
                <span style={{
                  fontSize: '0.65rem',
                  background: isPresent ? '#10b981' : '#ef4444',
                  color: 'white',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  fontWeight: '600'
                }}>
                  {isPresent ? 'IN SESSION' : 'NOT PRESENT'}
                </span>
              ) : (
                <span style={{
                  fontSize: '0.65rem',
                  background: '#9ca3af',
                  color: 'white',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  fontWeight: '600'
                }}>
                  NOT JOINED
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Level {player?.level || student.level || 1}</span>
              {(player?.powerLevel !== null && player?.powerLevel !== undefined) && (
                <span style={{ 
                  color: '#8b5cf6', 
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}>
                  ⚡ PL {player.powerLevel}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Health Bar */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.125rem', color: '#dc2626', fontWeight: '600' }}>
            HEALTH
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, vaultData.maxVaultHealth > 0 ? (vaultData.vaultHealth / vaultData.maxVaultHealth) * 100 : 0))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
              transition: 'width 0.3s ease'
            }} />
            <div style={{ 
              position: 'absolute', 
              right: '3px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              fontSize: '0.6rem',
              color: '#6b7280',
              fontWeight: '600'
            }}>
              {vaultData.vaultHealth}
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '0.05rem', color: '#6b7280' }}>
            {vaultData.vaultHealth}/{vaultData.maxVaultHealth}
          </div>
        </div>

        {/* Shield Bar */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.125rem', color: '#3b82f6', fontWeight: '600' }}>
            SHIELD
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, vaultData.maxShieldStrength > 0 ? (vaultData.shieldStrength / vaultData.maxShieldStrength) * 100 : 0))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
              transition: 'width 0.3s ease'
            }} />
            <div style={{ 
              position: 'absolute', 
              right: '3px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              fontSize: '0.6rem',
              color: '#6b7280',
              fontWeight: '600'
            }}>
              {vaultData.shieldStrength}
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '0.05rem', color: '#6b7280' }}>
            {vaultData.shieldStrength}/{vaultData.maxShieldStrength}
          </div>
        </div>

        {/* Participation Tracking - Show for ALL players (in session or not) */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.125rem', color: '#8b5cf6', fontWeight: '600' }}>
            PARTICIPATION
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            background: '#f3f4f6',
            borderRadius: '0.25rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '500' }}>
                Points: <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{player?.participationCount || 0}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '500' }}>
                Times: <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{player?.participationCount || 0}</span>
              </div>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '500' }}>
              Moves Available: <span style={{ color: '#10b981', fontWeight: '600' }}>{player?.movesEarned || 0}</span>
            </div>
          </div>
        </div>

        {/* PP Display - use vaultData so it matches Vault Management / Battle Arena */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>
            {vaultData.currentPP} PP
          </div>
        </div>

        {/* Admin/Scorekeeper Controls - COMPLETELY HIDDEN for all non-admin and non-scorekeeper users */}
        {/* ALL PP controls (Participation, -10/+10, PP Tools) are REMOVED from DOM unless user is explicitly confirmed as admin OR scorekeeper */}
        {/* Only show buttons if permissions are checked AND user is explicitly admin OR scorekeeper */}
        {/* For non-admin and non-scorekeeper users, these buttons should NEVER appear */}
        {(() => {
          // HARDCODED: Only Yondaime (the admin) can see buttons on ALL player cards
          // Check if the current user (viewer) is Yondaime by email or displayName
          // Yondaime's email is edm21179@gmail.com
          const isYondaimeByEmail = currentUser?.email === 'edm21179@gmail.com';
          const isYondaimeByDisplayName = currentUser?.displayName === 'Yondaime' || 
                                         currentUser?.displayName?.toLowerCase() === 'yondaime';
          const isYondaimeViewer = isYondaimeByEmail || isYondaimeByDisplayName;
          
          // STRICT CHECK: Only show buttons if permissions are checked AND current user is Yondaime
          // Yondaime can see buttons on ALL player cards to manage participation and PP
          const hasPermissions = permissionsChecked === true;
          const isAuthorized = isYondaimeViewer === true;
          const shouldShowButtons = hasPermissions && isAuthorized;
          
          // Always log for debugging (not just in development) to help track down issues
          console.log('[InSessionBattle] Button visibility check for student:', {
            studentId: student.id,
            studentName: student.displayName,
            currentUserId: currentUser?.uid,
            currentUserEmail: currentUser?.email,
            currentUserDisplayName: currentUser?.displayName,
            isYondaimeByEmail,
            isYondaimeByDisplayName,
            isYondaimeViewer,
            permissionsChecked,
            isAdminUser,
            isScorekeeper,
            hasPermissions,
            isAuthorized,
            shouldShowButtons,
            willRenderButtons: shouldShowButtons === true,
            note: 'Buttons only show when Yondaime is signed in - Yondaime can manage all players'
          });
          
          // CRITICAL: Only return true if current user is Yondaime (can see buttons on all cards)
          return shouldShowButtons === true;
        })() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.375rem' }}>
            <button
              onClick={() => handleAddParticipation(student.id)}
              style={{
                width: '100%',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                padding: '0.375rem',
                fontSize: '0.7rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              + Participation
            </button>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              background: '#f3f4f6',
              borderRadius: '0.25rem',
              padding: '0.2rem',
              border: '1px solid #d1d5db'
            }}>
              <button
                onClick={() => {
                  const currentValue = ppQuickAdjust[student.id] || 0;
                  setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: currentValue - 10 });
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  minWidth: '28px'
                }}
                title="Subtract 10 PP"
              >
                -10
              </button>
              <input
                type="number"
                value={ppQuickAdjust[student.id] || ''}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: value });
                }}
                placeholder="PP"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  padding: '0.2rem',
                  minWidth: '40px',
                  maxWidth: '60px'
                }}
              />
              <button
                onClick={() => {
                  const currentValue = ppQuickAdjust[student.id] || 0;
                  setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: currentValue + 10 });
                }}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  minWidth: '28px'
                }}
                title="Add 10 PP"
              >
                +10
              </button>
              <button
                onClick={() => {
                  const amount = ppQuickAdjust[student.id] || 0;
                  if (amount !== 0) {
                    handleAdjustPP(student.id, amount);
                    setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: 0 });
                  }
                }}
                disabled={!ppQuickAdjust[student.id] || ppQuickAdjust[student.id] === 0}
                style={{
                  background: (ppQuickAdjust[student.id] && ppQuickAdjust[student.id] !== 0) ? '#3b82f6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: '600',
                  cursor: (ppQuickAdjust[student.id] && ppQuickAdjust[student.id] !== 0) ? 'pointer' : 'not-allowed',
                  opacity: (ppQuickAdjust[student.id] && ppQuickAdjust[student.id] !== 0) ? 1 : 0.6
                }}
                title="Apply PP change"
              >
                ✓
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedStudentForPP(student.id);
                setPPAdjustment(0);
              }}
              style={{
                width: '100%',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                padding: '0.375rem',
                fontSize: '0.7rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              PP Tools
            </button>
          </div>
        ) : (
          // Explicitly render nothing for non-admin/non-scorekeeper users
          // This ensures buttons are completely removed from DOM
          null
        )}
        
        {/* Show message if not in session or not present */}
        {!isActiveInSession && (
          <div style={{
            marginTop: '0.375rem',
            padding: '0.375rem',
            background: '#fef3c7',
            borderRadius: '0.25rem',
            fontSize: '0.65rem',
            color: '#92400e',
            textAlign: 'center',
            fontWeight: '500'
          }}>
            Not in session
          </div>
        )}
        {isActiveInSession && !isPresent && (
          <div style={{
            marginTop: '0.375rem',
            padding: '0.375rem',
            background: '#fee2e2',
            borderRadius: '0.25rem',
            fontSize: '0.65rem',
            color: '#991b1b',
            textAlign: 'center',
            fontWeight: '500'
          }}>
            Not Present
          </div>
        )}

        {/* Eliminated overlay - shows over card when player is eliminated */}
        {isEliminated && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '0.5rem',
              background: 'rgba(0, 0, 0, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10
            }}
          >
            <span style={{
              fontSize: '1.25rem',
              fontWeight: '800',
              color: '#fef2f2',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              letterSpacing: '0.05em'
            }}>
              Eliminated
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <LiveEventDebugOverlay
        sessionId={sessionId}
        classId={classId}
        eventId={sessionId}
        selectedSkillId={selectedMove?.id}
        selectedTargetUid={selectedTarget || undefined}
      />
      <div style={{ 
        padding: '1rem',
        maxWidth: '1600px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0, marginBottom: '0.5rem' }}>📚 In Session: {className}</h1>
          <p style={{ fontSize: '1rem', opacity: 0.9, margin: 0 }}>
            {sessionPlayers.length} players • {currentPlayer ? `${currentPlayer.movesEarned} moves available` : 'Loading...'}
          </p>
        </div>
        {/* Leave Live Event: all players. End Session: only designated session-ender (all others see only Leave Live Event) */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={async () => {
              if (!currentUser) return;
              try {
                const left = await leaveSession(sessionId, currentUser.uid, currentUser.displayName || undefined);
                if (left) {
                  debug('inSessionBattle', `User ${currentUser.uid} left session ${sessionId}`);
                  navigate('/live-events');
                } else {
                  alert('Failed to leave session. Please try again.');
                }
              } catch (error) {
                debugError('inSessionBattle', 'Error leaving session', error);
                alert('Error leaving session. Please try again.');
              }
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '2px solid white',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Leave Live Event
          </button>
          {permissionsChecked && canEndLiveEventSession(currentUser?.email ?? null) && (
            <button
              onClick={async () => {
                if (!currentUser) return;
                try {
                  const ended = await endSession(sessionId, currentUser.uid, currentUser.email || undefined);
                  if (ended) {
                    debug('inSessionBattle', `Session ${sessionId} ended by ${currentUser.uid}`);
                    onEndSession();
                  } else {
                    debugError('inSessionBattle', `Failed to end session ${sessionId}`);
                    alert('Failed to end session. Only the designated host can end the session.');
                  }
                } catch (error) {
                  debugError('inSessionBattle', `Error ending session`, error);
                  alert('Error ending session. Please try again.');
                }
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.9)',
                color: 'white',
                border: '2px solid white',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              End Session
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 200px)', minHeight: '600px' }}>
        {/* Left Side - Players (Scrollable) */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: '#1f2937', fontWeight: '600' }}>Players</h2>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '0.5rem'
          }}>
            {leftStudents.map((student) => renderPlayerCard(student, true))}
          </div>
        </div>

        {/* Center - Battle Log, Action Buttons, and BattleEngine */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem',
          minWidth: 0,
          position: 'relative'
        }}>
          {/* Battle Log */}
          <div style={{
            background: '#374151',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '2px solid #1f2937',
            flex: 1,
            minHeight: '200px',
            maxHeight: '400px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 2
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              marginBottom: '1rem', 
              color: 'white',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              📜 BATTLE LOG
            </h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: 'white'
            }}>
              {battleLog.length === 0 ? (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                  Welcome to the MST Battle Arena! Select a move to begin your attack!
                </div>
              ) : (
                battleLog.map((log, index) => (
                  <div key={index} style={{ color: 'white', padding: '0.25rem 0' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            zIndex: 2
          }}>
            <button
              onClick={() => {
                console.log('⚔️ [InSessionBattle] FIGHT button clicked', {
                  hasCurrentPlayer: !!currentPlayer,
                  movesEarned: currentPlayer?.movesEarned || 0,
                  willOpenMenu: !!(currentPlayer && (currentPlayer.movesEarned || 0) > 0)
                });
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  setShowMoveMenu(true);
                  console.log('✅ [InSessionBattle] Move menu opened');
                } else {
                  console.warn('⚠️ [InSessionBattle] Cannot open menu - no moves available');
                }
              }}
              disabled={!currentPlayer || (currentPlayer.movesEarned || 0) === 0}
              style={{
                width: '100%',
                background: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                  : '#9ca3af',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? '0 4px 12px rgba(239, 68, 68, 0.3)' 
                  : 'none',
                opacity: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                }
              }}
              title={(currentPlayer && (currentPlayer.movesEarned || 0) === 0) ? 'No moves available. Earn Par. Pt. to make moves!' : 'Select a move to attack'}
            >
              ⚔️ FIGHT {(!currentPlayer || (currentPlayer.movesEarned || 0) === 0) && '(No Moves)'}
            </button>
            <button
              onClick={() => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  setShowBagModal(true);
                }
              }}
              disabled={!currentPlayer || (currentPlayer.movesEarned || 0) === 0}
              style={{
                width: '100%',
                background: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                  : '#9ca3af',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? '0 4px 12px rgba(245, 158, 11, 0.3)' 
                  : 'none',
                opacity: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
                }
              }}
              title={(currentPlayer && (currentPlayer.movesEarned || 0) === 0) ? 'No moves available. Earn Par. Pt. to use items!' : 'Use items from your bag'}
            >
              🎒 BAG {(!currentPlayer || (currentPlayer.movesEarned || 0) === 0) && '(No Moves)'}
            </button>
            <button
              onClick={() => {
                setShowVaultModal(true);
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
              }}
            >
              🏰 VAULT
            </button>
          </div>

          {/* BattleEngine - Hidden UI but functional for battle logic */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            overflow: 'hidden',
            pointerEvents: 'none'
          }}>
            <style>
              {`
                /* Hide the main battle arena container with ALLIES/ENEMIES */
                div[style*="width: 100%"][style*="height: 700px"] {
                  display: none !important;
                }
                /* Show only the move selection menu when it appears */
                div[style*="position: absolute"][style*="bottom: 120px"][style*="left: 50%"] {
                  display: block !important;
                  pointer-events: auto !important;
                  z-index: 10000 !important;
                  position: fixed !important;
                }
              `}
            </style>
            <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
              <BattleEngine
                onBattleEnd={handleBattleEnd}
                onMoveConsumption={handleMoveConsumption}
                onBattleLogUpdate={handleBattleLogUpdate}
                opponents={opponents}
                allies={allies}
                isMultiplayer={true}
                isPvP={true}
                isInSession={true}
                sessionId={sessionId}
                onArtifactUsed={() => {
                  // Handle artifact used - end turn
                  setShowBagModal(false);
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Side - Players (Scrollable) */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: '#1f2937', fontWeight: '600' }}>Players</h2>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '0.5rem'
          }}>
            {rightStudents.map((student) => renderPlayerCard(student, false))}
          </div>
        </div>
      </div>


      {/* Modals */}
      <BagModal 
        isOpen={showBagModal} 
        onClose={() => setShowBagModal(false)}
        onArtifactUsed={() => {
          // Handle artifact used - end turn
          setShowBagModal(false);
        }}
      />
      <VaultModal 
        isOpen={showVaultModal} 
        onClose={() => setShowVaultModal(false)}
      />

      {/* Target Selection Banner - Show when move is selected */}
      {selectedMove && !showMoveMenu && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '1.125rem',
          fontWeight: 'bold',
          border: '3px solid #f59e0b'
        }}>
          <span>🎯</span>
          <span>Selected: {selectedMove.name} - Click on a player card to select target</span>
          <button
            onClick={() => {
              setSelectedMove(null);
              setShowMoveMenu(true);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '2px solid white',
              color: 'white',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            Change Move
          </button>
        </div>
      )}

      {/* Move Selection Modal - Only show when selecting a move, not when a move is selected */}
      {showMoveMenu && !selectedMove && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowMoveMenu(false);
            setSelectedMove(null);
          }
        }}
        >
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            border: '3px solid #8B4513'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '1rem' 
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
                Select Move
              </h3>
              <button
                onClick={() => {
                  setShowMoveMenu(false);
                  setSelectedMove(null);
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 'bold'
                }}
              >
                ✕ Close
              </button>
            </div>
            
            {selectedMove ? (
              <div>
                <div style={{ 
                  marginBottom: '1rem', 
                  padding: '1rem', 
                  background: '#f3f4f6', 
                  borderRadius: '0.5rem' 
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.125rem' }}>
                    Selected: {selectedMove.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ 
                      background: '#e5e7eb', 
                      padding: '0.125rem 0.375rem', 
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      {selectedMove.type.toUpperCase()}
                    </span>
                    {selectedMove.category === 'elemental' && selectedMove.elementalAffinity && (
                      <span style={{ 
                        background: '#e5e7eb', 
                        padding: '0.125rem 0.375rem', 
                        borderRadius: '0.25rem',
                        fontSize: '0.7rem'
                      }}>
                        {selectedMove.elementalAffinity.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem' }}>
                      Lv.{selectedMove.level} • Mastery {getEffectiveMasteryLevel(selectedMove, equippedArtifacts)} • Cost: {selectedMove.cost} PP
                    </span>
                  </div>
                  {(() => {
                    const effectiveMasteryLevel = getEffectiveMasteryLevel(selectedMove, equippedArtifacts);
                    const getMoveDamageValue = (m: any): number => {
                      if (m.damage && m.damage > 0) return m.damage;
                      const moveDamage = getMoveDamageSync(m.name);
                      if (moveDamage) {
                        return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                      }
                      return 0;
                    };
                    
                    let damageRange = null;
                    let shieldRange = null;
                    let healingRange = null;
                    let artifactMultiplier = 1.0;
                    
                    if (selectedMove.type === 'attack') {
                      const baseDamage = getMoveDamageValue(selectedMove);
                      if (baseDamage > 0) {
                        damageRange = calculateDamageRange(baseDamage, selectedMove.level, effectiveMasteryLevel);
                        if (selectedMove.category === 'elemental' && equippedArtifacts) {
                          const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                          for (const slot of ringSlots) {
                            const ring = equippedArtifacts[slot];
                            if (ring && 
                                (ring.id === 'elemental-ring-level-1' || 
                                 (ring.name && ring.name.includes('Elemental Ring')))) {
                              const elementalRingLevel = ring.level || 1;
                              artifactMultiplier = getArtifactDamageMultiplier(elementalRingLevel);
                              damageRange = {
                                min: Math.floor(damageRange.min * artifactMultiplier),
                                max: Math.floor(damageRange.max * artifactMultiplier),
                                average: Math.floor(damageRange.average * artifactMultiplier)
                              };
                              break;
                            }
                          }
                        }
                      }
                    }
                    
                    if (selectedMove.shieldBoost && selectedMove.shieldBoost > 0) {
                      shieldRange = calculateShieldBoostRange(selectedMove.shieldBoost, selectedMove.level, effectiveMasteryLevel);
                    }
                    
                    if (selectedMove.healing && selectedMove.healing > 0) {
                      healingRange = calculateHealingRange(selectedMove.healing, selectedMove.level, effectiveMasteryLevel);
                    }
                    
                    return (
                      <div style={{ fontSize: '0.875rem', color: '#1f2937', marginBottom: '0.75rem' }}>
                        {damageRange && (
                          <div style={{ color: '#dc2626', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                            {artifactMultiplier > 1.0 && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }}>
                                💍 +{Math.round((artifactMultiplier - 1) * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        {shieldRange && (
                          <div style={{ color: '#3b82f6', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            🛡️ Shield Boost: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                          </div>
                        )}
                        {healingRange && (
                          <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            💚 Healing: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                          </div>
                        )}
                        {selectedMove.ppSteal && selectedMove.ppSteal > 0 && (
                          <div style={{ color: '#f59e0b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            💰 PP Steal: {selectedMove.ppSteal}
                          </div>
                        )}
                        {selectedMove.description && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                            {selectedMove.description}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    onClick={() => setSelectedMove(null)}
                    style={{
                      marginTop: '0.5rem',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 'bold'
                    }}
                  >
                    Change Move
                  </button>
                </div>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef3c7', borderRadius: '0.5rem', border: '2px solid #fbbf24' }}>
                  <div style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: 'bold', textAlign: 'center' }}>
                    🎯 Click on a player card to select target
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Filter available moves - unlocked and not on cooldown */}
                {(() => {
                  const availableMoves = moves.filter(move => 
                    move.unlocked && 
                    (move.currentCooldown === 0 || move.currentCooldown === undefined)
                  );
                  
                  const manifestMoves = availableMoves.filter(move => move.category === 'manifest');
                  const elementalMoves = availableMoves.filter(move => move.category === 'elemental');
                  // RR Candy skills have category='system' but id starts with 'rr-candy-'
                  const rrCandyMoves = availableMoves.filter(move => move.id?.startsWith('rr-candy-'));
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {manifestMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#8b5cf6' }}>
                            ✨ Manifest Moves
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {manifestMoves.map((move) => {
                              // Calculate move stats
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                              
                              // Helper to get move damage value
                              const getMoveDamageValue = (m: any): number => {
                                if (m.damage && m.damage > 0) return m.damage;
                                const moveDamage = getMoveDamageSync(m.name);
                                if (moveDamage) {
                                  return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                                }
                                return 0;
                              };
                              
                              // Calculate stats
                              let damageRange = null;
                              let shieldRange = null;
                              let healingRange = null;
                              
                              if (move.type === 'attack') {
                                const baseDamage = getMoveDamageValue(move);
                                if (baseDamage > 0) {
                                  damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                                }
                              }
                              
                              if (move.shieldBoost && move.shieldBoost > 0) {
                                shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                              }
                              
                              if (move.healing && move.healing > 0) {
                                healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                              }
                              
                              return (
                                <button
                                  key={move.id}
                                  onClick={async (e) => {
                                    // ALWAYS log skill click (critical - must see this)
                                    console.log('🎮 [InSessionBattle] ⚡ SKILL CLICKED ⚡', move.name, '| Cost:', move.cost, '| Actor:', currentUser?.uid?.substring(0, 8));
                                    console.log('🎮 [InSessionBattle] Click event details:', {
                                      buttonClicked: true,
                                      moveId: move.id,
                                      moveName: move.name,
                                      moveType: move.type,
                                      category: move.category,
                                      hasCurrentUser: !!currentUser,
                                      hasSessionId: !!sessionId,
                                      hasClassId: !!classId
                                    });
                                    
                                    setSelectedMove(move);
                                    setShowMoveMenu(false); // Close modal but keep move selected
                                  }}
                                  style={{
                                    background: selectedMove?.id === move.id 
                                      ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                                      : 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedMove?.id !== move.id) {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                                        {move.name}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ 
                                          background: 'rgba(255, 255, 255, 0.3)', 
                                          padding: '0.125rem 0.375rem', 
                                          borderRadius: '0.25rem',
                                          fontWeight: 'bold'
                                        }}>
                                          {move.type.toUpperCase()}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Cost: {move.cost} PP
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Stats */}
                                  <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    {damageRange && (
                                      <div style={{ color: '#fecaca', fontWeight: 'bold' }}>
                                        ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                      </div>
                                    )}
                                    {shieldRange && (
                                      <div style={{ color: '#bfdbfe', fontWeight: 'bold' }}>
                                        🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                                      </div>
                                    )}
                                    {healingRange && (
                                      <div style={{ color: '#bbf7d0', fontWeight: 'bold' }}>
                                        💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                                      </div>
                                    )}
                                    {move.ppSteal && move.ppSteal > 0 && (
                                      <div style={{ color: '#fde68a', fontWeight: 'bold' }}>
                                        💰 PP Steal: {move.ppSteal}
                                      </div>
                                    )}
                                    {move.description && (
                                      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.25rem', fontStyle: 'italic' }}>
                                        {move.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {elementalMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f59e0b' }}>
                            ⚡ Elemental Moves
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {elementalMoves.map((move) => {
                              // Calculate move stats
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                              
                              // Helper to get move damage value
                              const getMoveDamageValue = (m: any): number => {
                                if (m.damage && m.damage > 0) return m.damage;
                                const moveDamage = getMoveDamageSync(m.name);
                                if (moveDamage) {
                                  return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                                }
                                return 0;
                              };
                              
                              // Calculate stats
                              let damageRange = null;
                              let shieldRange = null;
                              let healingRange = null;
                              let artifactMultiplier = 1.0;
                              
                              if (move.type === 'attack') {
                                const baseDamage = getMoveDamageValue(move);
                                if (baseDamage > 0) {
                                  damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                                  // Apply artifact multiplier for elemental moves
                                  if (equippedArtifacts) {
                                    const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                                    for (const slot of ringSlots) {
                                      const ring = equippedArtifacts[slot];
                                      if (ring && 
                                          (ring.id === 'elemental-ring-level-1' || 
                                           (ring.name && ring.name.includes('Elemental Ring')))) {
                                        const elementalRingLevel = ring.level || 1;
                                        artifactMultiplier = getArtifactDamageMultiplier(elementalRingLevel);
                                        damageRange = {
                                          min: Math.floor(damageRange.min * artifactMultiplier),
                                          max: Math.floor(damageRange.max * artifactMultiplier),
                                          average: Math.floor(damageRange.average * artifactMultiplier)
                                        };
                                        break;
                                      }
                                    }
                                  }
                                }
                              }
                              
                              if (move.shieldBoost && move.shieldBoost > 0) {
                                shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                              }
                              
                              if (move.healing && move.healing > 0) {
                                healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                              }
                              
                              return (
                                <button
                                  key={move.id}
                                  onClick={() => {
                                    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                                             process.env.REACT_APP_DEBUG === 'true';
                                    
                                    if (DEBUG_LIVE_EVENTS) {
                                      console.log('[InSessionBattle] 🎮 SKILL CLICKED (RR Candy):', {
                                        skillId: move.id,
                                        skillName: move.name,
                                        skillType: move.type,
                                        category: move.category,
                                        cost: move.cost,
                                        cooldown: move.cooldown,
                                        actorUid: currentUser?.uid,
                                        sessionId: sessionId
                                      });
                                    }
                                    
                                    setSelectedMove(move);
                                    setShowMoveMenu(false); // Close modal but keep move selected
                                  }}
                                  style={{
                                    background: selectedMove?.id === move.id 
                                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                      : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedMove?.id !== move.id) {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                                        {move.name}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ 
                                          background: 'rgba(255, 255, 255, 0.3)', 
                                          padding: '0.125rem 0.375rem', 
                                          borderRadius: '0.25rem',
                                          fontWeight: 'bold'
                                        }}>
                                          {move.type.toUpperCase()}
                                        </span>
                                        {move.elementalAffinity && (
                                          <span style={{ 
                                            background: 'rgba(255, 255, 255, 0.3)', 
                                            padding: '0.125rem 0.375rem', 
                                            borderRadius: '0.25rem',
                                            fontSize: '0.65rem'
                                          }}>
                                            {move.elementalAffinity.toUpperCase()}
                                          </span>
                                        )}
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Cost: {move.cost} PP
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Stats */}
                                  <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    {damageRange && (
                                      <div style={{ color: '#fecaca', fontWeight: 'bold' }}>
                                        ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                        {artifactMultiplier > 1.0 && (
                                          <span style={{ color: '#fde68a', marginLeft: '0.25rem', fontSize: '0.65rem' }}>
                                            💍 +{Math.round((artifactMultiplier - 1) * 100)}%
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {shieldRange && (
                                      <div style={{ color: '#bfdbfe', fontWeight: 'bold' }}>
                                        🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                                      </div>
                                    )}
                                    {healingRange && (
                                      <div style={{ color: '#bbf7d0', fontWeight: 'bold' }}>
                                        💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                                      </div>
                                    )}
                                    {move.ppSteal && move.ppSteal > 0 && (
                                      <div style={{ color: '#fde68a', fontWeight: 'bold' }}>
                                        💰 PP Steal: {move.ppSteal}
                                      </div>
                                    )}
                                    {move.description && (
                                      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.25rem', fontStyle: 'italic' }}>
                                        {move.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {rrCandyMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f59e0b' }}>
                            🍬 RR Candy Skills
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {rrCandyMoves.map((move) => {
                              // Calculate move stats
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                              
                              // Helper to get move damage value
                              const getMoveDamageValue = (m: any): number => {
                                if (m.damage && m.damage > 0) return m.damage;
                                const moveDamage = getMoveDamageSync(m.name);
                                if (moveDamage) {
                                  return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                                }
                                return 0;
                              };
                              
                              // Calculate stats
                              let damageRange = null;
                              let shieldRange = null;
                              let healingRange = null;
                              
                              if (move.type === 'attack') {
                                const baseDamage = getMoveDamageValue(move);
                                if (baseDamage > 0) {
                                  damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                                }
                              }
                              
                              if (move.shieldBoost && move.shieldBoost > 0) {
                                shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                              }
                              
                              if (move.healing && move.healing > 0) {
                                healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                              }
                              
                              return (
                                <button
                                  key={move.id}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    // ALWAYS log skill click (critical - must see this)
                                    console.log('🎮 [InSessionBattle] ⚡ SKILL CLICKED ⚡', move.name, '| Cost:', move.cost, '| Actor:', currentUser?.uid?.substring(0, 8));
                                    console.log('🎮 [InSessionBattle] Click event details:', {
                                      buttonClicked: true,
                                      moveId: move.id,
                                      moveName: move.name,
                                      hasCurrentUser: !!currentUser,
                                      hasSessionId: !!sessionId,
                                      hasClassId: !!classId,
                                      timestamp: new Date().toISOString()
                                    });
                                    
                                    // CRITICAL: Verify the move object is valid
                                    if (!move || !move.id) {
                                      console.error('❌ [InSessionBattle] Invalid move object!', move);
                                      return;
                                    }
                                    
                                    // CRITICAL: Verify we have required context
                                    if (!currentUser || !sessionId) {
                                      console.error('❌ [InSessionBattle] Missing required context!', {
                                        hasCurrentUser: !!currentUser,
                                        hasSessionId: !!sessionId
                                      });
                                      return;
                                    }
                                    console.log('🎮 [InSessionBattle] Context check:', {
                                      hasCurrentUser: !!currentUser,
                                      userId: currentUser?.uid?.substring(0, 8),
                                      sessionId: sessionId || 'MISSING',
                                      classId: classId || 'MISSING',
                                      moveId: move.id,
                                      moveName: move.name
                                    });
                                    
                                    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILLS === 'true' ||
                                                             process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                                             process.env.REACT_APP_DEBUG === 'true';
                                    
                                    // Stage A: Skill selected - Generate traceId
                                    const { generateTraceId, traceStage, writeDebugAction } = await import('../utils/liveEventDebug');
                                    const traceId = generateTraceId();
                                    setCurrentTraceId(traceId);
                                    
                                    console.log('🎮 [InSessionBattle] TraceId generated:', traceId);
                                    
                                    traceStage('selected', traceId, 'Skill selected', {
                                      skillId: move.id,
                                      skillName: move.name,
                                      skillType: move.type,
                                      category: move.category,
                                      cost: move.cost,
                                      cooldown: move.cooldown,
                                      actorUid: currentUser?.uid,
                                      sessionId: sessionId
                                    }, { file: 'InSessionBattle.tsx', line: 2629 });
                                    
                                    // Write debug mirror
                                    if (classId && sessionId) {
                                      await writeDebugAction(classId, sessionId, traceId, 'selected', {
                                        actorUid: currentUser?.uid || '',
                                        targetUid: '', // Not selected yet
                                        skillId: move.id,
                                        skillName: move.name,
                                        metadata: {
                                          skillType: move.type,
                                          category: move.category,
                                          cost: move.cost,
                                          cooldown: move.cooldown
                                        }
                                      });
                                    }
                                    
                                    if (DEBUG_LIVE_EVENTS) {
                                      console.log('[InSessionBattle] 🎮 SKILL CLICKED (Manifest):', {
                                        traceId,
                                        skillId: move.id,
                                        skillName: move.name,
                                        skillType: move.type,
                                        category: move.category,
                                        cost: move.cost,
                                        cooldown: move.cooldown,
                                        actorUid: currentUser?.uid,
                                        sessionId: sessionId
                                      });
                                    }
                                    
                                    setSelectedMove(move);
                                    setShowMoveMenu(false); // Close modal but keep move selected
                                  }}
                                  style={{
                                    background: selectedMove?.id === move.id 
                                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                      : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedMove?.id !== move.id) {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                                        {move.name}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ 
                                          background: 'rgba(255, 255, 255, 0.3)', 
                                          padding: '0.125rem 0.375rem', 
                                          borderRadius: '0.25rem',
                                          fontWeight: 'bold'
                                        }}>
                                          {move.type.toUpperCase()}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Cost: {move.cost} PP
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Stats */}
                                  <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    {damageRange && (
                                      <div style={{ color: '#fecaca', fontWeight: 'bold' }}>
                                        ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                      </div>
                                    )}
                                    {shieldRange && (
                                      <div style={{ color: '#bfdbfe', fontWeight: 'bold' }}>
                                        🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                                      </div>
                                    )}
                                    {healingRange && (
                                      <div style={{ color: '#bbf7d0', fontWeight: 'bold' }}>
                                        💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                                      </div>
                                    )}
                                    {move.ppSteal && move.ppSteal > 0 && (
                                      <div style={{ color: '#fde68a', fontWeight: 'bold' }}>
                                        💰 PP Steal: {move.ppSteal}
                                      </div>
                                    )}
                                    {move.description && (
                                      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.25rem', fontStyle: 'italic' }}>
                                        {move.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {availableMoves.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                          No moves available. All moves are on cooldown or locked.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PP Management Modal (shown when PP Tools is clicked) - Only for admins and scorekeepers */}
      {selectedStudentForPP && (isAdminUser === true || isScorekeeper === true) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>
              PP Management
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Adjusting PP for: {sessionPlayers.find(p => p.userId === selectedStudentForPP)?.displayName}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Amount (negative to subtract)"
                  value={ppAdjustment || ''}
                  onChange={(e) => setPPAdjustment(parseInt(e.target.value) || 0)}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      if (ppAdjustment !== 0) {
                        handleAdjustPP(selectedStudentForPP, ppAdjustment);
                        setSelectedStudentForPP(null);
                        setPPAdjustment(0);
                      }
                    }}
                    style={{
                      flex: 1,
                      background: ppAdjustment !== 0 ? '#8b5cf6' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: ppAdjustment !== 0 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      setSelectedStudentForPP(null);
                      setPPAdjustment(0);
                    }}
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Session Summary Modal */}
        {currentUser && (
          <SessionSummaryModal
            isOpen={showSessionSummary}
            onClose={() => setShowSessionSummary(false)}
            summary={sessionSummary}
            currentPlayerId={currentUser.uid}
          />
        )}
    </div>
    </>
  );
};

export default InSessionBattle;

