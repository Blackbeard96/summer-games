// Battle Engine for MST Battle System
import { 
  Move, 
  ActionCard, 
  BattleParticipant, 
  MoveResult, 
  Buff, 
  Debuff,
  Vault,
  BATTLE_CONSTANTS,
  MOVE_DAMAGE_VALUES
} from '../types/battle';

export interface BattleCalculation {
  damage: number;
  healing: number;
  shieldDamage: number;
  ppStolen: number;
  buffsApplied: Buff[];
  debuffsApplied: Debuff[];
  success: boolean;
  message: string;
}

export class BattleEngine {
  // Calculate move effectiveness based on mastery level
  static calculateMovePower(move: Move): number {
    // Use the move's actual damage if it exists (from upgrades with boost), otherwise calculate from base
    const basePower = move.damage || move.healing || move.shieldBoost || 0;
    // If damage already includes boost from upgrades, don't apply mastery multiplier again
    // Otherwise, apply mastery multiplier
    if (move.damage && move.damage > 0) {
      // Damage already includes boost, just use it directly
      return basePower;
    }
    // For moves without upgraded damage, apply mastery multiplier
    const masteryMultiplier = 1 + (move.masteryLevel - 1) * 0.2; // 20% increase per mastery level
    return Math.floor(basePower * masteryMultiplier);
  }

  // Calculate damage with elemental affinity bonuses
  static calculateDamage(attacker: BattleParticipant, defender: BattleParticipant, move: Move): number {
    const baseDamage = this.calculateMovePower(move);
    
    // Elemental affinity bonuses
    let elementalBonus = 1.0;
    if (attacker.elementalAffinity === defender.elementalAffinity) {
      elementalBonus = 1.2; // Same element bonus
    } else if (this.isElementalAdvantage(attacker.elementalAffinity, defender.elementalAffinity)) {
      elementalBonus = 1.5; // Super effective
    } else if (this.isElementalDisadvantage(attacker.elementalAffinity, defender.elementalAffinity)) {
      elementalBonus = 0.7; // Not very effective
    }

    // Apply buffs/debuffs
    const damageBuffs = attacker.buffs.filter(buff => buff.type === 'damage_boost');
    const damageBoost = damageBuffs.reduce((total, buff) => total + buff.strength, 0);
    
    const vulnerabilityDebuffs = defender.debuffs.filter(debuff => debuff.type === 'vulnerability');
    const vulnerabilityBoost = vulnerabilityDebuffs.reduce((total, debuff) => total + debuff.strength, 0);

    const finalDamage = Math.floor(baseDamage * elementalBonus * (1 + damageBoost / 100) * (1 + vulnerabilityBoost / 100));
    
    return Math.max(1, finalDamage); // Minimum 1 damage
  }

  // Calculate vault attack success and PP stolen
  static calculateVaultAttack(attacker: BattleParticipant, defender: BattleParticipant, move: Move): { success: boolean; ppStolen: number; message: string } {
    const defenderVault = defender.vault;
    
    // Generator doesn't block attacks (removed firewall functionality)

    // Calculate PP that can be stolen
    const maxPPToSteal = Math.min(defenderVault.currentPP, move.debuffStrength || 10);
    const actualPPStolen = Math.floor(maxPPToSteal * (0.5 + Math.random() * 0.5)); // 50-100% of max

    return {
      success: true,
      ppStolen: actualPPStolen,
      message: `Stole ${actualPPStolen} PP from ${defender.displayName}'s vault!`
    };
  }

  // Calculate shield damage
  static calculateShieldDamage(attacker: BattleParticipant, defender: BattleParticipant, move: Move): number {
    const baseDamage = this.calculateMovePower(move);
    
    // Shield break debuffs increase shield damage
    const shieldBreakDebuffs = defender.debuffs.filter(debuff => debuff.type === 'shield_break');
    const shieldBreakBonus = shieldBreakDebuffs.reduce((total, debuff) => total + debuff.strength, 0);

    const finalDamage = Math.floor(baseDamage * (1 + shieldBreakBonus / 100));
    return Math.max(1, finalDamage);
  }

