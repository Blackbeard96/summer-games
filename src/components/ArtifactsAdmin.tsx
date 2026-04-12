import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ARTIFACT_PERK_OPTIONS, getArtifactPerkLimit } from '../constants/artifactPerks';
import { getPowerLevelBonusForRarity, normalizeArtifactRarity, type ArtifactRarity } from '../constants/artifactRarity';
import { MARKETPLACE_STORE_ARTIFACTS } from '../data/marketplaceArtifactsCatalog';
import { buildMarketplaceAdminMap } from '../utils/marketplaceStoreMerge';
import { mergeEquippableCatalogLayers } from '../utils/battleSkillsService';
import {
  formatEquippableCatalogSlotLabel,
  normalizeEquippableCatalogSlot,
  type EquippableCatalogSlot,
} from '../utils/equippableArtifactSlot';
import type { ConsumableEffect, LiveEventMktListing, MarketplaceItemType } from '../types/consumableEffects';
import {
  validateConsumableItemRow,
  parseConsumableEffect,
  previewConsumableEffectSentence,
  consumableEffectLabel,
} from '../types/consumableEffects';

/** Firestore rejects `undefined` in document data */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out as T;
}

interface ArtifactsAdminProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MarketplaceArtifact {
  id: string;
  name: string;
  description: string;
  price: number;
  truthMetalPrice?: number;
  icon: string;
  image: string;
  category: 'time' | 'protection' | 'food' | 'special' | 'equippable';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  originalPrice?: number;
  discount?: number;
  disabled?: boolean;
  /** Grants this equippable catalog id on purchase (MST MKT). */
  equippableArtifactId?: string;
  itemType?: MarketplaceItemType;
  consumableEffect?: ConsumableEffect;
  /** Live Event in-session shop (Participation PP). */
  liveEventMkt?: LiveEventMktListing;
}

const ARTIFACT_ELEMENTAL_TYPES = ['fire', 'water', 'air', 'earth', 'lightning', 'light', 'shadow', 'metal'] as const;

/** Show human-readable perk labels (Firestore may store id or legacy label). */
function formatPerksForDisplay(perks: string[]): string {
  return perks
    .map((p) => {
      const opt = ARTIFACT_PERK_OPTIONS.find((o) => o.id === p);
      if (opt) return opt.label;
      const byLabel = ARTIFACT_PERK_OPTIONS.find(
        (o) => o.label === p || o.label.toLowerCase() === p.trim().toLowerCase()
      );
      return byLabel ? byLabel.label : p;
    })
    .join(', ');
}

type ArtifactStatusEffect = {
  type: 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain' | 'cleanse' | 'freeze' | 'reduce' | 'summon' | 'none';
  duration: number;
  intensity?: number;
  damagePerTurn?: number;
  ppLossPerTurn?: number;
  ppStealPerTurn?: number;
  healPerTurn?: number;
  chance?: number;
  successChance?: number;
  damageReduction?: number;
  summonElementalType?: typeof ARTIFACT_ELEMENTAL_TYPES[number];
  summonDamage?: number;
};

interface EquippableArtifactSkill {
  id: string;
  name: string;
  description: string;
  type?: 'attack' | 'defense' | 'utility' | 'support' | 'control';
  cost?: number;
  cooldown?: number;
  targetType?: 'self' | 'single' | 'team' | 'enemy' | 'enemy_team' | 'all';
  damage?: number;
  healing?: number;
  shieldBoost?: number;
  statusEffects?: ArtifactStatusEffect[];
}

interface EquippableArtifact {
  id: string;
  name: string;
  slot: EquippableCatalogSlot;
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
      const mktData = marketplaceDoc.exists() ? marketplaceDoc.data() : {};
      setMarketplaceArtifacts(buildMarketplaceAdminMap(MARKETPLACE_STORE_ARTIFACTS, mktData as Record<string, unknown>));

