import { Typography, TypographyProps } from '@mui/material';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { isAIAssignee, AI_AGENT_HANDLE } from '@/lib/utils';
import UserHoverCard from './UserHoverCard';

interface MentionTextProps extends Omit<TypographyProps, 'children'> {
  text: string;
}

/**
 * Renders text with @username mentions highlighted.
 *
 * Rules:
 *  - Only matches `@name` when preceded by start-of-string or whitespace —
 *    avoids false positives inside emails / URLs (e.g. `support@101.181.0.198`
 *    must NOT highlight `@101`).
 *  - Only highlights mentions that resolve to a real org user or the AI agent;
 *    everything else stays as plain text.
 *  - Highlighted mentions are wrapped in `UserHoverCard` so users can hover to
 *    see profile details and click to navigate.
 */
export const MentionText = ({ text, sx, ...props }: MentionTextProps) => {
  const { userInfo } = useAuth();
  const { users } = useUsers();
  const currentUsername = userInfo?.username || '';

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

  while ((match = mentionRegex.exec(text)) !== null) {
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
        content: text.slice(lastIndex, mentionStart),
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
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
      isCurrentUser: false,
    });
  }

  // If no mentions found, just return plain text
  if (parts.length === 0) {
    return <Typography sx={sx} {...props}>{text}</Typography>;
  }

  return (
    <Typography component="span" sx={sx} {...props}>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <span key={idx}>{part.content}</span>;
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
