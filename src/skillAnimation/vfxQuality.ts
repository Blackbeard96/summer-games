import type { VfxQuality } from './types';

const STORAGE_KEY = 'mst_vfx_quality';

export function getStoredVfxQuality(): VfxQuality {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    /* ignore */
  }
  return 'high';
}

export function setStoredVfxQuality(q: VfxQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, q);
  } catch {
    /* ignore */
  }
}

/** Scale particle / flash intensity: low fights clutter in busy battles. */
export function vfxDensityScale(quality: VfxQuality): number {
  switch (quality) {
    case 'low':
      return 0.35;
    case 'medium':
      return 0.65;
    case 'high':
      return 1;
    default:
      return 1;
  }
}