      // Load equippable artifacts (Firestore overrides built-in defaults, e.g. Captain's Helmet)
      const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
      const equippableDoc = await getDoc(equippableRef);
      const rawEq = equippableDoc.exists() ? (equippableDoc.data() as Record<string, unknown>) : {};
      const mergedEquippable = mergeEquippableCatalogLayers(rawEq);
      setEquippableArtifacts(
        Object.fromEntries(
          Object.entries(mergedEquippable)
            .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
            .map(([key, artifact]: [string, any]) => {
              const rarity = normalizeArtifactRarity(artifact?.rarity);
              return [
                key,
                {
                  ...artifact,
                  id: typeof artifact?.id === 'string' && artifact.id.trim() ? artifact.id.trim() : key,
                  slot: normalizeEquippableCatalogSlot(artifact?.slot),
                  rarity,
                  powerLevelBonus:
                    typeof artifact?.powerLevelBonus === 'number'
                      ? artifact.powerLevelBonus
                      : getPowerLevelBonusForRarity(rarity),
                  perks: Array.isArray(artifact?.perks) ? artifact.perks : [],
                } as EquippableArtifact,
              ];
            })
        )
      );
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
      const payload: Record<string, unknown> = {
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin',
      };
      for (const [key, art] of Object.entries(marketplaceArtifacts)) {
        const row = { ...art } as Record<string, unknown>;
        if (typeof row.price === 'string') {
          row.price = Number(row.price) || 0;
        }
        if (row.truthMetalPrice === undefined || row.truthMetalPrice === null || row.truthMetalPrice === '') {
          delete row.truthMetalPrice;
        }
        if (row.disabled === false || row.disabled === undefined) delete row.disabled;
        if (row.originalPrice === undefined || row.originalPrice === null) delete row.originalPrice;
        if (row.discount === undefined || row.discount === null) delete row.discount;
        payload[key] = stripUndefinedDeep(row);
      }
      await setDoc(marketplaceRef, payload);
      alert('✅ Marketplace artifacts saved successfully!');
      await loadArtifacts();
    } catch (error) {
      console.error('Error saving marketplace artifacts:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`❌ Failed to save artifacts: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const saveEquippableArtifacts = async () => {
    setLoading(true);
    try {
      const equippableRef = doc(db, 'adminSettings', 'equippableArtifacts');
      const cleanedCatalog = stripUndefinedDeep(equippableArtifacts);
      await setDoc(equippableRef, {
        ...cleanedCatalog,
        lastUpdated: serverTimestamp(),
        updatedBy: 'admin',
      });
      alert('✅ Equippable artifacts saved successfully!');
      await loadArtifacts();
    } catch (error) {
      console.error('Error saving equippable artifacts:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`❌ Failed to save artifacts: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMarketplaceArtifact = () => {
    if (!newArtifact.id || !newArtifact.name) {
      alert('❌ Please provide at least an ID and name for the artifact.');
      return;
    }

    const eqPick = (newArtifact as MarketplaceArtifact).equippableArtifactId?.trim() || undefined;
    let itemType = ((newArtifact as MarketplaceArtifact).itemType ||
      (eqPick ? 'equippable_grant' : 'other')) as MarketplaceItemType;

    let consumableEffect: ConsumableEffect | undefined;
    if (itemType === 'consumable') {
      const p = parseConsumableEffect((newArtifact as MarketplaceArtifact).consumableEffect || {});
      if (!p.ok) {
        alert(`Consumable: ${p.error}`);
        return;
      }
      consumableEffect = p.value;
    }

    const leRaw = (newArtifact as MarketplaceArtifact).liveEventMkt;
    let liveEventMkt: LiveEventMktListing | undefined;
    if (leRaw && (leRaw.enabled === true || (leRaw.pricePp ?? 0) > 0)) {
      liveEventMkt = {
        enabled: leRaw.enabled === true,
        pricePp: Math.max(0, Math.floor(Number(leRaw.pricePp) || 0)),
      };
    }

    const rowValid = validateConsumableItemRow({ itemType, consumableEffect, equippableArtifactId: eqPick });
    if (!rowValid.ok) {
      alert(rowValid.error);
      return;
    }

    const artifact: MarketplaceArtifact = {
      id: newArtifact.id as string,
      name: newArtifact.name as string,
      description: (newArtifact as MarketplaceArtifact).description || '',
      price: (newArtifact as MarketplaceArtifact).price || 0,
      truthMetalPrice:
        (newArtifact as MarketplaceArtifact).truthMetalPrice != null &&
        (newArtifact as MarketplaceArtifact).truthMetalPrice! > 0
          ? Math.floor(Number((newArtifact as MarketplaceArtifact).truthMetalPrice) || 0)
          : undefined,
      icon: (newArtifact as MarketplaceArtifact).icon || '📦',
      image: (newArtifact as MarketplaceArtifact).image || '',
      category: (newArtifact as MarketplaceArtifact).category || 'special',
      rarity: (newArtifact as MarketplaceArtifact).rarity || 'common',
      originalPrice: (newArtifact as MarketplaceArtifact).originalPrice,
      discount: (newArtifact as MarketplaceArtifact).discount,
      disabled: (newArtifact as MarketplaceArtifact).disabled === true,
      equippableArtifactId: eqPick,
      itemType,
      consumableEffect: itemType === 'consumable' ? consumableEffect : undefined,
      liveEventMkt,
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
      slot: normalizeEquippableCatalogSlot((newArtifact as EquippableArtifact).slot),
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

    const eqPick = (newArtifact as MarketplaceArtifact).equippableArtifactId?.trim() || undefined;
    let itemType = ((newArtifact as MarketplaceArtifact).itemType ||
      (eqPick ? 'equippable_grant' : 'other')) as MarketplaceItemType;

    let consumableEffect: ConsumableEffect | undefined;
    if (itemType === 'consumable') {
      const p = parseConsumableEffect((newArtifact as MarketplaceArtifact).consumableEffect || {});
      if (!p.ok) {
        alert(`Consumable: ${p.error}`);
        return;
      }
      consumableEffect = p.value;
    }

    const leRaw = (newArtifact as MarketplaceArtifact).liveEventMkt;
    let liveEventMkt: LiveEventMktListing | undefined;
    if (leRaw && (leRaw.enabled === true || (leRaw.pricePp ?? 0) > 0)) {
      liveEventMkt = {
        enabled: leRaw.enabled === true,
        pricePp: Math.max(0, Math.floor(Number(leRaw.pricePp) || 0)),
      };
    }

    const rowValid = validateConsumableItemRow({ itemType, consumableEffect, equippableArtifactId: eqPick });
    if (!rowValid.ok) {
      alert(rowValid.error);
      return;
    }

    const artifact: MarketplaceArtifact = {
      id: newArtifact.id as string,
      name: newArtifact.name as string,
      description: (newArtifact as MarketplaceArtifact).description || '',
      price: (newArtifact as MarketplaceArtifact).price || 0,
      truthMetalPrice:
        (newArtifact as MarketplaceArtifact).truthMetalPrice != null &&
        (newArtifact as MarketplaceArtifact).truthMetalPrice! > 0
          ? Math.floor(Number((newArtifact as MarketplaceArtifact).truthMetalPrice) || 0)
          : undefined,
      icon: (newArtifact as MarketplaceArtifact).icon || '📦',
      image: (newArtifact as MarketplaceArtifact).image || '',
      category: (newArtifact as MarketplaceArtifact).category || 'special',
      rarity: (newArtifact as MarketplaceArtifact).rarity || 'common',
      originalPrice: (newArtifact as MarketplaceArtifact).originalPrice,
      discount: (newArtifact as MarketplaceArtifact).discount,
      disabled: (newArtifact as MarketplaceArtifact).disabled === true,
      equippableArtifactId: eqPick,
      itemType,
      consumableEffect: itemType === 'consumable' ? consumableEffect : undefined,
      liveEventMkt,
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
      slot: normalizeEquippableCatalogSlot((newArtifact as EquippableArtifact).slot),
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

  const SLOT_ICON_FOR_MKT: Record<EquippableArtifact['slot'], string> = {
    head: '👑',
    chest: '🦺',
    ring: '💍',
    legs: '👖',
    shoes: '👟',
    jacket: '🧥',
    weapon: '⚔️',
  };

  function toMarketplaceRarity(r: ArtifactRarity): MarketplaceArtifact['rarity'] {
    if (r === 'uncommon') return 'rare';
    return r;
  }

  /** Draft or update an MST MKT row that grants this equippable, then open the Marketplace tab. */
  const handleAddEquippableToMarketplace = (eq: EquippableArtifact) => {
    const eqId = eq.id;
    const existing = marketplaceArtifacts[eqId];

    if (existing?.equippableArtifactId === eqId) {
      setActiveTab('marketplace');
      setNewArtifact({ ...existing });
      setEditingArtifact(eqId);
      setPerkPickerValue('');
      alert(
        'This equippable already uses listing id "' +
          eqId +
          '" with Grants equippable set. Switched to MST MKT — adjust prices and Save.'
      );
      return;
    }

    const eqRarity = normalizeArtifactRarity(eq.rarity);
    const mkt: MarketplaceArtifact = {
      id: eqId,
      name: existing?.name ?? eq.name,
      description:
        existing?.description?.trim() ||
        (eq.description?.trim() ? eq.description.trim() : `Unlock ${eq.name} for your loadout.`),
      price: existing?.price ?? 0,
      truthMetalPrice: existing?.truthMetalPrice,
      icon: existing?.icon || SLOT_ICON_FOR_MKT[eq.slot] || '⚔️',
      image: existing?.image ?? eq.image ?? '',
      category: 'equippable',
      rarity: existing?.rarity ?? toMarketplaceRarity(eqRarity),
      equippableArtifactId: eqId,
      originalPrice: existing?.originalPrice,
      discount: existing?.discount,
      disabled: existing?.disabled === true,
    };

    setMarketplaceArtifacts((prev) => ({ ...prev, [eqId]: mkt }));
    setActiveTab('marketplace');
    setNewArtifact(mkt);
    setEditingArtifact(eqId);
    setPerkPickerValue('');
    alert(
      'MST MKT listing drafted (listing id = equippable id). Set PP / Truth Metal on the Marketplace tab, then click Save for MST MKT.'
    );
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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Artifacts Admin · MST MKT &amp; Equippable</h2>
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
            MST MKT (Marketplace)
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
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>MST MKT — Store items</h3>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem', lineHeight: 1.5 }}>
              Catalog defaults load from code; your edits save to Firestore and override the live store.
              Add new rows for items that only exist in the database. Use <strong>Save</strong> to persist.
              To sell an equippable ring/armor from the <strong>Equippable</strong> tab, set{' '}
              <strong>Grants equippable</strong> to that artifact&apos;s id — purchase unlocks it on the Artifacts page
              (no consumable inventory entry).
            </p>
            
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
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Description</label>
                  <textarea
                    value={(newArtifact as MarketplaceArtifact).description || ''}
                    onChange={(e) => setNewArtifact({ ...newArtifact, description: e.target.value })}
                    placeholder="Artifact description (shown in MST MKT)"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white',
                      resize: 'vertical',
                      fontFamily: 'inherit'
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Truth Metal (optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={(newArtifact as MarketplaceArtifact).truthMetalPrice ?? ''}
                    onChange={(e) =>
                      setNewArtifact((prev) => ({
                        ...(prev as any),
                        truthMetalPrice: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    placeholder="0 = PP only"
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
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="mkt-disabled"
                    checked={(newArtifact as MarketplaceArtifact).disabled === true}
                    onChange={(e) =>
                      setNewArtifact((prev) => ({ ...(prev as any), disabled: e.target.checked }))
                    }
                  />
                  <label htmlFor="mkt-disabled" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Hidden in MST MKT (disabled — players won&apos;t see this item)
                  </label>
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
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    Grants equippable (optional)
                  </label>
                  <select
                    value={(newArtifact as MarketplaceArtifact).equippableArtifactId || ''}
                    onChange={(e) =>
                      setNewArtifact((prev) => ({
                        ...(prev as any),
                        equippableArtifactId: e.target.value || undefined,
                      }))
                    }
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white',
                    }}
                  >
                    <option value="">— None (consumable / normal store item) —</option>
                    {Object.keys(equippableArtifacts)
                      .sort((a, b) =>
                        (equippableArtifacts[a]?.name || a).localeCompare(
                          equippableArtifacts[b]?.name || b,
                          undefined,
                          { sensitivity: 'base' }
                        )
                      )
                      .map((eqId) => (
                        <option key={eqId} value={eqId}>
                          {eqId} — {equippableArtifacts[eqId]?.name || eqId}
                        </option>
                      ))}
                  </select>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.35rem' }}>
                    Must match an id from the Equippable Artifacts tab. Store listing id can differ (e.g. promo sku).
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Item type
                  </label>
                  <select
                    value={(newArtifact as MarketplaceArtifact).itemType || 'other'}
                    onChange={(e) => {
                      const v = e.target.value as MarketplaceItemType;
                      setNewArtifact((prev) => {
                        const p = prev as MarketplaceArtifact;
                        if (v === 'consumable') {
                          return {
                            ...p,
                            itemType: v,
                            consumableEffect: p.consumableEffect || {
                              effectType: 'restore_health',
                              amount: 25,
                              targetScope: 'self',
                            },
                          };
                        }
                        return { ...p, itemType: v, consumableEffect: undefined };
                      });
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#1f2937',
                      color: 'white',
                    }}
                  >
                    <option value="other">Other / non-consumable</option>
                    <option value="consumable">Consumable (heal / shields / revive — uses effect below)</option>
                    <option value="equippable_grant">Equippable grant (purchase grants gear)</option>
                    <option value="currency">Currency</option>
                    <option value="unlock">Unlock</option>
                  </select>
                </div>
                {(newArtifact as MarketplaceArtifact).itemType === 'consumable' && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      padding: '0.85rem',
                      borderRadius: '0.5rem',
                      background: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#93c5fd', marginBottom: '0.65rem' }}>Consumable effect</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem' }}>Effect type</label>
                        <select
                          value={(newArtifact as MarketplaceArtifact).consumableEffect?.effectType || 'restore_health'}
                          onChange={(e) =>
                            setNewArtifact((prev) => {
                              const p = prev as MarketplaceArtifact;
                              const ce = p.consumableEffect || {
                                effectType: 'restore_health' as const,
                                amount: 25,
                                targetScope: 'self' as const,
                              };
                              return {
                                ...p,
                                consumableEffect: {
                                  ...ce,
                                  effectType: e.target.value as ConsumableEffect['effectType'],
                                  amount:
                                    e.target.value === 'revive_eliminated_self'
                                      ? ce.amount && ce.amount <= 100
                                        ? ce.amount
                                        : 50
                                      : ce.amount,
                                },
                              };
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '0.45rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #4b5563',
                            background: '#111827',
                            color: 'white',
                          }}
                        >
                          <option value="restore_health">{consumableEffectLabel('restore_health')}</option>
                          <option value="restore_shields">{consumableEffectLabel('restore_shields')}</option>
                          <option value="revive_eliminated_self">{consumableEffectLabel('revive_eliminated_self')}</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                          {(newArtifact as MarketplaceArtifact).consumableEffect?.effectType === 'revive_eliminated_self'
                            ? 'Revive HP % (1–100)'
                            : 'Effect amount (positive number)'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={
                            (newArtifact as MarketplaceArtifact).consumableEffect?.effectType ===
                            'revive_eliminated_self'
                              ? 100
                              : undefined
                          }
                          value={(newArtifact as MarketplaceArtifact).consumableEffect?.amount ?? ''}
                          onChange={(e) =>
                            setNewArtifact((prev) => {
                              const p = prev as MarketplaceArtifact;
                              const ce = p.consumableEffect || {
                                effectType: 'restore_health' as const,
                                amount: 25,
                                targetScope: 'self' as const,
                              };
                              return {
                                ...p,
                                consumableEffect: {
                                  ...ce,
                                  amount: Math.max(0, parseInt(e.target.value, 10) || 0),
                                },
                              };
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '0.45rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #4b5563',
                            background: '#111827',
                            color: 'white',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '0.65rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem' }}>Target scope</label>
                      <select
                        value={(newArtifact as MarketplaceArtifact).consumableEffect?.targetScope || 'self'}
                        onChange={(e) =>
                          setNewArtifact((prev) => {
                            const p = prev as MarketplaceArtifact;
                            const ce = p.consumableEffect || {
                              effectType: 'restore_health' as const,
                              amount: 25,
                              targetScope: 'self' as const,
                            };
                            return {
                              ...p,
                              consumableEffect: {
                                ...ce,
                                targetScope: e.target.value as ConsumableEffect['targetScope'],
                              },
                            };
                          })
                        }
                        style={{
                          width: '100%',
                          maxWidth: '280px',
                          padding: '0.45rem',
                          borderRadius: '0.25rem',
                          border: '1px solid #4b5563',
                          background: '#111827',
                          color: 'white',
                        }}
                      >
                        <option value="self">Self</option>
                        <option value="ally">Ally (reserved)</option>
                        <option value="team">Team (reserved)</option>
                      </select>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.35rem' }}>
                        Ally/team scopes are stored for future use; vault & battle bag use self only today.
                      </div>
                    </div>
                    {(() => {
                      const ce = (newArtifact as MarketplaceArtifact).consumableEffect;
                      const p = ce ? parseConsumableEffect(ce) : null;
                      if (p && p.ok) {
                        return (
                          <div style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: '#a5b4fc' }}>
                            Preview: {previewConsumableEffectSentence(p.value)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
                <div
                  style={{
                    gridColumn: '1 / -1',
                    padding: '0.85rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#fcd34d', marginBottom: '0.5rem' }}>Live Event MST MKT</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={(newArtifact as MarketplaceArtifact).liveEventMkt?.enabled === true}
                      onChange={(e) =>
                        setNewArtifact((prev) => {
                          const p = prev as MarketplaceArtifact;
                          const cur = p.liveEventMkt || { enabled: false, pricePp: 0 };
                          return {
                            ...p,
                            liveEventMkt: { ...cur, enabled: e.target.checked },
                          };
                        })
                      }
                    />
                    <span style={{ fontSize: '0.875rem' }}>Offer in Live Event shop (host opens MST MKT)</span>
                  </label>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                    Price (Participation PP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={(newArtifact as MarketplaceArtifact).liveEventMkt?.pricePp ?? ''}
                    onChange={(e) =>
                      setNewArtifact((prev) => {
                        const p = prev as MarketplaceArtifact;
                        const cur = p.liveEventMkt || { enabled: false, pricePp: 0 };
                        return {
                          ...p,
                          liveEventMkt: {
                            enabled: cur.enabled,
                            pricePp: Math.max(0, parseInt(e.target.value, 10) || 0),
                          },
                        };
                      })
                    }
                    style={{
                      width: '100%',
                      maxWidth: '200px',
                      padding: '0.45rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #4b5563',
                      background: '#111827',
                      color: 'white',
                    }}
                  />
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
                    <option value="equippable">Equippable (gear)</option>
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
                        {artifact.price} PP
                        {artifact.truthMetalPrice ? ` + ${artifact.truthMetalPrice} Truth Metal` : ''}
                        {' | '}
                        {artifact.category} | {artifact.rarity}
                        {artifact.disabled ? ' | 🚫 hidden' : ''}
                        {artifact.equippableArtifactId
                          ? ` | ⚔️ grants equippable: ${artifact.equippableArtifactId}`
                          : ''}
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
                    value={normalizeEquippableCatalogSlot((newArtifact as EquippableArtifact).slot)}
                    onChange={(e) =>
                      setNewArtifact({
                        ...newArtifact,
                        slot: e.target.value as EquippableCatalogSlot,
                      })
                    }
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
                    <option value="ring">Ring (any ring slot)</option>
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
                        <option key={perk.id} value={perk.id}>
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
                        <span>{formatPerksForDisplay([perk])}</span>
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
                  <div style={{ gridColumn: '1 / -1', padding: '1rem', background: 'rgba(251, 191, 36, 0.12)', borderRadius: '0.75rem', border: '1px solid #f59e0b' }}>
                    <h5 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 'bold', color: '#b45309' }}>Legendary New Skill</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Skill Name *</label>
                        <input
                          type="text"
                          value={draftArtifactSkill?.name || ''}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: e.target.value,
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          placeholder="Skill name"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Type</label>
                        <select
                          value={draftArtifactSkill?.type || 'utility'}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: e.target.value as EquippableArtifactSkill['type'],
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        >
                          <option value="attack">Attack</option>
                          <option value="defense">Defense</option>
                          <option value="utility">Utility</option>
                          <option value="support">Support</option>
                          <option value="control">Control</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Cost (PP)</label>
                        <input
                          type="number"
                          min={0}
                          value={draftArtifactSkill?.cost ?? 0}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: parseInt(e.target.value, 10) || 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Cooldown (turns)</label>
                        <input
                          type="number"
                          min={0}
                          value={draftArtifactSkill?.cooldown ?? 0}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: parseInt(e.target.value, 10) || 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Target</label>
                        <select
                          value={draftArtifactSkill?.targetType || 'self'}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: e.target.value as EquippableArtifactSkill['targetType'],
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        >
                          <option value="self">Self</option>
                          <option value="single">Single</option>
                          <option value="team">Team</option>
                          <option value="enemy">Enemy</option>
                          <option value="enemy_team">Enemy Team</option>
                          <option value="all">All</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Damage</label>
                        <input
                          type="number"
                          min={0}
                          value={draftArtifactSkill?.damage ?? ''}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          placeholder="0"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Healing</label>
                        <input
                          type="number"
                          min={0}
                          value={draftArtifactSkill?.healing ?? ''}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0,
                              shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          placeholder="0"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Shield Boost</label>
                        <input
                          type="number"
                          min={0}
                          value={draftArtifactSkill?.shieldBoost ?? ''}
                          onChange={(e) => setNewArtifact((prev) => ({
                            ...prev,
                            artifactSkill: {
                              id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                              name: (prev as EquippableArtifact).artifactSkill?.name || '',
                              description: (prev as EquippableArtifact).artifactSkill?.description || '',
                              type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                              cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                              cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                              targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                              damage: (prev as EquippableArtifact).artifactSkill?.damage,
                              healing: (prev as EquippableArtifact).artifactSkill?.healing,
                              shieldBoost: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0,
                              statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                            }
                          }))}
                          placeholder="0"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Description</label>
                      <textarea
                        value={draftArtifactSkill?.description || ''}
                        onChange={(e) => setNewArtifact((prev) => ({
                          ...prev,
                          artifactSkill: {
                            id: (prev as EquippableArtifact).artifactSkill?.id || `${(prev as EquippableArtifact).id || 'artifact'}-skill`,
                            name: (prev as EquippableArtifact).artifactSkill?.name || '',
                            description: e.target.value,
                            type: (prev as EquippableArtifact).artifactSkill?.type || 'utility',
                            cost: (prev as EquippableArtifact).artifactSkill?.cost ?? 0,
                            cooldown: (prev as EquippableArtifact).artifactSkill?.cooldown ?? 0,
                            targetType: (prev as EquippableArtifact).artifactSkill?.targetType || 'self',
                            damage: (prev as EquippableArtifact).artifactSkill?.damage,
                            healing: (prev as EquippableArtifact).artifactSkill?.healing,
                            shieldBoost: (prev as EquippableArtifact).artifactSkill?.shieldBoost,
                            statusEffects: (prev as EquippableArtifact).artifactSkill?.statusEffects ?? []
                          }
                        }))}
                        placeholder="Skill description"
                        rows={3}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', background: '#ffffff', color: '#111827', fontSize: '0.875rem', resize: 'vertical' }}
                      />
                    </div>
                    {/* Status Effects - same as Manifest Move Editor */}
                    <div style={{ marginTop: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #f59e0b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>Status Effects</h5>
                        <button
                          type="button"
                          onClick={() => setNewArtifact((prev) => {
                            const skill = (prev as EquippableArtifact).artifactSkill;
                            const effects = [...(skill?.statusEffects ?? []), { type: 'burn' as const, duration: 1, successChance: 100 }];
                            return { ...prev, artifactSkill: skill ? { ...skill, statusEffects: effects } : { id: `${(prev as EquippableArtifact).id || 'artifact'}-skill`, name: '', description: '', type: 'utility', cost: 0, cooldown: 0, targetType: 'self', statusEffects: effects } };
                          })}
                          style={{ padding: '0.25rem 0.75rem', background: '#10b981', border: 'none', borderRadius: '0.25rem', color: 'white', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          + Add Effect
                        </button>
                      </div>
                      {(draftArtifactSkill?.statusEffects ?? []).length === 0 ? (
                        <div style={{ color: '#92400e', fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>No effects. Click &quot;Add Effect&quot; to add one.</div>
                      ) : (
                        (draftArtifactSkill?.statusEffects ?? []).map((effect, effectIndex) => (
                          <div key={effectIndex} style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.5)', borderRadius: '0.5rem', border: '1px solid rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e' }}>Effect {effectIndex + 1}</span>
                              <button
                                type="button"
                                onClick={() => setNewArtifact((prev) => {
                                  const skill = (prev as EquippableArtifact).artifactSkill;
                                  if (!skill) return prev;
                                  const effects = (skill.statusEffects ?? []).filter((_, i) => i !== effectIndex);
                                  return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                })}
                                style={{ padding: '0.25rem 0.5rem', background: '#ef4444', border: 'none', borderRadius: '0.25rem', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}
                              >
                                Remove
                              </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Effect Type</label>
                                <select
                                  value={effect.type || 'none'}
                                  onChange={(e) => {
                                    const effectType = e.target.value as ArtifactStatusEffect['type'];
                                    setNewArtifact((prev) => {
                                      const skill = (prev as EquippableArtifact).artifactSkill;
                                      if (!skill) return prev;
                                      const effects = [...(skill.statusEffects ?? [])];
                                      effects[effectIndex] = { ...effects[effectIndex], type: effectType, duration: effects[effectIndex].duration ?? 1, successChance: effectType === 'none' ? undefined : (effects[effectIndex].successChance ?? 100) };
                                      if (effectType === 'none') { effects[effectIndex].intensity = undefined; effects[effectIndex].damagePerTurn = undefined; effects[effectIndex].ppLossPerTurn = undefined; effects[effectIndex].ppStealPerTurn = undefined; effects[effectIndex].healPerTurn = undefined; effects[effectIndex].chance = undefined; }
                                      return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                    });
                                  }}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }}
                                >
                                  <option value="none">None</option>
                                  <option value="burn">Burn (Damage over time)</option>
                                  <option value="stun">Stun (Skip turn)</option>
                                  <option value="bleed">Bleed (Lose PP each turn)</option>
                                  <option value="poison">Poison (Minor damage over time, stacks)</option>
                                  <option value="confuse">Confuse (50% wrong move/attack self)</option>
                                  <option value="drain">Drain (Steal PP and heal each turn)</option>
                                  <option value="cleanse">Cleanse (Removes all negative effects)</option>
                                  <option value="freeze">Freeze (Legacy)</option>
                                  <option value="reduce">Reduce (Reduce incoming damage)</option>
                                  <option value="summon">Summon (Construct ally attacks with elemental damage)</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Duration (Turns)</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={effect.duration ?? 0}
                                  onChange={(e) => setNewArtifact((prev) => {
                                    const skill = (prev as EquippableArtifact).artifactSkill;
                                    if (!skill) return prev;
                                    const effects = [...(skill.statusEffects ?? [])];
                                    effects[effectIndex] = { ...effects[effectIndex], duration: parseInt(e.target.value, 10) || 0 };
                                    return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                  })}
                                  disabled={effect.type === 'none'}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: effect.type === 'none' ? '#f3f4f6' : '#fff', color: '#111827' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Success Chance (%)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={effect.successChance !== undefined ? effect.successChance : 100}
                                  onChange={(e) => setNewArtifact((prev) => {
                                    const skill = (prev as EquippableArtifact).artifactSkill;
                                    if (!skill) return prev;
                                    const effects = [...(skill.statusEffects ?? [])];
                                    effects[effectIndex] = { ...effects[effectIndex], successChance: parseInt(e.target.value, 10) || 100 };
                                    return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                  })}
                                  disabled={effect.type === 'none'}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: effect.type === 'none' ? '#f3f4f6' : '#fff', color: '#111827' }}
                                />
                              </div>
                            </div>
                            {(effect.type === 'burn' || effect.type === 'poison') && (
                              <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Damage Per Turn</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={effect.damagePerTurn ?? effect.intensity ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0;
                                    setNewArtifact((prev) => {
                                      const skill = (prev as EquippableArtifact).artifactSkill;
                                      if (!skill) return prev;
                                      const effects = [...(skill.statusEffects ?? [])];
                                      effects[effectIndex] = { ...effects[effectIndex], damagePerTurn: value, intensity: value };
                                      return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                    });
                                  }}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }}
                                />
                              </div>
                            )}
                            {effect.type === 'bleed' && (
                              <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>PP Loss per turn</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={effect.ppLossPerTurn ?? effect.intensity ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0;
                                    setNewArtifact((prev) => {
                                      const skill = (prev as EquippableArtifact).artifactSkill;
                                      if (!skill) return prev;
                                      const effects = [...(skill.statusEffects ?? [])];
                                      effects[effectIndex] = { ...effects[effectIndex], ppLossPerTurn: value, intensity: value };
                                      return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                    });
                                  }}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }}
                                />
                              </div>
                            )}
                            {effect.type === 'confuse' && (
                              <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Confusion Chance (%)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={effect.chance ?? effect.intensity ?? 50}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? 50 : parseInt(e.target.value, 10) || 50;
                                    setNewArtifact((prev) => {
                                      const skill = (prev as EquippableArtifact).artifactSkill;
                                      if (!skill) return prev;
                                      const effects = [...(skill.statusEffects ?? [])];
                                      effects[effectIndex] = { ...effects[effectIndex], chance: value, intensity: value };
                                      return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                    });
                                  }}
                                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }}
                                />
                              </div>
                            )}
                            {effect.type === 'drain' && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>PP Steal Per Turn</label>
                                  <input type="number" min={0} value={effect.ppStealPerTurn ?? effect.intensity ?? ''} onChange={(e) => { const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0; setNewArtifact((prev) => { const skill = (prev as EquippableArtifact).artifactSkill; if (!skill) return prev; const effects = [...(skill.statusEffects ?? [])]; effects[effectIndex] = { ...effects[effectIndex], ppStealPerTurn: value, intensity: value }; return { ...prev, artifactSkill: { ...skill, statusEffects: effects } }; }); }} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }} />
                                </div>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Heal Per Turn</label>
                                  <input type="number" min={0} value={effect.healPerTurn ?? ''} onChange={(e) => { const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0; setNewArtifact((prev) => { const skill = (prev as EquippableArtifact).artifactSkill; if (!skill) return prev; const effects = [...(skill.statusEffects ?? [])]; effects[effectIndex] = { ...effects[effectIndex], healPerTurn: value }; return { ...prev, artifactSkill: { ...skill, statusEffects: effects } }; }); }} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }} />
                                </div>
                              </div>
                            )}
                            {effect.type === 'reduce' && (
                              <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Damage Reduction (%)</label>
                                <input type="number" min={0} max={100} value={effect.damageReduction ?? ''} onChange={(e) => { const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10) || 0; setNewArtifact((prev) => { const skill = (prev as EquippableArtifact).artifactSkill; if (!skill) return prev; const effects = [...(skill.statusEffects ?? [])]; effects[effectIndex] = { ...effects[effectIndex], damageReduction: value }; return { ...prev, artifactSkill: { ...skill, statusEffects: effects } }; }); }} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }} />
                              </div>
                            )}
                            {effect.type === 'summon' && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Elemental Type</label>
                                  <select
                                    value={effect.summonElementalType ?? 'fire'}
                                    onChange={(e) => setNewArtifact((prev) => {
                                      const skill = (prev as EquippableArtifact).artifactSkill;
                                      if (!skill) return prev;
                                      const effects = [...(skill.statusEffects ?? [])];
                                      effects[effectIndex] = { ...effects[effectIndex], summonElementalType: e.target.value as typeof ARTIFACT_ELEMENTAL_TYPES[number] };
                                      return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                    })}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }}
                                  >
                                    {ARTIFACT_ELEMENTAL_TYPES.map((elem) => (
                                      <option key={elem} value={elem}>{elem.charAt(0).toUpperCase() + elem.slice(1)}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>Construct Damage</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={effect.summonDamage ?? 100}
                                    onChange={(e) => setNewArtifact((prev) => {
                                      const skill = (prev as EquippableArtifact).artifactSkill;
                                      if (!skill) return prev;
                                      const effects = [...(skill.statusEffects ?? [])];
                                      effects[effectIndex] = { ...effects[effectIndex], summonDamage: parseInt(e.target.value, 10) || 0 };
                                      return { ...prev, artifactSkill: { ...skill, statusEffects: effects } };
                                    })}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.875rem', background: '#fff', color: '#111827' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
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
                {Object.entries(equippableArtifacts).map(([catalogKey, artifact]) => {
                  const eq: EquippableArtifact = {
                    ...artifact,
                    id: artifact.id || catalogKey,
                  };
                  return (
                  <div
                    key={catalogKey}
                    style={{
                      background: '#374151',
                      padding: '1rem',
                      borderRadius: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.125rem' }}>{eq.name}</div>
                        <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          Slot: {formatEquippableCatalogSlotLabel(eq.slot)} | Level: {eq.level || 1}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#60a5fa', marginTop: '0.25rem', fontWeight: 600 }}>
                          {String(eq.rarity || 'common').charAt(0).toUpperCase() + String(eq.rarity || 'common').slice(1)} · +{eq.powerLevelBonus ?? getPowerLevelBonusForRarity(eq.rarity || 'common')} Power Level
                        </div>
                        {eq.description && (
                          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            {eq.description}
                          </div>
                        )}
                        {eq.stats && Object.keys(eq.stats).length > 0 && (
                          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            Stats: {JSON.stringify(eq.stats)}
                          </div>
                        )}
                        {eq.perks && eq.perks.length > 0 && (
                          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                            Perks: {formatPerksForDisplay(eq.perks)}
                          </div>
                        )}
                        {eq.rarity === 'legendary' && eq.artifactSkill?.name && (
                          <div style={{ fontSize: '0.875rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: 600 }}>
                            New Skill: {eq.artifactSkill.name}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleAddEquippableToMarketplace(eq)}
                          style={{
                            background: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                          }}
                          title="Create or update an MST MKT store row that grants this equippable"
                        >
                          Add to MKT
                        </button>
                        <button
                          onClick={() => handleEditEquippableArtifact(catalogKey)}
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
                          onClick={() => handleDeleteEquippableArtifact(catalogKey)}
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
                  );
                })}
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

