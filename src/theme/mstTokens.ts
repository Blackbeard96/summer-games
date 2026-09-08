/**
 * JS mirror of MST CSS tokens for gradual inline-style migration.
 * Prefer CSS variables in className-based UI; use these when a
 * legacy `style={{}}` block must stay until that page is restyled.
 */
export const mst = {
  bg: {
    primary: 'var(--mst-bg-primary)',
    secondary: 'var(--mst-bg-secondary)',
    panel: 'var(--mst-bg-panel)',
    elevated: 'var(--mst-bg-elevated)',
  },
  gold: {
    base: 'var(--mst-gold)',
    bright: 'var(--mst-gold-bright)',
    muted: 'var(--mst-gold-muted)',
    soft: 'var(--mst-gold-soft)',
  },
  purple: {
    base: 'var(--mst-purple)',
    bright: 'var(--mst-purple-bright)',
    muted: 'var(--mst-purple-muted)',
    soft: 'var(--mst-purple-soft)',
  },
  text: {
    primary: 'var(--mst-text-primary)',
    secondary: 'var(--mst-text-secondary)',
    muted: 'var(--mst-text-muted)',
  },
  border: {
    default: 'var(--mst-border)',
    gold: 'var(--mst-border-gold)',
    purple: 'var(--mst-border-purple)',
  },
  semantic: {
    success: 'var(--mst-success)',
    danger: 'var(--mst-danger)',
    warning: 'var(--mst-warning)',
    info: 'var(--mst-info)',
  },
  font: {
    display: 'var(--mst-font-display)',
    body: 'var(--mst-font-body)',
    mono: 'var(--mst-font-mono)',
  },
  radius: {
    sm: 'var(--mst-radius-sm)',
    md: 'var(--mst-radius-md)',
    lg: 'var(--mst-radius-lg)',
  },
  shadow: {
    panel: 'var(--mst-shadow-panel)',
    elevated: 'var(--mst-shadow-elevated)',
    glowGold: 'var(--mst-glow-gold)',
    glowPurple: 'var(--mst-glow-purple)',
  },
  space: {
    1: 'var(--mst-space-1)',
    2: 'var(--mst-space-2)',
    3: 'var(--mst-space-3)',
    4: 'var(--mst-space-4)',
    5: 'var(--mst-space-5)',
    6: 'var(--mst-space-6)',
  },
} as const;

export type MstTokens = typeof mst;
