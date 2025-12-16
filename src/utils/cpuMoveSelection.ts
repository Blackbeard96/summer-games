// Intelligent CPU Move Selection for Multiplayer Battles
// Optimizes move selection to gain advantage in battle

import { Move } from '../types/battle';

export interface BattleSituation {
  cpuHealth: number;
  cpuMaxHealth: number;
  cpuShield: number;
  cpuMaxShield: number;
  cpuLevel: number;
  targetHealth: number;
  targetMaxHealth: number;
  targetShield: number;
  targetMaxShield: number;
  targetLevel: number;
  availableMoves: Array<{
    name: string;
    type: string;
    baseDamage?: number;
    damageRange?: { min: number; max: number };
    healingRange?: { min: number; max: number };
    shieldBoost?: number;
    ppSteal?: number;
    statusEffects?: Array<{ type: string; duration: number }>;
    priority?: number;
    level: number;
    masteryLevel: number;
  }>;
  cpuEffects?: Array<{ type: string; duration: number }>;
  targetEffects?: Array<{ type: string; duration: number }>;
}

export interface SelectedMove {
  move: {
    name: string;
    type: string;
    baseDamage?: number;
    damageRange?: { min: number; max: number };
    healingRange?: { min: number; max: number };
    shieldBoost?: number;
    ppSteal?: number;
    statusEffects?: Array<{ type: string; duration: number }>;
    priority?: number;
    level: number;
    masteryLevel: number;
  };
  targetId: string;
  reason: string; // For debugging/logging
}

/**
 * Intelligently select the best move for a CPU opponent based on battle situation
 */
