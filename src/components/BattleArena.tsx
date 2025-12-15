import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move, MOVE_DAMAGE_VALUES } from '../types/battle';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  formatDamageRange 
} from '../utils/damageCalculator';
import { getLevelFromXP } from '../utils/leveling';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { loadMoveOverrides } from '../utils/moveOverrides';
import BagModal from './BagModal';
import VaultModal from './VaultModal';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';
import { getEffectiveMasteryLevel } from '../utils/artifactUtils';

interface BattleArenaProps {
  onMoveSelect: (move: Move | null) => void;
  onTargetSelect: (targetId: string) => void;
  onEscape?: () => void;
  selectedMove: Move | null;
  selectedTarget: string | null;
  availableMoves: Move[];
  availableTargets: Array<{ id: string; name: string; avatar: string; currentPP: number; shieldStrength: number; maxPP?: number; maxShieldStrength?: number; level?: number }>;
  isPlayerTurn: boolean;
  battleLog: string[];
  customBackground?: string; // Custom background image for special modes like Mindforge
  hideCenterPrompt?: boolean; // Hide the center battle log prompt (for Mindforge mode)
  playerEffects?: Array<{ type: string; duration: number }>; // Active status effects on player
  opponentEffects?: Array<{ type: string; duration: number }>; // Active status effects on opponent
  isTerraAwakened?: boolean; // Whether Terra is in awakened state
  onArtifactUsed?: () => void; // Callback when an artifact is used (e.g., Health Potion ends turn)
}

