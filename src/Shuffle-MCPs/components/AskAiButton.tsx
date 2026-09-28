/**
 * AskAiButton — Floating "Ask AI" trigger button in the bottom-right corner.
 * Styled after ChatGPT docs with a "Support only" tag.
 *
 * Self-contained: No host-app `@/` imports.
 */

import React from 'react';
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import { isSupportUser } from '@/Shuffle-MCPs/components/AgentPresets';
import { isAgentRoute } from '@/Shuffle-MCPs/agentContextRegistry';
import { useShuffleMcpTheme } from '@/Shuffle-MCPs/ShuffleMcpThemeProvider';

export interface AskAiButtonProps {
  /** Click handler to toggle or open the context-aware drawer */
  onClick: () => void;
  /** Whether the drawer is currently open */
  isOpen?: boolean;
  /** Authoritative support user flag. Defaults to checking localStorage when omitted. */
  isSupport?: boolean;
  /**
   * Whether to require support status to display the button.
   * Default: true ("This is for now just for support users").
   */
  requireSupport?: boolean;
  /** Whether Ask AI is in Beta on this page, enabling it for normal users */
  isBeta?: boolean;
  /** Current URL pathname. Automatically disables button on /agents and /agent */
  pathname?: string;
  /** Custom button label. Default: "Ask Shuffle". */
  label?: string;
  /** Tag label in the button. When undefined, defaults to "Beta" if isBeta is true, else "Support". Set to null to hide tag. */
  tagLabel?: string | null;
  /** Optional context name or subtitle shown in tooltip (e.g. "Shuffle Incidents MCP") */
  contextHint?: string;
  /** Custom tooltip title. When omitted, auto-generated from contextHint. */
  tooltipTitle?: React.ReactNode;
  /** Custom sx style overrides for the button */
  sx?: SxProps<Theme>;
  /** Hide button when drawer is open. Default: true. */
  hideWhenOpen?: boolean;
}

export const AskAiButton: React.FC<AskAiButtonProps> = ({
  onClick,
  isOpen = false,
  isSupport,
  requireSupport = true,
  isBeta = false,
  pathname,
  label = 'Ask Shuffle',
  tagLabel,
  contextHint,
  tooltipTitle,
  sx,
  hideWhenOpen = true,
}) => {
  const themeScope = useShuffleMcpTheme();

  const currentPath = pathname !== undefined
    ? pathname
    : (typeof window !== 'undefined' ? window.location.pathname : '');

  // Disable on /agents and /agent
  if (isAgentRoute(currentPath)) {
    return null;
  }

  // Check support status (prop or fallback to localStorage)
  const isEffectiveSupport = isSupport !== undefined ? isSupport : isSupportUser();

  const isIncidentOrDocs =
    currentPath.startsWith('/incidents') ||
    currentPath.startsWith('/incidents-simple') ||
    currentPath.startsWith('/cases') ||
    currentPath.startsWith('/alerts') ||
    currentPath.startsWith('/tickets') ||
    currentPath.startsWith('/docs');

  const effectiveIsBeta = isBeta || isIncidentOrDocs;
  const effectiveRequireSupport = effectiveIsBeta ? false : requireSupport;
  if (effectiveRequireSupport && !isEffectiveSupport) {
    return null;
  }

  if (hideWhenOpen && isOpen) {
    return null;
  }

  const effectiveTagLabel =
    tagLabel !== undefined && !(tagLabel === 'Support' && isIncidentOrDocs)
      ? tagLabel
      : (effectiveIsBeta ? 'Beta' : 'Support');

  const effectiveTooltip =
    tooltipTitle !== undefined
      ? tooltipTitle
      : label !== 'Ask AI' && label !== 'Ask Shuffle'
        ? label
        : contextHint
          ? `Ask Shuffle (${contextHint})`
          : 'Ask Shuffle • Context-aware assistant';

  return (
    <Box
      className={themeScope?.scopeClassName}
      sx={{
        position: 'fixed',
        bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        right: 'calc(24px + env(safe-area-inset-right, 0px))',
        zIndex: 1250,
      }}
    >
      <Tooltip title={effectiveTooltip} arrow placement="top-end">
        <ButtonBase
          onClick={(e) => {
            onClick?.();
          }}
          aria-label={label}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.25,
            px: 2,
            py: 1.25,
            borderRadius: '9999px',
            bgcolor: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)',
            cursor: 'pointer',
            transition: 'all 160ms cubic-bezier(0.4, 0, 0.2, 1)',
            userSelect: 'none',
            backdropFilter: 'blur(8px)',
            '&:hover': {
              bgcolor: 'hsl(var(--accent))',
              color: 'hsl(var(--accent-foreground))',
              borderColor: 'hsl(var(--primary))',
              boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18), 0 3px 8px rgba(0, 0, 0, 0.12)',
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            },
            ...sx,
          }}
        >
          {/* Agent Icon Badge */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: '9999px',
              bgcolor: 'hsla(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
              flexShrink: 0,
            }}
          >
            <AgentIcon size={16} />
          </Box>

          {/* Label */}
          <Typography
            sx={{
              fontSize: '0.86rem',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1,
              color: 'inherit',
              whiteSpace: 'nowrap',
              maxWidth: { xs: 150, sm: 220, md: 300 },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </Typography>

          {/* Chip tag */}
          {effectiveTagLabel && (
            <Box
              component="span"
              sx={{
                fontSize: '0.64rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: effectiveIsBeta ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                bgcolor: effectiveIsBeta ? 'hsla(var(--primary) / 0.12)' : 'hsla(var(--muted-foreground) / 0.12)',
                border: effectiveIsBeta ? '1px solid hsla(var(--primary) / 0.26)' : '1px solid hsla(var(--muted-foreground) / 0.24)',
                px: 0.9,
                py: 0.25,
                borderRadius: '9999px',
                lineHeight: 1.1,
                flexShrink: 0,
              }}
            >
              {effectiveTagLabel}
            </Box>
          )}
        </ButtonBase>
      </Tooltip>
    </Box>
  );
};

export default AskAiButton;