export function selectOptimalCPUMove(
  situation: BattleSituation,
  targetId: string
): SelectedMove | null {
  if (!situation.availableMoves || situation.availableMoves.length === 0) {
    return null;
  }

  const {
    cpuHealth,
    cpuMaxHealth,
    cpuShield,
    cpuMaxShield,
    targetHealth,
    targetMaxHealth,
    targetShield,
    targetMaxShield,
    availableMoves
  } = situation;

  // Calculate health percentages
  const cpuHealthPercent = (cpuHealth / cpuMaxHealth) * 100;
  const cpuShieldPercent = (cpuShield / cpuMaxShield) * 100;
  const targetHealthPercent = (targetHealth / targetMaxHealth) * 100;
  const targetShieldPercent = (targetShield / targetMaxShield) * 100;

  // Strategic priorities (higher score = better choice)
  const moveScores = availableMoves.map(move => {
    let score = 0;
    let reason = '';

    // CRITICAL: CPU is very low on health (< 25%) - prioritize healing/defense
    if (cpuHealthPercent < 25) {
      if (move.type === 'heal' || move.healingRange) {
        const avgHealing = move.healingRange 
          ? (move.healingRange.min + move.healingRange.max) / 2
          : 0;
        score += 100 + (avgHealing * 2); // Heavily favor healing
        reason = `Critical health - need healing (${avgHealing} HP)`;
      } else if (move.type === 'defense' || move.shieldBoost) {
        score += 80 + (move.shieldBoost || 0);
        reason = 'Critical health - need defense';
      } else if (move.type === 'attack') {
        score -= 50; // Avoid attacking when critically low
        reason = 'Too low on health to attack';
      }
    }
    // LOW: CPU is low on health (25-50%) - consider healing/defense
    else if (cpuHealthPercent < 50) {
      if (move.type === 'heal' || move.healingRange) {
        const avgHealing = move.healingRange 
          ? (move.healingRange.min + move.healingRange.max) / 2
          : 0;
        score += 60 + (avgHealing * 1.5);
        reason = `Low health - healing beneficial (${avgHealing} HP)`;
      } else if (move.type === 'defense' || move.shieldBoost) {
        score += 40 + (move.shieldBoost || 0) * 0.5;
        reason = 'Low health - defense helpful';
      }
    }

    // CRITICAL: CPU has no shields - prioritize shield boost
    if (cpuShieldPercent < 20 && (move.type === 'defense' || move.shieldBoost)) {
      score += 70 + (move.shieldBoost || 0) * 2;
      reason = reason || `No shields - need shield boost (${move.shieldBoost || 0})`;
    }
    // LOW: CPU has low shields (20-50%) - consider shield boost
    else if (cpuShieldPercent < 50 && (move.type === 'defense' || move.shieldBoost)) {
      score += 30 + (move.shieldBoost || 0);
      reason = reason || `Low shields - shield boost helpful (${move.shieldBoost || 0})`;
    }

    // OPPORTUNITY: Target is very low on health (< 30%) - prioritize finishing move
    if (targetHealthPercent < 30 && move.type === 'attack') {
      const avgDamage = move.damageRange
        ? (move.damageRange.min + move.damageRange.max) / 2
        : (move.baseDamage || 0);
      score += 90 + (avgDamage * 1.5); // Heavily favor high damage
      reason = reason || `Target low health - finish them (${avgDamage} damage)`;
    }
    // OPPORTUNITY: Target has no shields - prioritize high damage attacks
    else if (targetShieldPercent < 20 && move.type === 'attack') {
      const avgDamage = move.damageRange
        ? (move.damageRange.min + move.damageRange.max) / 2
        : (move.baseDamage || 0);
      score += 50 + (avgDamage * 1.2);
      reason = reason || `Target no shields - high damage attack (${avgDamage} damage)`;
    }
    // STANDARD: Target has shields - prioritize shield-breaking or high damage
    else if (targetShieldPercent > 50 && move.type === 'attack') {
      const avgDamage = move.damageRange
        ? (move.damageRange.min + move.damageRange.max) / 2
        : (move.baseDamage || 0);
      // Prefer moves that can break shields or have high damage
      if (avgDamage > targetShield) {
        score += 40 + (avgDamage * 0.8);
        reason = reason || `Target has shields - high damage to break (${avgDamage} damage)`;
      } else {
        score += 20 + (avgDamage * 0.5);
        reason = reason || `Target has shields - moderate damage (${avgDamage} damage)`;
      }
    }

    // STATUS EFFECTS: Prefer moves that apply beneficial status effects
    if (move.statusEffects && move.statusEffects.length > 0) {
      const beneficialEffects = move.statusEffects.filter(effect => 
        ['drain', 'cleanse'].includes(effect.type)
      );
      if (beneficialEffects.length > 0) {
        score += 30;
        reason = reason || `Applies beneficial effects: ${beneficialEffects.map(e => e.type).join(', ')}`;
      }
      
      // Prefer moves that apply negative effects to target
      const negativeEffects = move.statusEffects.filter(effect =>
        ['burn', 'poison', 'stun', 'bleed', 'confuse'].includes(effect.type)
      );
      if (negativeEffects.length > 0) {
        score += 25;
        reason = reason || `Applies negative effects: ${negativeEffects.map(e => e.type).join(', ')}`;
      }
    }

    // PP STEAL: Prefer moves that steal PP when target has high PP
    if (move.ppSteal && move.ppSteal > 0) {
      score += 20 + (move.ppSteal * 0.5);
      reason = reason || `Steals PP (${move.ppSteal})`;
    }

    // TURN ORDER PRIORITY: Prefer moves with higher priority for turn advantage
    if (move.priority && move.priority > 0) {
      score += move.priority * 15; // Higher priority = better turn order
      reason = reason || `High priority move (+${move.priority})`;
    } else if (move.priority && move.priority < 0) {
      score -= Math.abs(move.priority) * 5; // Lower priority = worse turn order
      reason = reason || `Low priority move (${move.priority})`;
    }

    // BASE SCORE: All attack moves get base score
    if (move.type === 'attack') {
      const avgDamage = move.damageRange
        ? (move.damageRange.min + move.damageRange.max) / 2
        : (move.baseDamage || 0);
      score += 10 + (avgDamage * 0.3); // Base attack score
      reason = reason || `Standard attack (${avgDamage} damage)`;
    }

    // AVOID: Don't use low-damage attacks when target is healthy
    if (move.type === 'attack' && targetHealthPercent > 70) {
      const avgDamage = move.damageRange
        ? (move.damageRange.min + move.damageRange.max) / 2
        : (move.baseDamage || 0);
      if (avgDamage < 10) {
        score -= 20; // Penalize weak attacks against healthy targets
        reason = reason || `Weak attack against healthy target`;
      }
    }

    return { move, score, reason };
  });

  // Sort by score (highest first)
  moveScores.sort((a, b) => b.score - a.score);

  // Select the best move
  const bestMove = moveScores[0];
  if (!bestMove || bestMove.score < 0) {
    // Fallback: just pick the first available move
    return {
      move: availableMoves[0],
      targetId,
      reason: 'Fallback: first available move'
    };
  }

  return {
    move: bestMove.move,
    targetId,
    reason: bestMove.reason
  };
}

/**
 * Select the best target for a CPU opponent
 * In multiplayer, this should prioritize the weakest enemy
 */
export function selectOptimalCPUTarget(
  allies: Array<{ id: string; currentPP: number; maxPP: number; shieldStrength: number; maxShieldStrength: number }>,
  opponents: Array<{ id: string; currentPP: number; maxPP: number; shieldStrength: number; maxShieldStrength: number }>,
  cpuId: string
): string | null {
  // CPU should target enemies (opponents), not allies
  if (opponents.length === 0) {
    return null;
  }

  // Find the weakest enemy (lowest health percentage)
  const enemyScores = opponents.map(opp => {
    const healthPercent = (opp.currentPP / opp.maxPP) * 100;
    const shieldPercent = (opp.shieldStrength / opp.maxShieldStrength) * 100;
    
    // Prioritize enemies with low health and low shields
    const score = (100 - healthPercent) + (100 - shieldPercent) * 0.5;
    
    return { id: opp.id, score, healthPercent, shieldPercent };
  });

  // Sort by score (lowest health/shield = highest priority)
  enemyScores.sort((a, b) => b.score - a.score);

  return enemyScores[0]?.id || opponents[0]?.id || null;
}








