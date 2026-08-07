/**
 * Canonical Battle Skills Service
 *
 * SINGLE SOURCE OF TRUTH for battle-eligible skills.
 * - Unified 6-skill loadout: battle uses EQUIPPED skills only (manifest, elemental, RR Candy, artifact).
 * - getEquippedSkillsForBattle: returns equipped skills for battle (up to max loadout slots), then appends
 *   any unlocked RR Candy moves not already in the loadout (they are not auto-inserted into equippedSkillIds),
 *   then the Level 2 Manifest meta move when the player has one saved.
 * - getUserUnlockedSkillsForBattle: returns all unlocked (for loadout UI / backward compat).
 *
 * Cooldowns are tracked in battle state, NOT in skill library.
 * Returns Move[] for BattleEngine compatibility.
 */

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Move } from '../types/battle';
import { inferEnergyTypeForMove } from '../constants/energyTypes';
import { getUserRRCandySkills } from './rrCandyService';
import { getRRCandyStatusAsync } from './rrCandyUtils';
import { getPlayerSkillState } from './skillStateService';
import type { ArtifactSkillDefinition, ArtifactStatusEffect } from '../types/artifact';
import { getElementalAccessElementFromStudent, hasElementalAccessPerkEquipped } from './artifactPerkEffects';
import { DEFAULT_EQUIPPABLE_ARTIFACTS_CATALOG } from '../data/defaultEquippableArtifactsCatalog';
import {
  getMaxLoadoutSlotsFromEffects,
  getPlayerUniversalLawEffects,
} from './universalLawBoons';
import { getActiveLevel2ManifestMove } from '../services/level2ManifestService';
import { applyCanonicalSkillCostAndCooldown } from './skillCooldownCost';
import { hasElementalMoveAccess } from './elementalAccess';

// Prevent console log spam; only emit a small number of Magical Paintbrush debug lines.
let artifactPaintbrushDebugEmitted = false;

/** Convert artifact skill definition to Move for battle engine. */
function artifactSkillToMove(skill: ArtifactSkillDefinition, artifactId: string): Move {
  const hasSummon = Array.isArray(skill.statusEffects) && skill.statusEffects.some((e: { type?: string }) => e?.type === 'summon');
  const description = (typeof skill.description === 'string' && skill.description.trim()) ? skill.description : (hasSummon ? 'Summon a construct to fight alongside you.' : '');
  return {
    id: skill.id,
    name: skill.name,
    description,
    category: 'system',
    type: skill.type || 'attack',
    level: 1,
    cost: typeof skill.cost === 'number' ? skill.cost : 0,
    cooldown: typeof skill.cooldown === 'number' ? skill.cooldown : 0,
    currentCooldown: 0,
    unlocked: true,
    masteryLevel: 1,
    damage: skill.damage,
    ppSteal: skill.ppSteal,
    healing: skill.healing,
    shieldBoost: skill.shieldBoost,
    debuffType: skill.debuffType as any,
    debuffStrength: skill.debuffStrength,
    buffType: skill.buffType as any,
    buffStrength: skill.buffStrength,
    duration: skill.duration,
    targetType: skill.targetType,
    priority: skill.priority,
    statusEffects: skill.statusEffects,
    energyType: inferEnergyTypeForMove({
      category: 'system',
      type: skill.type || 'attack',
      damage: skill.damage,
      healing: skill.healing,
      shieldBoost: skill.shieldBoost,
      debuffType: skill.debuffType as string | undefined,
      buffType: skill.buffType as string | undefined,
      name: skill.name,
      description: skill.description,
    }),
  } as Move;
}

/** Read skill from equipped row, *_purchase doc, or equippable catalog row. */
function extractArtifactSkillFromBlobHolder(holder: Record<string, any> | null | undefined): Record<string, unknown> | null {
  if (!holder || typeof holder !== 'object') return null;
  const blobs = [holder.artifactSkill, holder.grantedSkill, holder.skill, holder.granted_skill];
  for (const sk of blobs) {
    if (typeof sk === 'string' && sk.trim()) {
      return { name: sk.trim(), description: '' };
    }
    if (!sk || typeof sk !== 'object' || Array.isArray(sk)) continue;
    const tryExtractFromObj = (
      o: Record<string, any> | null | undefined
    ): Record<string, unknown> | null => {
      if (!o || typeof o !== 'object') return null;
      const name = o.name ?? o.skillName ?? o.title ?? o.label;
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const fallbackId =
        typeof o.id === 'string' && o.id.trim()
          ? o.id.trim()
          : typeof o.skillId === 'string' && o.skillId.trim()
            ? o.skillId.trim()
            : '';
      if (trimmedName) {
        const out: Record<string, unknown> = { ...o, name: trimmedName };
        if (o.description != null) out.description = String(o.description);
        if (o.id != null) out.id = o.id;
        else if (o.skillId != null) out.id = o.skillId;
        return out;
      }
      // If admin accidentally saved an empty name, still surface the skill using its id.
      if (fallbackId) {
        const out: Record<string, unknown> = { ...o, name: fallbackId };
        if (o.description != null) out.description = String(o.description);
        if (o.id != null) out.id = o.id;
        else if (o.skillId != null) out.id = o.skillId;
        return out;
      }
      // Common nested shapes (e.g. { artifactSkill: { skill: { name }}} )
      const nested = [
        (o as any).skill,
        (o as any).grantedSkill,
        (o as any).granted_skill,
        (o as any).artifactSkill,
      ] as Array<Record<string, any> | null | undefined>;
      for (const n of nested) {
        const r: Record<string, unknown> | null = tryExtractFromObj(n);
        if (r) return r;
      }
      return null;
    };
    const r = tryExtractFromObj(sk as Record<string, any>);
    if (r) return r;
  }
  return null;
}

