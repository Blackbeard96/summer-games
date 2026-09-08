import React from 'react';
import { mst } from '../../theme/mstTokens';

export type MSTButtonVariant =
  | 'primary'
  | 'secondary'
  | 'mystic'
  | 'danger'
  | 'ghost'
  | 'element';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: MSTButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
};

const sizePad: Record<NonNullable<Props['size']>, string> = {
  sm: '0.4rem 0.75rem',
  md: '0.55rem 1.1rem',
  lg: '0.75rem 1.4rem',
};

export function MSTButton({
  variant = 'primary',
  size = 'md',
  fullWidth,
  style,
  children,
  disabled,
  ...rest
}: Props) {
  const variants: Record<MSTButtonVariant, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(180deg, ${mst.gold.bright}, ${mst.gold.base})`,
      color: mst.bg.primary,
      border: `1px solid ${mst.gold.muted}`,
      boxShadow: mst.shadow.glowGold,
    },
    secondary: {
      background: mst.bg.elevated,
      color: mst.gold.bright,
      border: `1px solid ${mst.border.gold}`,
    },
    mystic: {
      background: `linear-gradient(180deg, ${mst.purple.bright}, ${mst.purple.base})`,
      color: mst.text.primary,
      border: `1px solid ${mst.border.purple}`,
      boxShadow: mst.shadow.glowPurple,
    },
    danger: {
      background: 'rgba(196, 75, 75, 0.2)',
      color: '#f5c2c2',
      border: `1px solid ${mst.semantic.danger}`,
    },
    ghost: {
      background: 'transparent',
      color: mst.text.secondary,
      border: `1px solid transparent`,
    },
    element: {
      background: mst.bg.panel,
      color: mst.text.primary,
      border: `1px solid ${mst.border.default}`,
    },
  };

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        fontFamily: mst.font.body,
        fontSize: size === 'sm' ? '0.8125rem' : size === 'lg' ? '1rem' : '0.875rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: sizePad[size],
        borderRadius: mst.radius.sm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        width: fullWidth ? '100%' : undefined,
        transition: 'transform var(--mst-duration-fast) var(--mst-ease), box-shadow var(--mst-duration) var(--mst-ease), background var(--mst-duration) var(--mst-ease)',
        ...variants[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
