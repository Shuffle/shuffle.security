import React, { useState } from 'react';
import { Box, Button, Typography, type SxProps, type Theme } from '@mui/material';
import { AppFallbackIcon } from '../AppFallbackIcon';
import { McpSetupModal, type McpPlatform } from './McpSetupModal';

export interface McpSetupButtonsProps {
  /** Optional app name to scope the MCP server URL (e.g. "Wazuh"). When omitted, uses the Workflow Builder MCP endpoint. */
  appName?: string;
  /** Optional human-readable app title (e.g. "Wazuh"). */
  appTitle?: string;
  /** Optional backend base URL override. */
  globalUrl?: string;
  /** Optional default server name override. */
  defaultServerName?: string;
  /** Optional default server URL override. */
  defaultServerUrl?: string;
  /** Optional label or heading displayed next to the buttons. */
  label?: string;
  /** Optional subtitle displayed below the label. */
  subtitle?: string;
  /** Button height in pixels (default 28 for compact headers, or 32 for toolbars/docs). */
  size?: 'compact' | 'default';
  /** Optional wrapper sx styles. */
  sx?: SxProps<Theme>;
}

export const McpSetupButtons: React.FC<McpSetupButtonsProps> = ({
  appName,
  appTitle,
  globalUrl,
  defaultServerName,
  defaultServerUrl,
  label,
  subtitle,
  size = 'default',
  sx,
}) => {
  const [setupPlatform, setSetupPlatform] = useState<McpPlatform | null>(null);

  const btnHeight = size === 'compact' ? 28 : 32;
  const btnPx = size === 'compact' ? 1.5 : 1.75;
  const btnFontSize = size === 'compact' ? '0.75rem' : '0.8rem';

  const buttons = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Button
        variant="outlined"
        size="small"
        onClick={() => setSetupPlatform('chatgpt')}
        startIcon={
          <AppFallbackIcon
            name="ChatGPT"
            size={16}
            alt="ChatGPT"
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        }
        sx={{
          height: btnHeight,
          px: btnPx,
          textTransform: 'none',
          fontSize: btnFontSize,
          fontWeight: 600,
          borderRadius: 1.5,
          borderColor: 'hsl(var(--border))',
          color: 'hsl(var(--foreground))',
          bgcolor: 'hsl(var(--card))',
          '&:hover': {
            borderColor: 'hsl(var(--primary))',
            bgcolor: 'hsl(var(--muted) / 0.4)',
          },
        }}
      >
        ChatGPT
      </Button>

      <Button
        variant="outlined"
        size="small"
        onClick={() => setSetupPlatform('claude')}
        startIcon={
          <AppFallbackIcon
            name="Claude"
            size={16}
            alt="Claude"
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        }
        sx={{
          height: btnHeight,
          px: btnPx,
          textTransform: 'none',
          fontSize: btnFontSize,
          fontWeight: 600,
          borderRadius: 1.5,
          borderColor: 'hsl(var(--border))',
          color: 'hsl(var(--foreground))',
          bgcolor: 'hsl(var(--card))',
          '&:hover': {
            borderColor: 'hsl(var(--primary))',
            bgcolor: 'hsl(var(--muted) / 0.4)',
          },
        }}
      >
        Claude
      </Button>
    </Box>
  );

  return (
    <Box sx={sx}>
      {label || subtitle ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {label && (
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'hsl(var(--foreground))',
                  mb: subtitle ? 0.25 : 0,
                }}
              >
                {label}
              </Typography>
            )}
            {subtitle && (
              <Typography
                sx={{
                  fontSize: '0.8rem',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {buttons}
        </Box>
      ) : (
        buttons
      )}

      <McpSetupModal
        open={Boolean(setupPlatform)}
        platform={setupPlatform || 'chatgpt'}
        onClose={() => setSetupPlatform(null)}
        appName={appName}
        appTitle={appTitle}
        globalUrl={globalUrl}
        defaultServerName={defaultServerName}
        defaultServerUrl={defaultServerUrl}
      />
    </Box>
  );
};

export default McpSetupButtons;
