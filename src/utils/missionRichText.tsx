import React from 'react';

/**
 * Safe mission / story caption rendering with hyperlinks.
 * Supports:
 * - Markdown links: [Label](https://example.com) or [Label](/in-app/path)
 * - Bare URLs: https://example.com
 */

const MD_OR_URL =
  /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]+)\)|(https?:\/\/[^\s<>\[\]()]+)/gi;

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith('/')) {
    // In-app relative path — block protocol-relative and weird schemes
    if (trimmed.startsWith('//') || trimmed.includes(':')) return false;
    return true;
  }
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function linkStyle(base?: React.CSSProperties): React.CSSProperties {
  return {
    color: '#93c5fd',
    textDecoration: 'underline',
    wordBreak: 'break-word',
    ...base,
  };
}

export function renderMissionRichText(
  text: string,
  options?: { linkColor?: string }
): React.ReactNode {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MD_OR_URL.source, MD_OR_URL.flags);
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const mdLabel = match[1];
    const mdHref = match[2];
    const bareUrl = match[3];

    if (mdLabel != null && mdHref != null && isSafeHref(mdHref)) {
      const external = !mdHref.startsWith('/');
      nodes.push(
        <a
          key={`l-${key++}`}
          href={mdHref}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          style={linkStyle(options?.linkColor ? { color: options.linkColor } : undefined)}
          onClick={(e) => e.stopPropagation()}
        >
          {mdLabel}
        </a>
      );
    } else if (bareUrl && isSafeHref(bareUrl)) {
      // Trim trailing punctuation often glued to URLs
      let url = bareUrl;
      let trailing = '';
      while (/[.,;:!?)\]}'"]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      if (isSafeHref(url)) {
        nodes.push(
          <a
            key={`l-${key++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle(options?.linkColor ? { color: options.linkColor } : undefined)}
            onClick={(e) => e.stopPropagation()}
          >
            {url}
          </a>
        );
        if (trailing) nodes.push(trailing);
      } else {
        nodes.push(match[0]);
      }
    } else {
      nodes.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

export const MissionRichText: React.FC<{
  text: string;
  style?: React.CSSProperties;
  className?: string;
  as?: 'p' | 'div' | 'span';
  linkColor?: string;
}> = ({ text, style, className, as = 'div', linkColor }) => {
  const Tag = as;
  return (
    <Tag
      className={className}
      style={{ whiteSpace: 'pre-wrap', ...style }}
    >
      {renderMissionRichText(text, { linkColor })}
    </Tag>
  );
};

export const MISSION_LINK_HINT =
  'Links: paste a full URL, or use [Link text](https://example.com). In-app paths work too: [Training Grounds](/training-grounds).';

export default MissionRichText;
