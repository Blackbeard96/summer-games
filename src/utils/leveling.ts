// Returns the player's level based on XP. Level 1 starts at 0 XP, Level 2 at 100 XP, each next level requires 1.25x more XP than the previous.
export function getLevelFromXP(xp: number): number {
  let level = 1;
  let required = 100;
  let total = 0;
  while (xp >= total + required) {
    total += required;
    required = required * 1.25;
    level++;
  }
  return level;
} 