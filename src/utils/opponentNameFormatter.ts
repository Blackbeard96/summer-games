/**
 * Formats opponent names to show base name with instance number separated by "|"
 * Example: "Unpowered Zombie 1" -> "Unpowered Zombie | 1"
 *          "Unpowered Zombie 2" -> "Unpowered Zombie | 2"
 *          "Unpowered Zombie" -> "Unpowered Zombie" (no number if none present)
 */
export function formatOpponentName(name: string): string {
  if (!name) return name;
  
  // Match trailing number pattern: "Name 1", "Name 2", etc.
  const match = name.match(/^(.+?)\s+(\d+)$/);
  
  if (match) {
    const baseName = match[1].trim();
    const number = match[2];
    return `${baseName} | ${number}`;
  }
  
  // No trailing number, return as-is
  return name;
}

/**
 * Extracts the base name from an opponent name (removes trailing numbers)
 * Example: "Unpowered Zombie 1" -> "Unpowered Zombie"
 *          "Unpowered Zombie" -> "Unpowered Zombie"
 */
export function getBaseOpponentName(name: string): string {
  if (!name) return name;
  
  // Remove trailing numbers
  return name.replace(/\s+\d+$/, '').trim();
}