function equippedHasUsableArtifactSkill(art: { artifactSkill?: unknown }): boolean {
  const sk = art.artifactSkill;
  if (typeof sk === 'string') return sk.trim().length > 0;
  if (!sk || typeof sk !== 'object') return false;
  const n = (sk as any).name ?? (sk as any).skillName;
  return typeof n === 'string' && n.trim().length > 0;
}

/**
 * Resolve Legendary artifact skill for an equipped slot.
 * Order: (1) skill on equipped doc (2) students.artifacts.{id}_purchase (3) any *_purchase whose id/name matches.
 */
export function resolveArtifactSkillForEquipped(
  art: { id?: string; name?: string; artifactSkill?: unknown } | null | undefined,
  ownedArtifacts: Record<string, any> | null | undefined
): Record<string, unknown> | null {
  if (!art || typeof art !== 'object') return null;
  const sk = art.artifactSkill;
  if (typeof sk === 'string' && sk.trim()) {
    return { name: sk.trim(), description: '' };
  }
  if (sk && typeof sk === 'object' && typeof (sk as any).name === 'string' && String((sk as any).name).trim()) {
    return sk as Record<string, unknown>;
  }
  const id = art.id;
  const nameLower = (art.name || '').toLowerCase().trim();
  if (ownedArtifacts && typeof ownedArtifacts === 'object') {
    const tryKeys = id
      ? [`${id}_purchase`, `${id.replace(/-/g, '_')}_purchase`, `${id.replace(/_/g, '-')}_purchase`]
      : [];
    const skillFromPurchase = (p: Record<string, any>): Record<string, unknown> | null =>
      extractArtifactSkillFromBlobHolder(p);
    for (const k of tryKeys) {
      const p = ownedArtifacts[k];
      if (p && typeof p === 'object') {
        const s = skillFromPurchase(p as Record<string, any>);
        if (s) return s;
      }
    }
    for (const [key, val] of Object.entries(ownedArtifacts)) {
      if (!key.endsWith('_purchase') || !val || typeof val !== 'object') continue;
      const p = val as Record<string, any>;
      const pid = typeof p.id === 'string' ? p.id : '';
      const pname = typeof p.name === 'string' ? p.name.toLowerCase() : '';
      const base = key.replace(/_purchase$/i, '');
      const baseNorm = base.replace(/[-_]/g, '').toLowerCase();
      const idNorm = (id || '').replace(/[-_]/g, '').toLowerCase();
      const matchId = id && (pid === id || base === id || baseNorm === idNorm);
      const matchName = nameLower && pname === nameLower;
      if (matchId || matchName) {
        const s = skillFromPurchase(p);
        if (s) return s;
      }
    }
  }
  return null;
}

const EQUIPPABLE_DOC_META = new Set(['lastUpdated', 'updatedBy']);

/** Strip metadata from adminSettings/equippableArtifacts document → artifact id → definition rows. */
export function equippableCatalogFromDoc(raw: Record<string, unknown> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (EQUIPPABLE_DOC_META.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v;
  }
  return out;
}

/** Keys that hold nested artifact maps (not a single artifact row). */
export const CATALOG_NEST_KEYS = [
  'artifacts',
  'items',
  'equippable',
  'definitions',
  'marketplace',
  'products',
  'store'
] as const;

/** Flatten optional nested maps (e.g. { artifacts: { id: row } }) into one catalog. */
export function mergeEquippableCatalogLayers(raw: Record<string, unknown> | null | undefined): Record<string, any> {
  let merged = equippableCatalogFromDoc(raw);
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EQUIPPABLE_ARTIFACTS_CATALOG, ...merged };
  }
  for (const nestKey of CATALOG_NEST_KEYS) {
    const inner = raw[nestKey];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      merged = { ...merged, ...equippableCatalogFromDoc(inner as Record<string, unknown>) };
    }
  }
  for (const arrKey of ['list', 'artifactList', 'equippableList'] as const) {
    const arr = raw[arrKey];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, any>;
      const kid = typeof it.id === 'string' && it.id.trim() ? it.id.trim() : null;
      if (kid) merged[kid] = { ...it, ...merged[kid] };
    }
  }
  return { ...DEFAULT_EQUIPPABLE_ARTIFACTS_CATALOG, ...merged };
}

/** @public same as internal blob holder parser */
export function extractArtifactSkillFromEquippableRow(row: Record<string, any> | null | undefined): Record<string, unknown> | null {
  return extractArtifactSkillFromBlobHolder(row);
}

/**
 * Find catalog row for an equipped artifact (id fuzzy + exact name match).
 * Does not require the row to already have artifactSkill (extract step is separate).
 */
export function findEquippableDefinitionRow(
  catalog: Record<string, any>,
  art: { id?: string; name?: string }
): Record<string, any> | null {
  if (!catalog || typeof catalog !== 'object') return null;
  const id = art.id != null ? String(art.id) : '';
  if (id && catalog[id] && typeof catalog[id] === 'object') return catalog[id] as Record<string, any>;
  const norm = id.replace(/[-_\s]/g, '').toLowerCase();
  for (const [key, val] of Object.entries(catalog)) {
    if (EQUIPPABLE_DOC_META.has(key)) continue;
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const v = val as Record<string, any>;
    const vid = typeof v.id === 'string' ? v.id.replace(/[-_\s]/g, '').toLowerCase() : '';
    const kn = key.replace(/[-_\s]/g, '').toLowerCase();
    if (id && (kn === norm || vid === norm || key === id)) return v;
  }
  const normDisplayName = (s: string) =>
    s
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .replace(/^the\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const nameLower = normDisplayName(art.name || '');
  if (nameLower.length >= 2) {
    for (const val of Object.values(catalog)) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const row = val as Record<string, any>;
      const n = typeof row.name === 'string' ? normDisplayName(row.name) : '';
      if (n && (n === nameLower || (nameLower.length >= 6 && n.length >= 6 && (n.includes(nameLower) || nameLower.includes(n)))))
        return row;
    }
  }
  return null;
}

