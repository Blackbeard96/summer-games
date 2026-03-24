/**
 * Runtime effects for equippable artifact perks (Shield Boost, Cost Reduction, Elemental Access).
 * Resolves perks from equipped slots + optional Firestore equippable catalog (same as Artifacts page).
 */

import { ARTIFACT_PERK_OPTIONS } from '../constants/artifactPerks';
import {
  enrichEquippedArtifactsFromCatalog,
  findEquippableDefinitionRow,
  mergeEquippableCatalogLayers,
} from './battleSkillsService';

export const ELEMENTAL_ACCESS_PERK_ID = 'elemental-access';
export const SHIELD_BOOST_PERK_ID = 'shield-boost';
export const IMPENETRABLE_PERK_ID = 'impenetrable';
/** Firestore/catalog id (legacy id name). Perk is displayed as "Cost Reduction". */
export const COST_REDUCTION_PERK_ID = 'cooldown-reduction';
/** @deprecated Use COST_REDUCTION_PERK_ID — same string, kept for older imports */
export const COOLDOWN_REDUCTION_PERK_ID = COST_REDUCTION_PERK_ID;
export const DAMAGE_BOOST_PERK_ID = 'damage-boost';
export const MANIFEST_BOOST_PERK_ID = 'manifest-boost';
export const ELEMENTAL_BOOST_PERK_ID = 'elemental-boost';
export const STATUS_DEFENSE_PERK_ID = 'status-defense';
export const ARTIFACT_SYNERGY_PERK_ID = 'artifact-synergy';
export const HEALING_BOOST_PERK_ID = 'healing-boost';
export const PP_ECONOMY_PERK_ID = 'pp-economy';

/** Level range used for linear scaling (10%→100%, 5%→30%, etc.). */
export const ARTIFACT_PERK_SCALE_MAX_LEVEL = 10;

function clampArtifactLevelForPerks(level: unknown): number {
  return Math.max(1, Math.min(ARTIFACT_PERK_SCALE_MAX_LEVEL, Math.floor(Number(level) || 1)));
}

/**
 * Linear scale: level 1 → minValue, maxLevel → maxValue (inclusive).
 */
export function perkEffectLinear(
  level: number,
  minValue: number,
  maxValue: number,
  maxLevel: number = ARTIFACT_PERK_SCALE_MAX_LEVEL
): number {
  const L = Math.max(1, Math.min(maxLevel, Math.floor(level)));
  if (maxLevel <= 1) return maxValue;
  return minValue + ((L - 1) / (maxLevel - 1)) * (maxValue - minValue);
}

/** First word of display name = set tag (e.g. “Unveiled” from “Unveiled Leg Armor”). */
export function getArtifactSetKeywordFromName(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  const token = name.trim().split(/\s+/)[0];
  if (!token || token.length < 2) return null;
  return token;
}

/**
 * 1 + 10% per other equipped artifact with Artifact Synergy whose set keyword appears in target name.
 * Caps at ×1.30. Does not count the same slot (no self-synergy).
 */
export function getArtifactSynergyMultiplierForTarget(
  targetArtifactName: string,
  targetSlot: string,
  enrichedEquipped: Record<string, unknown>,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  let count = 0;
  const targetLower = targetArtifactName.toLowerCase();
  for (const slot of EQUIP_SLOTS) {
    if (slot === targetSlot) continue;
    const art = enrichedEquipped[slot] as Record<string, unknown> | undefined;
    if (!art || typeof art !== 'object') continue;
    if (!perkIdsForArtifact(art, rawCatalog).includes(ARTIFACT_SYNERGY_PERK_ID)) continue;
    const synName = typeof art.name === 'string' ? art.name : '';
    const kw = getArtifactSetKeywordFromName(synName);
    if (kw && targetLower.includes(kw.toLowerCase())) {
      count += 1;
    }
  }
  return 1 + Math.min(0.3, count * 0.1);
}

/** Elements players can pick for Elemental Access (lowercase keys). */
export const ELEMENTAL_ACCESS_ELEMENT_OPTIONS = [
  'fire',
  'water',
  'earth',
  'air',
  'lightning',
  'light',
  'shadow',
  'metal',
] as const;

export type ElementalAccessElement = (typeof ELEMENTAL_ACCESS_ELEMENT_OPTIONS)[number];

export function resolvePerkIdFromStored(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Legacy perk merged into Cost Reduction (cooldown-reduction id)
  if (s === 'skill-cost-reduction') return COST_REDUCTION_PERK_ID;
  if (ARTIFACT_PERK_OPTIONS.some((o) => o.id === s)) return s;
  const byLabel = ARTIFACT_PERK_OPTIONS.find(
    (o) => o.label === s || o.label.toLowerCase() === s.toLowerCase()
  );
  return byLabel?.id ?? null;
}

