import React, { useEffect, useState } from 'react';
import { resolveSkillArtworkSync, subscribeSkillArtwork } from '../../utils/skillArtwork';
import { getDefaultSkillArt, UNIVERSAL_SKILL_ART_KEY, type SkillArtInput } from '../../utils/skillArtworkDefaults';

interface SkillCardArtProps {
  skill: SkillArtInput | null | undefined;
  /** Preview a specific URL (admin editor) instead of resolving from the skill. */
  overrideSrc?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Skill artwork that can never render as a broken image: custom → category default → universal. */
const SkillCardArt: React.FC<SkillCardArtProps> = ({ skill, overrideSrc, alt, className, style }) => {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeSkillArtwork(() => setVersion((v) => v + 1)), []);

  const resolved = resolveSkillArtworkSync(skill);
  const primary = overrideSrc || resolved.src;
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    setFailed([]);
  }, [primary]);

  const chain = [primary, resolved.fallbackSrc, getDefaultSkillArt(UNIVERSAL_SKILL_ART_KEY)];
  const src = chain.find((s) => !failed.includes(s)) || chain[chain.length - 1];

  return (
    <img
      src={src}
      alt={alt ?? (skill?.name ? `${skill.name} artwork` : 'Skill artwork')}
      className={className}
      style={style}
      draggable={false}
      decoding="async"
      onError={() => setFailed((prev) => (prev.includes(src) ? prev : [...prev, src]))}
    />
  );
};

export default SkillCardArt;
