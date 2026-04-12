/** Default max human allies in Mission / Island Raid co-op (MST team scale). */
export const DEFAULT_MAX_ALLIED_PARTICIPANTS = 4;

/** Firestore field: mid-battle join / reinforcements allowed (rules + UI). */
export const JOINABLE_MID_BATTLE_FIELD = 'joinableMidBattle' as const;

/** When true, opening the battle URL does not auto-`arrayUnion` the user; they use Join CTA. */
export const REQUIRE_EXPLICIT_JOIN_FIELD = 'requireExplicitJoin' as const;