const EQUIP_SLOTS = [
  'head',
  'chest',
  'ring1',
  'ring2',
  'ring3',
  'ring4',
  'legs',
  'shoes',
  'jacket',
  'weapon',
] as const;

function perkIdsForArtifact(art: Record<string, unknown> | null | undefined, rawCatalog: Record<string, unknown> | null | undefined): string[] {
  if (!art || typeof art !== 'object') return [];
  const ids: string[] = [];
  const perks = (art as { perks?: unknown }).perks;
  if (Array.isArray(perks)) {
    for (const p of perks) {
      if (typeof p === 'string') {
        const id = resolvePerkIdFromStored(p);
        if (id) ids.push(id);
      }
    }
  }
  if (ids.length === 0 && rawCatalog) {
    const cat = mergeEquippableCatalogLayers(rawCatalog);
    const row = findEquippableDefinitionRow(cat, {
      id: typeof (art as { id?: string }).id === 'string' ? (art as { id: string }).id : undefined,
      name: typeof (art as { name?: string }).name === 'string' ? (art as { name: string }).name : undefined,
    });
    const rp = row?.perks;
    if (Array.isArray(rp)) {
      for (const p of rp) {
        if (typeof p === 'string') {
          const id = resolvePerkIdFromStored(p);
          if (id) ids.push(id);
        }
      }
    }
  }
  return ids;
}

/**
 * Enrich equipped map with catalog perks/skills (same as Artifacts page load).
 */
export function enrichEquippedForPerkEffects(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!equipped || typeof equipped !== 'object') return {};
  return enrichEquippedArtifactsFromCatalog(equipped as Record<string, any>, rawCatalog) as Record<string, unknown>;
}

export function hasElementalAccessPerkEquipped(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): boolean {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (perkIdsForArtifact(art, rawCatalog).includes(ELEMENTAL_ACCESS_PERK_ID)) return true;
  }
  return false;
}

/** Flat +max shield (and current shield headroom) from Shield Boost perk(s). Level 1 = +100, +50 per extra level per artifact. */
export function getShieldBoostFlatBonus(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let total = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!perkIdsForArtifact(art, rawCatalog).includes(SHIELD_BOOST_PERK_ID)) continue;
    const level = Math.max(1, Number((art as { level?: number }).level) || 1);
    const base = 100 + (level - 1) * 50;
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    total += Math.round(base * syn);
  }
  return total;
}

/** Flat +max shield from Impenetrable perk(s): +10 at level 1 → +100 at level 10, × set synergy. Stacks with Shield Boost. */
export function getImpenetrableShieldStatFlatBonus(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let total = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(IMPENETRABLE_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 10, 100, ARTIFACT_PERK_SCALE_MAX_LEVEL);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    total += Math.round(base * syn);
  }
  return total;
}

export function hasImpenetrablePerkEquipped(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): boolean {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (perkIdsForArtifact(art, rawCatalog).includes(IMPENETRABLE_PERK_ID)) return true;
  }
  return false;
}

function artifactHasCostReductionPerk(
  art: Record<string, unknown> | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): boolean {
  const ids = perkIdsForArtifact(art, rawCatalog);
  return ids.includes(COST_REDUCTION_PERK_ID);
}

/**
 * Live Events: Participation Point cost reduction from Cost Reduction perk.
 * Per artifact: −1 PP while below max level, −2 PP at max level (10). Synergy multiplies the reduction. Sum capped at 12.
 */
export function getLiveEventPpCostReductionFromEquipped(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let total = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!artifactHasCostReductionPerk(art, rawCatalog)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const maxed = level >= ARTIFACT_PERK_SCALE_MAX_LEVEL;
    const base = maxed ? 2 : 1;
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    total += Math.max(0, Math.round(base * syn));
  }
  return Math.min(12, total);
}

/**
 * Additive damage bonus from Cost Reduction perk: scales ~0.5% (L1) → 5% (L10) per piece, × synergy; **total cap +5%** from this perk type.
 */
export function getCostReductionPerkSkillEffectivenessBonusFraction(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!artifactHasCostReductionPerk(art, rawCatalog)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const curve = perkEffectLinear(level, 0.005, 0.05, ARTIFACT_PERK_SCALE_MAX_LEVEL);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += curve * syn;
  }
  return Math.min(0.05, sum);
}

export function getOutgoingDamageMultiplierFromCostReductionPerk(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  return 1 + getCostReductionPerkSkillEffectivenessBonusFraction(equipped, rawCatalog);
}