/**
 * Resolve skill: equipped + _purchase first, then equippable catalog (for Active Perks / UI when Firestore equip omits skill).
 */
export function resolveArtifactSkillWithCatalog(
  art: { id?: string; name?: string; artifactSkill?: unknown; rarity?: string } | null | undefined,
  ownedArtifacts: Record<string, any> | null | undefined,
  rawCatalogDoc: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const artName = typeof art?.name === 'string' ? art.name : '';
  const artId = typeof art?.id === 'string' ? art.id : '';
  const shouldDebug =
    !artifactPaintbrushDebugEmitted &&
    (artName.toLowerCase().includes('magical paintbrush') ||
      artId.toLowerCase().includes('magical-paintbrush') ||
      artId.toLowerCase().includes('magical_paintbrush'));

  const fromEquipped = resolveArtifactSkillForEquipped(art, ownedArtifacts);
  const fromEquippedName =
    fromEquipped && typeof (fromEquipped as any).name === 'string'
      ? String((fromEquipped as any).name).trim()
      : '';

  if (shouldDebug) {
    console.log('[ArtifactDebug] resolveArtifactSkillWithCatalog start', {
      artId,
      artName,
      rawCatalogDocIsNull: rawCatalogDoc == null,
      fromEquippedName,
    });
    artifactPaintbrushDebugEmitted = true;
  }

  if (fromEquippedName) return fromEquipped;

  const cat = mergeEquippableCatalogLayers(rawCatalogDoc);
  const row = findEquippableDefinitionRow(cat, {
    id: art?.id != null ? String(art.id) : undefined,
    name: typeof art?.name === 'string' ? art.name : undefined,
  });
  const extracted = extractArtifactSkillFromEquippableRow(row);

  if (shouldDebug) {
    const rowAny = row as any;
    const artifactSkillAny = rowAny?.artifactSkill;
    const grantedSkillAny = rowAny?.grantedSkill;
    const skillAny = rowAny?.skill;
    const grantedSkill2Any = rowAny?.granted_skill;
    const summarizeSkillBlob = (v: any) => {
      if (v == null) return { type: v };
      if (typeof v === 'string') return { type: 'string', value: v.slice(0, 80) };
      if (typeof v !== 'object') return { type: typeof v };
      const keys = Object.keys(v);
      return {
        type: 'object',
        keys,
        name: typeof v.name === 'string' ? v.name : null,
        skillName: typeof v.skillName === 'string' ? v.skillName : null,
        title: typeof v.title === 'string' ? v.title : null,
        label: typeof v.label === 'string' ? v.label : null,
        nestedSkill: v.skill ? Object.keys(v.skill) : null,
      };
    };
    console.log('[ArtifactDebug] resolveArtifactSkillWithCatalog catalog result', {
      matchedRowName: row && typeof (row as any).name === 'string' ? (row as any).name : null,
      matchedRowId: row && typeof (row as any).id === 'string' ? (row as any).id : null,
      rowKeysCount: rowAny && typeof rowAny === 'object' ? Object.keys(rowAny).length : 0,
      rowKeys: rowAny && typeof rowAny === 'object' ? Object.keys(rowAny).slice(0, 40) : [],
      artifactSkillBlob: summarizeSkillBlob(artifactSkillAny),
      grantedSkillBlob: summarizeSkillBlob(grantedSkillAny),
      skillBlob: summarizeSkillBlob(skillAny),
      grantedSkillBlob2: summarizeSkillBlob(grantedSkill2Any),
      extractedName: extracted && typeof (extracted as any).name === 'string' ? String((extracted as any).name) : null,
    });
  }

  return extracted;
}

/** Catalog row by artifact id (fuzzy); use for rarity/perks even when no skill defined. */
export function findEquippableRow(catalog: Record<string, any>, artifactId: string): any {
  return findEquippableDefinitionRow(catalog, { id: artifactId });
}

/**
 * Skill object to write onto equippedArtifacts[slot].artifactSkill when player equips.
 * Always read from merged equippable catalog so re-equip fixes missing Firestore skill data.
 */
export function skillPayloadFromEquippableCatalogForArtifact(
  rawCatalogDoc: Record<string, unknown> | null | undefined,
  artifact: { id: string; name: string }
): { name: string; description?: string; id?: string; cost?: number; cooldown?: number } | null {
  const cat = mergeEquippableCatalogLayers(rawCatalogDoc);
  const row = findEquippableDefinitionRow(cat, artifact);
  const sk = extractArtifactSkillFromEquippableRow(row);
  if (!sk || typeof sk.name !== 'string' || !String(sk.name).trim()) return null;
  const out: { name: string; description?: string; id?: string; cost?: number; cooldown?: number } = {
    name: String(sk.name).trim(),
  };
  if (typeof sk.description === 'string' && sk.description.trim()) out.description = sk.description.trim();
  if (sk.id != null && String(sk.id).trim()) out.id = String(sk.id).trim();
  if (typeof sk.cost === 'number') out.cost = sk.cost;
  if (typeof sk.cooldown === 'number') out.cooldown = sk.cooldown;
  return out;
}

