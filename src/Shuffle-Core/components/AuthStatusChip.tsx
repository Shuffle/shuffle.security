import { Chip, Tooltip } from '@mui/material';

/**
 * Single source of truth for authentication status chips.
 *
 * Every place that renders "Validated" / "Configured" / "Not configured" /
 * "Tested" / "Not tested" / "Auth not required" MUST use this component so the
 * chips look identical in the app auth card, the "Select authentication"
 * dropdown and the AI provider list.
 */
export type AuthStatusKind =
  | 'validated'
  | 'configured'
  | 'not-configured'
  | 'tested'
  | 'not-tested'
  | 'no-auth'
  | 'latest';

const STYLES: Record<AuthStatusKind, { label: string; bg: string; fg: string }> = {
  validated: {
    label: 'Validated',
    bg: 'hsl(var(--severity-low) / 0.15)',
    fg: 'hsl(var(--severity-low))',
  },
  configured: {
    label: 'Configured',
    bg: 'hsl(var(--severity-medium) / 0.15)',
    fg: 'hsl(var(--severity-medium))',
  },
  'not-configured': {
    label: 'Not configured',
    bg: 'hsl(var(--destructive) / 0.15)',
    fg: 'hsl(var(--destructive))',
  },
  tested: {
    label: 'Tested',
    bg: 'hsl(var(--severity-low) / 0.15)',
    fg: 'hsl(var(--severity-low))',
  },
  'not-tested': {
    label: 'Not tested',
    bg: 'hsl(var(--muted) / 0.8)',
    fg: 'hsl(var(--muted-foreground))',
  },
  'no-auth': {
    label: 'Auth not required',
    bg: 'hsl(var(--severity-info) / 0.15)',
    fg: 'hsl(var(--severity-info))',
  },
  latest: {
    label: 'Latest',
    bg: 'hsl(var(--infra-email) / 0.15)',
    fg: 'hsl(var(--infra-email))',
  },
};

export interface AuthStatusChipProps {
  status: AuthStatusKind;
  /** Overrides the default label text. */
  label?: string;
  /** Compact variant used inside dropdown rows. */
  dense?: boolean;
  tooltip?: string;
}

export const AuthStatusChip = ({ status, label, dense, tooltip }: AuthStatusChipProps) => {
  const style = STYLES[status];
  const chip = (
    <Chip
      label={label || style.label}
      size="small"
      sx={{
        backgroundColor: style.bg,
        color: style.fg,
        fontWeight: 500,
        fontSize: dense ? '0.6rem' : { xs: '0.6rem', sm: '0.65rem' },
        height: dense ? 20 : { xs: 22, sm: 24 },
        cursor: tooltip ? 'help' : 'default',
        '& .MuiChip-label': { px: dense ? 0.75 : 1 },
      }}
    />
  );
  if (!tooltip) return chip;
  return (
    <Tooltip title={tooltip} arrow placement="top">
      {chip}
    </Tooltip>
  );
};

export default AuthStatusChip;
