import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ARTIFACT_PERK_OPTIONS, getArtifactPerkLimit } from '../constants/artifactPerks';
import { getPowerLevelBonusForRarity, normalizeArtifactRarity, type ArtifactRarity } from '../constants/artifactRarity';

interface ArtifactsAdminProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MarketplaceArtifact {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  image: string;
  category: 'time' | 'protection' | 'food' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  originalPrice?: number;
  discount?: number;
}

interface EquippableArtifactSkill {
  id: string;
  name: string;
  description: string;
  type?: 'attack' | 'defense' | 'utility' | 'support' | 'control';
  cost?: number;
  cooldown?: number;
  targetType?: 'self' | 'single' | 'team' | 'enemy' | 'enemy_team' | 'all';
}

interface EquippableArtifact {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'ring1' | 'ring2' | 'ring3' | 'ring4' | 'legs' | 'shoes' | 'jacket' | 'weapon';
  rarity?: ArtifactRarity;
  powerLevelBonus?: number;
  stats?: {
    [key: string]: number;
  };
  perks?: string[];
  artifactSkill?: EquippableArtifactSkill | null;
  level?: number;
  image?: string;
  description?: string;
}

const ArtifactsAdmin: React.FC<ArtifactsAdminProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'equippable'>('marketplace');
  const [marketplaceArtifacts, setMarketplaceArtifacts] = useState<{ [key: string]: MarketplaceArtifact }>({});
  const [equippableArtifacts, setEquippableArtifacts] = useState<{ [key: string]: EquippableArtifact }>({});
  const [editingArtifact, setEditingArtifact] = useState<string | null>(null);
  const [newArtifact, setNewArtifact] = useState<Partial<MarketplaceArtifact | EquippableArtifact>>({});
  const [loading, setLoading] = useState(false);
  const [perkPickerValue, setPerkPickerValue] = useState<string>('');
  const [imageUploading, setImageUploading] = useState(false);
  const marketplaceImageInputRef = useRef<HTMLInputElement>(null);
  const equippableImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadArtifacts();
    }
  }, [isOpen]);

  const loadArtifacts = async () => {
    setLoading(true);
    try {
      // Load marketplace artifacts
      const marketplaceRef = doc(db, 'adminSettings', 'marketplaceArtifacts');
      const marketplaceDoc = await getDoc(marketplaceRef);
      if (marketplaceDoc.exists()) {
        const data = marketplaceDoc.data();
        // Remove metadata fields
        const { lastUpdated, updatedBy, ...artifacts } = data;
        setMarketplaceArtifacts(artifacts);
      }

      // Load equippable artifacts
      const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
      const equippableDoc = await getDoc(equippableRef);
      if (equippableDoc.exists()) {
        const data = equippableDoc.data();
        // Remove metadata fields
        const { lastUpdated, updatedBy, ...artifacts } = data;
        setEquippableArtifacts(Object.fromEntries(Object.entries(artifacts).map(([key, artifact]: any) => {
          const rarity = normalizeArtifactRarity(artifact?.rarity);
          return [key, {
            ...artifact,
            rarity,
            powerLevelBonus: typeof artifact?.powerLevelBonus === 'number' ? artifact.powerLevelBonus : getPowerLevelBonusForRarity(rarity),
            perks: Array.isArray(artifact?.perks) ? artifact.perks : [],
          }];
        })));
      }
    } catch (error) {
      console.error('Error loading artifacts:', error);
      alert('❌ Failed to load artifacts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleArtifactImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (e.g. PNG, JPEG, WebP).');
      return;
    }
    setImageUploading(true);
    try {
      const path = `artifacts/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setNewArtifact((prev) => ({ ...prev, image: downloadUrl }));
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('❌ Image upload failed. You can still paste an Image URL.');
    } finally {
      setImageUploading(false);
    }
  };

  const saveMarketplaceArtifacts = async () => {
    setLoading(true);
    try {
      const marketplaceRef = doc(db, 'adminSettings', 'marketplaceArtifacts');
      await setDoc(marketplaceRef, {
        ...marketplaceArtifacts,
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin'
      });
      alert('✅ Marketplace artifacts saved successfully!');
      await loadArtifacts();
    } catch (error) {
      console.error('Error saving marketplace artifacts:', error);
      alert('❌ Failed to save artifacts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveEquippableArtifacts = async () => {
    setLoading(true);
    try {
      const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
      await setDoc(equippableRef, {
        ...equippableArtifacts,
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin'
      });
      alert('✅ Equippable artifacts saved successfully!');
      await loadArtifacts();
    } catch (error) {
      console.error('Error saving equippable artifacts:', error);
      alert('❌ Failed to save artifacts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMarketplaceArtifact = () => {
    if (!newArtifact.id || !newArtifact.name) {
      alert('❌ Please provide at least an ID and name for the artifact.');
      return;
    }

    const artifact: MarketplaceArtifact = {
      id: newArtifact.id as string,
      name: newArtifact.name as string,
      description: (newArtifact as MarketplaceArtifact).description || '',
      price: (newArtifact as MarketplaceArtifact).price || 0,
      icon: (newArtifact as MarketplaceArtifact).icon || '📦',
      image: (newArtifact as MarketplaceArtifact).image || '',
      category: (newArtifact as MarketplaceArtifact).category || 'special',
      rarity: (newArtifact as MarketplaceArtifact).rarity || 'common',
      originalPrice: (newArtifact as MarketplaceArtifact).originalPrice,
      discount: (newArtifact as MarketplaceArtifact).discount
    };

    setMarketplaceArtifacts(prev => ({
      ...prev,
      [artifact.id]: artifact
    }));

    setNewArtifact({});
    setPerkPickerValue('');
    setEditingArtifact(null);
  };

  const handleAddEquippableArtifact = () => {
    if (!newArtifact.id || !newArtifact.name) {
      alert('❌ Please provide at least an ID and name for the artifact.');
      return;
    }

    const rarity = normalizeArtifactRarity((newArtifact as EquippableArtifact).rarity);
    const perkLimit = getArtifactPerkLimit(rarity);
    const perks = ((newArtifact as EquippableArtifact).perks || []).slice(0, perkLimit);

    const artifact: EquippableArtifact = {
      id: newArtifact.id as string,
      name: newArtifact.name as string,
      slot: (newArtifact as EquippableArtifact).slot || 'ring1',
      rarity,
      powerLevelBonus: getPowerLevelBonusForRarity(rarity),
      stats: (newArtifact as EquippableArtifact).stats || {},
      perks,
      artifactSkill: rarity === 'legendary'
        ? (newArtifact as EquippableArtifact).artifactSkill || null
        : null,
      level: (newArtifact as EquippableArtifact).level || 1,
      image: (newArtifact as EquippableArtifact).image || '',
      description: (newArtifact as EquippableArtifact).description || ''
    };

    setEquippableArtifacts(prev => ({
      ...prev,
      [artifact.id]: artifact
    }));

    setNewArtifact({});
    setPerkPickerValue('');
    setEditingArtifact(null);
  };

  const handleEditMarketplaceArtifact = (artifactId: string) => {
    const artifact = marketplaceArtifacts[artifactId];
    if (artifact) {
      setNewArtifact(artifact);
      setPerkPickerValue('');
      setEditingArtifact(artifactId);
    }
  };

  const handleEditEquippableArtifact = (artifactId: string) => {
    const artifact = equippableArtifacts[artifactId];
    if (artifact) {
      setNewArtifact(artifact);
      setPerkPickerValue('');
      setEditingArtifact(artifactId);
    }
  };

  const handleUpdateMarketplaceArtifact = () => {
    if (!editingArtifact || !newArtifact.id || !newArtifact.name) {
      alert('❌ Please provide at least an ID and name for the artifact.');
      return;
    }

    const artifact: MarketplaceArtifact = {
      id: newArtifact.id as string,
      name: newArtifact.name as string,
      description: (newArtifact as MarketplaceArtifact).description || '',
      price: (newArtifact as MarketplaceArtifact).price || 0,
      icon: (newArtifact as MarketplaceArtifact).icon || '📦',
      image: (newArtifact as MarketplaceArtifact).image || '',
      category: (newArtifact as MarketplaceArtifact).category || 'special',
      rarity: (newArtifact as MarketplaceArtifact).rarity || 'common',
      originalPrice: (newArtifact as MarketplaceArtifact).originalPrice,
      discount: (newArtifact as MarketplaceArtifact).discount
    };

    setMarketplaceArtifacts(prev => ({
      ...prev,
      [editingArtifact]: artifact
    }));

    setNewArtifact({});
    setPerkPickerValue('');
    setEditingArtifact(null);
  };

  const handleUpdateEquippableArtifact = () => {
    if (!editingArtifact || !newArtifact.id || !newArtifact.name) {
      alert('❌ Please provide at least an ID and name for the artifact.');
      return;
    }

    const rarity = normalizeArtifactRarity((newArtifact as EquippableArtifact).rarity);
    const perkLimit = getArtifactPerkLimit(rarity);
    const perks = ((newArtifact as EquippableArtifact).perks || []).slice(0, perkLimit);

    const artifact: EquippableArtifact = {
      id: newArtifact.id as string,
      name: newArtifact.name as string,
      slot: (newArtifact as EquippableArtifact).slot || 'ring1',
      rarity,
      powerLevelBonus: getPowerLevelBonusForRarity(rarity),
      stats: (newArtifact as EquippableArtifact).stats || {},
      perks,
      artifactSkill: rarity === 'legendary'
        ? (newArtifact as EquippableArtifact).artifactSkill || null
        : null,
      level: (newArtifact as EquippableArtifact).level || 1,
      image: (newArtifact as EquippableArtifact).image || '',
      description: (newArtifact as EquippableArtifact).description || ''
    };

    setEquippableArtifacts(prev => ({
      ...prev,
      [editingArtifact]: artifact
    }));

    setNewArtifact({});
    setPerkPickerValue('');
    setEditingArtifact(null);
  };

  const handleDeleteMarketplaceArtifact = async (artifactId: string) => {
    if (!window.confirm(`Are you sure you want to delete "${marketplaceArtifacts[artifactId]?.name}"?`)) {
      return;
    }

    const updated = { ...marketplaceArtifacts };
    delete updated[artifactId];
    setMarketplaceArtifacts(updated);
  };

  const handleDeleteEquippableArtifact = async (artifactId: string) => {
    if (!window.confirm(`Are you sure you want to delete "${equippableArtifacts[artifactId]?.name}"?`)) {
      return;
    }

    const updated = { ...equippableArtifacts };
    delete updated[artifactId];
    setEquippableArtifacts(updated);
  };

  const handleCancelEdit = () => {
    setNewArtifact({});
    setPerkPickerValue('');
    setEditingArtifact(null);
    setPerkPickerValue('');
  };

  const draftArtifactRarity = normalizeArtifactRarity((newArtifact as EquippableArtifact).rarity);
  const draftPerkLimit = getArtifactPerkLimit(draftArtifactRarity);
  const draftPerks = ((newArtifact as EquippableArtifact).perks || []).slice(0, draftPerkLimit);
  const draftArtifactSkill = (newArtifact as EquippableArtifact).artifactSkill || null;

  const addDraftPerk = () => {
    if (!perkPickerValue) return;
    if (draftPerks.includes(perkPickerValue)) return;
    if (draftPerks.length >= draftPerkLimit) {
      alert(`This rarity allows only ${draftPerkLimit} perk${draftPerkLimit === 1 ? '' : 's'}.`);
      return;
    }
    setNewArtifact({ ...newArtifact, perks: [...draftPerks, perkPickerValue] });
    setPerkPickerValue('');
  };

  const removeDraftPerk = (perkId: string) => {
    setNewArtifact({ ...newArtifact, perks: draftPerks.filter((perk) => perk !== perkId) });
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: '#1f2937',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '1200px',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '100%',
        color: '#fff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Artifacts Admin</h2>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #374151' }}>
          <button
            onClick={() => setActiveTab('marketplace')}
            style={{
              background: activeTab === 'marketplace' ? '#3b82f6' : 'transparent',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              borderBottom: activeTab === 'marketplace' ? '3px solid #60a5fa' : 'none'
            }}
          >
            Marketplace Artifacts
          </button>
          <button
            onClick={() => setActiveTab('equippable')}
            style={{
              background: activeTab === 'equippable' ? '#3b82f6' : 'transparent',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              borderBottom: activeTab === 'equippable' ? '3px solid #60a5fa' : 'none'
            }}
          >
            Equippable Artifacts
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ color: '#60a5fa' }}>Loading artifacts...</div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Marketplace Artifacts</h3>
            
            {/* Add/Edit Form */}
            <div style={{
              background: '#374151',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              marginBottom: '2rem'
            }}>
              <h4 style={{ marginBottom: '1rem' }}>
                {editingArtifact ? 'Edit Artifact' : 'Add New Artifact'}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>ID *</label>
                  <input
                    type="text"
                    value={(newArtifact as MarketplaceArtifact).id || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, id: e.target.value })}
                    placeholder="e.g., shield"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Name *</label>
                  <input
                    type="text"
                    value={(newArtifact as MarketplaceArtifact).name || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, name: e.target.value })}
                    placeholder="e.g., Shield"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Description</label>
                  <input
                    type="text"
                    value={(newArtifact as MarketplaceArtifact).description || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, description: e.target.value })}
                    placeholder="Artifact description"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Price (PP)</label>
                  <input
                    type="number"
                    value={(newArtifact as MarketplaceArtifact).price || 0}
                    onChange={(e) => setNewArtifact((prev) => ({ ...(prev as any), price: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Icon (Emoji)</label>
                  <input
                    type="text"
                    value={(newArtifact as MarketplaceArtifact).icon || ''}
                    onChange={(e) => setNewArtifact((prev) => ({ ...(prev as any), icon: e.target.value }))}
                    placeholder="🛡️"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Image URL</label>
                  <input
                    type="text"
                    value={(newArtifact as MarketplaceArtifact).image || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, image: e.target.value })}
                    placeholder="/images/artifact.png"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                  <input
                    ref={marketplaceImageInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleArtifactImageUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => marketplaceImageInputRef.current?.click()}
                    disabled={imageUploading}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.875rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#374151',
                      color: 'white',
                      cursor: imageUploading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {imageUploading ? 'Uploading…' : '📤 Upload image'}
                  </button>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Category</label>
                  <select
                    value={(newArtifact as MarketplaceArtifact).category || 'special'}
                    onChange={(e) => setNewArtifact((prev) => ({ ...(prev as any), category: e.target.value as any }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  >
                    <option value="time">Time</option>
                    <option value="protection">Protection</option>
                    <option value="food">Food</option>
                    <option value="special">Special</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Rarity</label>
                  <select
                    value={(newArtifact as MarketplaceArtifact).rarity || 'common'}
                    onChange={(e) => setNewArtifact({ ...newArtifact, rarity: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  >
                    <option value="common">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Original Price (Optional)</label>
                  <input
                    type="number"
                    value={(newArtifact as MarketplaceArtifact).originalPrice || ''}
                    onChange={(e) => setNewArtifact((prev) => ({ ...(prev as any), originalPrice: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="For discount display"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Discount % (Optional)</label>
                  <input
                    type="number"
                    value={(newArtifact as MarketplaceArtifact).discount || ''}
                    onChange={(e) => setNewArtifact((prev) => ({ ...(prev as any), discount: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="Discount percentage"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                {editingArtifact ? (
                  <>
                    <button
                      onClick={handleUpdateMarketplaceArtifact}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Update Artifact
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAddMarketplaceArtifact}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Add Artifact
                  </button>
                )}
              </div>
            </div>

            {/* Artifacts List */}
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ marginBottom: '1rem' }}>Existing Artifacts ({Object.keys(marketplaceArtifacts).length})</h4>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {Object.values(marketplaceArtifacts).map((artifact) => (
                  <div
                    key={artifact.id}
                    style={{
                      background: '#374151',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.125rem' }}>
                        {artifact.icon} {artifact.name}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        {artifact.description}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        Price: {artifact.price} PP | Category: {artifact.category} | Rarity: {artifact.rarity}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleEditMarketplaceArtifact(artifact.id)}
                        style={{
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          padding: '0.5rem 1rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMarketplaceArtifact(artifact.id)}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          padding: '0.5rem 1rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={saveMarketplaceArtifacts}
              disabled={loading}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                width: '100%'
              }}
            >
              {loading ? 'Saving...' : '💾 Save All Marketplace Artifacts'}
            </button>
          </div>
        )}

        {activeTab === 'equippable' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Equippable Artifacts</h3>
            
            {/* Add/Edit Form */}
            <div style={{
              background: '#374151',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              marginBottom: '2rem'
            }}>
              <h4 style={{ marginBottom: '1rem' }}>
                {editingArtifact ? 'Edit Artifact' : 'Add New Artifact'}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>ID *</label>
                  <input
                    type="text"
                    value={(newArtifact as EquippableArtifact).id || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, id: e.target.value })}
                    placeholder="e.g., elemental-ring-level-1"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Name *</label>
                  <input
                    type="text"
                    value={(newArtifact as EquippableArtifact).name || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, name: e.target.value })}
                    placeholder="e.g., Elemental Ring: Fire (Level 1)"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Slot</label>
                  <select
                    value={(newArtifact as EquippableArtifact).slot || 'ring1'}
                    onChange={(e) => setNewArtifact({ ...newArtifact, slot: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  >
                    <option value="head">Head</option>
                    <option value="chest">Chest</option>
                    <option value="ring1">Ring 1</option>
                    <option value="ring2">Ring 2</option>
                    <option value="ring3">Ring 3</option>
                    <option value="ring4">Ring 4</option>
                    <option value="legs">Legs</option>
                    <option value="shoes">Shoes</option>
                    <option value="jacket">Jacket</option>
                    <option value="weapon">Weapon</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Level</label>
                  <input
                    type="number"
                    value={(newArtifact as EquippableArtifact).level || 1}
                    onChange={(e) => setNewArtifact({ ...newArtifact, level: parseInt(e.target.value) || 1 })}
                    placeholder="1"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Image URL</label>
                  <input
                    type="text"
                    value={(newArtifact as EquippableArtifact).image || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, image: e.target.value })}
                    placeholder="/images/artifact.png"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                  <input
                    ref={equippableImageInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleArtifactImageUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => equippableImageInputRef.current?.click()}
                    disabled={imageUploading}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.875rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#374151',
                      color: 'white',
                      cursor: imageUploading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {imageUploading ? 'Uploading…' : '📤 Upload image'}
                  </button>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Description</label>
                  <input
                    type="text"
                    value={(newArtifact as EquippableArtifact).description || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, description: e.target.value })}
                    placeholder="Artifact description"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Rarity</label>
                  <select
                    value={draftArtifactRarity}
                    onChange={(e) => {
                      const rarity = normalizeArtifactRarity(e.target.value);
                      const cappedPerks = draftPerks.slice(0, getArtifactPerkLimit(rarity));
                      setNewArtifact({
                        ...newArtifact,
                        rarity,
                        perks: cappedPerks,
                        artifactSkill: rarity === 'legendary' ? draftArtifactSkill : null,
                        powerLevelBonus: getPowerLevelBonusForRarity(rarity)
                      });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white'
                    }}
                  >
                    <option value="common">Common</option>
                    <option value="uncommon">Uncommon</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    Stats (JSON format: {'{'} "statName": value {'}'})
                  </label>
                  <textarea
                    value={JSON.stringify((newArtifact as EquippableArtifact).stats || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const stats = JSON.parse(e.target.value);
                        setNewArtifact({ ...newArtifact, stats });
                      } catch (err) {
                        // Invalid JSON, but allow typing
                      }
                    }}
                    placeholder='{"hp": 10, "pp": 5}'
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white',
                      fontFamily: 'monospace',
                      minHeight: '100px'
                    }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Perks ({draftPerks.length}/{draftPerkLimit})</label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <select
                      value={perkPickerValue}
                      onChange={(e) => setPerkPickerValue(e.target.value)}
                      style={{
                        flex: '1 1 280px',
                        padding: '0.5rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #4b5563',
                        background: '#1f2937',
                        color: 'white'
                      }}
                    >
                      <option value="">Select a perk...</option>
                      {ARTIFACT_PERK_OPTIONS.map((perk) => (
                        <option key={perk.id} value={perk.label}>
                          {perk.label} - {perk.description}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addDraftPerk}
                      disabled={!perkPickerValue || draftPerks.length >= draftPerkLimit}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '0.25rem',
                        border: 'none',
                        background: !perkPickerValue || draftPerks.length >= draftPerkLimit ? '#6b7280' : '#3b82f6',
                        color: 'white',
                        cursor: !perkPickerValue || draftPerks.length >= draftPerkLimit ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Add Perk
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {draftPerks.map((perk) => (
                      <div key={perk} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '999px',
                        background: '#111827',
                        border: '1px solid #4b5563',
                        color: 'white',
                        fontSize: '0.8rem'
                      }}>
                        <span>{perk}</span>
                        <button
                          type="button"
                          onClick={() => removeDraftPerk(perk)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fca5a5',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                    Common: 1 perk · Uncommon: 2 perks · Rare: 2 perks · Epic: 3 perks · Legendary: 3 perks + a new skill
                  </p>
                </div>
                {draftArtifactRarity === 'legendary' && (
                  <div style={{ gridColumn: '1 / -1', background: '#111827', border: '1px solid #f59e0b', borderRadius: '0.75rem', padding: '1rem' }}>
                    <h5 style={{ margin: '0 0 0.75rem 0', color: '#fbbf24' }}>Legendary New Skill</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      <input
                        type="text"
                        value={draftArtifactSkill?.name || ''}
                        onChange={(e) => setNewArtifact({
                          ...newArtifact,
                          artifactSkill: {
                            id: draftArtifactSkill?.id || `${newArtifact.id || 'artifact'}-skill`,
                            name: e.target.value,
                            description: draftArtifactSkill?.description || '',
                            type: draftArtifactSkill?.type || 'utility',
                            cost: draftArtifactSkill?.cost || 0,
                            cooldown: draftArtifactSkill?.cooldown || 0,
                            targetType: draftArtifactSkill?.targetType || 'self'
                          }
                        })}
                        placeholder="Skill name"
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                      />
                      <input
                        type="text"
                        value={draftArtifactSkill?.description || ''}
                        onChange={(e) => setNewArtifact({
                          ...newArtifact,
                          artifactSkill: {
                            id: draftArtifactSkill?.id || `${newArtifact.id || 'artifact'}-skill`,
                            name: draftArtifactSkill?.name || '',
                            description: e.target.value,
                            type: draftArtifactSkill?.type || 'utility',
                            cost: draftArtifactSkill?.cost || 0,
                            cooldown: draftArtifactSkill?.cooldown || 0,
                            targetType: draftArtifactSkill?.targetType || 'self'
                          }
                        })}
                        placeholder="Skill description"
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                      />
                      <select
                        value={draftArtifactSkill?.type || 'utility'}
                        onChange={(e) => setNewArtifact({
                          ...newArtifact,
                          artifactSkill: {
                            id: draftArtifactSkill?.id || `${newArtifact.id || 'artifact'}-skill`,
                            name: draftArtifactSkill?.name || '',
                            description: draftArtifactSkill?.description || '',
                            type: e.target.value as any,
                            cost: draftArtifactSkill?.cost || 0,
                            cooldown: draftArtifactSkill?.cooldown || 0,
                            targetType: draftArtifactSkill?.targetType || 'self'
                          }
                        })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                      >
                        <option value="attack">Attack</option>
                        <option value="defense">Defense</option>
                        <option value="utility">Utility</option>
                        <option value="support">Support</option>
                        <option value="control">Control</option>
                      </select>
                      <input
                        type="number"
                        value={draftArtifactSkill?.cooldown || 0}
                        onChange={(e) => setNewArtifact({
                          ...newArtifact,
                          artifactSkill: {
                            id: draftArtifactSkill?.id || `${newArtifact.id || 'artifact'}-skill`,
                            name: draftArtifactSkill?.name || '',
                            description: draftArtifactSkill?.description || '',
                            type: draftArtifactSkill?.type || 'utility',
                            cost: draftArtifactSkill?.cost || 0,
                            cooldown: parseInt(e.target.value) || 0,
                            targetType: draftArtifactSkill?.targetType || 'self'
                          }
                        })}
                        placeholder="Cooldown"
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                {editingArtifact ? (
                  <>
                    <button
                      onClick={handleUpdateEquippableArtifact}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Update Artifact
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAddEquippableArtifact}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Add Artifact
                  </button>
                )}
              </div>
            </div>

            {/* Artifacts List */}
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ marginBottom: '1rem' }}>Existing Artifacts ({Object.keys(equippableArtifacts).length})</h4>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {Object.values(equippableArtifacts).map((artifact) => (
                  <div
                    key={artifact.id}
                    style={{
                      background: '#374151',
                      padding: '1rem',
                      borderRadius: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.125rem' }}>{artifact.name}</div>
                        <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          Slot: {artifact.slot} | Level: {artifact.level || 1}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#60a5fa', marginTop: '0.25rem', fontWeight: 600 }}>
                          {String(artifact.rarity || 'common').charAt(0).toUpperCase() + String(artifact.rarity || 'common').slice(1)} · +{artifact.powerLevelBonus ?? getPowerLevelBonusForRarity(artifact.rarity || 'common')} Power Level
                        </div>
                        {artifact.description && (
                          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            {artifact.description}
                          </div>
                        )}
                        {artifact.stats && Object.keys(artifact.stats).length > 0 && (
                          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            Stats: {JSON.stringify(artifact.stats)}
                          </div>
                        )}
                        {artifact.perks && artifact.perks.length > 0 && (
                          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            Perks: {artifact.perks.join(', ')}
                          </div>
                        )}
                        {artifact.rarity === 'legendary' && artifact.artifactSkill?.name && (
                          <div style={{ fontSize: '0.875rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: 600 }}>
                            New Skill: {artifact.artifactSkill.name}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleEditEquippableArtifact(artifact.id)}
                          style={{
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEquippableArtifact(artifact.id)}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={saveEquippableArtifacts}
              disabled={loading}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                width: '100%'
              }}
            >
              {loading ? 'Saving...' : '💾 Save All Equippable Artifacts'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsAdmin;

