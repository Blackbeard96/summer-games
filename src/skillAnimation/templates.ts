import type { SkillAnimationProfile, SkillVfxConfig, SkillVfxTimings } from './types';

export type TemplateId =
  | 'quickProjectile'
  | 'heavyProjectile'
  | 'beam'
  | 'meleeRush'
  | 'aoeBurst'
  | 'selfBarrier'
  | 'singleTargetShield'
  | 'teamShieldPulse'
  | 'healPulse'
  | 'healOverTimeAura'
  | 'silenceMark'
  | 'rootBind'
  | 'stunBurst'
  | 'cooldownDisrupt'
  | 'debuffPulse'
  | 'targetScan'
  | 'roomScan'
  | 'weakPointReveal'
  | 'buffExpose'
  | 'loadoutReveal'
  | 'glitchPulse'
  | 'refractionCopy'
  | 'lockoutSeal'
  | 'systemRewrite';

const T: Record<TemplateId, { profile: SkillAnimationProfile; timings: SkillVfxTimings; vfxKeys: SkillVfxConfig['vfx'] }> = {
  quickProjectile: {
    profile: {
      castType: 'snap',
      deliveryType: 'projectile',
      impactType: 'explode',
      tier: 1,
      targetType: 'singleEnemy',
      tone: 'aggressive',
    },
    timings: { castMs: 180, manifestationMs: 80, travelMs: 260, impactDelayMs: 30, afterMs: 160 },
    vfxKeys: { castEffect: 'spark', projectileEffect: 'bolt', impactEffect: 'burst', afterEffect: 'emberLinger' },
  },
  heavyProjectile: {
    profile: {
      castType: 'charge',
      deliveryType: 'projectile',
      impactType: 'explode',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'aggressive',
    },
    timings: { castMs: 320, manifestationMs: 200, travelMs: 340, impactDelayMs: 50, afterMs: 240 },
    vfxKeys: { chargeEffect: 'orbForm', projectileEffect: 'heavyOrb', impactEffect: 'shockwave', afterEffect: 'debris' },
  },
  beam: {
    profile: {
      castType: 'weaponRaise',
      deliveryType: 'beam',
      impactType: 'slash',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'clean',
    },
    timings: { castMs: 220, manifestationMs: 120, travelMs: 200, impactDelayMs: 40, afterMs: 180 },
    vfxKeys: { castEffect: 'focusLine', projectileEffect: 'beamCore', impactEffect: 'slashFlash', trailEffect: 'beamTrail' },
  },
  meleeRush: {
    profile: {
      castType: 'stance',
      deliveryType: 'melee',
      impactType: 'slash',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'aggressive',
    },
    timings: { castMs: 200, manifestationMs: 100, travelMs: 180, impactDelayMs: 20, afterMs: 200 },
    vfxKeys: { castEffect: 'rushWind', impactEffect: 'arcSlash', afterEffect: 'speedLines' },
  },
  aoeBurst: {
    profile: {
      castType: 'charge',
      deliveryType: 'aoeZone',
      impactType: 'shockwave',
      tier: 3,
      targetType: 'allEnemies',
      tone: 'aggressive',
    },
    timings: { castMs: 280, manifestationMs: 240, travelMs: 120, impactDelayMs: 60, afterMs: 320 },
    vfxKeys: { chargeEffect: 'groundSigil', impactEffect: 'ringBurst', afterEffect: 'fieldHaze' },
  },
  selfBarrier: {
    profile: {
      castType: 'stance',
      deliveryType: 'self',
      impactType: 'barrier',
      tier: 1,
      targetType: 'self',
      tone: 'supportive',
    },
    timings: { castMs: 200, manifestationMs: 160, travelMs: 0, impactDelayMs: 20, afterMs: 220 },
    vfxKeys: { castEffect: 'selfGlow', impactEffect: 'barrierShell', afterEffect: 'shieldSheen' },
  },
  singleTargetShield: {
    profile: {
      castType: 'snap',
      deliveryType: 'instant',
      impactType: 'barrier',
      tier: 1,
      targetType: 'singleAlly',
      tone: 'supportive',
    },
    timings: { castMs: 180, manifestationMs: 140, travelMs: 80, impactDelayMs: 20, afterMs: 200 },
    vfxKeys: { castEffect: 'glyph', impactEffect: 'shieldPlate', afterEffect: 'hexFlicker' },
  },
  teamShieldPulse: {
    profile: {
      castType: 'charge',
      deliveryType: 'aoeZone',
      impactType: 'barrier',
      tier: 3,
      targetType: 'team',
      tone: 'supportive',
    },
    timings: { castMs: 260, manifestationMs: 220, travelMs: 100, impactDelayMs: 40, afterMs: 300 },
    vfxKeys: { chargeEffect: 'teamRipple', impactEffect: 'domePulse', afterEffect: 'linkLines' },
  },
  healPulse: {
    profile: {
      castType: 'stance',
      deliveryType: 'instant',
      impactType: 'healPulse',
      tier: 1,
      targetType: 'singleAlly',
      tone: 'supportive',
    },
    timings: { castMs: 200, manifestationMs: 180, travelMs: 60, impactDelayMs: 30, afterMs: 240 },
    vfxKeys: { castEffect: 'warmBloom', impactEffect: 'plusBurst', afterEffect: 'sparkleRise' },
  },
  healOverTimeAura: {
    profile: {
      castType: 'stance',
      deliveryType: 'self',
      impactType: 'healPulse',
      tier: 2,
      targetType: 'self',
      tone: 'mystic',
    },
    timings: { castMs: 240, manifestationMs: 200, travelMs: 0, impactDelayMs: 40, afterMs: 360 },
    vfxKeys: { castEffect: 'auraWisp', impactEffect: 'regenLoop', afterEffect: 'softGlow' },
  },
  silenceMark: {
    profile: {
      castType: 'snap',
      deliveryType: 'instant',
      impactType: 'mark',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'tactical',
    },
    timings: { castMs: 160, manifestationMs: 120, travelMs: 100, impactDelayMs: 30, afterMs: 260 },
    vfxKeys: { castEffect: 'sealRing', impactEffect: 'muteWave', statusEffect: 'silenceIcon' },
  },
  rootBind: {
    profile: {
      castType: 'charge',
      deliveryType: 'instant',
      impactType: 'mark',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'mystic',
    },
    timings: { castMs: 220, manifestationMs: 180, travelMs: 80, impactDelayMs: 40, afterMs: 280 },
    vfxKeys: { chargeEffect: 'vineSketch', impactEffect: 'bindLoop', statusEffect: 'rootAnchor' },
  },
  stunBurst: {
    profile: {
      castType: 'snap',
      deliveryType: 'instant',
      impactType: 'shockwave',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'aggressive',
    },
    timings: { castMs: 140, manifestationMs: 100, travelMs: 120, impactDelayMs: 20, afterMs: 220 },
    vfxKeys: { castEffect: 'sparkBurst', impactEffect: 'stunStar', statusEffect: 'dizzyRing' },
  },
  cooldownDisrupt: {
    profile: {
      castType: 'weaponRaise',
      deliveryType: 'beam',
      impactType: 'glitch',
      tier: 3,
      targetType: 'singleEnemy',
      tone: 'tactical',
    },
    timings: { castMs: 200, manifestationMs: 160, travelMs: 140, impactDelayMs: 40, afterMs: 280 },
    vfxKeys: { castEffect: 'clockCrack', impactEffect: 'glitchShard', statusEffect: 'timerBreak' },
  },
  debuffPulse: {
    profile: {
      castType: 'charge',
      deliveryType: 'aoeZone',
      impactType: 'mark',
      tier: 3,
      targetType: 'allEnemies',
      tone: 'mystic',
    },
    timings: { castMs: 260, manifestationMs: 200, travelMs: 100, impactDelayMs: 50, afterMs: 300 },
    vfxKeys: { chargeEffect: 'miasma', impactEffect: 'pulseDown', statusEffect: 'debuffCloud' },
  },
  targetScan: {
    profile: {
      castType: 'stance',
      deliveryType: 'instant',
      impactType: 'scan',
      tier: 1,
      targetType: 'singleEnemy',
      tone: 'tactical',
    },
    timings: { castMs: 200, manifestationMs: 220, travelMs: 120, impactDelayMs: 40, afterMs: 280 },
    vfxKeys: { castEffect: 'reticle', projectileEffect: 'scanLine', impactEffect: 'dataFlash', afterEffect: 'tagLinger' },
  },
  roomScan: {
    profile: {
      castType: 'charge',
      deliveryType: 'aoeZone',
      impactType: 'scan',
      tier: 2,
      targetType: 'room',
      tone: 'tactical',
    },
    timings: { castMs: 240, manifestationMs: 280, travelMs: 160, impactDelayMs: 60, afterMs: 360 },
    vfxKeys: { chargeEffect: 'gridExpand', impactEffect: 'radarSweep', afterEffect: 'cornerTags' },
  },
  weakPointReveal: {
    profile: {
      castType: 'snap',
      deliveryType: 'instant',
      impactType: 'mark',
      tier: 3,
      targetType: 'singleEnemy',
      tone: 'tactical',
    },
    timings: { castMs: 180, manifestationMs: 200, travelMs: 100, impactDelayMs: 30, afterMs: 320 },
    vfxKeys: { castEffect: 'eyeGlow', impactEffect: 'weakDiamond', afterEffect: 'critHint' },
  },
  buffExpose: {
    profile: {
      castType: 'stance',
      deliveryType: 'instant',
      impactType: 'mark',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'tactical',
    },
    timings: { castMs: 200, manifestationMs: 160, travelMs: 90, impactDelayMs: 30, afterMs: 240 },
    vfxKeys: { castEffect: 'analysisRing', impactEffect: 'buffTags', afterEffect: 'infoStrip' },
  },
  loadoutReveal: {
    profile: {
      castType: 'charge',
      deliveryType: 'beam',
      impactType: 'scan',
      tier: 3,
      targetType: 'room',
      tone: 'tactical',
    },
    timings: { castMs: 260, manifestationMs: 260, travelMs: 140, impactDelayMs: 50, afterMs: 340 },
    vfxKeys: { chargeEffect: 'hudBoot', impactEffect: 'panelStack', afterEffect: 'wireframe' },
  },
  glitchPulse: {
    profile: {
      castType: 'snap',
      deliveryType: 'instant',
      impactType: 'glitch',
      tier: 2,
      targetType: 'singleEnemy',
      tone: 'clean',
    },
    timings: { castMs: 120, manifestationMs: 100, travelMs: 100, impactDelayMs: 20, afterMs: 260 },
    vfxKeys: { castEffect: 'rgbSplit', impactEffect: 'noiseBurst', afterEffect: 'scanLineGlitch' },
  },
  refractionCopy: {
    profile: {
      castType: 'charge',
      deliveryType: 'instant',
      impactType: 'glitch',
      tier: 3,
      targetType: 'singleEnemy',
      tone: 'mystic',
    },
    timings: { castMs: 260, manifestationMs: 240, travelMs: 120, impactDelayMs: 50, afterMs: 360 },
    vfxKeys: { chargeEffect: 'mirrorFold', impactEffect: 'doubleImage', afterEffect: 'shimmer' },
  },
  lockoutSeal: {
    profile: {
      castType: 'weaponRaise',
      deliveryType: 'instant',
      impactType: 'mark',
      tier: 3,
      targetType: 'singleEnemy',
      tone: 'tactical',
    },
    timings: { castMs: 220, manifestationMs: 200, travelMs: 100, impactDelayMs: 40, afterMs: 300 },
    vfxKeys: { castEffect: 'lockRing', impactEffect: 'sealStamp', statusEffect: 'lockIcon' },
  },
  systemRewrite: {
    profile: {
      castType: 'charge',
      deliveryType: 'aoeZone',
      impactType: 'glitch',
      tier: 4,
      targetType: 'room',
      tone: 'clean',
    },
    timings: { castMs: 360, manifestationMs: 400, travelMs: 200, impactDelayMs: 80, afterMs: 520 },
    vfxKeys: { chargeEffect: 'codeRain', impactEffect: 'arenaGlitch', afterEffect: 'ruleText' },
  },
};

export function getTemplate(id: TemplateId): (typeof T)[TemplateId] {
  return T[id];
}

export function listTemplateIds(): TemplateId[] {
  return Object.keys(T) as TemplateId[];
}
