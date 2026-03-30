import { ACTION_CARD_TEMPLATES, type ActionCard } from '../types/battle';

/**
 * Overlay admin-defined action card stats onto the player's saved cards while
 * preserving progress fields (id, unlocked, uses, mastery).
 */
export function mergeUserActionCardsWithAdmin(
  userCards: ActionCard[],
  adminCards: ActionCard[] | null | undefined
): ActionCard[] {
  if (!adminCards?.length) return userCards;
  const byName = new Map(adminCards.map((c) => [c.name, c]));
  return userCards.map((uc) => {
    const ac = byName.get(uc.name);
    if (!ac) return uc;
    return {
      ...ac,
      id: uc.id,
      unlocked: uc.unlocked,
      uses: uc.uses,
      masteryLevel: uc.masteryLevel,
    };
  });
}

/** Initial deck: templates with optional admin overrides by card name. */
export function buildInitialActionCardsFromAdmin(
  adminCards: ActionCard[] | null | undefined
): ActionCard[] {
  const byName = adminCards?.length ? new Map(adminCards.map((c) => [c.name, c])) : null;
  return ACTION_CARD_TEMPLATES.map((template, index) => {
    const admin = byName?.get(template.name);
    const merged = admin ? { ...template, ...admin, effect: admin.effect ?? template.effect } : { ...template };
    return {
      ...merged,
      id: `card_${index + 1}`,
      unlocked: index < 2,
    } as ActionCard;
  });
}
