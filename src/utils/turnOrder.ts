// Turn Order System for Multiplayer Battles
// Hybrid Approach: Priority*100 + Speed + Random(0-5)

import { Move } from '../types/battle';

export interface TurnOrderParticipant {
  id: string;
  name: string;
  speed: number;
  selectedMove: Move | null;
  isPlayer: boolean;
}

export interface TurnOrderResult {
  participantId: string;
  participantName: string;
  orderScore: number;
  priority: number;
  speed: number;
  random: number;
}

/**
 * Calculate turn order for all participants in a multiplayer battle
 * Formula: Final Order Score = Priority*100 + Speed + Random(0–5)
 * 
 * @param participants Array of participants with their selected moves
 * @returns Array of participants sorted by turn order (highest score goes first)
 */
export function calculateTurnOrder(
  participants: TurnOrderParticipant[]
): TurnOrderResult[] {
  const results: TurnOrderResult[] = participants.map(participant => {
    // Get move priority - use explicit priority if set, otherwise calculate from move properties
    let movePriority = 0;
    if (participant.selectedMove) {
      if (participant.selectedMove.priority !== undefined) {
        movePriority = participant.selectedMove.priority;
      } else {
        // Use getMovePriority to calculate priority from move properties
        movePriority = getMovePriority(participant.selectedMove);
      }
    }
    
    // Get participant speed (default 50 if not specified)
    const speed = participant.speed || 50;
    
    // Generate random seed (0-5)
    const random = Math.floor(Math.random() * 6); // 0-5 inclusive
    
    // Calculate final order score
    // Priority is multiplied by 100 to make it the dominant factor
    const orderScore = (movePriority * 100) + speed + random;
    
    return {
      participantId: participant.id,
      participantName: participant.name,
      orderScore,
      priority: movePriority,
      speed,
      random
    };
  });
  
  // Sort by order score (highest first)
  results.sort((a, b) => b.orderScore - a.orderScore);
  
  return results;
}

/**
 * Get priority for a move based on its name and type
 * This can be used as a fallback if move.priority is not set
 */
export function getMovePriority(move: Move): number {
  // If move has explicit priority, use it
  if (move.priority !== undefined) {
    return move.priority;
  }
  
  // Default priorities based on move type
  const typePriorities: Record<string, number> = {
    'attack': 0,
    'defense': 0,
    'utility': 0,
    'support': 0,
    'control': -1, // Control moves are slower
    'mobility': 1, // Mobility moves are faster
    'stealth': 1, // Stealth moves are faster
    'reveal': 0,
    'cleanse': 0
  };
  
  // Special move priorities
  const specialMovePriorities: Record<string, number> = {
    'Awakened Nature Surge': 2, // Terra's awakened move
    'Nature Surge': 1,
    // Heavy earth moves (can be identified by elemental affinity and type)
  };
  
  // Check for special move names first
  if (specialMovePriorities[move.name]) {
    return specialMovePriorities[move.name];
  }
  
  // Check for heavy earth moves (earth elemental, attack type)
  if (move.elementalAffinity === 'earth' && move.type === 'attack') {
    // Heavy earth moves are slower
    return -1;
  }
  
  // Return type-based priority
  return typePriorities[move.type] || 0;
}

/**
 * Get default speed for a participant
 */
export function getDefaultSpeed(speed: number | undefined, level: number, isPlayer: boolean): number {
  if (speed !== undefined) {
    return speed;
  }
  
  // Default speeds based on level
  if (!isPlayer) {
    // CPU opponents: speed based on level
    return 40 + (level * 2);
  }
  
  // Player default speed
  return 50;
}