/**
 * Merge artifactSkill and perks from equippable catalog onto equipped slots (in-memory).
 * Required because students.equippedArtifacts often omits full skill/perks; catalog is source of truth.
 */
export function enrichEquippedArtifactsFromCatalog(
  equipped: Record<string, any> | null | undefined,
  rawCatalogDoc: Record<string, unknown> | null | undefined
): Record<string, any> {
  if (!equipped || typeof equipped !== 'object') return {};
  const catalog = mergeEquippableCatalogLayers(rawCatalogDoc);
  const slots = ['head', 'chest', 'ring1', 'ring2', 'ring3', 'ring4', 'legs', 'shoes', 'jacket', 'weapon'] as const;
  let next: Record<string, any> = { ...equipped };
  for (const slot of slots) {
    const art = next[slot];
    if (!art || typeof art !== 'object') continue;
    if (!art.id && !art.name) continue;
    const def = findEquippableDefinitionRow(catalog, {
      id: art.id != null ? String(art.id) : undefined,
      name: typeof art.name === 'string' ? art.name : undefined,
    });
    if (!def) continue;
    const updates: Record<string, any> = {};
    // Merge artifactSkill when equipped omits it
    if (!equippedHasUsableArtifactSkill(art)) {
      const sk = extractArtifactSkillFromEquippableRow(def);
      if (sk && typeof sk.name === 'string') {
        updates.artifactSkill = { ...sk };
      }
    }
    // Merge perks from catalog so equipped has perks for display and battle logic
    if (Array.isArray(def.perks) && def.perks.length > 0) {
      updates.perks = [...def.perks];
    }
    if (Object.keys(updates).length > 0) {
      next = { ...next, [slot]: { ...art, ...updates } };
    }
  }
  return next;
}

/**
 * Build Move[] for all artifact-granted skills from current equipment.
 * Pass catalogRaw when available so skills resolve even if equipped doc omits artifactSkill (same as Active Perks).
 */
export function getArtifactSkillsFromEquipped(
  studentData: Record<string, any>,
  catalogRaw?: Record<string, unknown> | null
): Move[] {
  const equipped = studentData?.equippedArtifacts || {};
  const ownedArtifacts = (studentData?.artifacts || {}) as Record<string, any>;
  const moves: Move[] = [];
  const seenSkillIds = new Set<string>();
  Object.values(equipped).forEach((art: any) => {
    if (!art || typeof art !== 'object') return;
    const artName = typeof art.name === 'string' ? art.name : '';
    const artId = typeof art.id === 'string' ? art.id : '';
    const shouldDebug =
      !artifactPaintbrushDebugEmitted &&
      (artName.toLowerCase().includes('magical paintbrush') ||
        artId.toLowerCase().includes('magical-paintbrush') ||
        artId.toLowerCase().includes('magical_paintbrush'));
    const raw =
      catalogRaw != null
        ? resolveArtifactSkillWithCatalog(art, ownedArtifacts, catalogRaw)
        : resolveArtifactSkillForEquipped(art, ownedArtifacts);
    if (shouldDebug) {
      console.log('[ArtifactDebug] getArtifactSkillsFromEquipped equipped resolve', {
        artId,
        artName,
        raw,
      });
      artifactPaintbrushDebugEmitted = true;
    }
    if (!raw) return;
    const name = typeof raw.name === 'string' ? raw.name : '';
    if (!name) return;
    const artifactId = art.id || 'artifact';
    const skillId = (raw.id as string) || `${artifactId}-skill`;
    if (seenSkillIds.has(skillId)) return;
    seenSkillIds.add(skillId);
    let statusEffects = Array.isArray(raw.statusEffects) ? raw.statusEffects as ArtifactSkillDefinition['statusEffects'] : undefined;
    const isStrokeOfCreation = name.toLowerCase().includes('stroke of creation') || artifactId.toLowerCase().includes('magic-brush') || artifactId.toLowerCase().includes('magical-paintbrush');
    if (isStrokeOfCreation && (!statusEffects || !statusEffects.some((e: { type?: string }) => e?.type === 'summon'))) {
      statusEffects = [{ type: 'summon', duration: 2, summonElementalType: 'light', summonDamage: 100 } as ArtifactStatusEffect];
    }
    const hasSummonEffect = statusEffects?.some((e: { type?: string }) => e?.type === 'summon');
    const defaultTargetType = hasSummonEffect ? 'self' : 'single';
    const fullDef: ArtifactSkillDefinition = {
      id: skillId,
      name,
      description: typeof raw.description === 'string' ? raw.description : (hasSummonEffect ? 'Summon a construct to fight alongside you.' : ''),
      category: 'system',
      type: (raw.type as ArtifactSkillDefinition['type']) || 'attack',
      cost: typeof raw.cost === 'number' ? raw.cost : 0,
      cooldown: isStrokeOfCreation
        ? 2
        : typeof raw.cooldown === 'number'
          ? raw.cooldown
          : 0,
      damage: typeof raw.damage === 'number' ? raw.damage : undefined,
      healing: typeof raw.healing === 'number' ? raw.healing : undefined,
      shieldBoost: typeof raw.shieldBoost === 'number' ? raw.shieldBoost : undefined,
      targetType: (raw.targetType as ArtifactSkillDefinition['targetType']) || defaultTargetType,
      priority: typeof raw.priority === 'number' ? raw.priority : undefined,
      statusEffects,
    };
    const artLevel = Math.max(
      1,
      Math.min(10, Math.floor(Number(art.level) || 1))
    );
    moves.push({
      ...artifactSkillToMove(fullDef, artifactId),
      artifactGrant: {
        artifactId: String(artifactId),
        artifactLevel: artLevel,
        artifactName: typeof art.name === 'string' ? art.name : undefined,
      },
    });
  });
  return moves;
}

