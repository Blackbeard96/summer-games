/**
 * Session statistics types for In-Session Mode
 * Tracks player performance during a session
 */

export interface SessionStats {
  // Player identification
  playerId: string;
  playerName: string;
  
  // PP tracking
  startingPP: number;
  endingPP: number;
  netPPGained: number; // endingPP - startingPP
  ppSpent: number; // Total PP spent on skills/actions
  ppEarned: number; // PP earned from participation/eliminations
  
  // Participation tracking
  participationEarned: number; // Total participation points earned
  movesEarned: number; // Moves earned from participation
  
  // Combat stats
  eliminations: number; // Number of players eliminated by this player
  eliminatedBy?: string; // ID of player who eliminated this player (if eliminated)
  isEliminated: boolean; // Whether this player was eliminated
  damageDealt: number; // Total damage dealt to other players
  damageTaken: number; // Total damage taken from other players
  healingGiven: number; // Total healing given (if applicable)
  healingReceived: number; // Total healing received (if applicable)
  
  // Skill usage
  skillsUsed: Array<{
    skillId: string;
    skillName: string;
    count: number; // How many times this skill was used
    totalDamage?: number; // Total damage dealt with this skill
    totalHealing?: number; // Total healing with this skill
  }>;
  totalSkillsUsed: number; // Total number of skill activations
  
  // Session metadata
  sessionId: string;
  sessionStartTime: any; // Firestore Timestamp
  sessionEndTime: any; // Firestore Timestamp
  sessionDuration: number; // Duration in seconds
  
  // Optional: MVP badges
  badges?: Array<{
    type: 'most_pp' | 'most_eliminations' | 'most_participation' | 'most_damage' | 'survivor';
    label: string;
  }>;
}

/** Quiz awards snapshot (stored when a quiz completes, shown in Live Event summary). */
export interface QuizAwardsPlacement {
  place: string;   // e.g. "1st", "2nd", "Top 5"
  pp: number;
  xp: number;
  artifactName?: string;
}

export interface QuizAwardsSnapshot {
  quizTitle?: string;
  placements: QuizAwardsPlacement[];
}

export interface SessionSummary {
  sessionId: string;
  classId: string;
  className: string;
  startedAt: any; // Firestore Timestamp
  endedAt: any; // Firestore Timestamp
  duration: number; // Duration in seconds
  totalPlayers: number;
  stats: { [playerId: string]: SessionStats };
  mvpPlayerId?: string; // Player with most eliminations or most PP
  /** Quiz rewards by placement (if a quiz was run during the event). */
  quizAwardsSnapshot?: QuizAwardsSnapshot;
}



