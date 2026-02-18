import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface LiveFeedPrivacySettings {
  shareVaultAttacks: boolean; // When player attacks someone's vault
  shareVaultDefense: boolean; // When player's vault is attacked
  shareBattleWins: boolean; // When player wins a battle
  shareRaidCompletions: boolean; // When player completes an Island Raid
  sharePvPWins: boolean; // When player wins a PvP battle
  shareChapterCompletions: boolean; // When player completes a chapter
  updatedAt?: any;
}

const DEFAULT_SETTINGS: LiveFeedPrivacySettings = {
  shareVaultAttacks: true,
  shareVaultDefense: true,
  shareBattleWins: true,
  shareRaidCompletions: true,
  sharePvPWins: true,
  shareChapterCompletions: true
};

/**
 * Get user's Live Feed privacy settings
 */
export async function getLiveFeedPrivacySettings(userId: string): Promise<LiveFeedPrivacySettings> {
  try {
    const settingsRef = doc(db, 'students', userId, 'settings', 'liveFeedPrivacy');
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      return {
        ...DEFAULT_SETTINGS,
        ...data,
        // Ensure all boolean fields are present
        shareVaultAttacks: data.shareVaultAttacks !== undefined ? data.shareVaultAttacks : DEFAULT_SETTINGS.shareVaultAttacks,
        shareVaultDefense: data.shareVaultDefense !== undefined ? data.shareVaultDefense : DEFAULT_SETTINGS.shareVaultDefense,
        shareBattleWins: data.shareBattleWins !== undefined ? data.shareBattleWins : DEFAULT_SETTINGS.shareBattleWins,
        shareRaidCompletions: data.shareRaidCompletions !== undefined ? data.shareRaidCompletions : DEFAULT_SETTINGS.shareRaidCompletions,
        sharePvPWins: data.sharePvPWins !== undefined ? data.sharePvPWins : DEFAULT_SETTINGS.sharePvPWins,
        shareChapterCompletions: data.shareChapterCompletions !== undefined ? data.shareChapterCompletions : DEFAULT_SETTINGS.shareChapterCompletions
      };
    }
    
    // Return defaults if no settings exist
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error fetching Live Feed privacy settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update user's Live Feed privacy settings
 */
export async function updateLiveFeedPrivacySettings(
  userId: string,
  settings: Partial<LiveFeedPrivacySettings>
): Promise<void> {
  try {
    const settingsRef = doc(db, 'students', userId, 'settings', 'liveFeedPrivacy');
    const currentSettings = await getLiveFeedPrivacySettings(userId);
    
    const updatedSettings: LiveFeedPrivacySettings = {
      ...currentSettings,
      ...settings,
      updatedAt: serverTimestamp()
    };
    
    await setDoc(settingsRef, updatedSettings, { merge: true });
  } catch (error) {
    console.error('Error updating Live Feed privacy settings:', error);
    throw error;
  }
}

/**
 * Check if a specific event type should be shared based on user's privacy settings
 */
export async function shouldShareEvent(
  userId: string,
  eventType: 'vault_attack' | 'vault_defense' | 'battle_win' | 'raid_complete' | 'pvp_win' | 'chapter_complete'
): Promise<boolean> {
  const settings = await getLiveFeedPrivacySettings(userId);
  
  switch (eventType) {
    case 'vault_attack':
      return settings.shareVaultAttacks;
    case 'vault_defense':
      return settings.shareVaultDefense;
    case 'battle_win':
      return settings.shareBattleWins;
    case 'raid_complete':
      return settings.shareRaidCompletions;
    case 'pvp_win':
      return settings.sharePvPWins;
    case 'chapter_complete':
      return settings.shareChapterCompletions;
    default:
      return false;
  }
}


