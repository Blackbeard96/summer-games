/**
 * Skill Card artwork: pure helpers (no Firebase) for keys, default art, resolution and upload validation.
 */

export type SkillArtCategory = 'manifest' | 'elemental' | 'system' | 'cpu' | 'unknown';

export interface SkillArtEntry {
  imageUrl: string;
  imageStoragePath?: string;
  skillName?: string;
  category?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export type SkillArtEntries = Record<string, SkillArtEntry>;

/** Minimal skill shape the resolver needs (Move, CPU move rows, action cards). */
export interface SkillArtInput {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  elementalAffinity?: string | null;
  manifestType?: string | null;
  imageUrl?: string | null;
}

export type SkillArtSource = 'custom' | 'category' | 'universal';

export interface ResolvedSkillArt {
  src: string;
  source: SkillArtSource;
  /** Always-valid fallback for `<img onError>`. */
  fallbackSrc: string;
}

export const SKILL_ART_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const SKILL_ART_MAX_BYTES = 2 * 1024 * 1024;

/** Firestore field-path safe key: lowercase letters, digits and underscores only. */
export const normalizeSkillArtKey = (raw: string | null | undefined): string => {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
};

export const validateSkillArtFile = (file: { type: string; size: number }): string | null => {
  if (!(SKILL_ART_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return 'Artwork must be a PNG, JPG, or WebP image.';
  }
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > SKILL_ART_MAX_BYTES) {
    return `Artwork must be ${Math.round(SKILL_ART_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  return null;
};

const ELEMENT_ART: Record<string, { color: string; glyph: string }> = {
  fire: { color: '#ef5a2a', glyph: 'M150 52c18 26 40 44 40 76a40 40 0 0 1-80 0c0-18 10-30 18-40 2 14 8 22 16 26-4-22 0-42 6-62z' },
  water: { color: '#3b8df2', glyph: 'M150 50c22 32 42 56 42 82a42 42 0 0 1-84 0c0-26 20-50 42-82z' },
  air: { color: '#9b7cf6', glyph: 'M96 96h80a22 22 0 1 0-22-22M96 124h104a22 22 0 1 1-22 22M96 152h56' },
  earth: { color: '#3fa36b', glyph: 'M82 160l46-78 22 36 16-24 52 66z' },
  lightning: { color: '#f5b52a', glyph: 'M162 46l-52 78h34l-16 64 56-86h-36z' },
  light: { color: '#f3d36b', glyph: 'M150 82a32 32 0 1 1 0 64a32 32 0 1 1 0-64zM150 50v18M150 160v18M98 114h18M184 114h18M114 78l12 12M174 138l12 12M186 78l-12 12M126 138l-12 12' },
  shadow: { color: '#8a7fb0', glyph: 'M168 62a54 54 0 1 0 0 104a44 44 0 1 1 0-104z' },
  dark: { color: '#8a7fb0', glyph: 'M168 62a54 54 0 1 0 0 104a44 44 0 1 1 0-104z' },
  metal: { color: '#b8c2cc', glyph: 'M150 58l48 28v56l-48 28-48-28V86z' },
};

const MANIFEST_GLYPH = 'M150 56l14 40 42 2-33 26 12 40-35-24-35 24 12-40-33-26 42-2z';
const UNIVERSAL_GLYPH = 'M150 50l52 64-52 64-52-64zM150 78l29 36-29 36-29-36z';

const svgDataUri = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const buildDefaultArt = (accent: string, glyph: string, stroke: boolean, label: string): string =>
  svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 228" width="300" height="228">` +
      `<defs>` +
      `<radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${accent}" stop-opacity="0.55"/><stop offset="0.55" stop-color="#140f2a"/><stop offset="1" stop-color="#05070d"/></radialGradient>` +
      `<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0c96a"/><stop offset="1" stop-color="#8a6a2c"/></linearGradient>` +
      `</defs>` +
      `<rect width="300" height="228" fill="url(#g)"/>` +
      `<rect x="6" y="6" width="288" height="216" rx="10" fill="none" stroke="url(#f)" stroke-width="2"/>` +
      `<circle cx="150" cy="114" r="78" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5"/>` +
      `<circle cx="150" cy="114" r="90" fill="none" stroke="#d4a84f" stroke-opacity="0.25" stroke-dasharray="3 7"/>` +
      (stroke
        ? `<path d="${glyph}" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${glyph}" fill="${accent}" fill-opacity="0.92" stroke="#f0c96a" stroke-width="2" stroke-linejoin="round"/>`) +
      `<text x="150" y="212" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="11" letter-spacing="4" fill="#d4a84f" fill-opacity="0.85">${label}</text>` +
      `</svg>`
  );

const STROKE_GLYPHS = new Set(['air', 'light']);
const defaultArtCache = new Map<string, string>();

export const UNIVERSAL_SKILL_ART_KEY = 'universal';

/** Default artwork key: elemental element, manifest, or universal. */
export const getDefaultSkillArtKey = (skill: SkillArtInput | null | undefined): string => {
  const element = (skill?.elementalAffinity || '').toLowerCase();
  if ((skill?.category === 'elemental' || skill?.category === 'cpu') && ELEMENT_ART[element]) return `elemental_${element}`;
  if (skill?.category === 'elemental') return 'elemental';
  if (skill?.category === 'manifest') return 'manifest';
  return UNIVERSAL_SKILL_ART_KEY;
};

export const getDefaultSkillArt = (key: string): string => {
  const cached = defaultArtCache.get(key);
  if (cached) return cached;
  let art: string;
  if (key.startsWith('elemental_')) {
    const element = key.slice('elemental_'.length);
    const def = ELEMENT_ART[element] || ELEMENT_ART.fire;
    art = buildDefaultArt(def.color, def.glyph, STROKE_GLYPHS.has(element), `${element.toUpperCase()} · ELEMENTAL`);
  } else if (key === 'elemental') {
    art = buildDefaultArt('#d4a84f', UNIVERSAL_GLYPH, false, 'ELEMENTAL');
  } else if (key === 'manifest') {
    art = buildDefaultArt('#6d3ef2', MANIFEST_GLYPH, false, 'MANIFEST');
  } else {
    art = buildDefaultArt('#d4a84f', UNIVERSAL_GLYPH, false, 'MST');
  }
  defaultArtCache.set(key, art);
  return art;
};

const isUsableUrl = (url: unknown): url is string =>
  typeof url === 'string' && /^(https:\/\/|data:image\/|\/)/.test(url.trim());

/**
 * Lookup keys for a skill, in priority order. `extraNames` lets callers pass the template name
 * and the admin display name so renamed skills still find their artwork.
 */
export const getSkillArtLookupKeys = (skill: SkillArtInput, extraNames: Array<string | null | undefined> = []): string[] => {
  const keys = [skill.id, skill.name, ...extraNames].map(normalizeSkillArtKey).filter(Boolean);
  return Array.from(new Set(keys));
};

/** Priority: skill's own imageUrl → admin artwork entry → category/element default → universal default. */
export const resolveSkillArtwork = (
  skill: SkillArtInput | null | undefined,
  entries: SkillArtEntries | null | undefined,
  extraNames: Array<string | null | undefined> = []
): ResolvedSkillArt => {
  const defaultKey = getDefaultSkillArtKey(skill);
  const categoryDefault = getDefaultSkillArt(defaultKey);
  const universal = getDefaultSkillArt(UNIVERSAL_SKILL_ART_KEY);

  if (skill && isUsableUrl(skill.imageUrl)) {
    return { src: skill.imageUrl, source: 'custom', fallbackSrc: categoryDefault };
  }
  if (skill && entries) {
    for (const key of getSkillArtLookupKeys(skill, extraNames)) {
      const url = entries[key]?.imageUrl;
      if (isUsableUrl(url)) return { src: url, source: 'custom', fallbackSrc: categoryDefault };
    }
  }
  if (defaultKey !== UNIVERSAL_SKILL_ART_KEY) {
    return { src: categoryDefault, source: 'category', fallbackSrc: universal };
  }
  return { src: universal, source: 'universal', fallbackSrc: universal };
};

export const getSkillCategoryLabel = (skill: SkillArtInput | null | undefined): string => {
  if (skill?.category === 'manifest') return 'Manifest';
  if (skill?.category === 'elemental') {
    const element = (skill.elementalAffinity || '').trim();
    return element ? `${element.charAt(0).toUpperCase()}${element.slice(1)} · Elemental` : 'Elemental';
  }
  if (skill?.category === 'system') return 'System';
  if (skill?.category === 'cpu') return 'Enemy Skill';
  return 'Skill';
};