/**
 * Additive damage bonus fraction from Damage Boost perk(s), 10%→100% per artifact level curve, × synergy on matching set names.
 * Capped at +100% total from this perk type (fraction 1.0).
 */
export function getDamageBoostBonusFraction(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(DAMAGE_BOOST_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 0.1, 1.0);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += base * syn;
  }
  return Math.min(1, sum);
}

/** Outgoing damage multiplier for all skills (1 + capped bonus fraction). */
export function getOutgoingDamageMultiplierFromDamageBoostPerk(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  return 1 + getDamageBoostBonusFraction(equipped, rawCatalog);
}

/**
 * Additive bonus fraction for Manifest Boost — manifest-category attack (and manifest shield boost) only.
 * Same level curve as Damage Boost; cap +100% total from this perk type.
 */
export function getManifestBoostBonusFraction(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(MANIFEST_BOOST_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 0.1, 1.0);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += base * syn;
  }
  return Math.min(1, sum);
}

export function getOutgoingDamageMultiplierFromManifestBoostPerk(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  return 1 + getManifestBoostBonusFraction(equipped, rawCatalog);
}

/** Additive bonus fraction for Elemental Boost — elemental-category attacks only. Cap +100% total. */
export function getElementalBoostBonusFraction(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(ELEMENTAL_BOOST_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 0.1, 1.0);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += base * syn;
  }
  return Math.min(1, sum);
}

export function getOutgoingDamageMultiplierFromElementalBoostPerk(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  return 1 + getElementalBoostBonusFraction(equipped, rawCatalog);
}

/**
 * Fraction of incoming damage mitigated (0.05–0.30 per piece curve), after synergy, capped at 0.30 total.
 */
export function getStatusDefenseMitigationFraction(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(STATUS_DEFENSE_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 0.05, 0.3);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += base * syn;
  }
  return Math.min(0.3, sum);
}

/**
 * Passive healing at the start of each of your turns (vault health preferred, else current PP).
 * Per artifact: 10 HP/turn at level 1 → 50 at level 10, × set synergy. Cap 50/turn total from this perk.
 */
export function getHealingBoostRegenPerTurn(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(HEALING_BOOST_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 10, 50);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += Math.max(0, Math.round(base * syn));
  }
  return Math.min(50, sum);
}

/**
 * Bonus fraction on PP gained in battle (steals, victory payout, heal-to-PP, etc.).
 * Per artifact: 10% at L1 → 50% at L10, × synergy. Cap +50% total from this perk type.
 */
export function getPpEconomyBonusFraction(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  let sum = 0;
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(PP_ECONOMY_PERK_ID)) continue;
    const level = clampArtifactLevelForPerks((art as { level?: number }).level);
    const base = perkEffectLinear(level, 0.1, 0.5);
    const name = String((art as { name?: string }).name || '');
    const syn = getArtifactSynergyMultiplierForTarget(name, slot, eq, rawCatalog);
    sum += base * syn;
  }
  return Math.min(0.5, sum);
}

/** Floor of basePP × (1 + PP Economy bonus). Target still loses only the base stolen amount when used for steals. */
export function applyPpEconomyToPPGain(
  basePP: number,
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): number {
  const b = Math.max(0, Math.floor(Number(basePP) || 0));
  if (b === 0) return 0;
  const f = getPpEconomyBonusFraction(equipped, rawCatalog);
  return Math.floor(b * (1 + f));
}

/** Skills & Mastery UI: same numbers as battle (damage boost, mitigation, synergy lines). */
export interface SkillsMasteryPerkDisplaySnapshot {
  damageBoostMultiplier: number;
  damageBoostPercent: number;
  manifestBoostMultiplier: number;
  manifestBoostPercent: number;
  elementalBoostMultiplier: number;
  elementalBoostPercent: number;
  statusDefensePercent: number;
  /** Live Events: total PP cost reduction from Cost Reduction perk (capped). */
  liveEventPpCostReduction: number;
  /** Cost Reduction perk: skill damage effectiveness bonus (capped +5% total). */
  costReductionSkillEffectivenessPercent: number;
  costReductionSkillMultiplier: number;
  /** Passive health/PP restored at the start of each your turn in battle. */
  healingRegenPerTurn: number;
  /** Rounded % bonus on PP received (cap 50%). */
  ppEconomyPercent: number;
  synergyNotes: string[];
}

