/**
 * Unified Skill Resolution System
 * 
 * This is the SINGLE SOURCE OF TRUTH for resolving battle actions across ALL modes.
 * Every battle mode (Arena, Live Events, Island Raid, Journey, etc.) must use this
 * function to calculate damage, healing, shield changes, PP costs, and log messages.
 * 
 * This ensures:
 * - Consistent behavior across all battle modes
 * - Skills ALWAYS apply effects correctly
 * - Battle logs are formatted consistently
 * - No duplicate calculation logic
 */

import type { Move } from '../types/battle';
import { getMoveDamage } from './moveOverrides';
import { calculateDamageRange, rollDamage, calculateShieldBoostRange, calculateHealingRange } from './damageCalculator';
import { getEffectiveMasteryLevel, getManifestDamageBoost, getArtifactDamageMultiplier, getElementalRingLevel } from './artifactUtils';
import {
  applyPpEconomyToPPGain,
  getOutgoingDamageMultiplierFromCostReductionPerk,
  getOutgoingDamageMultiplierFromDamageBoostPerk,
  getOutgoingDamageMultiplierFromElementalBoostPerk,
  getOutgoingDamageMultiplierFromManifestBoostPerk,
} from './artifactPerkEffects';
import type { UniversalLawBoonEffects } from './universalLawBoons';

export interface ActorState {
  uid: string;
  name: string;
  level: number;
  hp?: number;
  maxHp?: number;
  shield?: number;
  maxShield?: number;
  powerPoints?: number;
  maxPowerPoints?: number;
  equippedArtifacts?: any;
  effects?: Array<{ type: string; duration: number }>;
}

export interface TargetState {
  uid: string;
  name: string;
  level: number;
  hp?: number;
  maxHp?: number;
  shield?: number;
  maxShield?: number;
  maxShieldStrength?: number; // For vault-based targets
  powerPoints?: number;
  maxPowerPoints?: number;
  effects?: Array<{ type: string; duration: number }>;
  isCPU?: boolean;
  vaultHealth?: number;
  shieldStrength?: number;
  currentPP?: number;
}

export interface BattleContext {
  mode: 'arena' | 'live_event' | 'raid' | 'vault' | 'journey' | 'practice';
  playerLevel: number;
  questionCorrect?: boolean; // For Mindforge mode
  mindforgeMode?: boolean;
  /** Optional admin equippable catalog (enriches perk ids like Artifacts page). */
  equippableCatalogRaw?: Record<string, unknown> | null;
  /** Pre-resolved universal law boons for this actor. */
  universalLawEffects?: UniversalLawBoonEffects | null;
  fieldBonus?: {
    type: string;
    healing?: number;
  };
}

export interface ResolvedSkillAction {
  // Calculated values
  damage: number;
  shieldDamage: number; // Amount absorbed by shield
  healthDamage: number; // Amount that goes to health (after shield)
  healing: number;
  shieldBoost: number;
  ppStolen: number;
  ppCost: number;
  
  // State deltas (what to apply)
  actorDelta: {
    hp?: number;
    shield?: number;
    powerPoints?: number;
  };
  targetDelta: {
    hp?: number;
    shield?: number;
    powerPoints?: number;
  };
  
  // Log messages
  logMessages: string[];
  
  // Metadata
  wasMaxDamage: boolean;
  wasMaxHealing: boolean;
  wasMaxShieldBoost: boolean;
  manifestBoost?: number;
  artifactMultiplier?: number;
}

/**
 * Resolve a skill action - the SINGLE SOURCE OF TRUTH for all battle calculations
 * 
 * This function takes:
 * - Actor state (who is using the skill)
 * - Target state (who is being targeted)
 * - Skill definition (the move/skill being used)
 * - Battle context (mode, level, special rules)
 * 
 * And returns:
 * - All calculated values (damage, healing, shield changes, PP costs)
 * - State deltas (what to apply to actor and target)
 * - Formatted log messages
 * 
 * This ensures ALL battle modes use the same calculation logic.
 */