  // Calculate healing
  static calculateHealing(healer: BattleParticipant, move: Move): number {
    const baseHealing = this.calculateMovePower(move);
    
    // Healing buffs
    const healingBuffs = healer.buffs.filter(buff => buff.type === 'pp_regen');
    const healingBonus = healingBuffs.reduce((total, buff) => total + buff.strength, 0);

    const finalHealing = Math.floor(baseHealing * (1 + healingBonus / 100));
    return Math.max(1, finalHealing);
  }

  // Process a move and return results
  static processMove(
    attacker: BattleParticipant,
    defender: BattleParticipant,
    move: Move,
    actionCard?: ActionCard
  ): BattleCalculation {
    let damage = 0;
    let healing = 0;
    let shieldDamage = 0;
    let ppStolen = 0;
    const buffsApplied: Buff[] = [];
    const debuffsApplied: Debuff[] = [];
    let success = true;
    let message = '';

    // Check if move is on cooldown
    if (move.currentCooldown > 0) {
      return {
        damage: 0,
        healing: 0,
        shieldDamage: 0,
        ppStolen: 0,
        buffsApplied: [],
        debuffsApplied: [],
        success: false,
        message: `${move.name} is on cooldown!`
      };
    }

    // Check energy cost
    if (attacker.energy < move.cost) {
      return {
        damage: 0,
        healing: 0,
        shieldDamage: 0,
        ppStolen: 0,
        buffsApplied: [],
        debuffsApplied: [],
        success: false,
        message: `Not enough energy to use ${move.name}!`
      };
    }

    // Process move based on type
    switch (move.type) {
      case 'attack':
        if (move.debuffType === 'vault_hack') {
          const vaultResult = this.calculateVaultAttack(attacker, defender, move);
          success = vaultResult.success;
          ppStolen = vaultResult.ppStolen;
          message = vaultResult.message;
        } else {
          damage = this.calculateDamage(attacker, defender, move);
          
          // Apply damage to shields first, then PP
          const moveDamageValues = MOVE_DAMAGE_VALUES[move.name];
          if (moveDamageValues && moveDamageValues.damage > 0) {
            const totalDamage = moveDamageValues.damage;
            const shieldDamage = Math.min(totalDamage, defender.vault.shieldStrength);
            const remainingDamage = totalDamage - shieldDamage;
            
            if (remainingDamage > 0) {
              ppStolen = Math.min(remainingDamage, defender.vault.currentPP);
              message = `${attacker.displayName} used ${move.name} for ${totalDamage} damage (${shieldDamage} to shields, ${ppStolen} to PP)!`;
            } else {
              message = `${attacker.displayName} used ${move.name} for ${shieldDamage} damage to shields!`;
            }
          } else {
            message = `${attacker.displayName} used ${move.name} for ${damage} damage!`;
          }
        }
        break;

      case 'defense':
        if (move.shieldBoost) {
          const shieldBoost = this.calculateMovePower(move);
          buffsApplied.push({
            id: `shield_boost_${Date.now()}`,
            type: 'shield_boost',
            strength: shieldBoost,
            duration: move.duration || 3,
            remainingTurns: move.duration || 3,
            source: move.name
          });
          message = `${attacker.displayName} boosted shields by ${shieldBoost}!`;
        } else if (move.healing) {
          healing = this.calculateHealing(attacker, move);
          message = `${attacker.displayName} healed for ${healing}!`;
        }
        break;

      case 'support':
        if (move.shieldBoost) {
          const shieldBoost = this.calculateMovePower(move);
          buffsApplied.push({
            id: `shield_boost_${Date.now()}`,
            type: 'shield_boost',
            strength: shieldBoost,
            duration: move.duration || 3,
            remainingTurns: move.duration || 3,
            source: move.name
          });
          message = `${attacker.displayName} boosted shields by ${shieldBoost}!`;
        } else if (move.healing) {
          healing = this.calculateHealing(attacker, move);
          message = `${attacker.displayName} healed for ${healing}!`;
        } else if (move.buffType) {
          const buffStrength = this.calculateMovePower(move);
          buffsApplied.push({
            id: `${move.buffType}_${Date.now()}`,
            type: move.buffType,
            strength: buffStrength,
            duration: move.duration || 2,
            remainingTurns: move.duration || 2,
            source: move.name
          });
          message = `${attacker.displayName} applied ${move.buffType} buff!`;
        }
        break;

      case 'control':
        if (move.debuffType) {
          const debuffStrength = move.debuffStrength || 0;
          debuffsApplied.push({
            id: `${move.debuffType}_${Date.now()}`,
            type: move.debuffType,
            strength: debuffStrength,
            duration: move.duration || 1,
            remainingTurns: move.duration || 1,
            source: move.name
          });
          message = `${attacker.displayName} applied ${move.debuffType} debuff!`;
        }
        break;

      case 'mobility':
        if (move.buffType) {
          const buffStrength = this.calculateMovePower(move);
          buffsApplied.push({
            id: `${move.buffType}_${Date.now()}`,
            type: move.buffType,
            strength: buffStrength,
            duration: move.duration || 1,
            remainingTurns: move.duration || 1,
            source: move.name
          });
          message = `${attacker.displayName} gained ${move.buffType} buff!`;
        }
        break;

      case 'stealth':
        if (move.buffType) {
          const buffStrength = this.calculateMovePower(move);
          buffsApplied.push({
            id: `${move.buffType}_${Date.now()}`,
            type: move.buffType,
            strength: buffStrength,
            duration: move.duration || 1,
            remainingTurns: move.duration || 1,
            source: move.name
          });
          message = `${attacker.displayName} entered stealth mode!`;
        }
        break;

      case 'reveal':
        if (move.buffType) {
          const buffStrength = this.calculateMovePower(move);
          buffsApplied.push({
            id: `${move.buffType}_${Date.now()}`,
            type: move.buffType,
            strength: buffStrength,
            duration: move.duration || 1,
            remainingTurns: move.duration || 1,
            source: move.name
          });
          message = `${attacker.displayName} revealed hidden information!`;
        }
        break;

      case 'cleanse':
        if (move.healing) {
          healing = this.calculateHealing(attacker, move);
          message = `${attacker.displayName} cleansed and healed for ${healing}!`;
        } else {
          message = `${attacker.displayName} cleansed debuffs!`;
        }
        break;

      case 'utility':
        // Utility moves are typically passive or informational
        message = `${attacker.displayName} used ${move.name}!`;
        break;

      default:
        message = `${attacker.displayName} used ${move.name}!`;
    }

    // Apply action card effects if present
    if (actionCard && actionCard.uses > 0) {
      const cardEffect = this.processActionCard(actionCard, attacker, defender);
      damage += cardEffect.damage || 0;
      healing += cardEffect.healing || 0;
      shieldDamage += cardEffect.shieldDamage || 0;
      ppStolen += cardEffect.ppStolen || 0;
      buffsApplied.push(...(cardEffect.buffsApplied || []));
      debuffsApplied.push(...(cardEffect.debuffsApplied || []));
      message += ` + ${actionCard.name} effect!`;
    }

    return {
      damage,
      healing,
      shieldDamage,
      ppStolen,
      buffsApplied,
      debuffsApplied,
      success,
      message
    };
  }

