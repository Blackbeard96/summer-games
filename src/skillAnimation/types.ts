/**
 * Modular skill animation system — types only.
 *
 * AUDIT (Battle integration): Skills are defined in src/types/battle.ts (Move). Battle flow lives in
 * src/components/BattleEngine.tsx: executePlayerMove sets currentAnimation + isAnimating; BattleAnimations
 * (now backed by SkillAnimationLayer) runs, then onAnimationComplete -> handleAnimationComplete applies
 * damage, shields, debuffs, cooldowns, and appends battle log. Framer Motion is not used; CSS keyframes
 * and inline styles match existing BattleAnimations patterns.
 */

import type { Move } from '../types/battle';

export type SkillCastType = 'stance' | 'weaponRaise' | 'charge' | 'snap' | 'none';
export type SkillDeliveryType = 'projectile' | 'beam' | 'instant' | 'self' | 'aoeZone' | 'melee';
export type SkillImpactType =
  | 'explode'
  | 'slash'
  | 'shockwave'
  | 'mark'
  | 'healPulse'
  | 'barrier'
  | 'glitch'
  | 'scan';

export type SkillElementKey =
  | 'fire'
  | 'water'
  | 'air'
  | 'earth'
  | 'lightning'
  | 'light'
  | 'shadow'
  | 'truth';

export type SkillManifestKey =
  | 'reading'
  | 'writing'
  | 'drawing'
  | 'athletics'
  | 'singing'
  | 'gaming'
  | 'observation'
  | 'empathy'
  | 'creating'
  | 'cooking';

export type SkillTargetPresentation = 'self' | 'singleEnemy' | 'singleAlly' | 'team' | 'allEnemies' | 'room';

export type SkillTone = 'clean' | 'aggressive' | 'mystic' | 'tactical' | 'supportive';

export type AnimationTier = 1 | 2 | 3 | 4;

export interface SkillAnimationProfile {
  castType: SkillCastType;
  deliveryType: SkillDeliveryType;
  impactType: SkillImpactType;
  element?: SkillElementKey;
  manifest?: SkillManifestKey;
  tier: AnimationTier;
  targetType: SkillTargetPresentation;
  tone: SkillTone;
}

export type VfxQuality = 'low' | 'medium' | 'high';

export interface SkillVfxTimings {
  castMs: number;
  manifestationMs?: number;
  travelMs?: number;
  impactDelayMs?: number;
  afterMs?: number;
}

export interface SkillVfxCamera {
  zoom?: number;
  shake?: 'none' | 'light' | 'medium' | 'heavy';
  panToTarget?: boolean;
}

export interface SkillVfxLayers {
  castEffect?: string;
  chargeEffect?: string;
  projectileEffect?: string;
  trailEffect?: string;
  impactEffect?: string;
  statusEffect?: string;
  afterEffect?: string;
}

export interface SkillVfxSfx {
  cast?: string;
  release?: string;
  hit?: string;
  loop?: string;
}

export interface SkillVfxUi {
  showSkillName?: boolean;
  showElementBadge?: boolean;
  colorTheme?: string;
}

/** Optional artifact prop / overlay hint for cast phase (data only; rendering uses keys). */
export interface SkillArtifactVisualHint {
  prop?: 'pen' | 'gauntlet' | 'compass' | 'ring' | 'mic' | 'card' | 'hudLens';
  tint?: string;
}

export interface SkillVfxLogHooks {
  /** When true, BattleEngine prepends a cast line when the animation begins. */
  prependCastLine?: boolean;
  /** Template: %a = actor name, %s = skill name */
  castLineTemplate?: string;
}

export interface SkillVfxConfig {
  id: string;
  name: string;
  templateId?: string;
  profile: SkillAnimationProfile;
  timings: SkillVfxTimings;
  camera?: SkillVfxCamera;
  vfx?: SkillVfxLayers;
  sfx?: SkillVfxSfx;
  ui?: SkillVfxUi;
  artifactVisual?: SkillArtifactVisualHint;
  log?: SkillVfxLogHooks;
}

/** Runtime hooks for orchestrator (visual + optional parent callbacks). */
export type SkillAnimationRuntimeEvent =
  | 'onCastStart'
  | 'onCastCharge'
  | 'onCastRelease'
  | 'onManifestationPeak'
  | 'onProjectileSpawn'
  | 'onProjectileHit'
  | 'onEffectApply'
  | 'onAfterEffectStart'
  | 'onAnimationComplete';

export interface SkillAnimationPhasePayload {
  event: SkillAnimationRuntimeEvent;
  move: Move;
  config: SkillVfxConfig;
  quality: VfxQuality;
}

export type SkillAnimationEventCallback = (payload: SkillAnimationPhasePayload) => void;

/** Target reaction hints for CSS layers (no gameplay state). */
export type SkillTargetReaction =
  | 'none'
  | 'flinch'
  | 'shieldHit'
  | 'stagger'
  | 'healed'
  | 'buffed'
  | 'debuffed'
  | 'shockJitter';

export interface SkillAnimationLayerProps {
  move: Move | null;
  isPlayerMove: boolean;
  onAnimationComplete: () => void;
  /** Fired at logical timeline points (visual sync; gameplay still completes after full duration). */
  onPhase?: SkillAnimationEventCallback;
  quality?: VfxQuality;
  actorDisplayName?: string;
}
