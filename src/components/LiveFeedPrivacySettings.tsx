import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLiveFeedPrivacySettings, updateLiveFeedPrivacySettings, LiveFeedPrivacySettings as LiveFeedPrivacySettingsType } from '../services/liveFeedPrivacy';

const LiveFeedPrivacySettings: React.FC = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<LiveFeedPrivacySettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const loadSettings = async () => {
      try {
        const userSettings = await getLiveFeedPrivacySettings(currentUser.uid);
        setSettings(userSettings);
      } catch (error) {
        console.error('Error loading privacy settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [currentUser]);

  const handleToggle = async (key: keyof LiveFeedPrivacySettingsType) => {
    if (!currentUser || !settings || saving) return;

    const newValue = !settings[key];
    const updatedSettings = { ...settings, [key]: newValue };

    setSettings(updatedSettings);
    setSaving(true);

    try {
      await updateLiveFeedPrivacySettings(currentUser.uid, { [key]: newValue });
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      // Revert on error
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div style={{
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '8px',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '0.875rem'
      }}>
        Loading privacy settings...
      </div>
    );
  }

  return (
    <div style={{
      padding: '1rem',
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <h3 style={{
        margin: '0 0 1rem 0',
        fontSize: '1rem',
        fontWeight: 'bold',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        🔒 Live Feed Privacy
      </h3>
      
      <p style={{
        margin: '0 0 1rem 0',
        fontSize: '0.75rem',
        color: 'rgba(255, 255, 255, 0.6)'
      }}>
        Choose what appears in the Live Feed
      </p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        <ToggleOption
          label="Vault Attacks"
          description="When you attack someone's vault"
          checked={settings.shareVaultAttacks}
          onChange={() => handleToggle('shareVaultAttacks')}
          disabled={saving}
        />
        
        <ToggleOption
          label="Vault Defense"
          description="When your vault is attacked"
          checked={settings.shareVaultDefense}
          onChange={() => handleToggle('shareVaultDefense')}
          disabled={saving}
        />
        
        <ToggleOption
          label="Battle Wins"
          description="When you win a battle"
          checked={settings.shareBattleWins}
          onChange={() => handleToggle('shareBattleWins')}
          disabled={saving}
        />
        
        <ToggleOption
          label="PvP Wins"
          description="When you win a PvP battle"
          checked={settings.sharePvPWins}
          onChange={() => handleToggle('sharePvPWins')}
          disabled={saving}
        />
        
        <ToggleOption
          label="Raid Completions"
          description="When you complete an Island Raid"
          checked={settings.shareRaidCompletions}
          onChange={() => handleToggle('shareRaidCompletions')}
          disabled={saving}
        />
        
        <ToggleOption
          label="Chapter Completions"
          description="When you complete a chapter"
          checked={settings.shareChapterCompletions}
          onChange={() => handleToggle('shareChapterCompletions')}
          disabled={saving}
        />
      </div>
    </div>
  );
};

interface ToggleOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}

const ToggleOption: React.FC<ToggleOptionProps> = ({ label, description, checked, onChange, disabled }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem',
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '6px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1
    }} onClick={disabled ? undefined : onChange}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: '500',
          color: '#fff',
          marginBottom: '0.25rem'
        }}>
          {label}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.6)'
        }}>
          {description}
        </div>
      </div>
      <div style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        background: checked ? '#10b981' : 'rgba(255, 255, 255, 0.2)',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        marginLeft: '0.75rem'
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: '2px',
          left: checked ? '22px' : '2px',
          transition: 'left 0.2s',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
        }} />
      </div>
    </div>
  );
};

export default LiveFeedPrivacySettings;

