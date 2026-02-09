import React, { useState, useEffect, useMemo } from 'react';
import { Move, MOVE_UPGRADE_TEMPLATES, MOVE_DAMAGE_VALUES } from '../types/battle';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  formatDamageRange 
} from '../utils/damageCalculator';
import { loadMoveOverrides, getMoveDamage, getMoveName, getMoveDescription, getMoveNameSync, getMoveDescriptionSync } from '../utils/moveOverrides';
import { useAuth } from '../context/AuthContext';
import { getArtifactDamageMultiplier, getEffectiveMasteryLevel, getManifestDamageBoost } from '../utils/artifactUtils';
import { doc, getDoc, getDocFromCache, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getRRCandyMoves } from '../utils/rrCandyMoves';
import { getRRCandyStatus, getRRCandyStatusAsync } from '../utils/rrCandyUtils';
import { getUserRRCandySkills, checkRRCandyUnlock } from '../utils/rrCandyService';

interface MovesDisplayProps {
  moves: Move[];
  movesRemaining: number;
  offlineMovesRemaining: number;
  maxOfflineMoves: number;
  onUpgradeMove: (moveId: string) => Promise<void> | void;
  onResetMoveLevel?: (moveId: string) => void;
  onUnlockElementalMoves?: (elementalAffinity: string) => void;
  onForceUnlockAllMoves?: () => void;
  onResetMovesWithElementFilter?: () => void;
  onApplyElementFilterToExistingMoves?: () => void;
  onForceMigration?: (resetLevels?: boolean) => void;
  userElement?: string;
  canPurchaseMove?: (category: 'manifest' | 'elemental' | 'system') => boolean;
  getNextMilestone?: (manifestType: string) => any;
  manifestProgress?: any;
  canPurchaseElementalMove?: (elementalType: string) => boolean;
  getNextElementalMilestone?: (elementalType: string) => any;
  elementalProgress?: any;
}