const BattleArena: React.FC<BattleArenaProps> = ({
  onMoveSelect,
  onTargetSelect,
  onEscape,
  selectedMove,
  selectedTarget,
  isTerraAwakened = false,
  availableMoves,
  availableTargets,
  isPlayerTurn,
  battleLog,
  customBackground,
  hideCenterPrompt = false,
  playerEffects = [],
  opponentEffects = [],
  onArtifactUsed
}) => {
  const { currentUser } = useAuth();
  const { vault } = useBattle();
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showTargetMenu, setShowTargetMenu] = useState(false);
  const [currentLogIndex, setCurrentLogIndex] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [ppBoostStatus, setPpBoostStatus] = useState<{ isActive: boolean; timeRemaining: string }>({ isActive: false, timeRemaining: '' });
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [moveOverrides, setMoveOverrides] = useState<{[key: string]: any}>({});
  const [showBagModal, setShowBagModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);

  // Load move overrides when component mounts
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        console.log('BattleArena: Loading move overrides...');
        const overrides = await loadMoveOverrides();
        setMoveOverrides(overrides);
        console.log('BattleArena: Move overrides loaded:', overrides);
      } catch (error) {
        console.error('BattleArena: Error loading move overrides:', error);
      }
    };

    loadOverrides();
  }, []);

  // Fetch user level and photo
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) {
        console.log('BattleArena: No currentUser available');
        return;
      }
      
      console.log('BattleArena: Fetching data for user:', currentUser.uid, currentUser.email);
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        console.log('BattleArena: User document exists:', userDoc.exists());
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          console.log('BattleArena: Full user data from Firestore:', userData);
          console.log('BattleArena: User XP from Firestore:', userData.xp);
          console.log('BattleArena: Calculated level from XP:', calculatedLevel);
          console.log('BattleArena: User photoURL from Firestore:', userData.photoURL);
          console.log('BattleArena: Current user photoURL:', currentUser.photoURL);
          console.log('BattleArena: User displayName from Firestore:', userData.displayName);
          console.log('BattleArena: Current user displayName:', currentUser.displayName);
          
          const finalPhotoURL = userData.photoURL || currentUser.photoURL || null;
          console.log('BattleArena: Final photoURL being set:', finalPhotoURL);
          
          setUserLevel(calculatedLevel);
          setUserPhotoURL(finalPhotoURL);
        } else {
          console.log('BattleArena: No user document found in students collection');
          // Try users collection as fallback
          const userDoc2 = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc2.exists()) {
            const userData2 = userDoc2.data();
            console.log('BattleArena: Found user data in users collection:', userData2);
            const finalPhotoURL = userData2.photoURL || currentUser.photoURL || null;
            setUserPhotoURL(finalPhotoURL);
          }
        }
      } catch (error) {
        console.error('BattleArena: Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Check for active PP boost
  useEffect(() => {
    const checkPPBoost = async () => {
      if (!currentUser) return;
      
      try {
        const activeBoost = await getActivePPBoost(currentUser.uid);
        const status = getPPBoostStatus(activeBoost);
        setPpBoostStatus(status);
      } catch (error) {
        console.error('Error checking PP boost:', error);
      }
    };
    
    checkPPBoost();
    
    // Update every minute for countdown
    const interval = setInterval(checkPPBoost, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Helper function to get move data with overrides applied
  const getMoveDataWithOverrides = (moveName: string) => {
    const override = moveOverrides[moveName];
    const defaultMove = MOVE_DAMAGE_VALUES[moveName];
    
    return {
      name: override?.name || moveName,
      damage: override?.damage || defaultMove?.damage || 0,
      description: override?.description || ''
    };
  };

  // Auto-advance battle log
  useEffect(() => {
    if (battleLog.length > 0 && currentLogIndex < battleLog.length - 1) {
      const timer = setTimeout(() => {
        setCurrentLogIndex(prev => prev + 1);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [battleLog, currentLogIndex]);

  // Update cooldown timer every second
  useEffect(() => {
    if (!vault?.vaultHealthCooldown) {
      setCooldownRemaining(null);
      return;
    }

    const updateCooldownTimer = () => {
      const cooldownEnd = new Date(vault.vaultHealthCooldown!);
      cooldownEnd.setHours(cooldownEnd.getHours() + 4); // 4-hour cooldown
      const now = new Date();
      const remainingMs = cooldownEnd.getTime() - now.getTime();
      
      if (remainingMs <= 0) {
        setCooldownRemaining(null);
        return;
      }
      
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
      
      setCooldownRemaining({ hours, minutes, seconds });
    };
    
    updateCooldownTimer();
    const interval = setInterval(updateCooldownTimer, 1000);
    
    return () => clearInterval(interval);
  }, [vault?.vaultHealthCooldown]);

  const handleMoveClick = (move: Move) => {
    onMoveSelect(move);
    setShowMoveMenu(false);
    // Don't show target menu - player will click on opponent image to select target
    if (move.targetType === 'self') {
      // For self-targeting moves, automatically select self as target
      onTargetSelect('self');
    }
  };

  const handleChangeMove = () => {
    // Clear selected move and target, return to move selection
    onMoveSelect(null); // Clear move selection
    setShowTargetMenu(false);
    setShowMoveMenu(true);
  };

  const handleTargetClick = (targetId: string) => {
    onTargetSelect(targetId);
    setShowTargetMenu(false);
  };

  const handleEscape = () => {
    console.log('BattleArena: handleEscape called', { hasOnEscape: !!onEscape });
    if (onEscape) {
      console.log('BattleArena: Calling onEscape handler immediately');
      // Call immediately - don't wait
      try {
        onEscape();
      } catch (error) {
        console.error('BattleArena: Error calling onEscape:', error);
      }
    } else {
      console.warn('BattleArena: onEscape handler not provided');
    }
  };


  const getMoveTypeColor = (move: Move) => {
    const colors = {
      attack: '#ef4444',
      defense: '#3b82f6',
      utility: '#8b5cf6',
      support: '#10b981',
      control: '#f59e0b',
      mobility: '#06b6d4',
      stealth: '#6b7280',
      reveal: '#f97316',
      cleanse: '#84cc16'
    };
    return colors[move.type] || '#6b7280';
  };

  const getElementalIcon = (element?: string) => {
    const icons = {
      fire: '🔥',
      water: '💧',
      air: '💨',
      earth: '🪨',
      lightning: '⚡',
      light: '✨',
      shadow: '🌑',
      metal: '⚙️'
    };
    return icons[element as keyof typeof icons] || '⭐';
  };

  // Helper function to calculate max vault health (always 10% of capacity)
  // Health is always 10% of Max PP (not capacity)
  const calculateMaxVaultHealth = (maxPP: number): number => {
    return Math.floor(maxPP * 0.1);
  };
  
  // Helper function to calculate current vault health (capped at current PP if PP < max health)
  // Health defaults to max health (10% of max PP) if not set or is 0, unless currentPP is less than max health
  const calculateCurrentVaultHealth = (maxPP: number, currentPP: number, storedVaultHealth?: number): number => {
    const maxVaultHealth = calculateMaxVaultHealth(maxPP);
    // If stored health is 0 or undefined/null, and player has enough PP, default to max health
    if ((storedVaultHealth === undefined || storedVaultHealth === null || storedVaultHealth === 0) && currentPP >= maxVaultHealth) {
      return maxVaultHealth;
    }
    if (storedVaultHealth !== undefined && storedVaultHealth !== null && storedVaultHealth > 0) {
      // If we have a stored value > 0, cap it at both max health and current PP
      return Math.min(storedVaultHealth, maxVaultHealth, currentPP);
    }
    // Default: if currentPP >= max health, start at max health. Otherwise, use currentPP
    // This ensures health is always visible and starts at max (10% of max PP) when player has enough PP
    if (currentPP >= maxVaultHealth) {
      return maxVaultHealth;
    }
    return Math.min(currentPP, maxVaultHealth);
  };

  const getOpponentImage = (opponentName: string, terraAwakened: boolean = false) => {
    // Return opponent-specific images based on name
    if (opponentName.toLowerCase().includes('hela')) {
      return '/images/Hela.png';
    }
    // Truth opponent
    if (opponentName.toLowerCase().includes('truth')) {
      return '/images/Truth.jpg';
    }
    // Training Dummy opponent
    if (opponentName.toLowerCase().includes('training dummy')) {
      return '/images/Training Dummy.png';
    }
    // Novice Guard opponent
    if (opponentName.toLowerCase().includes('novice guard')) {
      return '/images/Novice Guard.png';
    }
    // Elite Soldier opponent
    if (opponentName.toLowerCase().includes('elite soldier')) {
      return '/images/Elite Soldier.png';
    }
    // Vault Keeper opponent
    if (opponentName.toLowerCase().includes('vault keeper')) {
      return '/images/Vault Keeper.png';
    }
    // Flame Keeper / Master Guardian opponent
    if (opponentName.toLowerCase().includes('flame keeper') || opponentName.toLowerCase().includes('flame thrower') || opponentName.toLowerCase().includes('master guardian')) {
      return '/images/Master Guardian - Flame Thrower.png';
    }
    // Terra / Legendary Protector opponent
    if (opponentName.toLowerCase().includes('terra') || opponentName.toLowerCase().includes('legendary protector')) {
      // Use awakened image if Terra is awakened
      return terraAwakened ? '/images/Terra-Awakened.png' : '/images/Terra.png';
    }
    // Mindforge Standard opponent
    if (opponentName.toLowerCase().includes('mindforge') && opponentName.toLowerCase().includes('standard')) {
      return '/images/Standard Mind Forge Bot.png';
    }
    // Mindforge Advanced opponent
    if (opponentName.toLowerCase().includes('mindforge') && opponentName.toLowerCase().includes('advanced')) {
      return '/images/Advanced Mind Forge Bot.png';
    }
    // Ice Golem opponent
    if (opponentName.toLowerCase().includes('ice golem')) {
      return '/images/Ice Golem.png';
    }
    // Add more opponent images as needed
    return null; // Default fallback
  };

  return (
    <div style={{
      width: '100%',
      height: '600px',
      background: customBackground 
        ? `url("${customBackground}")` 
        : 'linear-gradient(135deg, #87CEEB 0%, #98FB98 50%, #F0E68C 100%)',
      backgroundSize: customBackground ? 'cover' : 'auto',
      backgroundPosition: customBackground ? 'center' : 'center',
      backgroundRepeat: customBackground ? 'no-repeat' : 'repeat',
      backgroundAttachment: customBackground ? 'fixed' : 'scroll',
      borderRadius: customBackground ? '0' : '1rem', // No border radius for Mindforge to show full background
      position: 'relative',
      overflow: 'hidden',
      border: customBackground ? 'none' : '3px solid #8B4513', // No border for Mindforge
      boxShadow: customBackground ? 'none' : '0 8px 32px rgba(0, 0, 0, 0.3)'
    }}>
      {/* Semi-transparent overlay for custom backgrounds (like Mindforge) */}
      {customBackground && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.2)', // Lighter overlay so background is more visible
          zIndex: 0,
          pointerEvents: 'none' // Allow clicks to pass through
        }} />
      )}
      
      {/* Battle Arena Background Elements */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '2rem',
        opacity: customBackground ? 0.1 : 0.3, // Less visible on Mindforge background
        zIndex: 1
      }}>
        ⚔️ MST BATTLE ARENA ⚔️
      </div>


      {/* Player Profile Picture */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        width: '140px',
        height: '140px',
        borderRadius: '50%',
        border: '4px solid #fbbf24',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '4rem',
        animation: isPlayerTurn ? 'pulse 1s infinite' : 'none',
        zIndex: 2
      }}>
        {(() => {
          console.log('BattleArena: Rendering player profile - userPhotoURL:', userPhotoURL);
          console.log('BattleArena: userPhotoURL type:', typeof userPhotoURL);
          console.log('BattleArena: userPhotoURL length:', userPhotoURL?.length);
          return userPhotoURL && userPhotoURL.trim() !== '';
        })() ? (
          <img 
            key={userPhotoURL}
            src={userPhotoURL || undefined} 
            alt="Player Avatar"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%'
            }}
            onLoad={() => {
              console.log('BattleArena: Player image loaded successfully:', userPhotoURL);
            }}
            onError={(e) => {
              console.log('BattleArena: Player image failed to load:', userPhotoURL);
              e.currentTarget.style.display = 'none';
              const fallbackElement = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallbackElement) {
                fallbackElement.style.display = 'flex';
              }
            }}
          />
        ) : (
          <div 
            key={`fallback-${currentUser?.displayName || 'player'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              fontSize: '3rem',
              color: 'white',
              fontWeight: 'bold'
            }}
          >
            {currentUser?.displayName?.[0]?.toUpperCase() || 'P'}
          </div>
        )}
      </div>

      {/* Player Status Box */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '180px',
        width: '200px',
        background: 'rgba(255, 255, 255, 0.95)',
        border: '3px solid #8B4513',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        fontFamily: 'monospace',
        zIndex: 2
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
          {currentUser?.displayName || 'PLAYER'} VAULT
        </div>
        <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          Lv.{userLevel}
        </div>
        <div style={{ marginBottom: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.125rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>PP</span>
            {ppBoostStatus.isActive && (
              <span 
                style={{ 
                  fontSize: '0.75rem',
                  color: '#f59e0b',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: '0 0 4px rgba(245, 158, 11, 0.5)',
                  animation: 'pulse 2s infinite'
                }}
                title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
              >
                ×2
              </span>
            )}
          </div>
          <div style={{
            width: '100%',
            height: '12px',
            background: '#e5e7eb',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${vault ? (vault.currentPP / vault.capacity) * 100 : 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
            {vault?.currentPP || 0}/{vault?.capacity || 100}
          </div>
        </div>
        <div style={{ marginBottom: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.125rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>VAULT HEALTH</span>
            {cooldownRemaining && (
              <span style={{ fontSize: '0.65rem', color: '#f59e0b', marginLeft: '0.25rem', fontWeight: 'bold' }}>
                (⏰ {cooldownRemaining.hours}h {cooldownRemaining.minutes}m {cooldownRemaining.seconds}s)
              </span>
            )}
          </div>
          <div style={{
            width: '100%',
            height: '12px',
            background: '#e5e7eb',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(() => {
                if (!vault) return 0;
                const maxPP = vault.capacity || 1000;
                const maxVaultHealth = vault.maxVaultHealth || calculateMaxVaultHealth(maxPP);
                const currentVaultHealth = calculateCurrentVaultHealth(maxPP, vault.currentPP, vault.vaultHealth);
                return maxVaultHealth > 0 ? (currentVaultHealth / maxVaultHealth) * 100 : 0;
              })()}%`,
              height: '100%',
              background: (() => {
                if (!vault) return 'linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)';
                const maxPP = vault.capacity || 1000;
                const maxVaultHealth = vault.maxVaultHealth || calculateMaxVaultHealth(maxPP);
                const currentVaultHealth = calculateCurrentVaultHealth(maxPP, vault.currentPP, vault.vaultHealth);
                return currentVaultHealth === 0 ? 'linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)' : 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
              })(),
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
            {(() => {
              if (!vault) return '0/0';
              const maxPP = vault.capacity || 1000; // Capacity is the max PP
              const maxVaultHealth = vault.maxVaultHealth || calculateMaxVaultHealth(maxPP);
              const currentVaultHealth = calculateCurrentVaultHealth(maxPP, vault.currentPP, vault.vaultHealth);
              return `${currentVaultHealth}/${maxVaultHealth}`;
            })()}
          </div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>SHIELD</span>
          <div style={{
            width: '100%',
            height: '12px',
            background: '#e5e7eb',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${vault ? (vault.shieldStrength / vault.maxShieldStrength) * 100 : 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
            {vault?.shieldStrength || 0}/{vault?.maxShieldStrength || 100}
          </div>
        </div>
        
        {/* Player Status Effects */}
        {playerEffects && playerEffects.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#92400e' }}>EFFECTS:</div>
            {playerEffects.map((effect, idx) => {
              const icons: { [key: string]: string } = {
                burn: '🔥',
                stun: '⚡',
                bleed: '🩸',
                poison: '☠️',
                confuse: '🌀',
                drain: '💉',
                freeze: '❄️'
              };
              return (
                <div key={idx} style={{ marginBottom: '0.125rem' }}>
                  {icons[effect.type] || '✨'} {effect.type.toUpperCase()} ({effect.duration})
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Opponent Profile Picture - Always visible */}
      {availableTargets.length > 0 && (
        <>

          {/* Opponent Profile Picture - Clickable when move is selected */}
          <div 
            onClick={() => {
              if (selectedMove && isPlayerTurn && availableTargets.length > 0) {
                onTargetSelect(availableTargets[0].id);
              }
            }}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              border: selectedMove && isPlayerTurn 
                ? (selectedTarget === availableTargets[0]?.id ? '6px solid #fbbf24' : '4px solid #ef4444')
                : '4px solid #ef4444',
              zIndex: 2,
              overflow: 'hidden',
              boxShadow: selectedMove && isPlayerTurn
                ? (selectedTarget === availableTargets[0]?.id 
                    ? '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 16px rgba(0, 0, 0, 0.3)'
                    : '0 0 15px rgba(239, 68, 68, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3)')
                : '0 4px 16px rgba(0, 0, 0, 0.3)',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '4rem',
              animation: !isPlayerTurn ? 'pulse 1s infinite' : 'none',
              cursor: selectedMove && isPlayerTurn ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              transform: selectedMove && isPlayerTurn ? 'scale(1.1)' : 'scale(1)'
            }}
            onMouseEnter={(e) => {
              if (selectedMove && isPlayerTurn) {
                e.currentTarget.style.transform = 'scale(1.15)';
                e.currentTarget.style.boxShadow = '0 0 25px rgba(251, 191, 36, 0.9), 0 6px 20px rgba(0, 0, 0, 0.4)';
                e.currentTarget.style.borderColor = '#fbbf24';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedMove && isPlayerTurn) {
                e.currentTarget.style.transform = selectedTarget === availableTargets[0]?.id ? 'scale(1.1)' : 'scale(1.05)';
                e.currentTarget.style.boxShadow = selectedTarget === availableTargets[0]?.id
                  ? '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 16px rgba(0, 0, 0, 0.3)'
                  : '0 0 15px rgba(239, 68, 68, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3)';
                e.currentTarget.style.borderColor = selectedTarget === availableTargets[0]?.id ? '#fbbf24' : '#ef4444';
              } else {
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            {(() => {
              const opponentImage = getOpponentImage(availableTargets[0]?.name || '', isTerraAwakened);
              // Adjust objectPosition based on opponent type
              const opponentName = availableTargets[0]?.name?.toLowerCase() || '';
              const isStandardMindforge = opponentName.includes('mindforge') && opponentName.includes('standard');
              const isAdvancedMindforge = opponentName.includes('mindforge') && opponentName.includes('advanced');
              const isTrainingDummy = opponentName.includes('training dummy');
              
              // Focus on face area - use negative value to shift image up and show the head/face
              const isNoviceGuard = opponentName.toLowerCase().includes('novice guard');
              const isEliteSoldier = opponentName.toLowerCase().includes('elite soldier');
              const isTruth = opponentName.toLowerCase().includes('truth');
              let objectPos = '55% -20%'; // Default
              if (isStandardMindforge) {
                objectPos = '50% -25%'; // Show face-focused view for Standard Mindforge Bot
              } else if (isAdvancedMindforge) {
                objectPos = '50% -20%'; // Show face-focused view for Advanced Mindforge Bot
              } else if (isTrainingDummy) {
                objectPos = '50% -40%'; // Show upper half of Training Dummy (scarecrow head and torso)
              } else if (isNoviceGuard) {
                objectPos = '50% -30%'; // Show upper half of Novice Guard (head and torso)
              } else if (isEliteSoldier) {
                objectPos = '50% -30%'; // Show upper half of Elite Soldier (head and torso)
              } else if (opponentName.toLowerCase().includes('vault keeper')) {
                objectPos = '50% 0%'; // Show top half of Vault Keeper (focus on face/head)
              } else if (opponentName.toLowerCase().includes('flame keeper') || opponentName.toLowerCase().includes('flame thrower') || opponentName.toLowerCase().includes('master guardian')) {
                objectPos = '50% -30%'; // Show upper half of Flame Keeper (focus on face/head and upper body)
              } else if (opponentName.toLowerCase().includes('terra') || opponentName.toLowerCase().includes('legendary protector')) {
                objectPos = '50% -30%'; // Show upper half of Terra (focus on face/head and upper body)
              } else if (isTruth) {
                objectPos = '50% 0%'; // Show top half of Truth (focus on the head/face area with the grin)
              }
              
              return opponentImage ? (
                <img 
                  src={opponentImage} 
                  alt="Opponent Avatar"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: objectPos,
                    borderRadius: '50%',
                    transform: 'scale(2.5)'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallbackElement = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallbackElement) {
                      fallbackElement.style.display = 'flex';
                    }
                  }}
                />
              ) : null;
            })()}
            <div 
              style={{
                display: getOpponentImage(availableTargets[0]?.name || '', isTerraAwakened) ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                fontSize: '3rem',
                color: 'white',
                fontWeight: 'bold'
              }}
            >
              {availableTargets[0]?.name?.[0]?.toUpperCase() || 'O'}
            </div>
          </div>

          {/* Opponent Status Box */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '180px',
            width: '200px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '3px solid #8B4513',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            fontFamily: 'monospace',
            zIndex: 2
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
              {availableTargets[0]?.name || 'OPPONENT'}
            </div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Lv.{availableTargets[0]?.level || Math.floor((availableTargets[0]?.currentPP || 0) / 100) + 1}
            </div>
            <div style={{ marginBottom: '0.25rem' }}>
              {(() => {
                // Check if this is a CPU opponent (Training Dummy, Novice Guard, Elite Soldier, etc.)
                const opponentName = availableTargets[0]?.name?.toLowerCase() || '';
                const isCPUOpponent = opponentName.includes('training dummy') || 
                                     opponentName.includes('novice guard') || 
                                     opponentName.includes('elite soldier') || 
                                     opponentName.includes('vault keeper') || 
                                     (opponentName.toLowerCase().includes('flame keeper') || opponentName.toLowerCase().includes('flame thrower') || opponentName.toLowerCase().includes('master guardian')) || 
                                     opponentName.includes('legendary protector') ||
                                     opponentName.includes('mindforge');
                const statLabel = isCPUOpponent ? 'HEALTH' : 'PP';
                return (
                  <>
                    <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{statLabel}</span>
                    <div style={{
                      width: '100%',
                      height: '12px',
                      background: '#e5e7eb',
                      borderRadius: '6px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${availableTargets[0] ? (availableTargets[0].currentPP / (availableTargets[0].maxPP || 1000)) * 100 : 0}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
                      {availableTargets[0]?.currentPP || 0}/{availableTargets[0]?.maxPP || 1000}
                    </div>
                  </>
                );
              })()}
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>SHIELD</span>
              <div style={{
                width: '100%',
                height: '12px',
                background: '#e5e7eb',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${availableTargets[0] ? (availableTargets[0].shieldStrength / (availableTargets[0].maxShieldStrength || 100)) * 100 : 0}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
                {availableTargets[0]?.shieldStrength || 0}/{availableTargets[0]?.maxShieldStrength || 100}
              </div>
            </div>
            
            {/* Opponent Status Effects */}
            {opponentEffects && opponentEffects.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#92400e' }}>EFFECTS:</div>
                {opponentEffects.map((effect, idx) => {
                  const icons: { [key: string]: string } = {
                    burn: '🔥',
                    stun: '⚡',
                    bleed: '🩸',
                    poison: '☠️',
                    confuse: '🌀',
                    drain: '💉',
                    cleanse: '✨',
                    freeze: '❄️'
                  };
                  return (
                    <div key={idx} style={{ marginBottom: '0.125rem' }}>
                      {icons[effect.type] || '✨'} {effect.type.toUpperCase()} ({effect.duration})
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Battle Log Display - Hide in Mindforge mode to avoid blocking targeting */}
      {!hideCenterPrompt && (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '1rem',
        borderRadius: '0.5rem',
        maxWidth: '400px',
        textAlign: 'center',
        fontSize: '0.875rem',
        fontFamily: 'monospace',
        border: '2px solid #fbbf24',
        zIndex: 2
      }}>
        {selectedMove && isPlayerTurn && !selectedTarget
          ? `Selected: ${selectedMove.name} - Click opponent to attack!`
          : (battleLog[currentLogIndex] || 'Select a move to begin battle!')}
      </div>
      )}

      {/* Move Selection Menu */}
      {showMoveMenu && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          width: '300px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '3px solid #8B4513',
          borderRadius: '0.5rem',
          padding: '1rem',
          zIndex: 1000,
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', textAlign: 'center', flex: 1 }}>
              SELECT MOVE
            </div>
            {selectedMove && (
              <button
                onClick={() => {
                  onMoveSelect(null);
                  setShowMoveMenu(false);
                }}
                style={{
                  background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                  color: 'white',
                  border: '2px solid #8B4513',
                  borderRadius: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.625rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  marginLeft: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #4b5563 0%, #374151 100%)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Clear selection"
              >
                ✕
              </button>
            )}
          </div>
          {selectedMove && (
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              marginBottom: '0.5rem', 
              textAlign: 'center',
              fontStyle: 'italic',
              padding: '0.25rem',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '0.25rem'
            }}>
              Selected: {selectedMove?.name || 'Unknown'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {availableMoves.map((move, index) => {
              // Calculate effective mastery level once for this move (includes ring bonuses)
              const effectiveMasteryLevel = move.category === 'elemental' && equippedArtifacts 
                ? getEffectiveMasteryLevel(move, equippedArtifacts)
                : move.masteryLevel;
              // Effective move level should match effective mastery level when artifacts boost it
              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
              
              return (
              <button
                key={move.id}
                onClick={() => handleMoveClick(move)}
                style={{
                  background: getMoveTypeColor(move),
                  color: 'white',
                  border: '2px solid #8B4513',
                  borderRadius: '0.25rem',
                  padding: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.25rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {getElementalIcon(move.elementalAffinity)}
                  <span>{getMoveDataWithOverrides(move.name).name} [Level {effectiveMasteryLevel}]</span>
                  {effectiveMasteryLevel > move.masteryLevel && (
                    <span style={{
                      fontSize: '0.625rem',
                      color: '#f59e0b',
                      marginLeft: '0.25rem',
                      fontWeight: 'normal'
                    }}>
                      (+{effectiveMasteryLevel - move.masteryLevel} from Ring)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>
                  {move.type.toUpperCase()}
                </div>
                {(() => {
                  // Use actual user level for range calculation
                  const playerLevel = userLevel;
                  
                  // Show damage range for offensive moves
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
                    let damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                    
                    const rangeString = formatDamageRange(damageRange);
                    console.log('BattleArena: Rendering damage range for', move.name, ':', rangeString, '(from override:', moveOverrides[move.name] ? 'YES' : 'NO', ')');
                    return (
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: '#ef4444', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        marginTop: '2px'
                      }}>
                        Damage: {rangeString}
                        {moveOverrides[move.name] && (
                          <span style={{ color: '#10B981', marginLeft: '4px' }}>⭐</span>
                        )}
                      </div>
                    );
                  }
                  
                  // Show shield boost range for defensive moves
                  if (move.shieldBoost && move.shieldBoost > 0) {
                    const shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, move.masteryLevel);
                    const rangeString = formatDamageRange(shieldRange);
                    console.log('BattleArena: Rendering shield boost range for', move.name, ':', rangeString);
                    return (
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: '#3b82f6', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        marginTop: '2px'
                      }}>
                        Shield: +{rangeString}
                      </div>
                    );
                  }
                  
                  // Show healing range for support moves
                  if (move.healing && move.healing > 0) {
                    const healingRange = calculateHealingRange(move.healing, move.level, move.masteryLevel);
                    const rangeString = formatDamageRange(healingRange);
                    console.log('BattleArena: Rendering healing range for', move.name, ':', rangeString);
                    return (
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: '#10b981', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        marginTop: '2px'
                      }}>
                        Heal: +{rangeString}
                      </div>
                    );
                  }
                  
                  console.log('BattleArena: No effect to render for', move.name);
                  return null;
                })()}
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Target Selection Menu - Hidden, targets are now selected by clicking their image */}
      {false && showTargetMenu && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '400px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '3px solid #8B4513',
          borderRadius: '0.5rem',
          padding: '1rem',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', textAlign: 'center', flex: 1 }}>
              SELECT TARGET
            </div>
            <button
              onClick={handleChangeMove}
              style={{
                background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                color: 'white',
                border: '2px solid #8B4513',
                borderRadius: '0.25rem',
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #4b5563 0%, #374151 100%)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ← Back
            </button>
          </div>
          {selectedMove && (
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              marginBottom: '0.5rem', 
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              Selected: {selectedMove?.name || 'Unknown'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => handleTargetClick(target.id)}
                style={{
                  background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                  border: '2px solid #8B4513',
                  borderRadius: '0.25rem',
                  padding: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div style={{ fontSize: '1.5rem' }}>🏦</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                    {target.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    PP: {target.currentPP} | Shield: {target.shieldStrength}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.5rem',
        width: '200px',
        zIndex: 1000,
        pointerEvents: 'auto'
      }}>
        {/* FIGHT button - only show when not in menus and player's turn */}
        {!showMoveMenu && !showTargetMenu && isPlayerTurn && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (selectedMove) {
                // If a move is selected, deselect it
                onMoveSelect(null);
                onTargetSelect('');
              } else {
                // Otherwise, open the move menu
                setShowMoveMenu(true);
              }
            }}
            style={{
              background: selectedMove 
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {selectedMove ? `✕ Cancel: ${selectedMove.name}` : '⚔️ FIGHT'}
          </button>
        )}
        {/* BAG button - only show when not in menus */}
        {!showMoveMenu && !showTargetMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowBagModal(true);
            }}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🎒 BAG
          </button>
        )}
        {/* VAULT button - only show when not in menus */}
        {!showMoveMenu && !showTargetMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowVaultModal(true);
            }}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🏦 VAULT
          </button>
        )}
        {/* RUN button - ALWAYS visible when onEscape is provided */}
        {onEscape && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              console.log('BattleArena: Run button clicked - exiting immediately');
              handleEscape();
            }}
            style={{
              background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              zIndex: 1001,
              position: 'relative',
              pointerEvents: 'auto'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🏃 RUN
          </button>
        )}
      </div>


      {/* CSS Animations */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
        `}
      </style>

      {/* Modals */}
      <BagModal 
        isOpen={showBagModal} 
        onClose={() => setShowBagModal(false)}
        onArtifactUsed={onArtifactUsed}
      />
      <VaultModal isOpen={showVaultModal} onClose={() => setShowVaultModal(false)} />
    </div>
  );
};

export default BattleArena;
