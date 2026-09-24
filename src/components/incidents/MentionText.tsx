import React from 'react';
import { Typography, TypographyProps } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { isAIAssignee, AI_AGENT_HANDLE } from '@/lib/utils';
import { useNavigate } from '@/lib/router-compat';
import { toCanonicalIncidentId, getIncidentUrl } from '@/lib/incidentUrl';
import UserHoverCard from './UserHoverCard';

interface MentionTextProps extends Omit<TypographyProps, 'children'> {
  text: string;
}

/**
 * Helper to render inline clickable links for URLs, incident paths, and composite incident IDs.
 */
function renderTextWithLinks(
  plainText: string,
  navigate: (path: string) => void,
): React.ReactNode[] {
  if (!plainText) return [];

  // Match URLs, /incidents/... paths, and composite IDs like "org::id"
  const tokenRegex = /(https?:\/\/[^\s<>"'`]+|\/incidents\/[a-zA-Z0-9_.:-]+|[a-zA-Z0-9_-]+::[a-zA-Z0-9_-]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(plainText)) !== null) {
    const matchedText = match[0];
    const matchStart = match.index;

    if (matchStart > lastIdx) {
      nodes.push(plainText.slice(lastIdx, matchStart));
    }

    let href: string;
    let label = toCanonicalIncidentId(matchedText);

    if (matchedText.startsWith('http://') || matchedText.startsWith('https://')) {
      href = matchedText;
    } else if (matchedText.startsWith('/incidents/')) {
      const targetId = matchedText.replace(/^\/incidents\//, '');
      href = getIncidentUrl(targetId);
      label = `/incidents/${toCanonicalIncidentId(targetId)}`;
    } else {
      // Composite ID e.g. "b::1a0a8c10c56f63c8"
      href = getIncidentUrl(matchedText);
    }

    nodes.push(
      <a
        key={`link-${matchStart}`}
        href={href}
        onClick={(e) => {
          if (!href.startsWith('http')) {
            e.preventDefault();
            e.stopPropagation();
            navigate(href);
          }
        }}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        style={{
          color: 'hsl(var(--primary))',
          textDecoration: 'underline',
          wordBreak: 'break-all',
          cursor: 'pointer',
        }}
      >
        {label}
      </a>
    );

    lastIdx = matchStart + matchedText.length;
  }

  if (lastIdx < plainText.length) {
    nodes.push(plainText.slice(lastIdx));
  }

  return nodes;
}

/**
 * Renders text with @username mentions highlighted and URLs/incident links clickable.
 *
 * Rules:
 *  - Only matches `@name` when preceded by start-of-string or whitespace —
 *    avoids false positives inside emails / URLs (e.g. `support@101.181.0.198`
 *    must NOT highlight `@101`).
 *  - Only highlights mentions that resolve to a real org user or the AI agent;
 *    everything else stays as plain text.
 *  - Highlighted mentions are wrapped in `UserHoverCard` so users can hover to
 *    see profile details and click to navigate.
 *  - Automatically decodes percent-encoded colons (%3A%3A -> ::) and renders
 *    incident URLs/composite IDs as clickable links.
 */
export const MentionText = ({ text, sx, ...props }: MentionTextProps) => {
  const { userInfo } = useAuth();
  const { users } = useUsers();
  const navigate = useNavigate();
  const currentUsername = userInfo?.username || '';

  // Canonicalize text to decode any %3A%3A in incident IDs or URLs upfront
  const canonicalText = toCanonicalIncidentId(text || '');

  // Require start-of-string or whitespace before the @ so we don't match
  // inside emails or IP-laden URLs. Support hyphens in handles like @ai-agent.
  const mentionRegex = /(^|\s)@([\w-]+)/g;
  const parts: {
    type: 'text' | 'mention';
    content: string;
    isCurrentUser: boolean;
    isAgent?: boolean;
  }[] = [];

  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(canonicalText)) !== null) {
    const leading = match[1];
    const username = match[2];
    const mentionStart = match.index + leading.length;

    // Only treat as a mention if it resolves to a real user or the AI agent.
    const isKnownUser = users.some(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    const isAgent = isAIAssignee(username);
    if (!isKnownUser && !isAgent) {
      continue;
    }

    // Add text before the mention (including the leading whitespace).
    if (mentionStart > lastIndex) {
      parts.push({
        type: 'text',
        content: canonicalText.slice(lastIndex, mentionStart),
        isCurrentUser: false,
      });
    }

    parts.push({
      type: 'mention',
      content: isAgent ? AI_AGENT_HANDLE : `@${username}`,
      isCurrentUser: !isAgent && username.toLowerCase() === currentUsername.toLowerCase(),
      isAgent,
    });

    lastIndex = mentionStart + 1 + username.length;
  }

  // Add remaining text
  if (lastIndex < canonicalText.length) {
    parts.push({
      type: 'text',
      content: canonicalText.slice(lastIndex),
      isCurrentUser: false,
    });
  }

  // If no mentions found, return plain text with links rendered
  if (parts.length === 0) {
    return (
      <Typography sx={sx} {...props}>
        {renderTextWithLinks(canonicalText, navigate)}
      </Typography>
    );
  }

  return (
    <Typography component="span" sx={sx} {...props}>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <span key={idx}>{renderTextWithLinks(part.content, navigate)}</span>;
        }

        return (
          <span
            key={idx}
            style={{
              backgroundColor: part.isCurrentUser ? 'rgba(255, 102, 0, 0.25)' : 'rgba(34, 184, 207, 0.15)',
              padding: '1px 4px',
              borderRadius: '4px',
              border: part.isCurrentUser ? '1px solid rgba(255, 102, 0, 0.4)' : 'none',
              display: 'inline-block',
            }}
          >
            <UserHoverCard username={part.content} isAgent={part.isAgent} />
          </span>
        );
      })}
    </Typography>
  );
};

export default MentionText;
