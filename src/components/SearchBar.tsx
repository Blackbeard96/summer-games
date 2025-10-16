import React, { useState, useEffect } from 'react';
import { useMobile, useHaptic } from '../hooks/useMobile';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  onClear?: () => void;
  className?: string;
  style?: React.CSSProperties;
  debounceMs?: number;
  autoFocus?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "Search students...",
  onSearch,
  onClear,
  className = "",
  style = {},
  debounceMs = 300,
  autoFocus = false
}) => {
  const [query, setQuery] = useState('');
  const { isMobile, isTouch } = useMobile();
  const { light } = useHaptic();

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, onSearch, debounceMs]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    // Haptic feedback for mobile
    if (isTouch && value.length > 0) {
      light();
    }
  };

  const handleClear = () => {
    setQuery('');
    onClear?.();
    
    // Haptic feedback for mobile
    if (isTouch) {
      light();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <div 
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        ...style
      }}
    >
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center'
      }}>
        {/* Search Icon */}
        <div style={{
          position: 'absolute',
          left: isMobile ? '12px' : '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#6b7280',
          fontSize: isMobile ? '16px' : '18px',
          pointerEvents: 'none',
          zIndex: 1
        }}>
          🔍
        </div>

        {/* Search Input */}
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{
            width: '100%',
            padding: isMobile ? '12px 16px 12px 44px' : '14px 20px 14px 50px',
            fontSize: isMobile ? '16px' : '14px',
            border: '2px solid #e5e7eb',
            borderRadius: isMobile ? '8px' : '10px',
            backgroundColor: 'white',
            color: '#1f2937',
            outline: 'none',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            ...(isMobile && {
              WebkitAppearance: 'none',
              fontSize: '16px' // Prevents zoom on iOS
            })
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#3b82f6';
            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e5e7eb';
            e.target.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        />

        {/* Clear Button */}
        {query && (
          <button
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: isMobile ? '12px' : '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: isMobile ? '16px' : '18px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              minWidth: isMobile ? '24px' : '28px',
              minHeight: isMobile ? '24px' : '28px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#6b7280';
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#374151';
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search Results Count (Optional) */}
      {query && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderTop: 'none',
          borderBottomLeftRadius: '10px',
          borderBottomRightRadius: '10px',
          padding: '8px 16px',
          fontSize: '12px',
          color: '#6b7280',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          zIndex: 10
        }}>
          Searching for "{query}"...
        </div>
      )}
    </div>
  );
};

export default SearchBar;
