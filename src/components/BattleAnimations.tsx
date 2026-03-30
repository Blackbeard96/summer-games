/**
 * Back-compat wrapper: battle flow still sets currentAnimation + isAnimating; logic resolves after
 * SkillAnimationLayer finishes (BattleEngine.handleAnimationComplete). See src/skillAnimation/ for types,
 * registry, templates, and timeline hooks.
 */
import React from 'react';
import SkillAnimationLayer, {
  type SkillAnimationLayerPublicProps,
} from './skillAnimation/SkillAnimationLayer';

type BattleAnimationsProps = SkillAnimationLayerPublicProps;

const BattleAnimations: React.FC<BattleAnimationsProps> = (props) => {
  return <SkillAnimationLayer {...props} />;
};

export default BattleAnimations;