/**
 * Artifact skill moves from student doc + equippable catalog merge.
 * Pass catalogData when already loaded (e.g. parallel with student) to avoid extra read.
 */
export async function getArtifactSkillMovesForStudentData(
  studentData: Record<string, any>,
  catalogData?: Record<string, unknown> | null
): Promise<Move[]> {
  let eq = studentData.equippedArtifacts;
  if (!eq || typeof eq !== 'object') return [];
  let catalog: Record<string, unknown> | null | undefined = catalogData;
  if (catalog === undefined) {
    try {
      const c = await getDoc(doc(db, 'adminSettings', 'equippableArtifacts'));
      catalog = c.exists() ? (c.data() as Record<string, unknown>) : null;
    } catch {
      catalog = null;
    }
  }
  if (catalog) {
    try {
      eq = enrichEquippedArtifactsFromCatalog(eq, catalog);
    } catch {
      /* ignore */
    }
  }
  return getArtifactSkillsFromEquipped({ ...studentData, equippedArtifacts: eq }, catalog ?? null);
}

/** Fetches student + catalog (parallel); use on Skills/Artifacts UI. */
export async function fetchArtifactSkillMovesForUser(userId: string): Promise<Move[]> {
  try {
    const [studentSnap, catalogData] = await Promise.all([
      getDoc(doc(db, 'students', userId)),
      getDoc(doc(db, 'adminSettings', 'equippableArtifacts'))
        .then((s) => (s.exists() ? (s.data() as Record<string, unknown>) : null))
        .catch(() => null),
    ]);
    if (!studentSnap.exists()) return [];
    return getArtifactSkillMovesForStudentData(studentSnap.data(), catalogData);
  } catch (e) {
    console.warn('[battleSkillsService] fetchArtifactSkillMovesForUser:', e);
    return [];
  }
}

