import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { navigateToShuffleCore, isShuffleCoreUrl } from '@/lib/authHandoff';

/**
 * Compact, reusable usage bar showing `usage / limit`. Designed to stack
 * tightly so multiple bars can sit anywhere (sidebars, footers, panels).
 *
 * Visual: neutral by default. Color only kicks in when approaching/over limit.
 *   < 65%  → muted foreground
 *   65-99% → severity-medium
 *   >=100% → destructive
 */
export interface UsageBarProps {
  label: string;
  usage: number;
  limit: number;
  unit?: string;
  hint?: string;
  actionLabel?: string;
  actionHref?: string;
}

const fmt = (n: number) => n.toLocaleString();

export const UsageBar: React.FC<UsageBarProps> = ({
  label,
  usage,
  limit,
  unit,
  hint,
  actionLabel,
  actionHref,
}) => {
  const safeLimit = Math.max(limit, 0);
  const pct = safeLimit > 0 ? (usage / safeLimit) * 100 : 0;
  const isOver = pct >= 100;
  const isWarn = pct >= 65 && !isOver;

  const accent = isOver
    ? 'hsl(var(--destructive))'
    : isWarn
      ? 'hsl(var(--severity-medium))'
      : 'hsl(var(--muted-foreground))';

  const tooltipText = safeLimit > 0
    ? `${pct.toFixed(0)}% used · ${fmt(usage)} / ${fmt(safeLimit)}${unit ? ' ' + unit : ''}${hint ? ' · ' + hint : ''}`
    : `${fmt(usage)}${unit ? ' ' + unit : ''}${hint ? ' · ' + hint : ''}`;

  return (
    <Tooltip title={tooltipText} placement="top" arrow>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography
            sx={{
              fontSize: '12.8px',
              fontWeight: 500,
              color: 'hsl(var(--muted-foreground))',
              lineHeight: 1.2,
            }}
          >
            {label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {actionLabel && actionHref && (isWarn || isOver) && (
              <Box
                component="a"
                href={actionHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={async (e: React.MouseEvent) => {
                  if (actionHref && isShuffleCoreUrl(actionHref)) {
                    e.preventDefault();
                    await navigateToShuffleCore(actionHref, { newTab: true });
                  }
                }}
                sx={{
                  fontSize: '12.8px',
                  fontWeight: 600,
                  color: accent,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {actionLabel}
              </Box>
            )}
            <Typography
              sx={{
                fontSize: '12.8px',
                fontWeight: 500,
                color: accent,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {safeLimit > 0
                ? `${fmt(usage)} / ${fmt(safeLimit)}${unit ? ' ' + unit : ''}`
                : `${fmt(usage)}${unit ? ' ' + unit : ''}`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ width: '100%', height: 2, bgcolor: 'hsl(var(--muted) / 0.5)', borderRadius: 1, overflow: 'hidden' }}>
          <Box
            sx={{
              width: `${Math.min(Math.max(pct, 0), 100)}%`,
              height: '100%',
              bgcolor: isOver
                ? 'hsl(var(--destructive))'
                : isWarn
                  ? 'hsl(var(--severity-medium))'
                  : 'hsl(var(--severity-low, 142 71% 45%))',
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
};

export default UsageBar;