export function getSkillsMasteryPerkDisplaySnapshot(
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): SkillsMasteryPerkDisplaySnapshot {
  const eq = enrichEquippedForPerkEffects(equipped, rawCatalog);
  const damageBoostMultiplier = getOutgoingDamageMultiplierFromDamageBoostPerk(equipped, rawCatalog);
  const manifestBoostMultiplier = getOutgoingDamageMultiplierFromManifestBoostPerk(equipped, rawCatalog);
  const elementalBoostMultiplier = getOutgoingDamageMultiplierFromElementalBoostPerk(equipped, rawCatalog);
  const statusDefensePercent = Math.round(getStatusDefenseMitigationFraction(equipped, rawCatalog) * 100);
  const liveEventPpCostReduction = getLiveEventPpCostReductionFromEquipped(equipped, rawCatalog);
  const costReductionSkillMultiplier = getOutgoingDamageMultiplierFromCostReductionPerk(equipped, rawCatalog);
  const costReductionSkillEffectivenessPercent = Math.round(
    (costReductionSkillMultiplier - 1) * 100
  );
  const healingRegenPerTurn = getHealingBoostRegenPerTurn(equipped, rawCatalog);
  const ppEconomyPercent = Math.round(getPpEconomyBonusFraction(equipped, rawCatalog) * 100);

  const synergyNotes: string[] = [];
  const seenKw = new Set<string>();
  for (const slot of EQUIP_SLOTS) {
    const art = eq[slot] as Record<string, unknown> | undefined;
    if (!art || !perkIdsForArtifact(art, rawCatalog).includes(ARTIFACT_SYNERGY_PERK_ID)) continue;
    const synName = typeof art.name === 'string' ? art.name : '';
    const kw = getArtifactSetKeywordFromName(synName);
    if (!kw || seenKw.has(kw)) continue;
    seenKw.add(kw);
    const matchedNames: string[] = [];
    for (const s2 of EQUIP_SLOTS) {
      if (s2 === slot) continue;
      const o = eq[s2] as Record<string, unknown> | undefined;
      const oname = o && typeof o.name === 'string' ? o.name : '';
      if (oname && oname.toLowerCase().includes(kw.toLowerCase())) matchedNames.push(oname);
    }
    if (matchedNames.length === 0) continue;
    const bonus = Math.min(30, matchedNames.length * 10);
    const samples = matchedNames.slice(0, 3).join(', ');
    const more = matchedNames.length > 3 ? '…' : '';
    synergyNotes.push(
      `“${kw}” set: up to +${bonus}% on matching gear’s perks (${matchedNames.length} piece${matchedNames.length !== 1 ? 's' : ''}: ${samples}${more})`
    );
  }

  return {
    damageBoostMultiplier,
    damageBoostPercent: Math.round((damageBoostMultiplier - 1) * 100),
    manifestBoostMultiplier,
    manifestBoostPercent: Math.round((manifestBoostMultiplier - 1) * 100),
    elementalBoostMultiplier,
    elementalBoostPercent: Math.round((elementalBoostMultiplier - 1) * 100),
    statusDefensePercent,
    liveEventPpCostReduction,
    costReductionSkillEffectivenessPercent,
    costReductionSkillMultiplier,
    healingRegenPerTurn,
    ppEconomyPercent,
    synergyNotes,
  };
}

export function effectiveSkillCooldownTurns(
  baseCooldown: number,
  _equipped?: Record<string, unknown> | null | undefined,
  _rawCatalog?: Record<string, unknown> | null | undefined
): number {
  const b = Math.max(0, Math.floor(Number(baseCooldown) || 0));
  return b;
}

/** Secondary element granted by Elemental Access (Firestore). */
export function getElementalAccessElementFromStudent(studentData: Record<string, unknown> | null | undefined): string | null {
  if (!studentData || typeof studentData !== 'object') return null;
  const artifacts = studentData.artifacts as Record<string, unknown> | undefined;
  const raw =
    (artifacts?.elemental_access_element as string | undefined) ||
    (studentData.elementalAccessElement as string | undefined);
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim().toLowerCase();
}

/** Apply shield boost to vault snapshot (stored values exclude perk bonus). */
export function applyVaultShieldBoostFromEquipped<T extends { maxShieldStrength?: number; shieldStrength?: number }>(
  vault: T,
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): T {
  const bonus =
    getShieldBoostFlatBonus(equipped, rawCatalog) + getImpenetrableShieldStatFlatBonus(equipped, rawCatalog);
  if (bonus <= 0) return vault;
  const baseMax = Math.max(0, Number(vault.maxShieldStrength) || 0);
  const baseCur = Math.max(0, Number(vault.shieldStrength) || 0);
  const newMax = baseMax + bonus;
  const newCur = Math.min(baseCur + bonus, newMax);
  return {
    ...vault,
    maxShieldStrength: newMax,
    shieldStrength: newCur,
  };
}