function sortBattlePoolSkills(skills: Move[]): void {
  skills.sort((a, b) => {
    const order = (m: Move) => {
      if (m.category === 'manifest') return 1;
      if (m.category === 'elemental') return 2;
      if (m.id?.startsWith('rr-candy-')) return 3;
      if (m.category === 'system') return 4;
      return 5;
    };
    const ao = order(a);
    const bo = order(b);
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

/** Prefer Manifest → elemental → other; deprioritize base vault system skills in loadouts. */
function pickPreferredLoadout(unlocked: Move[], maxSlots: number): Move[] {
  const sorted = [...unlocked];
  sortBattlePoolSkills(sorted);
  const nonVaultSystem = sorted.filter(
    (m) =>
      !(
        m.category === 'system' &&
        (m.name === 'Vault Hack' || m.name === 'Shield Restoration')
      )
  );
  const pool = nonVaultSystem.length > 0 ? nonVaultSystem : sorted;
  return pool.slice(0, maxSlots);
}

function isBaseVaultSystemMove(m: Move): boolean {
  return (
    m.category === 'system' &&
    (m.name === 'Vault Hack' || m.name === 'Shield Restoration')
  );
}

async function resolveUserManifestId(userId: string, studentData: Record<string, unknown>): Promise<string | null> {
  const { normalizeManifestId } = await import('./battleMovesManifestSync');

  const fromRecord = (data: Record<string, unknown> | undefined | null): string | null => {
    if (!data) return null;
    const m = data.manifest;
    if (m && typeof m === 'object' && typeof (m as { manifestId?: unknown }).manifestId === 'string') {
      return normalizeManifestId((m as { manifestId: string }).manifestId);
    }
    if (typeof m === 'string' && m.trim()) return normalizeManifestId(m);
    return null;
  };

  const fromStudent = fromRecord(studentData);
  if (fromStudent) return fromStudent;

  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const fromUser = fromRecord(userSnap.data() as Record<string, unknown>);
      if (fromUser) return fromUser;
    }
  } catch (e) {
    console.warn('[battleSkillsService] users.manifest lookup failed:', e);
  }
  return null;
}

function persistEquippedSkillIds(userId: string, ids: string[]): void {
  const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
  setDoc(
    skillStateRef,
    {
      equippedSkillIds: ids,
      lastUpdated: serverTimestamp(),
      version: 'v1',
    },
    { merge: true }
  ).catch(() => {});
}

/**
 * Get all unlocked skills eligible for battle
 * 
 * This is the CANONICAL function used by:
 * - BattleEngine (for move selection and execution)
 * - Battle UI components (for displaying available skills)
 * - Multiplayer battle validation
 * 
 * @param userId - User ID
 * @param userElement - User's elemental affinity (e.g., 'fire', 'water')
 * @param battleMoves - Optional: existing moves array from BattleContext (to avoid extra fetch)
 * @returns Array of unlocked Move objects eligible for battle
 */
export async function getUserUnlockedSkillsForBattle(
  userId: string,
  userElement?: string,
  battleMoves?: Move[]
): Promise<Move[]> {
  try {
    // Always prefer Firestore for the target userId. Optional `battleMoves` is only a cache when
    // the caller is sure it matches this userId — never accept it alone if Firestore has data.
    let allMoves: Move[] = [];
    try {
      const movesRef = doc(db, 'battleMoves', userId);
      const movesDoc = await getDoc(movesRef);
      if (movesDoc.exists()) {
        allMoves = (movesDoc.data().moves || []) as Move[];
      }
    } catch (e) {
      console.warn('[battleSkillsService] firestore battleMoves fetch failed, using optional cache if provided', e);
    }
    if (allMoves.length === 0 && battleMoves && battleMoves.length > 0) {
      allMoves = battleMoves;
    }

    // Get user's RR Candy status (never hard-fail the whole skill load for this)
    let rrCandyUnlocked = false;
    let rrCandyType: string | null = null;
    try {
      const rrCandyStatus = await getRRCandyStatusAsync(userId);
      rrCandyUnlocked = rrCandyStatus.unlocked;
      rrCandyType = rrCandyStatus.candyType;
    } catch (e) {
      console.warn('[battleSkillsService] RR Candy status skipped:', e);
    }

    const [studentDoc, catalogData] = await Promise.all([
      getDoc(doc(db, 'students', userId)).catch(() => null),
      getDoc(doc(db, 'adminSettings', 'equippableArtifacts'))
        .then((s) => (s.exists() ? (s.data() as Record<string, unknown>) : null))
        .catch(() => null),
    ]);
    const studentData = (studentDoc && studentDoc.exists() ? studentDoc.data() : {}) as Record<string, unknown>;
    let artifactSkillMoves: Move[] = [];
    try {
      artifactSkillMoves = await getArtifactSkillMovesForStudentData(studentData, catalogData);
    } catch (e) {
      console.warn('[battleSkillsService] artifact skills skipped:', e);
    }

    const userManifest = await resolveUserManifestId(userId, studentData);

    // Self-heal: empty/wrong battleMoves, or no unlocked moves for the chosen Manifest.
    // Always end with in-memory template moves if Firestore is empty or out of date.
    if (userManifest) {
      const unlockedManifest = allMoves.filter((m) => m.category === 'manifest' && m.unlocked);
      const mismatched =
        unlockedManifest.length > 0 &&
        unlockedManifest.some(
          (m) =>
            m.manifestType &&
            m.manifestType.toString().toLowerCase() !== userManifest
        );
      const noneForChosen =
        allMoves.length === 0 ||
        unlockedManifest.length === 0 ||
        !unlockedManifest.some(
          (m) => (m.manifestType || '').toString().toLowerCase() === userManifest
        );
      if (mismatched || noneForChosen) {
        try {
          const {
            syncBattleMovesForManifest,
            buildBattleMovesForManifest,
          } = await import('./battleMovesManifestSync');
          try {
            allMoves = await syncBattleMovesForManifest(userId, userManifest);
          } catch (syncErr) {
            console.warn('[battleSkillsService] auto-sync battleMoves failed, using templates:', syncErr);
            allMoves = buildBattleMovesForManifest(userManifest, {
              existingMoves: allMoves,
              canUseElemental: hasElementalMoveAccess(studentData),
              userElement: (
                (studentData.artifacts as Record<string, unknown> | undefined)?.chosen_element ||
                studentData.elementalAffinity ||
                userElement ||
                ''
              )
                .toString()
                .toLowerCase(),
            });
          }
        } catch (e) {
          console.warn('[battleSkillsService] auto-sync battleMoves to manifest failed:', e);
        }
      }
    }

    if (!userManifest) {
      console.warn(`[battleSkillsService] No valid manifest for user ${userId}; returning non-manifest + artifact skills (+ RR Candy when unlocked)`);
      const canUseElemental = hasElementalMoveAccess(studentData as Record<string, unknown>);
      const base = allMoves.filter(
        (move) =>
          move.category !== 'manifest' &&
          (move.category !== 'elemental' || (canUseElemental && move.unlocked))
      );
      const uniqueSkills = new Map<string, Move>();
      base.forEach(s => uniqueSkills.set(s.id, s));
      artifactSkillMoves.forEach(s => uniqueSkills.set(s.id, s));
      let rrCandySkills: Move[] = [];
      if (rrCandyUnlocked && rrCandyType) {
        const candyType = rrCandyType;
        try {
          rrCandySkills = await getUserRRCandySkills(userId, allMoves);
          rrCandySkills = rrCandySkills.filter((skill) => {
            const id = (skill.id || '').toLowerCase();
            if (!id.startsWith('rr-candy-')) return false;
            const userT = candyType.toLowerCase().replace(/_/g, '-');
            if (userT === 'config') return id.includes('konfig');
            const skillCandyMatch = skill.id.match(/^rr-candy-([^-]+(?:-[^-]+)?)-/);
            const skillCandyType = skillCandyMatch ? skillCandyMatch[1] : null;
            const normalizedSkillType = skillCandyType?.toLowerCase().replace(/_/g, '-');
            return normalizedSkillType === userT;
          });
        } catch (e) {
          console.warn('[battleSkillsService] RR Candy merge failed (no manifest branch):', e);
        }
      }
      rrCandySkills.forEach(s => uniqueSkills.set(s.id, s));
      const finalSkills = Array.from(uniqueSkills.values());
      sortBattlePoolSkills(finalSkills);
      return finalSkills.map(applyCanonicalSkillCostAndCooldown);
    }

    // Get user's element if not provided (Artifacts primary = chosen_element)
    const element = (
      userElement ||
      (studentData.artifacts as Record<string, unknown> | undefined)?.chosen_element ||
      studentData.elementalAffinity ||
      ''
    )
      .toString()
      .toLowerCase();
    const secondaryRaw = getElementalAccessElementFromStudent(studentData as Record<string, unknown>);
    const secondaryElement =
      hasElementalAccessPerkEquipped(
        studentData.equippedArtifacts as Record<string, unknown>,
        catalogData
      ) && secondaryRaw
        ? secondaryRaw
        : '';

    // Filter Manifest Skills
    let manifestSkills = allMoves.filter(move => {
      if (move.category !== 'manifest') return false;
      if (!move.unlocked) return false;
      // Only include moves that match user's manifest
      if (
        move.manifestType &&
        move.manifestType.toString().toLowerCase() !== userManifest
      ) {
        return false;
      }
      return true;
    });

    // Guaranteed Manifest kit when firestore unlocks are still empty (demo / new test accounts)
    if (manifestSkills.length === 0) {
      try {
        const { getManifestSkillsFromTemplates, buildBattleMovesForManifest } = await import(
          './battleMovesManifestSync'
        );
        manifestSkills = getManifestSkillsFromTemplates(userManifest);
        if (allMoves.length === 0) {
          allMoves = buildBattleMovesForManifest(userManifest, {
            existingMoves: [],
            canUseElemental: hasElementalMoveAccess(studentData),
            userElement: element,
          });
        }
      } catch (e) {
        console.warn('[battleSkillsService] template Manifest fallback failed:', e);
      }
    }

    // Elemental skills require Chapter 1-8 Elemental Ring (artifacts.elemental_ring_level_1)
    const canUseElemental = hasElementalMoveAccess(studentData as Record<string, unknown>);
    const elementalSkills = canUseElemental
      ? allMoves.filter(move => {
          if (move.category !== 'elemental') return false;
          if (!move.unlocked) return false;
          const aff = (move.elementalAffinity || '').toString().toLowerCase();
          if (!aff) return false;
          if (element && aff === element) return true;
          if (secondaryElement && aff === secondaryElement) return true;
          return false;
        })
      : [];

    // Get RR Candy Skills (using shared service)
    let rrCandySkills: Move[] = [];
    if (rrCandyUnlocked && rrCandyType) {
      const candyType = rrCandyType;
      try {
        rrCandySkills = await getUserRRCandySkills(userId, allMoves);
        // Filter to only include skills for the user's candy type
        rrCandySkills = rrCandySkills.filter((skill) => {
          const id = (skill.id || '').toLowerCase();
          if (!id.startsWith('rr-candy-')) return false;
          const userT = candyType.toLowerCase().replace(/_/g, '-');
          if (userT === 'config') return id.includes('konfig');
          const skillCandyMatch = skill.id.match(/^rr-candy-([^-]+(?:-[^-]+)?)-/);
          const skillCandyType = skillCandyMatch ? skillCandyMatch[1] : null;
          const normalizedSkillType = skillCandyType?.toLowerCase().replace(/_/g, '-');
          const normalizedUserType = userT;
          return normalizedSkillType === normalizedUserType;
        });
      } catch (e) {
        console.warn('[battleSkillsService] RR Candy skill load skipped:', e);
      }
    }

    const battleSkills: Move[] = [
      ...manifestSkills,
      ...elementalSkills,
      ...rrCandySkills,
      ...artifactSkillMoves,
    ];

    try {
      const lawEffects = await getPlayerUniversalLawEffects(userId);
      if (lawEffects.unlockedSpecificSkillIds.length > 0) {
        const bonusSkills = allMoves.filter((m) =>
          lawEffects.unlockedSpecificSkillIds.includes(m.id)
        );
        battleSkills.push(...bonusSkills);
      }
    } catch (e) {
      console.warn('[battleSkillsService] universal law bonuses skipped:', e);
    }

    const uniqueSkills = new Map<string, Move>();
    battleSkills.forEach(skill => {
      if (!uniqueSkills.has(skill.id)) {
        uniqueSkills.set(skill.id, skill);
      }
    });

    let finalSkills = Array.from(uniqueSkills.values());
    sortBattlePoolSkills(finalSkills);

    // Absolute last resort: always deliver L1 Manifest skills when the player has a Manifest
    if (finalSkills.filter((s) => s.category === 'manifest').length === 0) {
      try {
        const { getManifestSkillsFromTemplates } = await import('./battleMovesManifestSync');
        const local = getManifestSkillsFromTemplates(userManifest);
        finalSkills = [...local, ...finalSkills];
        sortBattlePoolSkills(finalSkills);
      } catch {
        /* ignore */
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 getUserUnlockedSkillsForBattle:', {
        userId,
        userElement: element,
        userManifest,
        rrCandyUnlocked,
        rrCandyType,
        counts: {
          manifest: manifestSkills.length,
          elemental: elementalSkills.length,
          rrCandy: rrCandySkills.length,
          artifact: artifactSkillMoves.length,
          total: finalSkills.length
        },
        skillIds: finalSkills.map(s => s.id),
        skillNames: finalSkills.map(s => s.name)
      });
    }

    return finalSkills.map(applyCanonicalSkillCostAndCooldown);
  } catch (error) {
    console.error('Error fetching battle skills:', error);
    return [];
  }
}

