/**
 * UserHoverCard — renders a username with a hover popover containing
 * profile details (role, status, schedule hint, github attribution).
 * Used in the activity feed to give users a definitive way to verify
 * who posted a comment.
 *
 * Identity rules:
 *  - AI Agent: matches `isAIAssignee(name)` OR `is_agent === true` AND
 *    the name does not collide with any real org user. We require BOTH
 *    signals so a normal user cannot impersonate the agent simply by
 *    setting `is_agent: true` from a forged payload.
 *  - Real user: name matches an entry in the org user list.
 *  - Unknown: neither — rendered as plain text without a hover card.
 */
import { User as PersonIcon, Github as GitHubIcon } from 'lucide-react';
import { Box, Typography, Avatar, Chip, Link as MuiLink, Button } from '@mui/material';
import { useNavigate } from '@/lib/router-compat';
import { useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import singulAgentIcon from '@/assets/singul-agent-icon.png';
import { isAIAssignee, AI_AGENT_HANDLE } from '@/lib/utils';
import { useUsers, type User } from '@/hooks/useUsers';
import { openAgentDrawer } from '@/lib/agentDrawer';


interface UserHoverCardProps {
  /** Username to display (e.g. "@AIAgent" or "frikky"). */
  username: string;
  /** Optional `is_agent` flag from the activity payload. */
  isAgent?: boolean;
  /** Optional override for the rendered text styling. */
  className?: string;
  /**
   * Truncate the visible username to this many characters. The full name is
   * always available through the native tooltip and the hover card itself,
   * so shortening never loses information.
   */
  maxChars?: number;
}

/** Shorten a username for dense layouts, keeping it recognisable. */
const shortenName = (name: string, maxChars?: number): string => {
  if (!maxChars || !name || name.length <= maxChars) return name;
  // Emails shorten to the local part first — that is the recognisable bit.
  const local = name.includes('@') ? name.split('@')[0] : name;
  if (local.length <= maxChars) return local;
  return `${local.slice(0, Math.max(1, maxChars - 1))}\u2026`;
};

const findRealUser = (users: User[], name: string): User | undefined => {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return users.find((u) => u.username.toLowerCase() === lower);
};

/**
 * Resolve the avatar image URL for a username, taking AI agent identity
 * and GitHub/Gravatar sync into account. Returns null when nothing usable
 * is available so callers can fall back to a generic Avatar icon.
 */
export const resolveUserAvatar = (
  username: string,
  users: User[],
  isAgent?: boolean,
): { src: string | null; isAgent: boolean; user?: User } => {
  const realUser = findRealUser(users, username);
  const looksLikeAgent = isAIAssignee(username);
  const verifiedAgent = looksLikeAgent || (isAgent === true && !realUser);
  if (verifiedAgent) {
    return { src: singulAgentIcon, isAgent: true };
  }
  return {
    src: realUser?.public_profile?.github_avatar || null,
    isAgent: false,
    user: realUser,
  };
};

export const UserHoverCard = ({ username, isAgent, className, maxChars }: UserHoverCardProps) => {
  const { users } = useUsers();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const realUser = findRealUser(users, username);
  const looksLikeAgent = isAIAssignee(username);
  const verifiedAgent = looksLikeAgent || (isAgent === true && !realUser);
  const githubUrl = realUser?.public_profile?.github_url;
  const githubAvatar = realUser?.public_profile?.github_avatar;
  const displayName = verifiedAgent ? AI_AGENT_HANDLE : username;

  // Clicking the agent name should open the same hover popup instead of
  // redirecting to another page. This keeps the interaction lightweight and
  // consistent across the app.
  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  const handleOrgAdminClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (realUser) {
      navigate('/users');
    }
  };

  // Plain text for unknown users (no hover card, no click).
  if (!verifiedAgent && !realUser) {
    return (
      <Typography
        component="span"
        variant="caption"
        className={className}
        title={username}
        sx={{ fontWeight: 600, fontSize: '0.75rem' }}
      >
        {shortenName(username, maxChars)}
      </Typography>
    );
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Box
          component="span"
          onClick={handleNameClick}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            borderRadius: 0.75,
            px: 0.4,
            mx: -0.4,
            transition: 'background-color 0.15s',
            '&:hover': {
              bgcolor: 'hsl(var(--muted) / 0.6)',
            },
          }}
        >
          <Typography
            component="span"
            variant="caption"
            className={className}
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              color: 'text.primary',
            }}
            title={displayName}
          >
            {shortenName(displayName, maxChars)}
          </Typography>
        </Box>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={6}
        className="w-[330px] border border-border bg-popover p-3 text-popover-foreground shadow-xl z-[9999]"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
          <Avatar
            src={verifiedAgent ? singulAgentIcon : githubAvatar || undefined}
            sx={{
              width: 36,
              height: 36,
              bgcolor: 'hsl(var(--muted))',
              color: 'text.secondary',
            }}
          >
            {verifiedAgent ? <AgentIcon size={18} /> : <PersonIcon size={18} />}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.2 }}
              noWrap
            >
              {displayName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
              {verifiedAgent ? 'AI Agent · automated responder' : (realUser?.role || 'Team member')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {verifiedAgent ? (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Schedule
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  Always on · 24/7
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Level
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  Tier 1 triage
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Verified
                </Typography>
                <Chip
                  label="Automated responder"
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.6rem',
                    bgcolor: 'hsl(var(--primary) / 0.15)',
                    color: 'hsl(var(--primary))',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              </Box>
            </>
          ) : (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Status
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: realUser?.active ? 'hsl(142 71% 45%)' : 'text.secondary',
                  }}
                >
                  {realUser?.active ? 'Active' : 'Inactive'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Role
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  {realUser?.role || '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Schedule
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  See on-call
                </Typography>
              </Box>
              {githubUrl && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    mt: 0.25,
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    GitHub
                  </Typography>
                  <MuiLink
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.4,
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      color: 'hsl(var(--primary))',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    <GitHubIcon size={11} />
                    {githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                  </MuiLink>
                </Box>
              )}
            </>
          )}
        </Box>

        <Box
          sx={{
            mt: 1.25,
            pt: 1,
            borderTop: '1px solid hsl(var(--border-subtle))',
          }}
        >
          {verifiedAgent && (
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  openAgentDrawer('permissions', { openToolPicker: true });
                }}
                sx={{
                  flex: 1,
                  height: 32,
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.06)' },
                }}
              >
                Assign tools
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  openAgentDrawer('localLLM');
                }}
                sx={{
                  flex: 1,
                  height: 32,
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  '&:hover': { borderColor: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.06)' },
                }}
              >
                Shuffle AI
              </Button>
            </Box>
          )}
          <Button
            fullWidth
            size="small"
            variant={verifiedAgent ? 'contained' : 'outlined'}
            onClick={(e) => {
              e.stopPropagation();
              if (verifiedAgent) {
                window.open('/agents#agent-activity', '_blank', 'noopener,noreferrer');
                return;
              }
              handleOrgAdminClick(e);
            }}

            startIcon={verifiedAgent ? <AgentIcon size={14} /> : <PersonIcon size={14} />}
            sx={{
              height: 30,
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 1,
              ...(verifiedAgent
                ? {
                    bgcolor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    '&:hover': { bgcolor: 'hsl(var(--primary) / 0.9)' },
                  }
                : {
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    '&:hover': {
                      bgcolor: 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--border))',
                    },
                  }),
            }}
          >
            {verifiedAgent ? 'Open Agent activity' : 'Open Org Admin'}
          </Button>
        </Box>
      </HoverCardContent>
    </HoverCard>
  );
};

export default UserHoverCard;
