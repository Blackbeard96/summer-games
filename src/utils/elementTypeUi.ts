import type { ElementType } from '../types/elementTypes';
import { ELEMENT_ADVANTAGES } from './elementAdvantages';

const EMOJI: Record<ElementType, string> = {
  water: '💧',
  fire: '🔥',
  earth: '🌍',
  air: '💨',
  lightning: '⚡',
  metal: '⚙️',
  light: '✨',
  dark: '🌑',
};

const LABEL: Record<ElementType, string> = {
  water: 'Water',
  fire: 'Fire',
  earth: 'Earth',
  air: 'Air',
  lightning: 'Lightning',
  metal: 'Metal',
  light: 'Light',
  dark: 'Dark',
};

export function elementTypeEmoji(el: ElementType): string {
  return EMOJI[el] ?? '◎';
}

export function elementTypeLabel(el: ElementType): string {
  return LABEL[el] ?? el;
}

export function formatEnemyElementPreview(enemyType: ElementType): {
  strongAgainst: string;
  weakAgainst: string;
  resistsDamageFrom: string;
  takesBonusFrom: string;
} {
  const strong = ELEMENT_ADVANTAGES[enemyType] ?? [];
  const weak = (Object.keys(ELEMENT_ADVANTAGES) as ElementType[]).filter((atk) =>
    ELEMENT_ADVANTAGES[atk].includes(enemyType)
  );
  return {
    strongAgainst: strong.map(elementTypeLabel).join(', ') || '—',
    weakAgainst: weak.map(elementTypeLabel).join(', ') || '—',
    resistsDamageFrom: strong.map(elementTypeLabel).join(', ') || '—',
    takesBonusFrom: weak.map(elementTypeLabel).join(', ') || '—',
  };
}
