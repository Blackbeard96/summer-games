/** Data-attribute value for status mini-VFX on portraits (BattleArena). */
export function statusEffectVisualClass(effectType: string): string {
  const t = effectType.toLowerCase();
  const map: Record<string, string> = {
    burn: 'mst-st-burn',
    poison: 'mst-st-poison',
    shock: 'mst-st-shock',
    dread: 'mst-st-dread',
    root: 'mst-st-root',
    silence: 'mst-st-silence',
    stun: 'mst-st-stun',
    fortify: 'mst-st-fortify',
    accuracy: 'mst-st-accuracy',
    bleed: 'mst-st-bleed',
    freeze: 'mst-st-freeze',
    confuse: 'mst-st-confuse',
    drain: 'mst-st-drain',
  };
  return map[t] || 'mst-st-generic';
}
