/**
 * Perk display lines for MST Marketplace equippable listings (source: equippable catalog).
 */

import { ARTIFACT_PERK_OPTIONS, type ArtifactPerkOption } from '../constants/artifactPerks';
import {
  extractArtifactSkillFromEquippableRow,
  findEquippableDefinitionRow,
  mergeEquippableCatalogLayers,
} from './battleSkillsService';

function resolveStoredPerkToOption(raw: string): ArtifactPerkOption | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const byId = ARTIFACT_PERK_OPTIONS.find((o) => o.id === s);
  if (byId) return byId;
  const lower = s.toLowerCase();
  return ARTIFACT_PERK_OPTIONS.find(
    (o) => o.label === s || o.label.toLowerCase() === lower
  );
}

export interface MarketplaceEquippablePerkLine {
  label: string;
  description: string;
}

/**
 * Rows to show under "Perks when equipped" for a marketplace listing that grants
 * `equippableArtifactId`. Uses merged catalog (defaults + Firestore + admin).
 */
export function getEquippablePerkDisplayRows(
  equippableArtifactId: string,
  catalogMerged: Record<string, unknown> | null | undefined
): MarketplaceEquippablePerkLine[] {
  const id = equippableArtifactId.trim();
  if (!id) return [];

  const catalog =
    catalogMerged && typeof catalogMerged === 'object'
      ? catalogMerged
      : mergeEquippableCatalogLayers(undefined);

  const row = findEquippableDefinitionRow(catalog, { id });
  if (!row || typeof row !== 'object') return [];

  const out: MarketplaceEquippablePerkLine[] = [];

  const perkIds = Array.isArray((row as { perks?: unknown }).perks)
    ? ((row as { perks: unknown[] }).perks.filter((p): p is string => typeof p === 'string'))
    : [];

  for (const pid of perkIds) {
    const opt = resolveStoredPerkToOption(pid);
    if (opt) {
      out.push({ label: opt.label, description: opt.description });
    }
  }

  const sk = extractArtifactSkillFromEquippableRow(row as Record<string, unknown>);
  if (sk && typeof sk.name === 'string' && sk.name.trim()) {
    out.push({
      label: `Grants skill: ${sk.name.trim()}`,
      description: typeof sk.description === 'string' && sk.description.trim() ? sk.description.trim() : '',
    });
  }

  if (out.length === 0) {
    const stats = (row as { stats?: Record<string, number> }).stats;
    if (stats && typeof stats === 'object') {
      if (typeof stats.manifestDamageBoost === 'number' && stats.manifestDamageBoost > 0) {
        out.push({
          label: 'Manifest damage',
          description: `+${Math.round(stats.manifestDamageBoost * 100)}% damage from manifest-category skills.`,
        });
      }
      if (typeof stats.elementalDamageBoost === 'number' && stats.elementalDamageBoost > 0) {
        out.push({
          label: 'Elemental damage',
          description: `+${Math.round(stats.elementalDamageBoost * 100)}% damage from elemental-category skills.`,
        });
      }
      if (typeof stats.damageBoost === 'number' && stats.damageBoost > 0) {
        out.push({
          label: 'Damage',
          description: `+${Math.round(stats.damageBoost * 100)}% damage from skills.`,
        });
      }
    }
    const plb = (row as { powerLevelBonus?: number }).powerLevelBonus;
    if (typeof plb === 'number' && plb > 0 && out.length === 0) {
      out.push({
        label: 'Power level',
        description: `+${Math.floor(plb)} power level while equipped.`,
      });
    }
  }

  return out;
}
