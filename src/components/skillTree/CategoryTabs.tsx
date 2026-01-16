import React from 'react';
import { SkillTreeCategory } from '../../types/skillSystem';

interface CategoryTabsProps {
  categories: SkillTreeCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory
}) => {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1rem',
      flexWrap: 'wrap'
    }}>
      <button
        onClick={() => onSelectCategory(null)}
        style={{
          background: selectedCategoryId === null ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
          border: `1px solid ${selectedCategoryId === null ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
          borderRadius: '0.375rem',
          padding: '0.5rem 1rem',
          color: selectedCategoryId === null ? '#fff' : 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.75rem',
          fontWeight: selectedCategoryId === null ? 'bold' : 'normal',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}
      >
        All
      </button>
      {categories.map((category) => {
        const isSelected = category.id === selectedCategoryId;
        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            style={{
              background: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              border: `1px solid ${isSelected ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.75rem',
              fontWeight: isSelected ? 'bold' : 'normal',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
};