export async function resolveSkillAction(
  actor: ActorState,
  target: TargetState,
  skill: Move,
  context: BattleContext
): Promise<ResolvedSkillAction> {
  const result: ResolvedSkillAction = {
    damage: 0,
    shieldDamage: 0,
    healthDamage: 0,
    healing: 0,
    shieldBoost: 0,
    ppStolen: 0,
    ppCost: skill.cost || 0,
    actorDelta: {},
    targetDelta: {},
    logMessages: [],
    wasMaxDamage: false,
    wasMaxHealing: false,
    wasMaxShieldBoost: false
  };

  // Get effective mastery level (includes artifact bonuses)
  const effectiveMasteryLevel = getEffectiveMasteryLevel(skill, actor.equippedArtifacts);
  
  // Apply damage multipliers from Mindforge mode
  let playerDamageMultiplier = 1.0;
  let opponentDamageMultiplier = 1.0;
  
  if (context.mindforgeMode) {
    if (!context.questionCorrect) {
      // Wrong answer: Player's moves are less effective (50% damage), opponent's moves are more effective (1.75x damage)
      playerDamageMultiplier = 0.5;
      opponentDamageMultiplier = 1.75;
    } else {
      // Correct answer: Player's moves work normally, opponent's moves are less effective (65% damage)
      playerDamageMultiplier = 1.0;
      opponentDamageMultiplier = 0.65;
    }
  }

  // Calculate damage for offensive moves
  if (skill.damage && skill.damage > 0 && skill.type === 'attack') {
    // Use the move's actual damage property if it exists (from upgrades), otherwise use lookup
    let baseDamage: number;
    if (skill.damage > 0) {
      baseDamage = skill.damage;
    } else {
      const moveDamageValue = await getMoveDamage(skill.name);
      if (typeof moveDamageValue === 'object') {
        baseDamage = moveDamageValue.max;
      } else {
        baseDamage = moveDamageValue;
      }
    }
    
    const damageRange = calculateDamageRange(baseDamage, skill.level, effectiveMasteryLevel);
    const damageResult = rollDamage(damageRange, context.playerLevel, skill.level, effectiveMasteryLevel);
    
    // Apply artifact damage multipliers
    let artifactMultiplier = 1.0;
    const eqArt = actor.equippedArtifacts as Record<string, unknown> | null | undefined;
    const eqCat = context.equippableCatalogRaw ?? null;

    // Manifest: Captain's Helmet (stats) + Manifest Boost perk
    if (skill.category === 'manifest' && actor.equippedArtifacts) {
      const manifestBoost = getManifestDamageBoost(actor.equippedArtifacts);
      if (manifestBoost > 1.0) {
        result.manifestBoost = manifestBoost;
        artifactMultiplier *= manifestBoost;
      }
      const manifestPerkMult = getOutgoingDamageMultiplierFromManifestBoostPerk(
        eqArt,
        eqCat,
        context.universalLawEffects
      );
      if (manifestPerkMult > 1.001) {
        artifactMultiplier *= manifestPerkMult;
      }
    }

    // Elemental: Elemental Ring level + Elemental Boost perk
    if (skill.category === 'elemental' && actor.equippedArtifacts) {
      const ringLevel = getElementalRingLevel(actor.equippedArtifacts);
      const elementalMultiplier = getArtifactDamageMultiplier(ringLevel);
      if (elementalMultiplier > 1.0) {
        artifactMultiplier *= elementalMultiplier;
      }
      const elementalPerkMult = getOutgoingDamageMultiplierFromElementalBoostPerk(
        eqArt,
        eqCat,
        context.universalLawEffects
      );
      if (elementalPerkMult > 1.001) {
        artifactMultiplier *= elementalPerkMult;
      }
    }

    const dmgBoostMult = getOutgoingDamageMultiplierFromDamageBoostPerk(
      eqArt,
      eqCat,
      context.universalLawEffects
    );
    if (dmgBoostMult > 1.001) {
      artifactMultiplier *= dmgBoostMult;
    }

    const costRedMult = getOutgoingDamageMultiplierFromCostReductionPerk(
      eqArt,
      eqCat,
      context.universalLawEffects
    );
    if (costRedMult > 1.001) {
      artifactMultiplier *= costRedMult;
    }
    
    result.artifactMultiplier = artifactMultiplier;
    
    // Apply Mindforge multiplier
    const finalDamage = Math.round(damageResult.damage * artifactMultiplier * playerDamageMultiplier);
    result.damage = finalDamage;
    result.wasMaxDamage = damageResult.isMaxDamage;
    
    // Calculate shield absorption
    const targetShield = target.shield || target.shieldStrength || 0;
    const shieldAbsorbed = Math.min(targetShield, finalDamage);
    const remainingDamage = Math.max(0, finalDamage - shieldAbsorbed);
    
    result.shieldDamage = shieldAbsorbed;
    result.healthDamage = remainingDamage;
    
    // Apply to target delta
    result.targetDelta.shield = -shieldAbsorbed;
    result.targetDelta.hp = -remainingDamage;
    
    // Create log message
    const healthLabel = target.isCPU ? 'health' : 'vault health';
    if (shieldAbsorbed > 0 && remainingDamage > 0) {
      result.logMessages.push(`⚔️ ${actor.name} attacked ${target.name} with ${skill.name} for ${finalDamage} damage (${shieldAbsorbed} to shields, ${remainingDamage} to ${healthLabel})!`);
    } else if (shieldAbsorbed > 0) {
      result.logMessages.push(`⚔️ ${actor.name} attacked ${target.name} with ${skill.name} for ${shieldAbsorbed} damage to shields!`);
    } else {
      result.logMessages.push(`⚔️ ${actor.name} attacked ${target.name} with ${skill.name} for ${remainingDamage} damage to ${healthLabel}!`);
    }
    
    // Add artifact boost messages
    if (result.manifestBoost && result.manifestBoost > 1.0) {
      result.logMessages.push(`🪖 Captain's Helmet boosts ${skill.name} damage by ${Math.round((result.manifestBoost - 1) * 100)}%!`);
    }
    
    if (skill.category === 'elemental' && actor.equippedArtifacts) {
      const ringLevel = getElementalRingLevel(actor.equippedArtifacts);
      const ringMult = getArtifactDamageMultiplier(ringLevel);
      if (ringMult > 1.0) {
        result.logMessages.push(
          `💍 Elemental Ring (Level ${ringLevel}) boosts ${skill.name} damage by ${Math.round((ringMult - 1) * 100)}%!`
        );
      }
      const ePerk = getOutgoingDamageMultiplierFromElementalBoostPerk(
        eqArt,
        eqCat,
        context.universalLawEffects
      );
      if (ePerk > 1.001) {
        result.logMessages.push(
          `🔥 Elemental Boost increases ${skill.name} damage by ${Math.round((ePerk - 1) * 100)}%!`
        );
      }
    }

    if (skill.category === 'manifest') {
      const mPerk = getOutgoingDamageMultiplierFromManifestBoostPerk(
        eqArt,
        eqCat,
        context.universalLawEffects
      );
      if (mPerk > 1.001) {
        result.logMessages.push(
          `✨ Manifest Boost increases ${skill.name} damage by ${Math.round((mPerk - 1) * 100)}%!`
        );
      }
    }
    
    if (context.mindforgeMode && !context.questionCorrect) {
      result.logMessages.push(`❌ ${actor.name} tried to use ${skill.name}, but the answer was wrong! Power reduced by ${Math.round((1 - playerDamageMultiplier) * 100)}%!`);
    }
  }

  // Calculate healing
  if (skill.healing && skill.healing > 0) {
    const healingRange = calculateHealingRange(skill.healing, skill.level, effectiveMasteryLevel);
    const healingResult = rollDamage(healingRange, context.playerLevel, skill.level, effectiveMasteryLevel);
    
    result.healing = healingResult.damage; // Reuse damage calculation for healing
    result.wasMaxHealing = healingResult.isMaxDamage;
    
    // Apply to target delta (healing goes to target, or actor if self-targeting)
    if (target.uid === actor.uid) {
      result.actorDelta.hp = result.healing;
    } else {
      result.targetDelta.hp = result.healing;
    }
    
    const rangeInfo = result.wasMaxHealing ? ' (MAX HEAL!)' : '';
    result.logMessages.push(`💚 ${actor.name} used ${skill.name} to heal for ${result.healing} PP${rangeInfo}!`);
  }

  // Calculate shield boost
  if (skill.shieldBoost && skill.shieldBoost > 0) {
    let shieldBoostRange = calculateShieldBoostRange(skill.shieldBoost, skill.level, effectiveMasteryLevel);
    if (skill.category === 'manifest' && actor.equippedArtifacts) {
      let shieldMult = getManifestDamageBoost(actor.equippedArtifacts);
      shieldMult *= getOutgoingDamageMultiplierFromManifestBoostPerk(
        actor.equippedArtifacts as Record<string, unknown> | null | undefined,
        context.equippableCatalogRaw ?? null,
        context.universalLawEffects
      );
      if (shieldMult > 1.001) {
        shieldBoostRange = {
          min: Math.floor(shieldBoostRange.min * shieldMult),
          max: Math.floor(shieldBoostRange.max * shieldMult),
          average: Math.floor(shieldBoostRange.average * shieldMult),
        };
      }
    }
    const shieldBoostResult = rollDamage(shieldBoostRange, context.playerLevel, skill.level, effectiveMasteryLevel);

    result.shieldBoost = shieldBoostResult.damage; // Reuse damage calculation
    result.wasMaxShieldBoost = shieldBoostResult.isMaxDamage;
    
    // Apply to target delta (or actor if self-targeting)
    if (target.uid === actor.uid) {
      result.actorDelta.shield = result.shieldBoost;
    } else {
      result.targetDelta.shield = result.shieldBoost;
    }
    
    const rangeInfo = result.wasMaxShieldBoost ? ' (MAX BOOST!)' : '';
    result.logMessages.push(`🛡️ ${actor.name} used ${skill.name} to boost shields by ${result.shieldBoost}${rangeInfo}!`);
  }

  // Calculate PP steal (for vault hack moves)
  if (skill.debuffType === 'vault_hack' && target.powerPoints !== undefined) {
    // PP steal is calculated in the move service, but we can include it here for consistency
    // This is typically a percentage of target's PP
    const stealPercentage = 0.1; // 10% default
    const baseStolen = Math.floor((target.powerPoints || 0) * stealPercentage);
    const gainedWithEconomy = applyPpEconomyToPPGain(
      baseStolen,
      actor.equippedArtifacts as Record<string, unknown> | null | undefined,
      context.equippableCatalogRaw ?? null,
      context.universalLawEffects
    );
    result.ppStolen = gainedWithEconomy;

    if (baseStolen > 0) {
      result.targetDelta.powerPoints = -baseStolen;
      result.actorDelta.powerPoints = gainedWithEconomy;
      const bonus = gainedWithEconomy - baseStolen;
      result.logMessages.push(
        bonus > 0
          ? `💰 ${actor.name} stole ${baseStolen} PP from ${target.name} (+${bonus} from PP Economy = ${gainedWithEconomy} received)!`
          : `💰 ${actor.name} stole ${baseStolen} PP from ${target.name}!`
      );
    }
  }

  // Apply PP cost
  if (result.ppCost > 0) {
    result.actorDelta.powerPoints = (result.actorDelta.powerPoints || 0) - result.ppCost;
  }

  // Handle special RR Candy moves
  if (skill.id === 'rr-candy-on-off-shields-on') {
    // Shield ON - Restore 50% of max shields
    const maxShields = target.maxShield || target.maxShieldStrength || 100;
    const shieldRestoreAmount = Math.floor(maxShields * 0.5);
    result.shieldBoost = shieldRestoreAmount;
    result.targetDelta.shield = shieldRestoreAmount;
    // Replace any existing log messages with the RR Candy message
    result.logMessages = [`🔋 ${actor.name} used ${skill.name} to restore ${shieldRestoreAmount} shields (50% of max)!`];
  } else if (skill.id === 'rr-candy-on-off-shields-off') {
    // Shield OFF - Remove 25% of max shields
    const maxShields = target.maxShield || target.maxShieldStrength || 100;
    const shieldRemoveAmount = Math.floor(maxShields * 0.25);
    result.shieldDamage = shieldRemoveAmount;
    result.targetDelta.shield = -shieldRemoveAmount;
    // Replace any existing log messages with the RR Candy message
    result.logMessages = [`🛡️ ${actor.name} used ${skill.name} to remove ${shieldRemoveAmount} shields from ${target.name} (25% of max shields: ${maxShields})!`];
  }

  // If no log message was created, create a default one
  if (result.logMessages.length === 0) {
    result.logMessages.push(`⚔️ ${actor.name} used ${skill.name} on ${target.name}!`);
  }

  return result;
}

/**
 * Format a battle log entry consistently across all modes
 */
export function formatBattleLogEntry(
  type: 'action' | 'system' | 'status' | 'reward',
  message: string,
  actorUid?: string,
  targetUid?: string,
  skillId?: string,
  actionId?: string
): {
  text: string;
  type: string;
  actorUid?: string;
  targetUid?: string;
  skillId?: string;
  actionId?: string;
  createdAt: Date;
} {
  return {
    text: message,
    type,
    actorUid,
    targetUid,
    skillId,
    actionId,
    createdAt: new Date()
  };
}