  // Process action card effects
  static processActionCard(card: ActionCard, user: BattleParticipant, target?: BattleParticipant): BattleCalculation {
    let damage = 0;
    let healing = 0;
    let shieldDamage = 0;
    let ppStolen = 0;
    const buffsApplied: Buff[] = [];
    const debuffsApplied: Debuff[] = [];

    switch (card.effect.type) {
      case 'shield_breach':
        if (target) {
          shieldDamage = card.effect.strength;
          debuffsApplied.push({
            id: `shield_break_${Date.now()}`,
            type: 'shield_break',
            strength: 20,
            duration: card.effect.duration || 2,
            remainingTurns: card.effect.duration || 2,
            source: card.name
          });
        }
        break;

      case 'pp_restore':
        healing = card.effect.strength;
        break;

      case 'teleport_pp':
        if (target) {
          ppStolen = Math.min(target.vault.currentPP, card.effect.strength);
        }
        break;

      case 'double_xp':
        // This will be handled in the battle resolution
        break;

      case 'move_disrupt':
        if (target) {
          debuffsApplied.push({
            id: `move_lock_${Date.now()}`,
            type: 'move_lock',
            strength: 0,
            duration: card.effect.duration || 1,
            remainingTurns: card.effect.duration || 1,
            source: card.name
          });
        }
        break;

      case 'freeze':
        if (target) {
          damage = card.effect.strength; // 20 damage
          // Apply freeze status effect with chance
          const freezeChance = card.effect.chance || 85;
          if (Math.random() * 100 < freezeChance) {
            debuffsApplied.push({
              id: `freeze_${Date.now()}`,
              type: 'freeze',
              strength: 0,
              duration: card.effect.duration || 1,
              remainingTurns: card.effect.duration || 1,
              source: card.name
            });
          }
        }
        break;
    }

    return {
      damage,
      healing,
      shieldDamage,
      ppStolen,
      buffsApplied,
      debuffsApplied,
      success: true,
      message: `${card.name} effect applied!`
    };
  }