const MovesDisplay: React.FC<MovesDisplayProps> = ({ 
  moves, 
  movesRemaining, 
  offlineMovesRemaining, 
  maxOfflineMoves, 
  onUpgradeMove,
  onResetMoveLevel,
  onUnlockElementalMoves,
  onForceUnlockAllMoves,
  onResetMovesWithElementFilter,
  onApplyElementFilterToExistingMoves,
  onForceMigration,
  userElement,
  canPurchaseMove,
  getNextMilestone,
  manifestProgress,
  canPurchaseElementalMove,
  getNextElementalMilestone,
  elementalProgress,
}) => {
  const [moveOverrides, setMoveOverrides] = useState<{[key: string]: any}>({});
  const [overridesLoaded, setOverridesLoaded] = useState(false);
  const [ascendConfirm, setAscendConfirm] = useState<{moveId: string, moveName: string} | null>(null);
  const { currentUser } = useAuth();
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  const [truthMetal, setTruthMetal] = useState<number>(0);
  const [userManifest, setUserManifest] = useState<string | null>(null);

  // Load user's manifest type from both students and users collections
  useEffect(() => {
    const loadUserManifest = async () => {
      if (!currentUser) return;
      
      try {
        let manifest: string | null = null;
        
        // Try students collection first
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          // Get manifest from student data
          if (studentData.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
            manifest = studentData.manifest.manifestId;
          } else if (studentData.manifest && typeof studentData.manifest === 'string') {
            manifest = studentData.manifest;
          }
          console.log('MovesDisplay: Manifest from students collection:', manifest, studentData.manifest);
        }
        
        // If no manifest found in students, try users collection as fallback
        if (!manifest) {
          const userRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.manifest && typeof userData.manifest === 'object' && userData.manifest.manifestId) {
              manifest = userData.manifest.manifestId;
            } else if (userData.manifest && typeof userData.manifest === 'string') {
              manifest = userData.manifest;
            } else if (userData.manifestationType) {
              manifest = userData.manifestationType;
            }
            console.log('MovesDisplay: Manifest from users collection:', manifest, userData.manifest);
          }
        }
        
        setUserManifest(manifest);
        console.log('MovesDisplay: Final user manifest loaded:', manifest);
        
        // Debug: Log all manifest moves to see what we have
        const allManifestMoves = moves.filter(m => m.category === 'manifest');
        console.log('MovesDisplay: All manifest moves:', allManifestMoves.map(m => ({
          name: m.name,
          manifestType: m.manifestType,
          unlocked: m.unlocked,
          category: m.category
        })));
      } catch (error) {
        console.error('MovesDisplay: Error loading user manifest:', error);
      }
    };

    loadUserManifest();
  }, [currentUser, moves]);

  // Load move overrides when component mounts and periodically refresh
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        console.log('MovesDisplay: Loading move overrides...');
        const overrides = await loadMoveOverrides();
        setMoveOverrides(overrides);
        setOverridesLoaded(true);
        console.log('MovesDisplay: Move overrides loaded:', overrides);
      } catch (error) {
        console.error('MovesDisplay: Error loading move overrides:', error);
        setOverridesLoaded(true); // Set to true even on error to prevent infinite loading
      }
    };

    loadOverrides();
    
    // Refresh overrides every 30 seconds to pick up admin changes
    const refreshInterval = setInterval(() => {
      loadOverrides();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  // Load user's Truth Metal for RR Candy upgrade requirements
  useEffect(() => {
    const loadTruthMetal = async () => {
      if (!currentUser) {
        setTruthMetal(0);
        return;
      }
      
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setTruthMetal(userData.truthMetal || 0);
        }
      } catch (error) {
        console.error('MovesDisplay: Error loading Truth Metal:', error);
        setTruthMetal(0);
      }
    };
    
    loadTruthMetal();
    // Refresh Truth Metal periodically
    const interval = setInterval(loadTruthMetal, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Load equipped artifacts to check for Elemental Ring
  useEffect(() => {
    const loadEquippedArtifacts = async () => {
      if (!currentUser) return;
      
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          setEquippedArtifacts(studentData.equippedArtifacts || null);
        }
      } catch (error) {
        console.error('Error loading equipped artifacts:', error);
      }
    };

    loadEquippedArtifacts();
  }, [currentUser]);

  // Ensure RR Candy moves are loaded when component mounts
  // This ensures they appear in Skills & Mastery even if they weren't loaded initially
  // State to track RR Candy unlock status and skills
  const [rrCandyStatus, setRRCandyStatus] = useState<{ unlocked: boolean; candyType: 'on-off' | 'up-down' | 'config' | null }>({ unlocked: false, candyType: null });
  const [rrCandySkillsFromService, setRRCandySkillsFromService] = useState<Move[]>([]);

  // Fetch RR Candy skills using the shared service (same as Profile)
  useEffect(() => {
    const fetchRRCandySkills = async () => {
      if (!currentUser) {
        console.log('MovesDisplay: No currentUser, skipping RR Candy fetch');
        return;
      }
      
      console.log('MovesDisplay: Starting RR Candy skills fetch for user:', currentUser.uid);
      
      try {
        // Check unlock status
        const unlockStatus = await checkRRCandyUnlock(currentUser.uid);
        console.log('MovesDisplay: Unlock status check result:', unlockStatus);
        setRRCandyStatus(unlockStatus);
        
        if (!unlockStatus.unlocked) {
          console.warn('MovesDisplay: RR Candy not unlocked. Status:', unlockStatus);
          setRRCandySkillsFromService([]);
          return;
        }

        console.log('MovesDisplay: RR Candy is unlocked! Fetching skills...', {
          candyType: unlockStatus.candyType,
          movesArrayLength: moves.length
        });

        // Fetch RR Candy skills using shared service (passes moves array to avoid extra fetch)
        // The service will generate and persist moves if they don't exist
        const rrSkills = await getUserRRCandySkills(currentUser.uid, moves);
        setRRCandySkillsFromService(rrSkills);
        
        console.log('MovesDisplay: RR Candy skills fetched from service:', {
          count: rrSkills.length,
          unlocked: unlockStatus.unlocked,
          candyType: unlockStatus.candyType,
          skills: rrSkills.map(s => ({ id: s.id, name: s.name, level: s.masteryLevel, unlocked: s.unlocked }))
        });
        
        // If service generated new moves, they'll be picked up by BattleContext's listener
        // But we can also trigger a refresh by checking if moves array needs updating
        if (rrSkills.length > 0) {
          const movesInArray = moves.filter(m => m.id?.startsWith('rr-candy-'));
          if (movesInArray.length < rrSkills.length) {
            console.log('MovesDisplay: Service returned more RR Candy skills than in moves array. BattleContext listener should pick them up.');
          }
        } else {
          console.warn('MovesDisplay: Service returned 0 RR Candy skills even though unlocked!');
        }
      } catch (error) {
        console.error('MovesDisplay: Error fetching RR Candy skills:', error);
        setRRCandySkillsFromService([]);
      }
    };

    fetchRRCandySkills();
  }, [currentUser, moves]); // Re-fetch when moves array changes (from BattleContext listener)

  console.log('MovesDisplay: movesRemaining:', movesRemaining, 'offlineMovesRemaining:', offlineMovesRemaining);
  console.log('MovesDisplay: Total moves loaded:', moves.length);
  console.log('MovesDisplay: Move overrides loaded:', overridesLoaded, 'overrides:', moveOverrides);
  
  // Log RR Candy moves specifically for debugging
  const allRRCandyMoves = moves.filter(move => move.id?.includes('rr-candy'));
  console.log('MovesDisplay: All RR Candy moves in moves array:', allRRCandyMoves.length, allRRCandyMoves.map(m => ({ id: m.id, name: m.name, unlocked: m.unlocked, category: m.category })));

  // Helper function to get move data with overrides applied
  // Uses synchronous functions that access the global cache, which is updated when admin saves changes
  const getMoveDataWithOverrides = (moveName: string) => {
    // Use synchronous functions that access the global cache
    // This ensures we get the latest overrides even if local state hasn't updated
    // The cache is invalidated when admin saves, and will be refreshed on next loadMoveOverrides call
    const overrideName = getMoveNameSync(moveName);
    const overrideDescription = getMoveDescriptionSync(moveName);
    
    // Find the original template name if moveName is an overridden name
    // This is needed because overrides are keyed by original template names
    let originalTemplateName = moveName;
    if (moveOverrides) {
      // Check if moveName is already an overridden name by searching for it
      for (const [templateName, override] of Object.entries(moveOverrides)) {
        if (override.name === moveName) {
          originalTemplateName = templateName;
          break;
        }
      }
    }
    
    // For damage, check local state using original template name, then fall back to cache, then default
    const override = moveOverrides[originalTemplateName] || moveOverrides[moveName];
    const defaultMove = MOVE_DAMAGE_VALUES[originalTemplateName] || MOVE_DAMAGE_VALUES[moveName];
    
    // Prioritize cache-based name (from getMoveNameSync) over local state
    // This ensures we always get the latest admin updates
    return {
      name: overrideName, // Always use the cache-based name
      damage: override?.damage || defaultMove?.damage || 0,
      description: overrideDescription || override?.description || ''
    };
  };

  // Filter moves by category and unlocked status - memoized for performance
  // CRITICAL: Only show manifest moves that match the user's actual manifest type
  const manifestMoves = useMemo(() => {
    const filtered = moves.filter(move => {
      // Only filter by category - show all manifest moves that match user's manifest
      if (move.category !== 'manifest') {
        return false;
      }
      
      // If userManifest is provided, ONLY show moves matching that manifest (strict filtering)
      if (userManifest) {
        const moveManifest = move.manifestType?.toLowerCase();
        const userManifestLower = userManifest.toLowerCase();
        const matches = moveManifest === userManifestLower;
        
        // Log for debugging
        if (!matches) {
          console.log(`MovesDisplay: Manifest move filtered out - ${move.name} (manifestType: ${move.manifestType}, userManifest: ${userManifest})`);
        }
        
        return matches;
      }
      
      // If no userManifest provided, show all manifest moves (fallback for backwards compatibility)
      return true;
    });
    
    console.log('MovesDisplay: Filtered manifest moves:', {
      totalMoves: moves.length,
      manifestMoves: filtered.length,
      userManifest: userManifest,
      filteredNames: filtered.map(m => ({ name: m.name, manifestType: m.manifestType, unlocked: m.unlocked }))
    });
    
    return filtered;
  }, [moves, userManifest]);
  
  // Filter elemental moves by player's chosen element - memoized for performance
  const elementalMoves = useMemo(() => {
    return moves.filter(move => {
      if (move.category !== 'elemental' || !move.unlocked) return false;
      // If userElement is provided, ONLY show moves matching that element (strict filtering)
      if (userElement) {
        const moveElement = move.elementalAffinity?.toLowerCase();
        const userElementLower = userElement.toLowerCase();
        return moveElement === userElementLower;
      }
      // If no userElement provided, don't show any elemental moves (user must choose element first)
      return false;
    });
  }, [moves, userElement]);
  
  // Separate Power Card skills (custom moves from Profile)
  const powerCardMoves = useMemo(() => {
    const filtered = moves.filter(move => {
      return move.id?.startsWith('power-card-') && move.unlocked;
    });
    console.log('MovesDisplay: Power Card moves filtered:', filtered.length, filtered.map(m => ({ id: m.id, name: m.name })));
    return filtered;
  }, [moves]);
  
  // Use RR Candy skills from shared service (same source as Profile)
  // This ensures Skill Mastery shows the exact same skills as Profile → Skill Tree Settings
  const rrCandyMoves = useMemo(() => {
    // PRIORITY 1: If we have skills from the service, use those (they're the source of truth)
    // The service fetches from Firestore and generates if needed, matching Profile logic exactly
    if (rrCandySkillsFromService.length > 0) {
      console.log('MovesDisplay: Using RR Candy skills from service (source of truth):', {
        count: rrCandySkillsFromService.length,
        skills: rrCandySkillsFromService.map(m => ({ id: m.id, name: m.name, level: m.masteryLevel, unlocked: m.unlocked }))
      });
      return rrCandySkillsFromService;
    }
    
    // PRIORITY 2: Fallback to filtering from moves array if service hasn't loaded yet
    // This ensures we show skills immediately if they're already in the moves array
    const filtered = moves.filter(move => {
      const isRRCandy = move.id?.includes('rr-candy') || move.id?.startsWith('rr-candy-');
      if (!isRRCandy) return false;
      
      // If RR Candy is unlocked globally, show ALL RR Candy moves
      if (rrCandyStatus.unlocked) {
        return true;
      }
      
      // If RR Candy is not unlocked, only show moves that are explicitly unlocked
      return move.unlocked === true;
    });
    
    console.log('MovesDisplay: RR Candy moves from fallback filter:', {
      count: filtered.length,
      rrCandyUnlocked: rrCandyStatus.unlocked,
      candyType: rrCandyStatus.candyType,
      serviceSkillsCount: rrCandySkillsFromService.length,
      moves: filtered.map(m => ({ id: m.id, name: m.name, unlocked: m.unlocked }))
    });
    return filtered;
  }, [rrCandySkillsFromService, moves, rrCandyStatus.unlocked, rrCandyStatus.candyType]);
  
  // System Skills removed - all skills are now Manifest, Elemental, or RR Candy
  console.log('MovesDisplay: Filtered skills - Manifest:', manifestMoves.length, 'Elemental:', elementalMoves.length, 'RR Candy:', rrCandyMoves.length);
  console.log('MovesDisplay: userElement prop:', userElement);
  if (elementalMoves.length > 0) {
    console.log('MovesDisplay: Elemental moves found:', elementalMoves.map((m: Move) => `${m.name} (${m.elementalAffinity})`));
  } else {
    console.log('MovesDisplay: No elemental moves found for element:', userElement);
    console.log('MovesDisplay: All unlocked elemental moves:', moves.filter((m: Move) => m.category === 'elemental' && m.unlocked).map((m: Move) => `${m.name} (${m.elementalAffinity})`));
  }

  const getMasteryLabel = (level: number) => {
    switch (level) {
      case 1: return 'Novice';
      case 2: return 'Apprentice';
      case 3: return 'Adept';
      case 4: return 'Master';
      case 5: return 'Grandmaster';
      default: return 'Unknown';
    }
  };

  const getMasteryColor = (level: number) => {
    switch (level) {
      case 1: return '#6b7280';
      case 2: return '#059669';
      case 3: return '#2563eb';
      case 4: return '#7c3aed';
      case 5: return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getElementalColor = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '#dc2626';
      case 'water': return '#2563eb';
      case 'air': return '#7c3aed';
      case 'earth': return '#059669';
      case 'lightning': return '#f59e0b';
      case 'light': return '#fbbf24';
      case 'shadow': return '#6b7280';
      case 'metal': return '#9ca3af';
      default: return '#6b7280';
    }
  };

  const getElementalIcon = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '🔥';
      case 'water': return '💧';
      case 'air': return '💨';
      case 'earth': return '🪨';
      case 'lightning': return '⚡';
      case 'light': return '✨';
      case 'shadow': return '🌑';
      case 'metal': return '⚙️';
      default: return '⚡';
    }
  };

  const getElementalBackgroundColor = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '#fef2f2';
      case 'water': return '#eff6ff';
      case 'air': return '#f5f3ff';
      case 'earth': return '#f0fdf4';
      case 'lightning': return '#fffbeb';
      case 'light': return '#fffbeb';
      case 'shadow': return '#f3f4f6';
      case 'metal': return '#f9fafb';
      default: return '#f3f4f6';
    }
  };

  const getElementalBorderColor = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '#fecaca';
      case 'water': return '#bfdbfe';
      case 'air': return '#c4b5fd';
      case 'earth': return '#bbf7d0';
      case 'lightning': return '#fde68a';
      case 'light': return '#fde68a';
      case 'shadow': return '#d1d5db';
      case 'metal': return '#e5e7eb';
      default: return '#d1d5db';
    }
  };

  const getManifestColor = (manifestType: string) => {
    switch (manifestType) {
      case 'reading': return '#8B5CF6';
      case 'writing': return '#3B82F6';
      case 'drawing': return '#EC4899';
      case 'athletics': return '#10B981';
      case 'singing': return '#F59E0B';
      case 'gaming': return '#EF4444';
      case 'observation': return '#6366F1';
      case 'empathy': return '#8B5CF6';
      case 'creating': return '#F97316';
      case 'cooking': return '#84CC16';
      default: return '#6b7280';
    }
  };

  const renderMoveCard = (move: Move) => {
    // Force unlock RR Candy moves if RR Candy is globally unlocked
    // This ensures moves appear in Skill Mastery even if move.unlocked is false
    const isRRCandyMove = move.id?.startsWith('rr-candy-') || move.id?.includes('rr-candy');
    const isManifestMove = move.category === 'manifest';
    
    // For manifest moves, always allow upgrading (they're shown regardless of unlock status)
    // For RR Candy moves, allow if globally unlocked
    // For other moves, require unlocked status
    const effectiveUnlocked = isManifestMove ? true : (isRRCandyMove && rrCandyStatus.unlocked ? true : move.unlocked);
    
    // Get effective mastery level (includes Blaze Ring bonus for elemental moves)
    const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
    
    // Check if move can be upgraded (up to level 10)
    // Manifest moves can always be upgraded if they're shown (they match the user's manifest)
    const canUpgrade = move.masteryLevel < 10 && effectiveUnlocked;
    const canAscend = move.masteryLevel === 5 && effectiveUnlocked;
    
    // Calculate exponential upgrade cost based on current level
    // RR Candy moves: 1000 PP for Level 1 → Level 2
    // Regular moves: 100 PP for Level 1 → Level 2
    // Then multiplied by the respective multiplier for each level
    const basePrice = isRRCandyMove ? 1000 : 100; // 1000 PP for RR Candy moves, 100 PP for regular moves
    const getUpgradeCost = () => {
      const nextLevel = move.masteryLevel + 1;
      if (nextLevel === 2) return basePrice; // Level 1 → Level 2: base price
      if (nextLevel === 3) return basePrice * 2; // Level 2 → Level 3: base * 2
      if (nextLevel === 4) return basePrice * 4; // Level 3 → Level 4: base * 4
      if (nextLevel === 5) return basePrice * 8; // Level 4 → Level 5: base * 8
      if (nextLevel === 6) return basePrice * 16; // Level 5 → Level 6 (Ascend): base * 16
      if (nextLevel === 7) return basePrice * 32; // Level 6 → Level 7: base * 32
      if (nextLevel === 8) return basePrice * 64; // Level 7 → Level 8: base * 64
      if (nextLevel === 9) return basePrice * 128; // Level 8 → Level 9: base * 128
      if (nextLevel === 10) return basePrice * 256; // Level 9 → Level 10: base * 256
      return basePrice;
    };
    const upgradeCost = getUpgradeCost();

    // For RR Candy moves, calculate Truth Metal Shard requirement (nextLevel - 1 shards)
    const nextLevel = move.masteryLevel + 1;
    const requiredShards = isRRCandyMove ? (nextLevel - 1) : 0;

    // Get current stats from upgrade template (only relevant for levels 1-5)
    const upgradeTemplate = MOVE_UPGRADE_TEMPLATES[move.name];
    const currentLevelStats = upgradeTemplate && move.masteryLevel <= 5 ? upgradeTemplate[`level${move.masteryLevel}` as keyof typeof upgradeTemplate] : null;
    const nextLevelStats = upgradeTemplate && move.masteryLevel < 5 ? upgradeTemplate[`level${move.masteryLevel + 1}` as keyof typeof upgradeTemplate] : null;

    // Determine card background based on move category
    const getCardBackground = () => {
      if (move.category === 'manifest') {
        const manifestColor = getManifestColor(move.manifestType || 'reading');
        return `linear-gradient(135deg, ${manifestColor}15 0%, ${manifestColor}25 100%)`;
      } else if (move.category === 'elemental') {
        const elementalColor = getElementalColor(move.elementalAffinity || 'fire');
        return `linear-gradient(135deg, ${elementalColor}15 0%, ${elementalColor}25 100%)`;
      } else if (move.category === 'system') {
        return 'linear-gradient(135deg, #3b82f615 0%, #3b82f625 100%)';
      }
      return 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
    };

    // Get category icon
    const getCategoryIcon = () => {
      if (move.category === 'manifest') return '⭐';
      if (move.category === 'elemental') {
        return getElementalIcon(move.elementalAffinity || '');
      }
      // Use Power Card icon if available (for custom Power Card moves)
      if ((move as any).powerCardIcon) {
        return (move as any).powerCardIcon;
      }
      return '⚙️';
    };

    // Get border color based on category
    const getBorderColor = () => {
      if (move.category === 'manifest') {
        return getManifestColor(move.manifestType || 'reading');
      } else if (move.category === 'elemental') {
        return getElementalColor(move.elementalAffinity || 'fire');
      } else if (move.id?.startsWith('power-card-')) {
        return '#f59e0b'; // Orange for Power Card moves
      } else if (move.category === 'system') {
        return '#3b82f6';
      }
      return '#cbd5e1';
    };

    return (
      <div key={move.id} style={{
        background: getCardBackground(),
        border: `2px solid ${getBorderColor()}`,
        borderRadius: '1.5rem',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        position: 'relative',
        minHeight: '320px',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
        e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.borderColor = getBorderColor();
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = getBorderColor();
      }}>

        {/* Card Header */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ 
            fontSize: '2rem', 
            marginBottom: '0.5rem',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
          }}>
            {getCategoryIcon()}
          </div>
          <h3 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            color: '#1f2937',
            margin: '0',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            {getMoveDataWithOverrides(move.name).name} [Level {effectiveMasteryLevel}]
            {effectiveMasteryLevel > move.masteryLevel && equippedArtifacts && (() => {
              const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
              const moveElement = move.elementalAffinity?.toLowerCase();
              for (const slot of ringSlots) {
                const ring = equippedArtifacts[slot];
                if (!ring) continue;
                if ((ring.id === 'blaze-ring' || (ring.name && ring.name.includes('Blaze Ring'))) && moveElement === 'fire') {
                  return (
                    <span style={{
                      fontSize: '0.875rem',
                      color: '#f59e0b',
                      marginLeft: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      (Base: {move.masteryLevel} + Blaze Ring)
                    </span>
                  );
                }
                if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
                  return (
                    <span style={{
                      fontSize: '0.875rem',
                      color: '#8b5cf6',
                      marginLeft: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      (Base: {move.masteryLevel} + Terra Ring)
                    </span>
                  );
                }
                if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
                  return (
                    <span style={{
                      fontSize: '0.875rem',
                      color: '#8b5cf6',
                      marginLeft: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      (Base: {move.masteryLevel} + Aqua Ring)
                    </span>
                  );
                }
                if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
                  return (
                    <span style={{
                      fontSize: '0.875rem',
                      color: '#8b5cf6',
                      marginLeft: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      (Base: {move.masteryLevel} + Air Ring)
                    </span>
                  );
                }
              }
              return null;
            })()}
          </h3>
          {move.level > 1 && (
            <span style={{ 
              background: 'rgba(255,255,255,0.2)',
              color: '#1f2937',
              padding: '0.25rem 0.75rem',
              borderRadius: '1rem',
              fontSize: '0.75rem',
              marginTop: '0.5rem',
              display: 'inline-block',
              backdropFilter: 'blur(10px)'
            }}>
              Level {move.level}
            </span>
          )}
        </div>

        {/* Skill Description */}
        <div style={{ 
          background: 'rgba(255,255,255,0.95)',
          padding: '1rem',
          borderRadius: '1rem',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <p style={{ 
            color: '#374151', 
            fontSize: '0.875rem', 
            lineHeight: '1.5',
            margin: '0',
            textAlign: 'center',
            marginBottom: '0.75rem'
          }}>
            {getMoveDataWithOverrides(move.name).description || move.description}
          </p>

          {/* Power Type Information */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {move.manifestType && (
              <div style={{
                background: getManifestColor(move.manifestType),
                padding: '0.5rem 1rem',
                borderRadius: '0.75rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>⭐</span>
                {move.manifestType.charAt(0).toUpperCase() + move.manifestType.slice(1)}
              </div>
            )}
            {move.elementalAffinity && (
              <div style={{
                background: getElementalColor(move.elementalAffinity),
                padding: '0.5rem 1rem',
                borderRadius: '0.75rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>🔥</span>
                {move.elementalAffinity.charAt(0).toUpperCase() + move.elementalAffinity.slice(1)}
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          {/* Skill Cost */}
          <div style={{
            background: 'rgba(255,255,255,0.9)',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>SKILL COST</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>{move.cost}</div>
          </div>

          {/* Combined Damage Range */}
          {(() => {
            // Use the move's actual damage if it exists (from upgrades), otherwise use lookup
            let baseDamage: number;
            if (move.damage && move.damage > 0) {
              // Use the upgraded damage directly
              baseDamage = move.damage;
            } else {
              // Fall back to lookup for moves that haven't been upgraded yet
              const moveData = getMoveDataWithOverrides(move.name);
              if (typeof moveData.damage === 'object') {
                baseDamage = moveData.damage.max || moveData.damage.min || 0;
              } else {
                baseDamage = moveData.damage || 0;
              }
            }
            
            if (baseDamage > 0) {
              // Calculate range based on the actual damage and effective mastery level
              // (effectiveMasteryLevel is already calculated at the top of renderMoveCard)
              let damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
              
              // Store base damage range before artifact multipliers
              const baseDamageRange = { ...damageRange };
              
              // Apply artifact damage multipliers (apply to range, not base damage)
              let artifactMultiplier = 1.0;
              let ringLevel = 1;
              let manifestBoost = 1.0;
              
              if (move.category === 'elemental' && equippedArtifacts) {
                // Check all ring slots for Elemental Ring
                const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                for (const slot of ringSlots) {
                  const ring = equippedArtifacts[slot];
                  if (ring && 
                      (ring.id === 'elemental-ring-level-1' || 
                       (ring.name && ring.name.includes('Elemental Ring')))) {
                    ringLevel = ring.level || 1;
                    artifactMultiplier = getArtifactDamageMultiplier(ringLevel);
                    // Apply multiplier to the damage range (not base damage)
                    damageRange = {
                      min: Math.floor(damageRange.min * artifactMultiplier),
                      max: Math.floor(damageRange.max * artifactMultiplier),
                      average: Math.floor(damageRange.average * artifactMultiplier)
                    };
                    break; // Only apply once
                  }
                }
              }
              
              // Apply manifest damage boost for manifest moves (Captain's Helmet)
              if (move.category === 'manifest' && equippedArtifacts) {
                manifestBoost = getManifestDamageBoost(equippedArtifacts);
                if (manifestBoost > 1.0) {
                  // Apply multiplier to the damage range (not base damage)
                  damageRange = {
                    min: Math.floor(damageRange.min * manifestBoost),
                    max: Math.floor(damageRange.max * manifestBoost),
                    average: Math.floor(damageRange.average * manifestBoost)
                  };
                }
              }
              
              const rangeString = formatDamageRange(damageRange);
              const baseRangeString = formatDamageRange(baseDamageRange);
              const hasArtifactBoost = artifactMultiplier > 1.0 || manifestBoost > 1.0;
              
              return (
                <div style={{
                  background: 'rgba(255,255,255,0.9)',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  gridColumn: 'span 2'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>DAMAGE RANGE</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}>
                    {hasArtifactBoost ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ color: '#dc2626' }}>{rangeString}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>
                          Base: {baseRangeString}
                        </div>
                      </div>
                    ) : (
                      rangeString
                    )}
                  </div>
                  {artifactMultiplier > 1.0 && move.category === 'elemental' && (
                    <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: 'bold' }}>
                      💍 Elemental Ring (Level {ringLevel}) +{Math.round((artifactMultiplier - 1) * 100)}%
                    </div>
                  )}
                  {manifestBoost > 1.0 && move.category === 'manifest' && (
                    <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '0.25rem', fontWeight: 'bold' }}>
                      🪖 Captain's Helmet +{Math.round((manifestBoost - 1) * 100)}%
                    </div>
                  )}
                  {effectiveMasteryLevel > move.masteryLevel && equippedArtifacts && (() => {
                    const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                    const moveElement = move.elementalAffinity?.toLowerCase();
                    for (const slot of ringSlots) {
                      const ring = equippedArtifacts[slot];
                      if (!ring) continue;
                      if ((ring.id === 'blaze-ring' || (ring.name && ring.name.includes('Blaze Ring'))) && moveElement === 'fire') {
                        return (
                          <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '0.25rem', fontWeight: 'bold' }}>
                            🔥 Blaze Ring: +1 Level (Effective Level {effectiveMasteryLevel})
                          </div>
                        );
                      }
                      if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
                        return (
                          <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '0.25rem', fontWeight: 'bold' }}>
                            🌍 Terra Ring: +1 Level (Effective Level {effectiveMasteryLevel})
                          </div>
                        );
                      }
                      if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
                        return (
                          <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '0.25rem', fontWeight: 'bold' }}>
                            💧 Aqua Ring: +1 Level (Effective Level {effectiveMasteryLevel})
                          </div>
                        );
                      }
                      if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
                        return (
                          <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '0.25rem', fontWeight: 'bold' }}>
                            💨 Air Ring: +1 Level (Effective Level {effectiveMasteryLevel})
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                  {moveOverrides[move.name] && (
                    <div style={{ fontSize: '0.6rem', color: '#10B981', marginTop: '0.25rem' }}>
                      ⭐ CUSTOM VALUE
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}

          {/* Healing */}
          {move.healing && (() => {
            // Calculate healing range if we have mastery level
            let healingDisplay: string | number = move.healing;
            if (effectiveMasteryLevel > 1) {
              const healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
              healingDisplay = `${healingRange.min}-${healingRange.max} (Avg: ${healingRange.average})`;
            }
            return (
              <div style={{
                background: 'rgba(255,255,255,0.9)',
                padding: '0.75rem',
                borderRadius: '0.75rem',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                gridColumn: 'span 2'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>HEALING</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>{healingDisplay}</div>
              </div>
            );
          })()}

          {/* Shield Boost */}
          {move.shieldBoost && (() => {
            // Calculate shield boost range if we have mastery level
            let shieldDisplay: string | number = move.shieldBoost;
            let manifestBoost = 1.0;
            
            if (effectiveMasteryLevel > 1) {
              let shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
              
              // Store base shield range before artifact multipliers
              const baseShieldRange = { ...shieldRange };
              
              // Apply manifest damage boost for manifest moves (Captain's Helmet)
              // This also boosts shield values for manifest defensive moves
              if (move.category === 'manifest' && equippedArtifacts) {
                manifestBoost = getManifestDamageBoost(equippedArtifacts);
                if (manifestBoost > 1.0) {
                  // Apply multiplier to the shield range
                  shieldRange = {
                    min: Math.floor(shieldRange.min * manifestBoost),
                    max: Math.floor(shieldRange.max * manifestBoost),
                    average: Math.floor(shieldRange.average * manifestBoost)
                  };
                }
              }
              
              const hasArtifactBoost = manifestBoost > 1.0;
              const baseShieldString = `${baseShieldRange.min}-${baseShieldRange.max} (Avg: ${baseShieldRange.average})`;
              shieldDisplay = `${shieldRange.min}-${shieldRange.max} (Avg: ${shieldRange.average})`;
              
              return (
                <div style={{
                  background: 'rgba(255,255,255,0.9)',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  gridColumn: 'span 2'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>SHIELD BOOST</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>
                    {hasArtifactBoost ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ color: '#3b82f6' }}>{shieldDisplay}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>
                          Base: {baseShieldString}
                        </div>
                      </div>
                    ) : (
                      shieldDisplay
                    )}
                  </div>
                  {manifestBoost > 1.0 && move.category === 'manifest' && (
                    <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: '0.25rem', fontWeight: 'bold' }}>
                      🪖 Captain's Helmet +{Math.round((manifestBoost - 1) * 100)}%
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <div style={{
                background: 'rgba(255,255,255,0.9)',
                padding: '0.75rem',
                borderRadius: '0.75rem',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                gridColumn: 'span 2'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>SHIELD BOOST</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>{shieldDisplay}</div>
              </div>
            );
          })()}

          {/* PP Steal */}
          {move.ppSteal && move.ppSteal > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>PP STEAL</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>{move.ppSteal}</div>
            </div>
          )}

          {/* Cooldown */}
          {move.cooldown > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>COOLDOWN</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#8b5cf6' }}>
                {move.cooldown} {move.cooldown === 1 ? 'turn' : 'turns'}
                {move.currentCooldown > 0 && (
                  <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem' }}>
                    ({move.currentCooldown} remaining)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Priority */}
          {move.priority !== undefined && move.priority !== 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>PRIORITY</div>
              <div style={{ 
                fontSize: '1.25rem', 
                fontWeight: 'bold', 
                color: move.priority > 0 ? '#10b981' : '#dc2626' 
              }}>
                {move.priority > 0 ? '+' : ''}{move.priority}
              </div>
            </div>
          )}

          {/* Target Type */}
          {move.targetType && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>TARGET</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', textTransform: 'capitalize' }}>
                {move.targetType.replace('_', ' ')}
              </div>
            </div>
          )}
        </div>

        {/* Effects Section */}
        {(() => {
          // Check for statusEffects from moveOverrides
          const moveOverride = moveOverrides[move.name];
          const statusEffects = moveOverride?.statusEffects || (moveOverride?.statusEffect && moveOverride.statusEffect.type !== 'none' ? [moveOverride.statusEffect] : []);
          
          // Also check for legacy debuffType/buffType
          const hasLegacyEffects = move.debuffType || move.buffType;
          const hasStatusEffects = statusEffects && statusEffects.length > 0;
          
          if (!hasLegacyEffects && !hasStatusEffects) return null;
          
          return (
            <div style={{ 
              background: 'rgba(255,255,255,0.9)',
              padding: '1rem',
              borderRadius: '0.75rem',
              marginBottom: '1rem',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
                Effects
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.6' }}>
                {/* Legacy buff/debuff display */}
                {move.debuffType && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    • <strong>Debuff:</strong> {move.debuffType} ({move.debuffStrength || 0} strength, {move.duration || 1} turns)
                  </div>
                )}
                {move.buffType && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    • <strong>Buff:</strong> {move.buffType} ({move.buffStrength || 0} strength, {move.duration || 1} turns)
                  </div>
                )}
                
                {/* Status Effects from overrides */}
                {statusEffects.map((effect: any, index: number) => {
                  if (!effect || effect.type === 'none') return null;
                  
                  const effectType = effect.type.charAt(0).toUpperCase() + effect.type.slice(1);
                  const duration = effect.duration || 1;
                  const successChance = effect.successChance ?? effect.chance ?? 100;
                  
                  return (
                    <div key={index} style={{ 
                      marginBottom: '0.5rem',
                      padding: '0.5rem',
                      background: 'rgba(251, 191, 36, 0.1)',
                      borderRadius: '0.375rem',
                      border: '1px solid rgba(251, 191, 36, 0.3)'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        Effect {index + 1}: {effectType}
                      </div>
                      <div style={{ fontSize: '0.7rem', lineHeight: '1.5' }}>
                        <div>• Duration: {duration} {duration === 1 ? 'turn' : 'turns'}</div>
                        {successChance < 100 && (
                          <div>• Success Chance: {successChance}%</div>
                        )}
                        {effect.damageReduction !== undefined && (
                          <div>• Damage Reduction: {effect.damageReduction}%</div>
                        )}
                        {effect.damagePerTurn !== undefined && (
                          <div>• Damage Per Turn: {effect.damagePerTurn}</div>
                        )}
                        {effect.ppLossPerTurn !== undefined && (
                          <div>• PP Loss Per Turn: {effect.ppLossPerTurn}</div>
                        )}
                        {effect.ppStealPerTurn !== undefined && (
                          <div>• PP Steal Per Turn: {effect.ppStealPerTurn}</div>
                        )}
                        {effect.healPerTurn !== undefined && (
                          <div>• Heal Per Turn: {effect.healPerTurn}</div>
                        )}
                        {effect.intensity !== undefined && (
                          <div>• Intensity: {effect.intensity}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Mastery Level */}
        <div style={{ 
          background: 'rgba(255,255,255,0.9)',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Mastery Level</span>
            <span style={{ fontSize: '0.875rem', color: getMasteryColor(effectiveMasteryLevel), fontWeight: 'bold' }}>
              {getMasteryLabel(effectiveMasteryLevel)} ({effectiveMasteryLevel}/{effectiveMasteryLevel <= 5 ? 5 : 10})
              {effectiveMasteryLevel > move.masteryLevel && equippedArtifacts && (() => {
                const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                const moveElement = move.elementalAffinity?.toLowerCase();
                for (const slot of ringSlots) {
                  const ring = equippedArtifacts[slot];
                  if (!ring) continue;
                  if ((ring.id === 'blaze-ring' || (ring.name && ring.name.includes('Blaze Ring'))) && moveElement === 'fire') {
                    return (
                      <span style={{
                        fontSize: '0.7rem',
                        color: '#8b5cf6',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        (+1 Blaze Ring)
                      </span>
                    );
                  }
                  if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
                    return (
                      <span style={{
                        fontSize: '0.7rem',
                        color: '#8b5cf6',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        (+1 Terra Ring)
                      </span>
                    );
                  }
                  if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
                    return (
                      <span style={{
                        fontSize: '0.7rem',
                        color: '#8b5cf6',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        (+1 Aqua Ring)
                      </span>
                    );
                  }
                  if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
                    return (
                      <span style={{
                        fontSize: '0.7rem',
                        color: '#8b5cf6',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        (+1 Air Ring)
                      </span>
                    );
                  }
                }
                return null;
              })()}
            </span>
          </div>
          <div style={{ 
            background: '#e5e7eb', 
            borderRadius: '0.5rem', 
            height: '0.5rem', 
            width: '100%',
            overflow: 'hidden'
          }}>
              <div style={{ 
                width: `${(effectiveMasteryLevel / (effectiveMasteryLevel <= 5 ? 5 : 10)) * 100}%`, 
                background: getMasteryColor(effectiveMasteryLevel),
              height: '100%', 
              borderRadius: '0.5rem',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>

        {/* Upgrade Preview (if can upgrade and below level 5, or if ascended) */}
        {canUpgrade && (move.masteryLevel < 5 ? nextLevelStats : true) && (
          <div style={{ 
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              ⬆️ Next Level Preview
            </div>
            <div style={{ fontSize: '0.75rem', color: '#059669', lineHeight: '1.3' }}>
              {(() => {
                // Use the move's actual current damage
                let currentBaseDamage: number;
                if (move.damage && move.damage > 0) {
                  currentBaseDamage = move.damage;
                } else {
                  // Fall back to lookup for moves that haven't been upgraded yet
                  const moveData = getMoveDataWithOverrides(move.name);
                  if (typeof moveData.damage === 'object') {
                    currentBaseDamage = moveData.damage.max || moveData.damage.min || 0;
                  } else {
                    currentBaseDamage = moveData.damage || 0;
                  }
                }
                
                if (currentBaseDamage > 0) {
                  // Calculate current damage range
                  const currentRange = calculateDamageRange(currentBaseDamage, move.level, move.masteryLevel);
                  
                  // Calculate next level damage based on boost multipliers
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 3:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 4:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 5:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 6:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 7:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 8:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 9:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 10:
                      minBoost = 3.0;
                      maxBoost = 3.5;
                      break;
                    default:
                      minBoost = 1.0;
                      maxBoost = 1.0;
                  }
                  
                  // Calculate next level damage range (using min and max multipliers)
                  // For preview, we'll show a range based on min and max possible boosts
                  const nextMinDamage = Math.floor(currentBaseDamage * minBoost);
                  const nextMaxDamage = Math.floor(currentBaseDamage * maxBoost);
                  
                  // Calculate damage ranges for both min and max boost scenarios
                  const nextRangeMin = calculateDamageRange(nextMinDamage, move.level, nextLevel);
                  const nextRangeMax = calculateDamageRange(nextMaxDamage, move.level, nextLevel);
                  
                  // Combine into a range showing the potential span
                  const nextRange = {
                    min: nextRangeMin.min,
                    max: nextRangeMax.max,
                    average: Math.floor((nextRangeMin.average + nextRangeMax.average) / 2)
                  };
                  
                  return (
                    <div>Damage: {formatDamageRange(currentRange)} → {formatDamageRange(nextRange)}</div>
                  );
                }
                return null;
              })()}
              {(() => {
                // Calculate next level shield boost based on current shield boost and multiplier
                if (move.shieldBoost && move.shieldBoost > 0) {
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 3:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 4:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 5:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 6:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 7:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 8:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 9:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 10:
                      minBoost = 3.0;
                      maxBoost = 3.5;
                      break;
                    default:
                      minBoost = 1.0;
                      maxBoost = 1.0;
                  }
                  
                  const currentShield = move.shieldBoost;
                  const nextMinShield = Math.floor(currentShield * minBoost);
                  const nextMaxShield = Math.floor(currentShield * maxBoost);
                  
                  return (
                    <div>Shield: {currentShield} → {nextMinShield}-{nextMaxShield}</div>
                  );
                }
                return null;
              })()}
              {(() => {
                // Calculate next level healing based on current healing and multiplier
                if (move.healing && move.healing > 0) {
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 3:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 4:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 5:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 6:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 7:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 8:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 9:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 10:
                      minBoost = 3.0;
                      maxBoost = 3.5;
                      break;
                    default:
                      minBoost = 1.0;
                      maxBoost = 1.0;
                  }
                  
                  const currentHealing = move.healing;
                  const nextMinHealing = Math.floor(currentHealing * minBoost);
                  const nextMaxHealing = Math.floor(currentHealing * maxBoost);
                  
                  return (
                    <div>Healing: {currentHealing} → {nextMinHealing}-{nextMaxHealing}</div>
                  );
                }
                return null;
              })()}
              {(() => {
                // Special handling for RR Candy skills - show shield removal/boost preview
                if (isRRCandyMove && move.debuffType === 'shield_break' && move.debuffStrength) {
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2: minBoost = 2.0; maxBoost = 2.3; break;
                    case 3: minBoost = 1.25; maxBoost = 1.5; break;
                    case 4: minBoost = 1.3; maxBoost = 1.6; break;
                    case 5: minBoost = 2.0; maxBoost = 2.5; break;
                    default: minBoost = 1.0; maxBoost = 1.0;
                  }
                  
                  const currentShieldRemoval = move.debuffStrength;
                  const nextMinRemoval = Math.floor(currentShieldRemoval * minBoost);
                  const nextMaxRemoval = Math.floor(currentShieldRemoval * maxBoost);
                  
                  return (
                    <div>Shield Removal: {currentShieldRemoval}% → {nextMinRemoval}% - {nextMaxRemoval}%</div>
                  );
                }
                
                // Special handling for RR Candy skills - show shield boost preview
                if (isRRCandyMove && move.shieldBoost) {
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2: minBoost = 2.0; maxBoost = 2.3; break;
                    case 3: minBoost = 1.25; maxBoost = 1.5; break;
                    case 4: minBoost = 1.3; maxBoost = 1.6; break;
                    case 5: minBoost = 2.0; maxBoost = 2.5; break;
                    default: minBoost = 1.0; maxBoost = 1.0;
                  }
                  
                  const currentShieldBoost = move.shieldBoost;
                  const nextMinBoost = Math.floor(currentShieldBoost * minBoost);
                  const nextMaxBoost = Math.floor(currentShieldBoost * maxBoost);
                  
                  return (
                    <div>Shield Boost: {currentShieldBoost}% → {nextMinBoost}% - {nextMaxBoost}%</div>
                  );
                }
                
                // Regular debuff/buff preview
                if (nextLevelStats && nextLevelStats.debuffStrength !== undefined) {
                  return <div>Debuff: {move.debuffStrength || 0} → {nextLevelStats.debuffStrength}</div>;
                }
                if (nextLevelStats && nextLevelStats.buffStrength !== undefined) {
                  return <div>Buff: {move.buffStrength || 0} → {nextLevelStats.buffStrength}</div>;
                }
                return null;
              })()}
            </div>
          </div>
        )}

        {/* Ascend Button - Show if level is exactly 5 */}
        {canAscend && onUpgradeMove && (() => {
          const ascendCost = isRRCandyMove ? 16000 : 1600; // 16000 PP for RR Candy moves, 1600 PP for regular moves
          return (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('🔄 Ascend button clicked!', {
                  moveId: move.id,
                  moveName: move.name,
                  masteryLevel: move.masteryLevel,
                  canAscend,
                  onUpgradeMove: !!onUpgradeMove,
                  timestamp: new Date().toISOString()
                });
                
                // Show custom confirmation modal instead of window.confirm (works better in Firefox)
                const moveName = getMoveDataWithOverrides(move.name).name;
                setAscendConfirm({ moveId: move.id, moveName });
              }}
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                color: 'white',
                border: '3px solid #f59e0b',
                padding: '0.75rem',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                width: '100%',
                marginBottom: '0.5rem',
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.5)',
                position: 'relative',
                zIndex: 10,
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 0 25px rgba(245, 158, 11, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.5)';
              }}
            >
              ⬆️ Ascend ({ascendCost} PP)
            </button>
          );
        })()}

        {/* Upgrade Button - Show for levels 1-4 and 6-9 */}
        {canUpgrade && move.masteryLevel !== 5 && onUpgradeMove && (
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('🔄 Upgrade button clicked!', {
                moveId: move.id,
                moveName: move.name,
                masteryLevel: move.masteryLevel,
                nextLevel: move.masteryLevel + 1,
                upgradeCost,
                isManifestMove,
                isRRCandyMove,
                effectiveUnlocked,
                canUpgrade,
                hasOnUpgradeMove: !!onUpgradeMove,
                timestamp: new Date().toISOString()
              });
              
              if (!onUpgradeMove) {
                console.error('❌ onUpgradeMove is not defined!');
                alert('Upgrade function not available. Please refresh the page.');
                return;
              }
              
              try {
                console.log('🔄 Calling onUpgradeMove...');
                await onUpgradeMove(move.id);
                console.log('✅ onUpgradeMove completed successfully');
              } catch (error) {
                console.error('❌ Error in onUpgradeMove:', error);
                alert(`Failed to upgrade: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }}
            disabled={!canUpgrade}
            style={{
              background: canUpgrade ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(156,163,175,0.8)',
              color: canUpgrade ? 'white' : '#6b7280',
              border: canUpgrade ? '2px solid #10b981' : 'none',
              padding: '1rem',
              borderRadius: '0.75rem',
              cursor: canUpgrade ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              width: '100%',
              marginTop: '0.5rem',
              transition: 'all 0.2s',
              backdropFilter: 'blur(10px)',
              boxShadow: canUpgrade ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
            }}
            onMouseEnter={(e) => {
              if (canUpgrade) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (canUpgrade) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
              }
            }}
          >
            {canUpgrade ? `⬆️ Upgrade to Level ${move.masteryLevel + 1} (${upgradeCost} PP${isRRCandyMove && requiredShards > 0 ? ` + ${requiredShards} Truth Metal Shard${requiredShards > 1 ? 's' : ''}` : ''})` : 'Cannot Upgrade'}
          </button>
        )}
        
      </div>
    );
  };

  const renderMoveSection = (title: string, moves: Move[], icon: string, color: string) => {
    if (moves.length === 0) return null;

    // Determine purchase cost based on category
    const getPurchaseCost = () => {
      if (title.includes('Manifest')) return 300;
      if (title.includes('Elemental')) return 300;
      if (title.includes('System')) return 300;
      return 300;
    };

    const purchaseCost = getPurchaseCost();
    
    // Check if purchase is allowed
    const category = title.includes('Manifest') ? 'manifest' : 
                    (title.includes('Element') || title.includes('Elemental')) ? 'elemental' : 'system';
    
    let canPurchase = true;
    let nextMilestone = null;
    
    if (title.includes('Manifest') && canPurchaseMove) {
      canPurchase = canPurchaseMove(category);
      nextMilestone = (getNextMilestone && manifestProgress) ? 
        getNextMilestone(manifestProgress.manifestType) : null;
    } else if ((title.includes('Element') || title.includes('Elemental')) && canPurchaseElementalMove && elementalProgress) {
      // For Elemental moves, we need to check the specific element type
      const elementType = userElement?.toLowerCase();
      if (elementType) {
        try {
          canPurchase = canPurchaseElementalMove(elementType);
          nextMilestone = (getNextElementalMilestone) ? 
            getNextElementalMilestone(elementType) : null;
        } catch (error) {
          console.error('MovesDisplay: Error checking elemental move purchase:', error);
          canPurchase = false;
          nextMilestone = null;
        }
      }
    } else if (canPurchaseMove) {
      canPurchase = canPurchaseMove(category);
    }

    return (
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: color,
          borderRadius: '0.5rem'
        }}>
          <span style={{ fontSize: '1.25rem', marginRight: '0.75rem' }}>{icon}</span>
          <h4 style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold',
            color: 'white',
            margin: 0
          }}>
            {title} ({moves.length} Available)
          </h4>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, 380px)', 
          gap: '2rem',
          justifyContent: 'center'
        }}>
          {moves.map(renderMoveCard)}
          
          {/* Purchase Card */}
          <div style={{
            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            border: '3px dashed #9ca3af',
            borderRadius: '1.5rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            position: 'relative',
            minHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
            e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.borderColor = '#6b7280';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#9ca3af';
          }}>
            
            {/* Card Header */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ 
                fontSize: '3rem', 
                marginBottom: '1rem',
                opacity: 0.6
              }}>
                ➕
              </div>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: 'bold', 
                color: '#6b7280',
                margin: '0',
                textAlign: 'center'
              }}>
                Purchase New Move
              </h3>
            </div>

            {/* Purchase Info */}
            <div style={{ 
              background: 'rgba(255,255,255,0.8)',
              padding: '1rem',
              borderRadius: '1rem',
              marginBottom: '1rem',
              textAlign: 'center',
              width: '100%'
            }}>
              {canPurchase ? (
                <>
                  <p style={{ 
                    color: '#6b7280', 
                    fontSize: '0.875rem', 
                    lineHeight: '1.5',
                    margin: '0',
                    marginBottom: '1rem'
                  }}>
                    Unlock a new {title.toLowerCase().replace(' moves', '')} move to expand your arsenal
                  </p>
                  
                  <div style={{
                    background: 'rgba(255,255,255,0.9)',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    textAlign: 'center',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>COST</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{purchaseCost} PP</div>
                  </div>
                </>
              ) : nextMilestone ? (
                <>
                  <p style={{ 
                    color: '#dc2626', 
                    fontSize: '0.875rem', 
                    lineHeight: '1.5',
                    margin: '0',
                    marginBottom: '1rem',
                    fontWeight: 'bold'
                  }}>
                    ⚠️ Milestone Required: {nextMilestone?.name || 'Unknown Milestone'}
                  </p>
                  
                  <div style={{
                    background: 'rgba(220, 38, 38, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    textAlign: 'center',
                    marginBottom: '1rem',
                    border: '1px solid rgba(220, 38, 38, 0.2)'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.25rem', fontWeight: 'bold' }}>REQUIREMENTS</div>
                    <div style={{ fontSize: '0.875rem', color: '#dc2626', marginBottom: '0.5rem' }}>
                      Level 1 Moves Used: {
                        title.includes('Manifest') ? 
                          (manifestProgress?.level1MovesUsed || 0) : 
                          (elementalProgress?.level1MovesUsed || 0)
                      }/{nextMilestone?.requirements?.level1MovesUsed || 9}<br/>
                      Mastery Level: {nextMilestone?.requirements?.masteryLevel || 1}<br/>
                      Moves Unlocked: {nextMilestone?.requirements?.movesUnlocked || 1}<br/>
                      Battles Won: {nextMilestone?.requirements?.battlesWon || 0}<br/>
                      PP Earned: {nextMilestone?.requirements?.ppEarned || 0}
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ 
                  color: '#6b7280', 
                  fontSize: '0.875rem', 
                  lineHeight: '1.5',
                  margin: '0',
                  marginBottom: '1rem'
                }}>
                  Complete milestones to unlock more moves
                </p>
              )}
            </div>

            {/* Purchase Button */}
            <button
              disabled={!canPurchase}
              style={{
                background: canPurchase ? color : '#9ca3af',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '1rem',
                cursor: canPurchase ? 'pointer' : 'not-allowed',
                fontSize: '1rem',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                width: '100%',
                opacity: canPurchase ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (canPurchase) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {canPurchase ? '💰 Purchase Move' : '🔒 Milestone Required'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      background: 'white', 
      border: '1px solid #e5e7eb',
      borderRadius: '1rem',
      padding: '2rem'
    }}>
      <h3 style={{ 
        fontSize: '1.5rem', 
        marginBottom: '1.5rem', 
        color: '#1f2937',
        textAlign: 'center'
      }}>
        ⚔️ Your Battle Arsenal ({manifestMoves.length + elementalMoves.length + rrCandyMoves.length} Skills Unlocked)
      </h3>

      {/* Move Availability Summary */}
      <div style={{ 
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '0.75rem',
        padding: '1rem',
        marginBottom: '2rem'
      }}>
        <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>Skill Availability</h4>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ 
            background: '#dbeafe',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #93c5fd'
          }}>
            <span style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '500' }}>
              ⚔️ Battle Skills: {offlineMovesRemaining} remaining
            </span>
          </div>
          <div style={{ 
            background: '#fef3c7',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #fcd34d'
          }}>
            <span style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: '500' }}>
              ⏰ Offline Skills: {offlineMovesRemaining}/{maxOfflineMoves}
            </span>
          </div>
        </div>
      </div>

      {/* Power Card Skills Section - Custom moves from Profile */}
      {powerCardMoves.length > 0 && (
        renderMoveSection('Power Card Skills', powerCardMoves, '🎴', '#f59e0b')
      )}

      {/* RR Candy Skills Section - Same layout as Manifest/Elemental Skills */}
      {/* Show skills if unlocked AND we have skills (prioritize service results, fallback to moves array) */}
      {(() => {
        // Determine which skills to display (service results take priority)
        const skillsToDisplay = rrCandySkillsFromService.length > 0 
          ? rrCandySkillsFromService 
          : rrCandyMoves;
        const skillsCount = skillsToDisplay.length;
        
        console.log('MovesDisplay: RR Candy display check:', {
          unlocked: rrCandyStatus.unlocked,
          serviceSkillsCount: rrCandySkillsFromService.length,
          movesArrayCount: rrCandyMoves.length,
          skillsToDisplayCount: skillsCount,
          candyType: rrCandyStatus.candyType
        });
        
        if (rrCandyStatus.unlocked && skillsCount > 0) {
          return renderMoveSection(
            `RR Candy Skills (${skillsCount} Available)`, 
            skillsToDisplay, 
            '🍬', 
            '#ec4899'
          );
        } else if (rrCandyStatus.unlocked && skillsCount === 0) {
          // RR Candy is unlocked but moves aren't loaded yet - show loading state
          return (
            <div style={{ marginBottom: '2rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: '#ec4899',
            borderRadius: '0.5rem'
          }}>
            <span style={{ fontSize: '1.25rem', marginRight: '0.75rem' }}>🍬</span>
            <h4 style={{ 
              fontSize: '1.125rem', 
              fontWeight: 'bold',
              color: 'white',
              margin: 0
            }}>
              RR Candy Skills (Loading...)
            </h4>
          </div>
          <div style={{ 
            background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
            border: '2px solid #ec4899',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            textAlign: 'center'
          }}>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Loading your RR Candy skills...
            </p>
          </div>
        </div>
          );
        } else {
          // Show message if no RR Candy skills are unlocked
          return (
            <div style={{ 
          background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
          border: '2px solid #ec4899',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍬</div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#ec4899' }}>
            RR Candy Skills
          </h4>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            Complete Chapter 2-4 to unlock your first RR Candy ability! These powerful reality-rewrite skills allow you to manipulate battle mechanics.
          </p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            Once unlocked, manage and upgrade your RR Candy skills here in Skill Mastery.
          </p>
        </div>
          );
        }
      })()}

      {/* Manifest Skills Section */}
      {renderMoveSection('Manifest Skills', manifestMoves, '🌟', '#8b5cf6')}

      {/* Element Skills Section */}
      {elementalMoves.length > 0 && userElement && (
        renderMoveSection(
          `Element Skills (${elementalMoves.length} Available)`, 
          elementalMoves, 
          getElementalIcon(userElement), 
          getElementalColor(userElement)
        )
      )}
      
      {/* Unlock Element Skills Button */}
      {elementalMoves.length === 0 && onUnlockElementalMoves && userElement && (
        <div style={{ 
          background: getElementalBackgroundColor(userElement),
          border: `1px solid ${getElementalBorderColor(userElement)}`,
          borderRadius: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{getElementalIcon(userElement)}</div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: getElementalColor(userElement) }}>
            Unlock Your {userElement.charAt(0).toUpperCase() + userElement.slice(1)} Element Skills
          </h4>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            As a {userElement} element user, you can unlock powerful {userElement} skills to enhance your battle capabilities!
          </p>
          <button
            onClick={() => onUnlockElementalMoves(userElement)}
            style={{
              background: getElementalColor(userElement),
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = '0.9';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {getElementalIcon(userElement)} Unlock {userElement.charAt(0).toUpperCase() + userElement.slice(1)} Skills
          </button>
        </div>
      )}

      {/* No Skills Message */}
      {manifestMoves.length === 0 && elementalMoves.length === 0 && rrCandyMoves.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Skills Unlocked</h4>
          <p>Complete challenges and level up to unlock powerful skills!</p>
          
          {/* Debug button to force unlock all moves */}
          {onForceUnlockAllMoves && (
            <div style={{ marginTop: '2rem' }}>
              <button
                onClick={onForceUnlockAllMoves}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >
                🔧 Debug: Force Unlock All Moves
              </button>
            </div>
          )}
          
          {/* Debug button to reset moves with element filter */}
          {onResetMovesWithElementFilter && (
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={onResetMovesWithElementFilter}
                style={{
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >
                🔄 Reset Moves (Element Filter)
              </button>
            </div>
          )}
          
          {/* Debug button to apply element filter to existing moves */}
                      {onApplyElementFilterToExistingMoves && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick={onApplyElementFilterToExistingMoves}
                  style={{
                    background: '#7c3aed',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  🎯 Apply Element Filter to Existing Moves
                </button>
              </div>
            )}
            
            {/* Debug: Force Migration Buttons */}
            {onForceMigration && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => onForceMigration(false)}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  🔄 Force Migration (Keep Levels)
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('⚠️ This will reset all move mastery levels to 1 while keeping updated move names. Continue?')) {
                      onForceMigration(true);
                    }
                  }}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  🔄 Force Migration (Reset Levels)
                </button>
              </div>
            )}
        </div>
      )}

      {/* Ascend Confirmation Modal */}
      {ascendConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}
        onClick={() => setAscendConfirm(null)}
        >
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#1f2937'
            }}>
              ⬆️ Ascend Move?
            </h3>
            <p style={{
              fontSize: '1rem',
              marginBottom: '1.5rem',
              color: '#6b7280',
              lineHeight: '1.5'
            }}>
              Ascend <strong>{ascendConfirm.moveName}</strong> beyond Level 5?
            </p>
            <p style={{
              fontSize: '0.875rem',
              marginBottom: '1rem',
              color: '#9ca3af'
            }}>
              This will unlock the Ascension path to Level 10!
            </p>
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <p style={{
                fontSize: '0.875rem',
                color: '#92400e',
                margin: 0,
                fontWeight: 'bold'
              }}>
                ⚡ Cost: 1600 PP
              </p>
            </div>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setAscendConfirm(null)}
                style={{
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    console.log(`✅ Proceeding with ascend for move: ${ascendConfirm.moveId} (${ascendConfirm.moveName})`);
                    
                    if (!onUpgradeMove) {
                      throw new Error('onUpgradeMove function is not available');
                    }
                    
                    await onUpgradeMove(ascendConfirm.moveId);
                    console.log(`✅ Ascend completed for: ${ascendConfirm.moveId}`);
                    
                    setAscendConfirm(null);
                  } catch (error) {
                    console.error('❌ Error ascending move:', error);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    alert(`Failed to ascend move: ${errorMessage}`);
                    setAscendConfirm(null);
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(245, 158, 11, 0.3)'
                }}
              >
                ⬆️ Ascend (1600 PP)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovesDisplay; 