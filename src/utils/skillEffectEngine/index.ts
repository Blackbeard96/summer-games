/**
 * MST Skill Effects Engine — public entry for battle + admin.
 *
 * How to add a new effect: see module comment in `./core.ts`.
 */

export * from './core';
export * from './validate';
export * from './legacyAdapter';
export { mergeSkillEffectsIntoResolvedSkillAction } from './resolverBridge';