  // Apply battle results to participants
  static applyBattleResults(
    attacker: BattleParticipant,
    defender: BattleParticipant,
    results: BattleCalculation
  ): { updatedAttacker: BattleParticipant; updatedDefender: BattleParticipant } {
    const updatedAttacker = { ...attacker };
    const updatedDefender = { ...defender };

    // Apply damage to defender
    if (results.damage > 0) {
      updatedDefender.health = Math.max(0, updatedDefender.health - results.damage);
    }

    // Apply healing to attacker
    if (results.healing > 0) {
      updatedAttacker.health = Math.min(updatedAttacker.maxHealth, updatedAttacker.health + results.healing);
    }

    // Apply shield damage
    if (results.shieldDamage > 0) {
      updatedDefender.vault.shieldStrength = Math.max(0, updatedDefender.vault.shieldStrength - results.shieldDamage);
    }

    // Apply PP stolen
    if (results.ppStolen > 0) {
      updatedDefender.vault.currentPP = Math.max(0, updatedDefender.vault.currentPP - results.ppStolen);
      updatedAttacker.vault.currentPP = Math.min(
        updatedAttacker.vault.capacity,
        updatedAttacker.vault.currentPP + results.ppStolen
      );
    }

    // Apply buffs to attacker
    updatedAttacker.buffs.push(...results.buffsApplied);

    // Apply debuffs to defender
    updatedDefender.debuffs.push(...results.debuffsApplied);

    // Consume energy
    const move = updatedAttacker.moves.find(m => m.id === 'current_move_id'); // This would need to be passed in
    if (move) {
      updatedAttacker.energy = Math.max(0, updatedAttacker.energy - move.cost);
    }

    return { updatedAttacker, updatedDefender };
  }

  // Update buff/debuff durations
  static updateBuffsAndDebuffs(participant: BattleParticipant): BattleParticipant {
    const updated = { ...participant };

    // Update buffs
    updated.buffs = updated.buffs
      .map(buff => ({ ...buff, remainingTurns: buff.remainingTurns - 1 }))
      .filter(buff => buff.remainingTurns > 0);

    // Update debuffs
    updated.debuffs = updated.debuffs
      .map(debuff => ({ ...debuff, remainingTurns: debuff.remainingTurns - 1 }))
      .filter(debuff => debuff.remainingTurns > 0);

    // Regenerate energy
    updated.energy = Math.min(updated.maxEnergy, updated.energy + BATTLE_CONSTANTS.ENERGY_REGEN_PER_TURN);

    return updated;
  }

  // Check if battle is over
  static isBattleOver(participants: BattleParticipant[]): { isOver: boolean; winner?: string } {
    const aliveParticipants = participants.filter(p => p.health > 0);
    
    if (aliveParticipants.length <= 1) {
      return {
        isOver: true,
        winner: aliveParticipants[0]?.userId
      };
    }

    return { isOver: false };
  }

  // Elemental advantage system
  private static isElementalAdvantage(attackerElement: string, defenderElement: string): boolean {
    const advantages: { [key: string]: string[] } = {
      'fire': ['earth', 'air'],
      'water': ['fire', 'earth'],
      'earth': ['air', 'water'],
      'air': ['fire', 'water']
    };

    return advantages[attackerElement]?.includes(defenderElement) || false;
  }

  private static isElementalDisadvantage(attackerElement: string, defenderElement: string): boolean {
    return this.isElementalAdvantage(defenderElement, attackerElement);
  }
} 