/**
 * Get battle skills with cooldown information (unlocked pool only).
 */
export async function getUserBattleSkillsWithCooldowns(
  userId: string,
  userElement: string | undefined,
  skillCooldowns: Map<string, number>,
  battleMoves?: Move[]
): Promise<Move[]> {
  const skills = await getUserUnlockedSkillsForBattle(userId, userElement, battleMoves);
  return skills.map(skill => ({
    ...skill,
    currentCooldown: skillCooldowns.get(skill.id) || 0
  }));
}

/**
 * Get EQUIPPED skills for battle (unified loadout slots from skill_state).
 * If equippedSkillIds is empty, falls back to the first `maxSlots` unlocked skills.
 * Unlocked RR Candy moves are always appended if missing from the equipped id list (see module header).
 */
export async function getEquippedSkillsForBattle(
  userId: string,
  userElement?: string,
  battleMoves?: Move[]
): Promise<Move[]> {
  try {
    let skillState: Awaited<ReturnType<typeof getPlayerSkillState>> = {
      unlockedNodeIds: [],
      equippedSkillIds: [],
      skillUpgrades: {},
      version: 'v1',
    };
    let unlocked: Move[] = [];
    let maxSlots = 6;

    try {
      skillState = await getPlayerSkillState(userId);
    } catch (e) {
      console.warn('[getEquippedSkillsForBattle] skill_state skipped:', e);
    }

    try {
      unlocked = await getUserUnlockedSkillsForBattle(userId, userElement, battleMoves);
    } catch (e) {
      console.error('[getEquippedSkillsForBattle] unlocked skills failed:', e);
      unlocked = [];
    }

    // Template Manifest fallback if unlocked is still empty (e.g. no firestore profile yet)
    if (unlocked.filter((m) => m.category === 'manifest').length === 0) {
      try {
        const { loadPlayerManifest } = await import('./playerManifestSelection');
        const { getManifestSkillsFromTemplates } = await import('./battleMovesManifestSync');
        const m = await loadPlayerManifest(userId);
        if (m?.manifestId) {
          unlocked = [
            ...getManifestSkillsFromTemplates(m.manifestId).map(applyCanonicalSkillCostAndCooldown),
            ...unlocked,
          ];
        }
      } catch (e) {
        console.warn('[getEquippedSkillsForBattle] template fallback failed:', e);
      }
    }

    try {
      const lawEffects = await getPlayerUniversalLawEffects(userId);
      maxSlots = getMaxLoadoutSlotsFromEffects(lawEffects);
    } catch (e) {
      console.warn('[getEquippedSkillsForBattle] law slots defaulted to 6:', e);
      maxSlots = 6;
    }

    const equippedIds = skillState.equippedSkillIds || [];

    const byId = new Map<string, Move>();
    unlocked.forEach(m => byId.set(m.id, m));

    /** RR Candy, L2, and unlocked elementals are often missing from equippedSkillIds; append so battle matches unlock state. */
    const appendRrCandyAndLevel2Meta = async (base: Move[]): Promise<Move[]> => {
      let out = [...base];
      const rrExtras = unlocked.filter(
        (m) => typeof m.id === 'string' && m.id.startsWith('rr-candy-') && !out.some((b) => b.id === m.id)
      );
      if (rrExtras.length > 0) {
        out = [...out, ...rrExtras];
      }
      const elementalExtras = unlocked.filter(
        (m) => m.category === 'elemental' && !out.some((b) => b.id === m.id)
      );
      if (elementalExtras.length > 0) {
        out = [...out, ...elementalExtras];
      }
      try {
        const l2 = await getActiveLevel2ManifestMove(userId);
        if (l2 && !out.some((m) => m.id === l2.id)) out = [...out, applyCanonicalSkillCostAndCooldown(l2)];
      } catch {
        /* ignore */
      }
      return out;
    };

    const unlockedManifest = unlocked.filter((m) => m.category === 'manifest');
    const rebuildPreferred = (): Move[] => {
      const preferred = pickPreferredLoadout(unlocked, maxSlots);
      if (preferred.length > 0) {
        persistEquippedSkillIds(
          userId,
          preferred.map((m) => m.id)
        );
      }
      return preferred;
    };

    // Demo / onboarding: if player has Manifest skills at all, never return an empty fight menu —
    // always surface at least their Manifest kit (full preferred loadout, not a stale empty equip list).
    if (unlockedManifest.length > 0) {
      if (equippedIds.length > 0) {
        const result: Move[] = [];
        for (const id of equippedIds.slice(0, maxSlots)) {
          const move = byId.get(id);
          if (move) result.push(move);
        }
        const hasManifestEquipped = result.some((m) => m.category === 'manifest');
        const onlyVaultSystem =
          result.length > 0 && result.every((m) => isBaseVaultSystemMove(m));
        if (hasManifestEquipped && !onlyVaultSystem && result.length > 0) {
          return appendRrCandyAndLevel2Meta(result);
        }
      }
      const preferred = rebuildPreferred();
      if (preferred.length > 0) {
        return appendRrCandyAndLevel2Meta(preferred);
      }
      // Prefer every unlocked Manifest skill over empty
      return appendRrCandyAndLevel2Meta(unlockedManifest.slice(0, maxSlots));
    }

    if (equippedIds.length > 0) {
      const result: Move[] = [];
      for (const id of equippedIds.slice(0, maxSlots)) {
        const move = byId.get(id);
        if (move) result.push(move);
      }
      if (result.length > 0) {
        return appendRrCandyAndLevel2Meta(result);
      }
    }

    return appendRrCandyAndLevel2Meta(rebuildPreferred());
  } catch (error) {
    console.error('Error getEquippedSkillsForBattle:', error);
    // Last-chance: templates from saved Manifest so demo fights are never unusable
    try {
      const { loadPlayerManifest } = await import('./playerManifestSelection');
      const { getManifestSkillsFromTemplates } = await import('./battleMovesManifestSync');
      const m = await loadPlayerManifest(userId);
      if (m?.manifestId) {
        return getManifestSkillsFromTemplates(m.manifestId).map(applyCanonicalSkillCostAndCooldown);
      }
    } catch {
      /* ignore */
    }
    return [];
  }
}




